"""Intake API router for document upload and processing."""
from __future__ import annotations

import json
import logging
import os
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.encryption import decrypt_api_key
from app.core.security import sanitize_user_input
from app.db.session import get_db
from app.models.user_settings import UserSettings
from app.services.documents.extractor import CreatorStudioExtractor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake", tags=["intake"])

# Initialize extractor (reused from creator studio)
_document_extractor = CreatorStudioExtractor()

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MIN_TEXT_LENGTH = 50  # Minimum readable text length
MIN_ALPHANUMERIC_RATIO = 0.3  # At least 30% alphanumeric characters


class IntakeUploadPreviewResponse(BaseModel):
    """Response model for document upload preview (text extraction only)."""
    extracted_text_preview: str
    file_name: str
    file_size: int
    word_count: int
    character_count: int


class IntakeUploadResponse(BaseModel):
    """Response model for document upload intake."""
    summary: str
    done: bool = True
    extracted_text_preview: Optional[str] = None


def validate_file_type(filename: str) -> bool:
    """Validate file extension (primary check)."""
    if not filename:
        return False
    filename_lower = filename.lower()
    return filename_lower.endswith(".pdf") or filename_lower.endswith(".docx")


def validate_extracted_text(text: str) -> tuple[bool, str]:
    """
    Validate that extracted text is readable and meaningful.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not text or not text.strip():
        return False, "No text could be extracted from the document. Please ensure the document contains readable text."
    
    # Check minimum length
    if len(text.strip()) < MIN_TEXT_LENGTH:
        return False, f"Document contains too little text (minimum {MIN_TEXT_LENGTH} characters required). Please ensure the document has readable text content."
    
    # Check for meaningful content (not just special chars)
    alphanumeric_count = sum(1 for c in text if c.isalnum())
    alphanumeric_ratio = alphanumeric_count / len(text) if text else 0
    if alphanumeric_ratio < MIN_ALPHANUMERIC_RATIO:
        return False, "Document appears to contain mostly non-text content. Please upload a document with readable text."
    
    # Check for excessive binary/control characters
    control_chars = sum(1 for c in text if ord(c) < 32 and c not in '\n\r\t')
    control_char_ratio = control_chars / len(text) if text else 0
    if control_char_ratio > 0.1:  # More than 10% control chars
        return False, "Document contains excessive unreadable characters. Please ensure the document is a valid text-based PDF or DOCX file."
    
    return True, ""


def _get_openrouter_encrypted(provider_api_keys: dict) -> Optional[str]:
    """Get OpenRouter encrypted key from provider_api_keys, trying common key names."""
    for k in ("openrouter", "OpenRouter", "open_router"):
        v = provider_api_keys.get(k)
        if v:
            return v
    return None


async def _get_user_openrouter_key(user_id: str, db: AsyncSession) -> Optional[str]:
    """
    Get the current user's OpenRouter API key from UserSettings.provider_api_keys.
    Returns None if not found or on error. Tries keys: openrouter, OpenRouter, open_router.
    """
    if not user_id or not db:
        return None
    try:
        user_uuid = UUID(str(user_id))
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_uuid)
        )
        settings = result.scalar_one_or_none()
        if not settings or not settings.provider_api_keys:
            return None
        encrypted = _get_openrouter_encrypted(settings.provider_api_keys)
        if not encrypted:
            return None
        key = decrypt_api_key(encrypted)
        return key.strip() if key else None
    except (ValueError, TypeError) as e:
        logger.debug(f"_get_user_openrouter_key: invalid user_id or decrypt error: {e}")
        return None
    except Exception as e:
        logger.warning(f"_get_user_openrouter_key: {e}")
        return None


def _resolve_openrouter_api_key(env_key: Optional[str], user_key: Optional[str]) -> Optional[str]:
    """Resolve OpenRouter API key: env first, then user settings."""
    return env_key or user_key


async def generate_intake_summary_from_text(
    text: str, 
    *, 
    openrouter_api_key: str,
    detected_provider: Optional[str] = None
) -> str:
    """
    Generate intake summary from extracted document text using LLM.
    
    Uses the same system prompt and model as the chat-based intake flow.
    Supports OpenRouter, OpenAI, and Anthropic APIs.
    Caller must resolve openrouter_api_key from env or user settings.
    
    Args:
        text: Extracted document text
        openrouter_api_key: API key (can be from any provider)
        detected_provider: Optional provider name ("openai", "anthropic", "openrouter")
                          to help with accurate detection
    """
    
    # Validate API key is not empty
    if not openrouter_api_key or not openrouter_api_key.strip():
        logger.error("[intake-summary] API key is empty or None")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="API key is invalid or empty. Please check your API key configuration."
        )
    
    # Clean and validate API key format
    openrouter_api_key = openrouter_api_key.strip()
    # Remove any leading/trailing whitespace or newlines that might have been introduced
    openrouter_api_key = "".join(openrouter_api_key.splitlines())
    
    # Validate key is not just whitespace after cleaning
    if not openrouter_api_key or len(openrouter_api_key) < 10:
        logger.error(f"[intake-summary] API key is too short after cleaning (length: {len(openrouter_api_key) if openrouter_api_key else 0})")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="API key appears to be invalid. Please check your API key in Settings."
        )
    
    # Log key format for debugging (safely - only first 20 chars to verify format)
    key_preview = openrouter_api_key[:20] if len(openrouter_api_key) >= 20 else openrouter_api_key
    logger.info(f"[intake-summary] Key format check - Length: {len(openrouter_api_key)}, Preview: {key_preview}...")
    
    # Check if key looks valid (should start with sk- for most providers)
    if not openrouter_api_key.startswith("sk-"):
        logger.warning(f"[intake-summary] WARNING: Key does not start with 'sk-' - this may be invalid. First 10 chars: {openrouter_api_key[:10]}")
    
    # Detect provider - use detected_provider if provided, otherwise infer from key format
    if detected_provider:
        # Use the provider that was detected when retrieving the key
        is_anthropic = detected_provider.lower() == "anthropic"
        is_openai = detected_provider.lower() == "openai"
        is_openrouter = detected_provider.lower() == "openrouter"
        logger.debug(f"[intake-summary] Using detected provider: {detected_provider}")
    else:
        # Fallback: detect provider based on key prefix patterns
        is_anthropic = openrouter_api_key.startswith("sk-ant-")
        # OpenRouter keys can start with "sk-or-" or "sk-or-v1-" (e.g., "sk-or-v1-abc123")
        is_openrouter = (
            openrouter_api_key.startswith("sk-or-") or
            openrouter_api_key.startswith("sk-or-v1-")
        )
        # OpenAI keys start with "sk-" but NOT "sk-ant-" or "sk-or-"
        is_openai = openrouter_api_key.startswith("sk-") and not is_anthropic and not is_openrouter
        
        # If key doesn't match any known pattern, try to infer from context
        # DO NOT assume OpenRouter based on length alone - modern OpenAI/Anthropic keys can be long
        if not is_anthropic and not is_openai and not is_openrouter:
            # If it starts with "sk-" but doesn't match known patterns, assume OpenAI
            # (OpenAI is the most common provider and has the most flexible key format)
            if openrouter_api_key.startswith("sk-"):
                logger.warning(f"[intake-summary] Key starts with 'sk-' but doesn't match known patterns, assuming OpenAI")
                is_openai = True
            else:
                # Key doesn't start with "sk-" at all - this is unusual
                # Could be a malformed key or a different provider format
                logger.warning(f"[intake-summary] Key doesn't start with 'sk-' - format may be invalid. First 10 chars: {openrouter_api_key[:10]}")
                # Default to OpenAI as fallback (most common)
                is_openai = True
    
    logger.info(f"[intake-summary] Provider detection - Anthropic: {is_anthropic}, OpenAI: {is_openai}, OpenRouter: {is_openrouter}, Key prefix: {key_preview}...")
    
    # Set model and base URL based on provider
    if is_anthropic:
        model = "claude-sonnet-4.5"
        base_url = "https://api.anthropic.com/v1"
    elif is_openai:
        model = "gpt-5.1"
        base_url = "https://api.openai.com/v1"
    else:  # OpenRouter
        model = os.getenv("INTAKE_MODEL") or os.getenv("ROUNDTABLE_OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")
        base_url = os.getenv("OPENROUTER_BASE_URL") or os.getenv("ROUNDTABLE_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    
    temperature = float(os.getenv("INTAKE_TEMPERATURE") or os.getenv("ROUNDTABLE_INTAKE_TEMPERATURE", "0.4"))
    
    # System prompt for document-based intake (similar to chat, but adapted for documents)
    system_prompt = (
        "You are a Strategic Intake Facilitator preparing a board-level decision brief. "
        "Your role is to analyze a document and extract essential context for an executive Crucible debate.\n\n"
        "**Your Objective:**\n"
        "Extract the core decision question, strategic context, business stakes, constraints, and urgency from the provided document. "
        "Your analysis will inform a moderator brief and guide expert selection for the debate.\n\n"
        "**Information to Extract:**\n"
        "1. The core decision question or strategic challenge\n"
        "2. Business context and stakes (financial, operational, strategic impact)\n"
        "3. Key constraints or guardrails (budget, timeline, regulatory, technical, geographic/jurisdictional)\n"
        "4. Urgency and decision timeline\n"
        "5. Relevant background or prior analysis\n"
        "6. Success criteria or desired outcomes\n\n"
        "**Summary Format:**\n"
        "Craft a concise executive summary (4-5 sentences) that captures:\n"
        "- The strategic question or decision to be debated\n"
        "- Key business context and stakes\n"
        "- Critical constraints or considerations\n"
        "- Urgency level and timeline\n\n"
        "**Response Format:**\n"
        'You MUST respond with valid JSON only, matching this exact schema: {"summary": "string"}\n'
        "Do not include any text outside the JSON object. Ensure all JSON is valid and properly formatted."
    )
    
    # User message with document content
    user_message = (
        "Please analyze the following document and generate an executive summary for a board-level debate:\n\n"
        f"{text[:50000]}"  # Limit to 50K chars to avoid token limits
    )
    
    # Prepare headers based on provider
    headers = {"Content-Type": "application/json"}
    
    if is_anthropic:
        headers["x-api-key"] = openrouter_api_key
        headers["anthropic-version"] = "2023-06-01"
    else:
        # For OpenAI and OpenRouter, use Bearer token
        # Ensure key is properly formatted (no extra spaces, newlines, etc.)
        clean_key = openrouter_api_key.strip()
        headers["Authorization"] = f"Bearer {clean_key}"
        
        # Log Authorization header format (safely - show first 20 and last 4 chars)
        auth_header_preview = headers["Authorization"][:20] + "..." + headers["Authorization"][-4:] if len(headers["Authorization"]) > 24 else "***masked***"
        logger.debug(f"[intake-summary] Authorization header format: {auth_header_preview}")
        logger.debug(f"[intake-summary] Key length in header: {len(clean_key)}")
        
        # Add OpenRouter-specific headers
        # If we're using OpenRouter base URL or key doesn't match OpenAI/Anthropic, assume OpenRouter
        if is_openrouter or (not is_openai and not is_anthropic):
            logger.debug(f"[intake-summary] Setting OpenRouter-specific headers (is_openrouter={is_openrouter})")
            site_url = os.getenv("OPENROUTER_SITE_URL") or os.getenv("ROUNDTABLE_OPENROUTER_SITE_URL")
            if site_url:
                headers["HTTP-Referer"] = site_url
                logger.debug(f"[intake-summary] Added HTTP-Referer header: {site_url}")
            app_title = os.getenv("OPENROUTER_APP_TITLE") or os.getenv("ROUNDTABLE_OPENROUTER_APP_TITLE")
            if app_title:
                headers["X-Title"] = app_title
                logger.debug(f"[intake-summary] Added X-Title header: {app_title}")
    
    # Prepare payload based on provider
    if is_anthropic:
        # Anthropic uses different API format
        payload = {
            "model": model,
            "max_tokens": 4096,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_message},
            ],
        }
        endpoint = f"{base_url}/messages"
    else:
        # OpenAI and OpenRouter use chat completions format
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        endpoint = f"{base_url}/chat/completions"
    
    try:
        # Log request details (without sensitive data)
        provider_name = 'Anthropic' if is_anthropic else 'OpenAI' if is_openai else 'OpenRouter'
        logger.info(f"[intake-summary] Making API request to {endpoint}, provider: {provider_name}")
        
        # Log header info (safely - mask Authorization header)
        safe_headers = {}
        for k, v in headers.items():
            if k.lower() == "authorization" or k.lower() == "x-api-key":
                # Show first 10 chars and last 4 chars of the key
                if len(v) > 14:
                    safe_headers[k] = f"{v[:10]}...{v[-4:]}"
                else:
                    safe_headers[k] = "***masked***"
            else:
                safe_headers[k] = v[:50] + "..." if len(str(v)) > 50 else v
        logger.debug(f"[intake-summary] Headers (sanitized): {safe_headers}")
        
        # Verify Authorization header is present and valid for non-Anthropic requests
        if not is_anthropic:
            if "Authorization" not in headers:
                logger.error("[intake-summary] Authorization header is missing for non-Anthropic request!")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Internal error: Authorization header not set. Please contact support."
                )
            auth_value = headers["Authorization"]
            # Verify Authorization header format
            if not auth_value.startswith("Bearer "):
                logger.error(f"[intake-summary] Authorization header format is invalid: {auth_value[:20]}...")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Internal error: Authorization header format is invalid. Please contact support."
                )
            # Verify the key part is not empty
            key_part = auth_value[7:]  # Remove "Bearer " prefix
            if not key_part or len(key_part.strip()) < 10:
                logger.error(f"[intake-summary] API key in Authorization header is too short or empty (length: {len(key_part)})")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="API key appears to be invalid. Please check your API key in Settings."
                )
            logger.debug(f"[intake-summary] Authorization header validated - key length: {len(key_part)}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                json=payload,
            )
            logger.debug(f"[intake-summary] Response status: {response.status_code}")
            response.raise_for_status()
            result = response.json()
            
            # Extract content from response based on provider
            if is_anthropic:
                # Anthropic response format
                content = result.get("content", [{}])[0].get("text", "")
            else:
                # OpenAI/OpenRouter response format
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                raise ValueError("Empty response from LLM")
            
            # Clean up content - remove markdown code blocks if present
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:].strip()
            elif content.startswith("```"):
                content = content[3:].strip()
            if content.endswith("```"):
                content = content[:-3].strip()
            
            # Parse JSON response
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {content[:200]}...")
                raise ValueError(f"Invalid JSON response from LLM: {str(e)}")
            
            summary = parsed.get("summary", "").strip()
            
            if not summary:
                raise ValueError("Summary is empty")
            
            return summary
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if e.response else "Unknown error"
        status_code = e.response.status_code if e.response else 500
        
        # Try to parse error response for more details
        error_details = error_text
        try:
            if e.response:
                error_json = e.response.json()
                if isinstance(error_json, dict) and "error" in error_json:
                    error_details = str(error_json.get("error", error_text))
        except:
            pass
        
        logger.error(f"Intake summary generation API error (status {status_code}): {error_details}")
        logger.error(f"[intake-summary] Request endpoint: {endpoint}")
        logger.error(f"[intake-summary] Provider detected: Anthropic={is_anthropic}, OpenAI={is_openai}, OpenRouter={is_openrouter}")
        logger.error(f"[intake-summary] Key length: {len(openrouter_api_key)}, Key prefix: {openrouter_api_key[:15] if len(openrouter_api_key) >= 15 else openrouter_api_key}")
        
        # Provide more specific error messages based on status code
        if status_code == 401:
            # Check if it's an OpenRouter-specific error
            if "cookie" in error_details.lower() or "auth credentials" in error_details.lower():
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="OpenRouter API authentication failed. Please verify your OpenRouter API key is correct and active in Settings. The key should start with 'sk-or-'."
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="API authentication failed. Please check your API key (OpenRouter, OpenAI, or Anthropic) in Settings."
            )
        elif status_code == 429:
            # Community Edition: Rate limiting disabled - treat 429 as temporary service issue
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM service is temporarily unavailable. Please try again in a few moments."
            )
        elif status_code >= 500:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM service is temporarily unavailable. Please try again later."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate intake summary from document. Please try again or use the chat-based intake."
            )
    except httpx.TimeoutException:
        logger.error("Intake summary generation timed out after 60 seconds")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request timed out while generating summary. The document may be too large. Please try a shorter document or use the chat-based intake."
        )
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON response: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse response from LLM. Please try again."
        )
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"Intake summary validation error: {error_msg}")
        if "empty" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="LLM returned an empty summary. Please try again or use the chat-based intake."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Summary validation failed: {error_msg}"
        )
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        logger.error(f"Intake summary generation error ({error_type}): {error_msg}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {error_type}. Please try again or use the chat-based intake."
        )


@router.post("/upload/preview", response_model=IntakeUploadPreviewResponse, status_code=status.HTTP_200_OK)
async def preview_intake_document(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> IntakeUploadPreviewResponse:
    """
    Preview document upload - extracts text only (no LLM processing).
    Used to show user what will be processed before confirming.
    """
    # 1. File size validation
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)}MB."
        )
    
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )
    
    # 2. File type validation
    filename = file.filename or "upload.pdf"
    if not validate_file_type(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF or DOCX files are supported."
        )
    
    # 3. Extract text from document
    try:
        extracted_text = _document_extractor._extract_text(file_bytes, filename)
    except ValueError as e:
        error_msg = str(e)
        logger.warning(f"Document extraction validation error (preview): {error_msg}")
        # Provide more specific error messages
        if "python-docx" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DOCX support is not available. Please convert your document to PDF and try again."
            )
        elif "unable to open" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to open the document file. {error_msg}. Please ensure the file is not corrupted and is a valid PDF or DOCX document."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        logger.error(f"Document extraction error (preview) ({error_type}): {error_msg}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to extract text from document. Please ensure the file is a valid PDF or DOCX document and is not corrupted."
        )
    
    # 4. Validate extracted text readability
    is_valid, error_msg = validate_extracted_text(extracted_text)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Return preview (first 500 chars for display)
    preview = extracted_text[:500] if len(extracted_text) > 500 else extracted_text
    word_count = len(extracted_text.strip().split())
    char_count = len(extracted_text)
    
    return IntakeUploadPreviewResponse(
        extracted_text_preview=preview,
        file_name=filename,
        file_size=len(file_bytes),
        word_count=word_count,
        character_count=char_count,
    )


@router.post("/upload", response_model=IntakeUploadResponse, status_code=status.HTTP_200_OK)
async def upload_intake_document(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntakeUploadResponse:
    """
    Upload and process a document for intake, bypassing the Q&A flow.
    
    Accepts PDF or DOCX files, extracts text, validates content, and generates
    an intake summary using LLM.
    """
    # 1. File size validation
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)}MB."
        )
    
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )
    
    # 2. File type validation (extension check)
    filename = file.filename or "upload.pdf"
    if not validate_file_type(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF or DOCX files are supported."
        )
    
    # 3. Extract text from document
    try:
        extracted_text = _document_extractor._extract_text(file_bytes, filename)
    except ValueError as e:
        error_msg = str(e)
        logger.warning(f"Document extraction validation error: {error_msg}")
        # Provide more specific error messages
        if "python-docx" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DOCX support is not available. Please convert your document to PDF and try again."
            )
        elif "unable to open" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to open the document file. {error_msg}. Please ensure the file is not corrupted and is a valid PDF or DOCX document."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        logger.error(f"Document extraction error ({error_type}): {error_msg}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to extract text from document. Please ensure the file is a valid PDF or DOCX document and is not corrupted."
        )
    
    # 4. Validate extracted text readability
    is_valid, error_msg = validate_extracted_text(extracted_text)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 5. Sanitize extracted text (security check)
    # Note: We may want to keep PII for intake context, so redact_pii=False
    # But we still check for prompt injection
    sanitized_text, security_result = sanitize_user_input(
        extracted_text,
        check_injection=True,
        redact_pii=False,  # Keep PII for intake context
        max_length=100000  # Allow longer for documents
    )
    
    if not security_result.is_safe and security_result.severity == "block":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document content failed security validation."
        )

    # Resolve API key: try OpenRouter first, then fall back to OpenAI/Anthropic
    env_key = (
        os.getenv("ROUNDTABLE_OPENROUTER_API_KEY") or
        os.getenv("OPENROUTER_API_KEY")
    )
    user_openrouter_key = None
    user_openai_key = None
    user_anthropic_key = None
    
    if current_user and not current_user.is_guest:
        # Get user's API keys from settings
        # Handle both UUID and string user IDs (community edition)
        user_uuid = None
        try:
            # Try to parse as UUID first
            user_uuid = UUID(str(current_user.id))
        except ValueError:
            # Not a UUID - look up default community user
            from app.models.user import User
            result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            default_user = result.scalar_one_or_none()
            if default_user:
                user_uuid = default_user.id
                logger.debug(f"[intake-upload] Using default community user UUID: {user_uuid}")
            else:
                logger.warning(f"[intake-upload] User ID is not UUID and default user not found: {current_user.id}")
        
        if user_uuid:
            try:
                result = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == user_uuid)
                )
                settings = result.scalars().first()
                if settings and settings.provider_api_keys:
                    # Try OpenRouter
                    openrouter_encrypted = _get_openrouter_encrypted(settings.provider_api_keys)
                    if openrouter_encrypted:
                        try:
                            user_openrouter_key = decrypt_api_key(openrouter_encrypted)
                            # Log key info safely (first 10 chars only)
                            key_preview = user_openrouter_key[:10] if user_openrouter_key else "None"
                            logger.info(f"[intake-upload] Found OpenRouter key in user settings (length: {len(user_openrouter_key) if user_openrouter_key else 0}, prefix: {key_preview}...)")
                        except Exception as e:
                            logger.warning(f"Failed to decrypt OpenRouter key: {e}", exc_info=True)
                    
                    # Try OpenAI
                    openai_encrypted = settings.provider_api_keys.get("openai")
                    if openai_encrypted:
                        try:
                            user_openai_key = decrypt_api_key(openai_encrypted)
                            logger.debug(f"[intake-upload] Found OpenAI key in user settings")
                        except Exception as e:
                            logger.warning(f"Failed to decrypt OpenAI key: {e}")
                    
                    # Try Anthropic
                    anthropic_encrypted = settings.provider_api_keys.get("anthropic")
                    if anthropic_encrypted:
                        try:
                            user_anthropic_key = decrypt_api_key(anthropic_encrypted)
                            logger.debug(f"[intake-upload] Found Anthropic key in user settings")
                        except Exception as e:
                            logger.warning(f"Failed to decrypt Anthropic key: {e}")
            except Exception as e:
                logger.warning(f"Failed to load user settings: {e}", exc_info=True)
    
    # Resolve API key - prefer OpenRouter, fallback to OpenAI or Anthropic
    # Track which provider the key came from to avoid misclassification
    api_key = None
    detected_provider = None
    
    # Try OpenRouter first
    openrouter_key = _resolve_openrouter_api_key(env_key, user_openrouter_key)
    if openrouter_key:
        api_key = openrouter_key
        detected_provider = "openrouter"
        logger.info(f"[intake-upload] Using OpenRouter API key")
    
    # If no OpenRouter, try OpenAI
    if not api_key and (os.getenv("OPENAI_API_KEY") or user_openai_key):
        api_key = os.getenv("OPENAI_API_KEY") or user_openai_key
        detected_provider = "openai"
        logger.info(f"[intake-upload] Using OpenAI API key")
    
    # If no OpenAI, try Anthropic
    if not api_key and (os.getenv("ANTHROPIC_API_KEY") or user_anthropic_key):
        api_key = os.getenv("ANTHROPIC_API_KEY") or user_anthropic_key
        detected_provider = "anthropic"
        logger.info(f"[intake-upload] Using Anthropic API key")
    
    if not api_key:
        logger.error(f"[intake-upload] No API key found - env_key: {bool(env_key)}, user_openrouter: {bool(user_openrouter_key)}, user_openai: {bool(user_openai_key)}, user_anthropic: {bool(user_anthropic_key)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No API key configured. Please add an OpenRouter, OpenAI, or Anthropic API key in Settings."
        )
    
    # Log which provider we're using (without logging the actual key)
    logger.info(f"[intake-upload] Using {detected_provider.upper()} API (key length: {len(api_key)})")

    # 6. Generate intake summary from document
    try:
        summary = await generate_intake_summary_from_text(
            sanitized_text, 
            openrouter_api_key=api_key,
            detected_provider=detected_provider
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Summary generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate intake summary. Please try again or use the chat-based intake."
        )
    
    # 7. Return response with summary
    # Include preview of extracted text (first 500 chars) for debugging/verification
    preview = sanitized_text[:500] if len(sanitized_text) > 500 else sanitized_text
    
    return IntakeUploadResponse(
        summary=summary,
        done=True,
        extracted_text_preview=preview if os.getenv("NODE_ENV") == "development" else None,
    )


@router.get("/upload/config-check")
async def check_upload_config(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Diagnostic endpoint to check upload configuration.
    Helps debug upload failures by verifying required dependencies and environment variables.
    Considers both server env vars and the user's API key in Settings (provider_api_keys.openrouter).
    """
    env_key = (
        os.getenv("ROUNDTABLE_OPENROUTER_API_KEY") or
        os.getenv("OPENROUTER_API_KEY") or
        os.getenv("OPENAI_API_KEY")
    )
    user_key = None
    if current_user and not current_user.is_guest:
        user_key = await _get_user_openrouter_key(str(current_user.id), db)
    openrouter_key = _resolve_openrouter_api_key(env_key, user_key)

    config_status = {
        "openrouter_api_key_configured": bool(openrouter_key),
        "openrouter_api_key_prefix": "",
        "document_extraction_available": True,
        "pdf_support": True,
        "docx_support": False,
    }

    # Prefix: only show for env key (do not expose user-stored key)
    if env_key:
        config_status["openrouter_api_key_prefix"] = env_key[:7] + "..."
    elif user_key:
        config_status["openrouter_api_key_prefix"] = "•••••••"
    
    # Check DOCX support
    try:
        from docx import Document
        config_status["docx_support"] = True
    except ImportError:
        config_status["docx_support"] = False
    
    # Check PDF support (pymupdf)
    try:
        import pymupdf
        config_status["pdf_support"] = True
    except ImportError:
        config_status["pdf_support"] = False
        config_status["document_extraction_available"] = False
    
    return config_status

