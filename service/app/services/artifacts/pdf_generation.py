"""PDF generation service for debate artifacts."""
from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import RoundtableSession
from app.services.artifacts.s3_upload import read_json_from_s3, upload_pdf_to_s3_async
from app.services.artifacts.local_pdf_generator import generate_pdf_from_session_json

logger = logging.getLogger(__name__)


async def generate_and_upload_pdf(
    session_id: str,
    session: RoundtableSession,
    db: AsyncSession,
    raise_on_error: bool = False,
) -> Optional[str]:
    """
    Generate PDF locally using Playwright, upload to S3, return S3 URI.
    
    This function:
    1. Reads session JSON from S3 (using audit_log_uri)
    2. Generates PDF locally using Playwright
    3. Uploads PDF to S3
    4. Returns S3 URI for the PDF
    
    Args:
        session_id: Session ID
        session: RoundtableSession object
        db: Database session
        raise_on_error: If True, raise exceptions instead of returning None
    
    Returns:
        S3 URI if successful, None if failed
    
    Raises:
        Exception: If PDF generation fails and raise_on_error is True
    """
    try:
        # 1. Get session JSON from S3 (stored in audit_log_uri)
        if not session.audit_log_uri:
            logger.warning(f"[pdf_generation] No audit_log_uri found for session {session_id}, cannot generate PDF")
            return None
        
        logger.info(f"[pdf_generation] Reading JSON from S3: {session.audit_log_uri}")
        json_bytes = read_json_from_s3(session.audit_log_uri)
        session_json = json.loads(json_bytes.decode("utf-8"))
        
        # 2. Generate PDF locally using Playwright (pass user_id and db for API key resolution)
        logger.info(f"[pdf_generation] Generating PDF locally for session {session_id} (user_id={str(session.user_id)[:8]}...)")
        pdf_bytes = await generate_pdf_from_session_json(
            session_id, 
            session_json, 
            use_llm=True,
            user_id=str(session.user_id),  # Pass user_id for API key resolution
            db=db  # Pass db session for API key lookup
        )
        logger.info(f"[pdf_generation] PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        # 3. Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            tmp_path = Path(tmp.name)
        
        try:
            # 4. Upload to S3
            logger.info(f"[pdf_generation] Uploading PDF to S3 for session {session_id}")
            s3_uri = await upload_pdf_to_s3_async(tmp_path, session_id)
            logger.info(f"[pdf_generation] PDF uploaded to S3: {s3_uri}")
            return s3_uri
        finally:
            # 5. Clean up temp file
            tmp_path.unlink(missing_ok=True)
            logger.debug(f"[pdf_generation] Cleaned up temp file: {tmp_path}")
    
    except Exception as e:
        logger.error(f"[pdf_generation] Error generating PDF for session {session_id}: {e}", exc_info=True)
        if raise_on_error:
            # Re-raise exception for on-demand generation so user gets proper error message
            raise
        # Don't raise - return None so debate can continue (for automatic generation)
        return None
