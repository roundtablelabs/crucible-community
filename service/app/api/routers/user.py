"""User account management endpoints."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.api.utils.audit import log_data_access
from app.db.session import get_db
from app.models.user import User
from app.models.session import RoundtableSession

# Import in-memory data structures from sessions router for cleanup
# These are module-level variables that need to be cleaned up
from app.api.routers import sessions as sessions_module

router = APIRouter(prefix="/user", tags=["user"])
logger = logging.getLogger(__name__)


def _require_member_user(user: CurrentUser) -> None:
    """Require authenticated member user (not guest)."""
    if user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    try:
        UUID(str(user.id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier"
        )


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    Delete the current user's account and all associated data.
    
    This will:
    - Delete all user's sessions (cascades to events, knights, etc.)
    - Delete user settings
    - Delete user accounts (OAuth connections)
    - Delete audit logs
    - Clean up in-memory session data
    - Delete the user record itself
    
    This action cannot be undone.
    """
    _require_member_user(current_user)
    
    user_uuid = UUID(str(current_user.id))
    
    # Verify user exists
    result = await db.execute(
        select(User).where(User.id == user_uuid)
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    logger.info(f"[delete_account] Starting account deletion for user {user.id} ({user.email})")
    
    # Get all user's sessions for cleanup
    sessions_result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.user_id == user_uuid)
    )
    user_sessions = sessions_result.scalars().all()
    
    # Clean up in-memory data for all user's sessions
    for session in user_sessions:
        session_id_str = session.session_id
        
        # Clean up session topics
        if hasattr(sessions_module, '_session_topics') and session_id_str in sessions_module._session_topics:
            sessions_module._session_topics.pop(session_id_str, None)
            logger.debug(f"Cleaned up session topic for {session_id_str}")
        
        # Cancel and clean up active debate tasks
        if hasattr(sessions_module, '_active_debate_tasks') and session_id_str in sessions_module._active_debate_tasks:
            task = sessions_module._active_debate_tasks[session_id_str]
            if not task.done():
                task.cancel()
                logger.debug(f"Cancelled active debate task for {session_id_str}")
            sessions_module._active_debate_tasks.pop(session_id_str, None)
        
        # Clean up artifacts (S3 or local file) for each session
        if session.artifact_uri and (session.artifact_uri.startswith("s3://") or session.artifact_uri.startswith("file://")):
            try:
                from app.services.artifacts.s3_upload import delete_json_from_s3_async
                await delete_json_from_s3_async(session.artifact_uri)
                logger.debug(f"Deleted artifact for session {session_id_str}: {session.artifact_uri}")
            except Exception as artifact_error:
                logger.warning(f"Failed to delete artifact {session.artifact_uri} for session {session_id_str}: {artifact_error}")
        
        # Also clean up audit_log_uri if it exists and is different from artifact_uri
        if session.audit_log_uri and session.audit_log_uri != session.artifact_uri:
            if session.audit_log_uri.startswith("s3://") or session.audit_log_uri.startswith("file://"):
                try:
                    from app.services.artifacts.s3_upload import delete_json_from_s3_async
                    await delete_json_from_s3_async(session.audit_log_uri)
                    logger.debug(f"Deleted audit log artifact for session {session_id_str}: {session.audit_log_uri}")
                except Exception as audit_error:
                    logger.warning(f"Failed to delete audit log artifact {session.audit_log_uri} for session {session_id_str}: {audit_error}")
    
    # Clean up all files in file explorer directory that match any of the user's session IDs
    try:
        from app.services.artifacts.s3_upload import LOCAL_ARTIFACTS_PATH
        from pathlib import Path
        
        artifacts_dir = Path(LOCAL_ARTIFACTS_PATH)
        if artifacts_dir.exists():
            total_deleted = 0
            for session in user_sessions:
                session_id = session.session_id
                # Find all files that start with the session_id pattern
                pattern = f"{session_id}_*"
                matching_files = list(artifacts_dir.glob(pattern))
                
                for file_path in matching_files:
                    if file_path.is_file():
                        try:
                            file_path.unlink()
                            total_deleted += 1
                            logger.debug(f"[delete_account] Deleted file explorer file: {file_path.name}")
                        except Exception as file_error:
                            logger.warning(f"[delete_account] Failed to delete file {file_path.name}: {file_error}")
            
            if total_deleted > 0:
                logger.info(f"[delete_account] Deleted {total_deleted} file(s) from file explorer for user {user_uuid}")
    except Exception as file_explorer_error:
        # Log error but don't fail the deletion - file explorer cleanup is best effort
        logger.warning(f"[delete_account] Failed to clean up file explorer files for user {user_uuid}: {file_explorer_error}")
    
    # Clean up user's active session mapping
    if hasattr(sessions_module, '_user_active_sessions') and user_uuid in sessions_module._user_active_sessions:
        sessions_module._user_active_sessions.pop(user_uuid, None)
        logger.debug(f"Cleaned up active session mapping for user {user_uuid}")
    
    # Log account deletion for audit trail (before actual deletion)
    try:
        await log_data_access(
            db=db,
            user_id=user_uuid,
            resource_type="account",
            resource_id=user_uuid,
            action="delete",
            request=request,
        )
    except Exception as audit_error:
        logger.warning(f"Failed to log audit for account deletion: {audit_error}")
    
    # Delete the user (cascades to all related data via foreign keys)
    # This will automatically delete:
    # - UserSettings (CASCADE)
    # - UserAccount (CASCADE)
    # - RoundtableSession (CASCADE) -> SessionEvent (CASCADE), SessionKnight (CASCADE)
    # - DataAccessLog (CASCADE)
    await db.execute(delete(User).where(User.id == user_uuid))
    await db.commit()
    
    logger.info(
        f"[delete_account] Successfully deleted account for user {user_uuid} ({user.email}). "
        f"Cleaned up {len(user_sessions)} sessions."
    )
    
    return None


# Community Edition: Onboarding email endpoint removed - not needed for single-user setup
# @router.post("/onboarding-email", ...) - REMOVED
