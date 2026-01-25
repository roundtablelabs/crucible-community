"""Service to recover and resume incomplete debates after server restart."""
import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models import RoundtableSession
from app.models.session_event import SessionEvent
from app.schemas.session import SessionStatus
from app.core.redis_helpers import get_session_topic, is_task_running, get_task_id, set_task_running
from celery.result import AsyncResult
from app.workers.tasks import run_debate_task
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def recover_incomplete_debates() -> list[str]:
    """
    Find and recover incomplete debates after server restart.
    
    Returns:
        List of session IDs that were recovered/restarted.
    """
    recovered_sessions = []
    
    try:
        # Use a context manager to ensure connection is properly closed
        # This helps prevent connection pool exhaustion
        async with AsyncSessionLocal() as db:
            # Community Edition: Find all sessions that are:
            # 1. In "running" state (debate was started but not completed)
            # Note: No payment_status check needed - community edition has no payments
            result = await db.execute(
                select(RoundtableSession)
                .where(
                    RoundtableSession.status == SessionStatus.RUNNING.value
                )
            )
            incomplete_sessions = result.scalars().all()
            
            logger.info(f"[recovery] Found {len(incomplete_sessions)} incomplete paid sessions")
            
            # Track if we've seen Redis connection errors to avoid repeated warnings
            redis_connection_failed = False
            
            for session in incomplete_sessions:
                session_id = session.session_id
                
                # Check if Celery task exists and is active
                # Skip status check if Redis is known to be unavailable
                if session.celery_task_id and not redis_connection_failed:
                    try:
                        task_result = AsyncResult(session.celery_task_id, app=celery_app)
                        task_state = task_result.state
                        if task_state in ['PENDING', 'STARTED', 'RETRY']:
                            logger.info(f"[recovery] Session {session_id} has active Celery task {session.celery_task_id}, skipping")
                            continue
                        else:
                            logger.info(f"[recovery] Session {session_id} has dead Celery task ({task_state}), will re-dispatch")
                    except Exception as celery_error:
                        # Check if this is a Redis connection error
                        error_type = type(celery_error).__name__
                        error_msg = str(celery_error).lower()
                        is_redis_error = (
                            "ConnectionError" in error_type or
                            "Connection closed" in error_msg or
                            "redis" in error_msg or
                            "result backend" in error_msg
                        )
                        
                        if is_redis_error and not redis_connection_failed:
                            # First Redis error - log once and skip all future status checks
                            logger.warning(
                                f"[recovery] Celery result backend (Redis) is not available during recovery. "
                                "Will skip task status checks and re-dispatch all incomplete debates. "
                                "This is non-critical - debates will resume when users reconnect or Redis is available."
                            )
                            redis_connection_failed = True
                        elif not is_redis_error:
                            # Non-Redis error - log it
                            logger.warning(
                                f"[recovery] Failed to check Celery task status for {session.celery_task_id}: "
                                f"{error_type}. Will re-dispatch task."
                            )
                        
                        # Clear the task ID since we can't verify it's running
                        session.celery_task_id = None
                elif session.celery_task_id and redis_connection_failed:
                    # Redis unavailable - clear task ID and re-dispatch (skip status check)
                    session.celery_task_id = None
                
                # Check if session has events (debate was started)
                events_result = await db.execute(
                    select(SessionEvent)
                    .where(SessionEvent.session_id == session.id)
                    .limit(1)
                )
                has_events = events_result.scalar_one_or_none() is not None
                
                if has_events:
                    # Re-dispatch Celery task
                    topic = session.topic or get_session_topic(session_id)
                    if not topic:
                        # Enhanced logging with context
                        logger.error(
                            f"[recovery] Cannot recover session {session_id}: no topic available. "
                            f"Status: {session.status}, "
                            f"Topic in DB: {session.topic is not None}, "
                            f"Topic in Redis: {get_session_topic(session_id) is not None}"
                        )
                        continue
                    
                    celery_task = run_debate_task.delay(
                        str(session.id),
                        session_id,
                        topic,
                        str(session.user_id)
                    )
                    session.celery_task_id = celery_task.id
                    set_task_running(session_id, task_id=celery_task.id)
                    
                    recovered_sessions.append(session_id)
                    logger.info(f"[recovery] ✅ Re-dispatched Celery task {celery_task.id} for session {session_id}")
                else:
                    logger.debug(f"[recovery] Session {session_id} has no events yet, not recovering (may not have started)")
            
            await db.commit()
            logger.info(f"[recovery] Recovery scan complete. Found {len(recovered_sessions)} debates to recover")
        
    except (OSError, ConnectionError) as e:
        # Database connection errors - log but don't fail startup
        error_msg = str(e)
        if "Network is unreachable" in error_msg or "Connection refused" in error_msg:
            logger.warning(
                f"[recovery] Database connection failed during recovery (this is non-critical): {e}. "
                "The app will continue to start. Please check ROUNDTABLE_DATABASE_URL environment variable."
            )
        else:
            logger.warning(f"[recovery] Database connection error (non-critical, app will continue): {e}")
    except Exception as e:
        error_msg = str(e)
        # Check for connection pool exhaustion errors
        if "MaxClientsInSessionMode" in error_msg or "max clients" in error_msg.lower() or "pool" in error_msg.lower():
            logger.warning(
                f"[recovery] Database connection pool exhausted during recovery (this is non-critical): {e}. "
                "The app will continue to start. Recovery will be skipped for this startup. "
                "Consider using Transaction Mode (port 6543) for Supabase or increasing pool size."
            )
        elif "Redis" in error_msg or "celery" in error_msg.lower() or "result backend" in error_msg.lower():
            # Redis/Celery backend errors - these are non-critical for recovery
            logger.warning(
                f"[recovery] Redis/Celery backend error during recovery (this is non-critical): {type(e).__name__}. "
                "The app will continue to start. Debates will resume when users reconnect or when Redis is available."
            )
        else:
            logger.warning(f"[recovery] Error during recovery (non-critical, app will continue): {type(e).__name__}: {e}")
    
    return recovered_sessions


async def resume_debate_session(session_id: str) -> bool:
    """
    Resume a specific debate session.
    
    Args:
        session_id: The session ID to resume
        
    Returns:
        True if debate was successfully resumed, False otherwise
    """
    try:
        async with AsyncSessionLocal() as db:
            # Fetch session
            result = await db.execute(
                select(RoundtableSession)
                .where(RoundtableSession.session_id == session_id)
            )
            session = result.scalar_one_or_none()
            
            if not session:
                logger.warning(f"[recovery] Session {session_id} not found, cannot resume")
                return False
            
            # Check if already completed
            if session.status == SessionStatus.COMPLETED.value:
                logger.info(f"[recovery] Session {session_id} is already completed, skipping")
                return False
            
            # Check if task is already running
            if is_task_running(session_id):
                logger.info(f"[recovery] Session {session_id} already has task running, skipping")
                return False
            
            # Get topic from Redis or skip if not available
            topic = get_session_topic(session_id)
            if not topic:
                logger.warning(f"[recovery] Session {session_id} has no topic in Redis, cannot resume (topic may have expired)")
                # Still try to resume - the stream endpoint will require topic
                # But we'll let the stream endpoint handle the topic requirement
            
            logger.info(f"[recovery] Ready to resume session {session_id} (topic available: {topic is not None})")
            return True
        
    except Exception as e:
        logger.error(f"[recovery] Error resuming session {session_id}: {e}", exc_info=True)
        return False

