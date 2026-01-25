import json
import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError, InternalServerError
from app.db.session import get_db
from app.models.session import RoundtableSession
from app.models.share_token import ShareToken
from app.services.artifacts.s3_upload import read_json_from_s3, read_pdf_from_s3, LOCAL_ARTIFACTS_PATH
from fastapi import Header
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/artifacts", tags=["artifacts"])
logger = logging.getLogger(__name__)

# Public use case session IDs (allowed without authentication)
PUBLIC_USE_CASE_SESSION_IDS = {
    "2e580fb4-2305-479e-aa00-960f0478c0ce",  # Product Strategy use case (old)
    "4703a989-41df-4a10-9b20-ffa0c3f61be3",  # Product Strategy use case (new) - Also used for interactive demo
    "b2bca702-8b0f-49bd-8d9e-c49c329e2d1c",  # Enterprise Deal Strategy use case (old)
    "d280db5e-4c89-4e00-97bd-1e10437fb8e0",  # Enterprise Deal Strategy use case (new)
}


@router.get("/public/{session_id}/json")
async def get_public_session_json(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """
    Fetch JSON output for a public use case session (no authentication required).
    Only allows access to specific whitelisted session IDs.
    """
    # Only allow whitelisted session IDs
    if session_id not in PUBLIC_USE_CASE_SESSION_IDS:
        logger.warning(f"Session ID not in whitelist: {session_id}")
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Fetch session
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        logger.warning(f"Session not found in database: {session_id}")
        raise NotFoundError(resource="Session", identifier=session_id)
    
    logger.info(f"Session found: {session_id}, audit_log_uri: {session.audit_log_uri}, artifact_uri: {session.artifact_uri}")
    
    # Get JSON artifact URI from database (stored in audit_log_uri)
    artifact_uri = session.audit_log_uri
    
    if not artifact_uri:
        logger.warning(f"audit_log_uri is empty for session: {session_id}. Checking artifact_uri as fallback...")
        # Fallback to artifact_uri if audit_log_uri is not set
        artifact_uri = session.artifact_uri
        if not artifact_uri:
            logger.error(f"Neither audit_log_uri nor artifact_uri found for session: {session_id}")
            raise NotFoundError(resource="JSON artifact", identifier=session_id)
    
    # Check if it's an S3 or file:// URI (read_json_from_s3 handles both)
    if artifact_uri.startswith("s3://") or artifact_uri.startswith("file://"):
        try:
            json_bytes = read_json_from_s3(artifact_uri)
            json_data = json.loads(json_bytes.decode("utf-8"))
            return JSONResponse(content=json_data)
        except FileNotFoundError as e:
            logger.error(f"Artifact not found: {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Artifact file not found: {str(e)}",
            )
        except Exception as e:
            logger.error(f"Error reading JSON: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read JSON: {str(e)}",
            )
    else:
        # Legacy local file path (without file:// prefix)
        json_path = Path(artifact_uri)
        if not json_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="JSON file not found",
            )
        
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)
            return JSONResponse(content=json_data)
        except Exception as e:
            logger.error(f"Error reading local JSON file: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read JSON file: {str(e)}",
            )


@router.get("/{session_id}/json")
async def get_session_json(
    session_id: str,
    x_share_token: Optional[str] = Header(None, alias="X-Share-Token"),
    current_user: Optional[CurrentUser] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """
    Fetch JSON output for a session from S3 or local file system.
    Supports share tokens for public access.
    """
    # Fetch session
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Check if share token is provided
    if x_share_token:
        # Verify share token
        token_result = await db.execute(
            select(ShareToken)
            .where(ShareToken.token == x_share_token)
            .where(ShareToken.session_id == session.id)
        )
        share_token = token_result.scalars().first()
        
        if not share_token or not share_token.is_valid():
            raise ForbiddenError(message="Invalid or expired share token")
        
        # Token is valid, allow access
        logger.info(f"Access granted via share token for session {session_id}")
    else:
        # Regular authentication required
        if not current_user or current_user.is_guest:
            raise ForbiddenError(message="Authentication required")
        
        # Verify user owns the session
        if str(session.user_id) != str(current_user.id):
            raise ForbiddenError(message="Access denied")
    
    # Log session URIs for debugging
    logger.info(f"Session {session_id} - audit_log_uri: {session.audit_log_uri}, artifact_uri: {session.artifact_uri}")
    
    # Get JSON artifact URI from database (stored in audit_log_uri)
    artifact_uri = session.audit_log_uri
    
    # Fallback to artifact_uri if audit_log_uri is empty (same as public endpoint)
    if not artifact_uri:
        logger.warning(f"audit_log_uri is empty for session: {session_id}. Checking artifact_uri as fallback...")
        # Fallback to artifact_uri if audit_log_uri is not set
        artifact_uri = session.artifact_uri
        if not artifact_uri:
            logger.error(f"Neither audit_log_uri nor artifact_uri found for session: {session_id}")
            raise NotFoundError(resource="JSON artifact", identifier=session_id)
        # Only use artifact_uri if it looks like JSON (not PDF)
        if artifact_uri.endswith('.pdf'):
            logger.error(f"artifact_uri is a PDF, not JSON for session: {session_id}")
            raise NotFoundError(resource="JSON artifact", identifier=session_id)
        logger.info(f"Using artifact_uri as fallback for session {session_id}: {artifact_uri}")
    
    # Log URI details and verify file existence
    logger.info(f"Attempting to read artifact for session {session_id}: {artifact_uri}")
    
    # Handle path migration: /tmp/artifacts/ -> /data/artifacts/ (Docker volume)
    # This handles legacy paths stored before the Docker volume migration
    if artifact_uri.startswith("/tmp/artifacts/"):
        logger.warning(f"Legacy /tmp/artifacts/ path detected, attempting migration to /data/artifacts/")
        # Extract filename from /tmp/artifacts/ path
        filename = Path(artifact_uri).name
        migrated_path = f"/data/artifacts/{filename}"
        logger.info(f"Trying migrated path: {migrated_path}")
        if Path(migrated_path).exists():
            logger.info(f"File found at migrated path, updating artifact_uri")
            artifact_uri = migrated_path
        else:
            logger.warning(f"File not found at migrated path either: {migrated_path}")
    
    if artifact_uri.startswith("file://"):
        resolved_path = artifact_uri[7:]  # Strip "file://" prefix
        logger.info(f"Resolved file:// URI to path: {resolved_path}")
        file_exists = Path(resolved_path).exists()
        logger.info(f"File exists: {file_exists}")
        if not file_exists:
            logger.error(f"File not found at path: {resolved_path}")
            # List directory contents to help debug
            parent_dir = Path(resolved_path).parent
            if parent_dir.exists():
                logger.info(f"Directory exists: {parent_dir}")
                try:
                    files_in_dir = list(parent_dir.glob('*'))
                    logger.info(f"Files in directory: {[str(f.name) for f in files_in_dir]}")
                except Exception as dir_error:
                    logger.warning(f"Could not list directory contents: {dir_error}")
            else:
                logger.error(f"Parent directory does not exist: {parent_dir}")
    elif artifact_uri.startswith("s3://"):
        logger.info(f"URI type: S3")
    else:
        logger.info(f"URI type: local path (legacy format)")
        file_exists = Path(artifact_uri).exists()
        logger.info(f"File exists: {file_exists}")
        if not file_exists:
            logger.error(f"File not found at path: {artifact_uri}")
            # If it's a /tmp/artifacts/ path, also check /data/artifacts/
            if artifact_uri.startswith("/tmp/artifacts/"):
                filename = Path(artifact_uri).name
                migrated_path = f"/data/artifacts/{filename}"
                logger.info(f"Checking migrated path: {migrated_path}")
                if Path(migrated_path).exists():
                    logger.info(f"File found at migrated path, using: {migrated_path}")
                    artifact_uri = migrated_path
                    file_exists = True
            if not file_exists:
                # List directory contents to help debug
                parent_dir = Path(artifact_uri).parent
                if parent_dir.exists():
                    logger.info(f"Directory exists: {parent_dir}")
                    try:
                        files_in_dir = list(parent_dir.glob('*'))
                        logger.info(f"Files in directory: {[str(f.name) for f in files_in_dir]}")
                    except Exception as dir_error:
                        logger.warning(f"Could not list directory contents: {dir_error}")
                else:
                    logger.error(f"Parent directory does not exist: {parent_dir}")
                    # Also check /data/artifacts/ directory
                    data_artifacts_dir = Path("/data/artifacts")
                    if data_artifacts_dir.exists():
                        logger.info(f"Checking /data/artifacts/ directory for file")
                        try:
                            files_in_data_dir = list(data_artifacts_dir.glob('*'))
                            logger.info(f"Files in /data/artifacts/: {[str(f.name) for f in files_in_data_dir]}")
                            # Try to find the file by session ID
                            session_files = list(data_artifacts_dir.glob(f"*{session_id}*"))
                            if session_files:
                                logger.info(f"Found potential session files: {[str(f) for f in session_files]}")
                        except Exception as dir_error:
                            logger.warning(f"Could not list /data/artifacts/ contents: {dir_error}")
    
    # Check if it's an S3 or file:// URI (read_json_from_s3 handles both)
    if artifact_uri.startswith("s3://") or artifact_uri.startswith("file://"):
        try:
            json_bytes = read_json_from_s3(artifact_uri)
            json_data = json.loads(json_bytes.decode("utf-8"))
            logger.info(f"Successfully read JSON artifact for session {session_id}")
            return JSONResponse(content=json_data)
        except FileNotFoundError as e:
            logger.error(f"Artifact not found: {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Artifact file not found: {str(e)}. URI: {artifact_uri}",
            )
        except Exception as e:
            logger.error(f"Error reading JSON: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read JSON: {str(e)}. URI: {artifact_uri}",
            )
    else:
        # Legacy local file path (without file:// prefix)
        json_path = Path(artifact_uri)
        if not json_path.exists():
            logger.error(f"JSON file not found at path: {json_path}")
            # Try to find file in /data/artifacts/ if original path was /tmp/artifacts/
            if artifact_uri.startswith("/tmp/artifacts/"):
                filename = Path(artifact_uri).name
                migrated_path = Path(f"/data/artifacts/{filename}")
                logger.info(f"Trying migrated path: {migrated_path}")
                if migrated_path.exists():
                    logger.info(f"File found at migrated path, using: {migrated_path}")
                    json_path = migrated_path
                else:
                    # Also try to find by session ID pattern
                    data_artifacts_dir = Path("/data/artifacts")
                    if data_artifacts_dir.exists():
                        session_files = list(data_artifacts_dir.glob(f"*{session_id}*.json"))
                        if session_files:
                            logger.info(f"Found session JSON file: {session_files[0]}")
                            json_path = session_files[0]
                        else:
                            raise HTTPException(
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"JSON file not found. Checked: {artifact_uri} and /data/artifacts/. The file may have been deleted or the path is incorrect.",
                            )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"JSON file not found at path: {json_path}. The file may have been deleted or the path is incorrect.",
                        )
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"JSON file not found at path: {json_path}. The file may have been deleted or the path is incorrect.",
                )
        
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)
            logger.info(f"Successfully read local JSON file for session {session_id} from {json_path}")
            return JSONResponse(content=json_data)
        except Exception as e:
            logger.error(f"Error reading local JSON file: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read JSON file at {json_path}: {str(e)}",
            )


@router.get("/{session_id}/download")
async def download_artifact(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Download the JSON artifact file for a session.
    Handles both S3 URIs and local file paths.
    """
    # Fetch session and verify ownership
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Verify user owns the session
    if str(session.user_id) != str(current_user.id):
        raise ForbiddenError(message="Access denied")
    
    # Get JSON artifact URI from database (stored in audit_log_uri)
    artifact_uri = session.audit_log_uri
    
    if not artifact_uri:
        raise NotFoundError(resource="Artifact", identifier=session_id)
    
    # Check if it's an S3 or file:// URI (read_json_from_s3 handles both)
    if artifact_uri.startswith("s3://") or artifact_uri.startswith("file://"):
        try:
            json_bytes = read_json_from_s3(artifact_uri)
            return StreamingResponse(
                iter([json_bytes]),
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="{session_id}_debate_output.json"'
                }
            )
        except FileNotFoundError as e:
            logger.error(f"Artifact not found: {e}")
            raise NotFoundError(resource="Artifact file", identifier=session_id)
        except Exception as e:
            logger.error(f"Error reading artifact: {e}", exc_info=True)
            raise InternalServerError(message="Failed to read artifact")
    else:
        # Local file path
        json_path = Path(artifact_uri)
        if not json_path.exists():
            raise NotFoundError(resource="Artifact file", identifier=artifact_uri)
        
        return FileResponse(
            json_path,
            media_type="application/json",
            filename=f"{session_id}_debate_output.json"
        )


@router.post("/{session_id}/generate-pdf")
async def generate_pdf_on_demand(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """
    Generate PDF on-demand for a session.
    Reads JSON from audit_log_uri, generates PDF, uploads to S3, and updates artifact_uri.
    """
    # Fetch session and verify ownership
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Verify user owns the session
    if str(session.user_id) != str(current_user.id):
        raise ForbiddenError(message="Access denied")
    
    # Check if PDF already exists
    if session.artifact_uri and session.artifact_uri.endswith(".pdf"):
        return JSONResponse(
            content={"message": "PDF already exists", "pdf_uri": session.artifact_uri},
            status_code=status.HTTP_200_OK
        )
    
    # Check if JSON exists (required for PDF generation)
    if not session.audit_log_uri:
        raise ValidationError(
            message="JSON artifact not found. Cannot generate PDF without JSON data."
        )
    
    try:
        from app.services.artifacts.pdf_generation import generate_and_upload_pdf
        
        logger.info(f"[generate-pdf-on-demand] Generating PDF for session {session_id}")
        # Pass raise_on_error=True so exceptions are raised with detailed error messages
        pdf_uri = await generate_and_upload_pdf(session_id, session, db, raise_on_error=True)
        
        if not pdf_uri:
            raise InternalServerError(message="PDF generation returned None (unexpected error)")
        
        # Update session artifact_uri with PDF URI
        session.artifact_uri = pdf_uri
        await db.commit()
        logger.info(f"[generate-pdf-on-demand] PDF generated and stored: {pdf_uri}")
        return JSONResponse(
            content={"message": "PDF generated successfully", "pdf_uri": pdf_uri},
            status_code=status.HTTP_200_OK
        )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"[generate-pdf-on-demand] Error generating PDF: {e}", exc_info=True)
        # Extract more detailed error message if available
        error_msg = str(e)
        if "PDF generation failed:" in error_msg:
            # Extract the actual error from the exception message
            error_msg = error_msg.split("PDF generation failed: ", 1)[-1] if "PDF generation failed: " in error_msg else error_msg
        
        # Return more detailed error message to help with debugging
        # Common issues: Playwright not installed, S3 connection issues, missing env vars
        detailed_msg = f"Failed to generate PDF: {error_msg}"
        raise InternalServerError(message=detailed_msg)


@router.get("/{session_id}/pdf")
async def download_pdf(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Download the PDF artifact for a session.
    Handles both S3 URIs and local file paths.
    PDF is stored in artifact_uri field.
    """
    # Fetch session and verify ownership
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Verify user owns the session
    if str(session.user_id) != str(current_user.id):
        raise ForbiddenError(message="Access denied")

    # Get PDF URI from database (stored in artifact_uri)
    pdf_uri = session.artifact_uri
    
    if not pdf_uri:
        raise NotFoundError(resource="PDF artifact", identifier=session_id)
    
    # Check if it's an S3 or file:// URI (read_pdf_from_s3 handles both)
    if pdf_uri.startswith("s3://") or pdf_uri.startswith("file://"):
        try:
            pdf_bytes = read_pdf_from_s3(pdf_uri)
            return StreamingResponse(
                iter([pdf_bytes]),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{session_id}_executive_brief.pdf"'
                }
            )
        except FileNotFoundError as e:
            logger.error(f"PDF not found: {e}")
            raise NotFoundError(resource="PDF file", identifier=session_id)
        except Exception as e:
            logger.error(f"Error reading PDF: {e}", exc_info=True)
            raise InternalServerError(message="Failed to read PDF")
    else:
        # Legacy local file path (without file:// prefix)
        pdf_path = Path(pdf_uri)
        if not pdf_path.exists():
            raise NotFoundError(resource="PDF file", identifier=pdf_uri)
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"{session_id}_executive_brief.pdf"
        )


@router.get("/{session_id}/download-pdf-from-json")
async def download_pdf_from_json(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Generate PDF on-demand from session JSON.
    Different from /pdf endpoint which downloads pre-generated executive briefs.
    This endpoint generates full debate documents from raw JSON.
    """
    # Fetch session and verify ownership
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Verify user owns the session
    if str(session.user_id) != str(current_user.id):
        raise ForbiddenError(message="Access denied")
    
    # Get JSON artifact URI from database (stored in audit_log_uri)
    artifact_uri = session.audit_log_uri
    
    if not artifact_uri:
        raise NotFoundError(resource="JSON artifact", identifier=session_id)
    
    # Handle path migration: /tmp/artifacts/ -> /data/artifacts/ (Docker volume)
    # This handles legacy paths stored before the Docker volume migration
    if artifact_uri.startswith("/tmp/artifacts/"):
        logger.warning(f"[download-pdf-from-json] Legacy /tmp/artifacts/ path detected, attempting migration to /data/artifacts/")
        # Extract filename from /tmp/artifacts/ path
        filename = Path(artifact_uri).name
        migrated_path = f"/data/artifacts/{filename}"
        logger.info(f"[download-pdf-from-json] Trying migrated path: {migrated_path}")
        if Path(migrated_path).exists():
            logger.info(f"[download-pdf-from-json] File found at migrated path, updating artifact_uri")
            artifact_uri = migrated_path
        else:
            logger.warning(f"[download-pdf-from-json] File not found at migrated path either: {migrated_path}")
    elif artifact_uri.startswith("file:///tmp/artifacts/"):
        # Handle file:// URIs pointing to /tmp/artifacts/
        logger.warning(f"[download-pdf-from-json] Legacy file:///tmp/artifacts/ path detected, attempting migration to /data/artifacts/")
        filename = Path(artifact_uri[7:]).name  # Strip "file://" prefix
        migrated_path = f"/data/artifacts/{filename}"
        logger.info(f"[download-pdf-from-json] Trying migrated path: {migrated_path}")
        if Path(migrated_path).exists():
            logger.info(f"[download-pdf-from-json] File found at migrated path, updating artifact_uri")
            artifact_uri = f"file://{migrated_path}"
        else:
            logger.warning(f"[download-pdf-from-json] File not found at migrated path either: {migrated_path}")
    
    try:
        # Load JSON from S3, file://, or local file path
        if artifact_uri.startswith("s3://") or artifact_uri.startswith("file://"):
            try:
                json_bytes = read_json_from_s3(artifact_uri)
                import json
                session_json = json.loads(json_bytes.decode("utf-8"))
            except FileNotFoundError:
                # If file:// URI failed, try migrating from /tmp/artifacts/ to /data/artifacts/
                if artifact_uri.startswith("file:///tmp/artifacts/"):
                    filename = Path(artifact_uri[7:]).name  # Strip "file://" prefix
                    migrated_path = f"/data/artifacts/{filename}"
                    logger.info(f"[download-pdf-from-json] File not found at original path, trying migrated path: {migrated_path}")
                    if Path(migrated_path).exists():
                        json_bytes = read_json_from_s3(f"file://{migrated_path}")
                        import json
                        session_json = json.loads(json_bytes.decode("utf-8"))
                    else:
                        # Try to find by session ID pattern
                        data_artifacts_dir = Path("/data/artifacts")
                        if data_artifacts_dir.exists():
                            session_files = list(data_artifacts_dir.glob(f"*{session_id}*.json"))
                            if session_files:
                                logger.info(f"[download-pdf-from-json] Found session JSON file: {session_files[0]}")
                                json_bytes = read_json_from_s3(f"file://{session_files[0]}")
                                import json
                                session_json = json.loads(json_bytes.decode("utf-8"))
                            else:
                                raise NotFoundError(resource="JSON file", identifier=artifact_uri)
                        else:
                            raise NotFoundError(resource="JSON file", identifier=artifact_uri)
                else:
                    raise
        else:
            # Legacy local file path (without file:// prefix)
            json_path = Path(artifact_uri)
            if not json_path.exists():
                # Try to find file in /data/artifacts/ if original path was /tmp/artifacts/
                if artifact_uri.startswith("/tmp/artifacts/"):
                    filename = Path(artifact_uri).name
                    migrated_path = Path(f"/data/artifacts/{filename}")
                    logger.info(f"[download-pdf-from-json] Trying migrated path: {migrated_path}")
                    if migrated_path.exists():
                        logger.info(f"[download-pdf-from-json] File found at migrated path, using: {migrated_path}")
                        json_path = migrated_path
                    else:
                        # Also try to find by session ID pattern
                        data_artifacts_dir = Path("/data/artifacts")
                        if data_artifacts_dir.exists():
                            session_files = list(data_artifacts_dir.glob(f"*{session_id}*.json"))
                            if session_files:
                                logger.info(f"[download-pdf-from-json] Found session JSON file: {session_files[0]}")
                                json_path = session_files[0]
                            else:
                                raise NotFoundError(resource="JSON file", identifier=artifact_uri)
                        else:
                            raise NotFoundError(resource="JSON file", identifier=artifact_uri)
                else:
                    raise NotFoundError(resource="JSON file", identifier=artifact_uri)
            
            import json
            with open(json_path, "r", encoding="utf-8") as f:
                session_json = json.load(f)
        
        # Generate PDF from JSON
        from app.services.artifacts.debate_pdf_generator import generate_pdf_from_debate_json
        
        logger.info(f"[download-pdf-from-json] Generating PDF from JSON for session {session_id}")
        pdf_bytes = await generate_pdf_from_debate_json(session_json)
        logger.info(f"[download-pdf-from-json] PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        # Return PDF as streaming response
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{session_id}_debate_document.pdf"'
            }
        )
        
    except NotFoundError:
        # Re-raise NotFoundError as-is
        raise
    except Exception as e:
        logger.error(f"[download-pdf-from-json] Error generating PDF: {e}", exc_info=True)
        error_msg = str(e)
        if "PDF generation failed:" in error_msg:
            error_msg = error_msg.split("PDF generation failed: ", 1)[-1] if "PDF generation failed: " in error_msg else error_msg
        
        # Check if it's a Playwright issue
        if "playwright" in error_msg.lower() or "browser" in error_msg.lower():
            raise InternalServerError(
                message="PDF generation failed: Playwright browser not available. Please ensure Playwright is properly installed."
            )
        
        raise InternalServerError(message=f"Failed to generate PDF: {error_msg}")


# File Explorer endpoints
class FileInfo(BaseModel):
    name: str
    size: int
    modified: datetime
    type: str  # "json", "pdf", "other"


@router.get("/files/list")
async def list_artifact_files(
    current_user: CurrentUser = Depends(get_current_user),
) -> JSONResponse:
    """
    List all files in the artifacts directory.
    Returns file metadata including name, size, modification date, and type.
    """
    # Verify user is authenticated (not guest)
    if not current_user or current_user.is_guest:
        raise ForbiddenError(message="Authentication required")
    
    artifacts_dir = Path(LOCAL_ARTIFACTS_PATH)
    
    if not artifacts_dir.exists():
        logger.warning(f"Artifacts directory does not exist: {artifacts_dir}")
        return JSONResponse(content={"files": []})
    
    try:
        files = []
        for file_path in artifacts_dir.iterdir():
            if file_path.is_file():
                # Get file metadata
                stat = file_path.stat()
                file_name = file_path.name
                
                # Determine file type
                if file_name.endswith('.json'):
                    file_type = "json"
                elif file_name.endswith('.pdf'):
                    file_type = "pdf"
                else:
                    file_type = "other"
                
                files.append({
                    "name": file_name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    "type": file_type
                })
        
        # Sort by modification date (newest first)
        files.sort(key=lambda x: x["modified"], reverse=True)
        
        logger.info(f"Listed {len(files)} files from artifacts directory")
        return JSONResponse(content={"files": files})
    
    except Exception as e:
        logger.error(f"Error listing artifact files: {e}", exc_info=True)
        raise InternalServerError(message=f"Failed to list files: {str(e)}")


@router.get("/files/{filename}")
async def get_artifact_file(
    filename: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """
    Download or view an artifact file by filename.
    Supports JSON (viewable) and PDF (downloadable) files.
    """
    # Verify user is authenticated (not guest)
    if not current_user or current_user.is_guest:
        raise ForbiddenError(message="Authentication required")
    
    # Security: Prevent path traversal attacks
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ForbiddenError(message="Invalid filename")
    
    artifacts_dir = Path(LOCAL_ARTIFACTS_PATH)
    file_path = artifacts_dir / filename
    
    if not file_path.exists():
        raise NotFoundError(resource="File", identifier=filename)
    
    # Verify file is within artifacts directory (additional security check)
    try:
        file_path.resolve().relative_to(artifacts_dir.resolve())
    except ValueError:
        raise ForbiddenError(message="Invalid file path")
    
    # Determine content type and disposition
    if filename.endswith('.json'):
        media_type = "application/json"
        # For JSON, allow viewing in browser
        headers = {
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    elif filename.endswith('.pdf'):
        media_type = "application/pdf"
        # For PDF, allow viewing in browser
        headers = {
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    else:
        media_type = "application/octet-stream"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    
    try:
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=filename,
            headers=headers
        )
    except Exception as e:
        logger.error(f"Error serving file {filename}: {e}", exc_info=True)
        raise InternalServerError(message=f"Failed to serve file: {str(e)}")