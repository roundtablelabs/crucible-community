"""Security endpoints for input sanitization."""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import sanitize_user_input

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/security", tags=["security"])


class SanitizeRequest(BaseModel):
    """Request to sanitize user input."""
    input: str = ""
    check_injection: bool = True
    redact_pii: bool = True


class SanitizeResponse(BaseModel):
    """Response from sanitization."""
    sanitized: str
    is_safe: bool
    reason: Optional[str] = None
    was_modified: bool


@router.post("/sanitize")
async def sanitize_input(request: SanitizeRequest) -> SanitizeResponse:
    """
    Sanitize user input for safe use in LLM prompts.
    
    Performs:
    - Prompt injection detection
    - PII detection and redaction
    - Input sanitization
    
    Returns sanitized input and safety status.
    """
    try:
        # Validate input
        if request.input is None:
            logger.warning("Received None input in sanitize endpoint")
            return SanitizeResponse(
                sanitized="",
                is_safe=True,
                reason="Input was None",
                was_modified=True
            )
        
        # Ensure input is a string
        input_str = str(request.input) if not isinstance(request.input, str) else request.input
        
        logger.debug(f"Sanitizing input of length {len(input_str)}")
        
        sanitized, security_check = sanitize_user_input(
            input_str,
            check_injection=request.check_injection,
            redact_pii=request.redact_pii
        )
        
        was_modified = sanitized != input_str
        
        return SanitizeResponse(
            sanitized=sanitized,
            is_safe=security_check.is_safe,
            reason=security_check.reason,
            was_modified=was_modified
        )
    except Exception as e:
        logger.error(f"Sanitization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Sanitization failed: {str(e)}"
        )



