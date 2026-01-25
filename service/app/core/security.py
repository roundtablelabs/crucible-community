"""Security utilities for prompt injection protection, PII detection, content moderation, and JWT token creation."""
import re
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from jose import jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SecurityCheckResult:
    """Result of a security check."""
    is_safe: bool
    reason: Optional[str] = None
    sanitized_input: Optional[str] = None
    severity: str = "safe"  # "block", "warn", "safe"


class PromptInjectionDetector:
    """Detect and prevent prompt injection attacks."""
    
    # Common prompt injection patterns
    INJECTION_PATTERNS = [
        # Direct instruction overrides
        r"(?i)(ignore|forget|disregard|skip).*(previous|above|earlier|instructions|system|prompt)",
        r"(?i)(new|different|override|replace).*(instructions|prompt|system|rules)",
        r"(?i)(you are|act as|pretend|simulate).*(now|instead|different)",
        
        # System prompt leaks
        r"(?i)(show|display|reveal|print|output).*(system|prompt|instructions|rules|guidelines)",
        r"(?i)(what are|tell me|explain).*(your|the).*(instructions|prompt|system|rules)",
        
        # Role manipulation
        r"(?i)(you are|act as|pretend to be).*(admin|root|developer|system|god)",
        
        # Data extraction attempts
        r"(?i)(extract|reveal|show|display|output|print|return|list|dump).*(all|every|entire|full).*(data|information|content|prompt|instructions)",
        r"(?i)(what|tell|show).*(is|are).*(in|the|your).*(training|data|prompt|instructions)",
        
        # Jailbreak attempts
        r"(?i)(jailbreak|bypass|override|hack|exploit)",
        r"(?i)(do anything|ignore safety|remove restrictions)",
        
        # Encoding attempts
        r"(?i)(base64|hex|unicode|encode|decode).*(prompt|instructions)",
        
        # Special characters that might be used for injection
        r"<\|.*?\|>",  # Special tokens
        r"\[INST\].*?\[/INST\]",  # Instruction tags
        r"<\|im_start\|>.*?<\|im_end\|>",  # ChatML tags
    ]
    
    # Suspicious character sequences
    SUSPICIOUS_CHARS = [
        "\x00",  # Null byte
        "\x1B",  # Escape
        "\x7F",  # DEL
    ]
    
    # Maximum input length (characters) - prevent extremely long inputs
    # 50,000 chars ≈ 10,000-12,000 words (very generous for normal use)
    # This is primarily a security measure against prompt injection attacks
    # For context: Average debate question is <500 chars, intake messages are <200 chars
    MAX_INPUT_LENGTH = 50000
    
    # Soft limit: warn but don't reject (for legitimate long inputs)
    # Hard limit: reject completely (for security)
    SOFT_LIMIT = 10000  # ~2,000 words - warn but allow
    HARD_LIMIT = 100000  # ~20,000 words - reject for security
    
    # Maximum number of suspicious patterns before flagging
    MAX_SUSPICIOUS_PATTERNS = 2
    
    @classmethod
    def detect(cls, user_input: str) -> SecurityCheckResult:
        """
        Detect prompt injection attempts in user input.
        
        Args:
            user_input: The user input to check
            
        Returns:
            SecurityCheckResult with is_safe flag and reason if unsafe
        """
        if not user_input or not isinstance(user_input, str):
            return SecurityCheckResult(is_safe=True)
        
        # Check length - use hard limit for security
        # This prevents extremely long inputs that could be used for prompt injection
        if len(user_input) > cls.HARD_LIMIT:
            return SecurityCheckResult(
                is_safe=False,
                severity="block",
                reason=f"Input exceeds maximum security limit of {cls.HARD_LIMIT:,} characters ({cls.HARD_LIMIT//1000}K). Please provide a more concise input."
            )
        
        # Warn if approaching soft limit (but still allow)
        if len(user_input) > cls.SOFT_LIMIT:
            logger.info(
                f"Long input detected: {len(user_input):,} characters "
                f"(soft limit: {cls.SOFT_LIMIT:,}). This is allowed but may impact processing."
            )
        
        # Check for suspicious characters
        for char in cls.SUSPICIOUS_CHARS:
            if char in user_input:
                return SecurityCheckResult(
                    is_safe=False,
                    severity="block",
                    reason=f"Input contains suspicious control character: {repr(char)}"
                )
        
        # Check for injection patterns
        suspicious_count = 0
        matched_patterns = []
        
        for pattern in cls.INJECTION_PATTERNS:
            matches = re.findall(pattern, user_input)
            if matches:
                suspicious_count += len(matches)
                matched_patterns.append(pattern)
        
        if suspicious_count >= cls.MAX_SUSPICIOUS_PATTERNS:
            return SecurityCheckResult(
                is_safe=False,
                severity="block",
                reason=f"Detected {suspicious_count} suspicious patterns indicating potential prompt injection"
            )
        
        # If we get here, input appears safe
        return SecurityCheckResult(is_safe=True, severity="safe")
    
    @classmethod
    def sanitize(cls, user_input: str) -> str:
        """
        Sanitize user input to prevent prompt injection.
        
        This is a conservative approach that:
        1. Escapes special characters that could be used for injection
        2. Removes control characters
        3. Truncates extremely long inputs
        
        Args:
            user_input: The user input to sanitize
            
        Returns:
            Sanitized input safe for use in prompts
        """
        if not user_input or not isinstance(user_input, str):
            return ""
        
        # Remove control characters (security: prevent injection via control chars)
        sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', user_input)
        
        # Only truncate if exceeds hard security limit
        # We preserve the beginning (most important part) rather than truncating arbitrarily
        original_length = len(sanitized)
        if len(sanitized) > cls.HARD_LIMIT:
            # Preserve first part (usually most important) and add truncation notice
            preserved = sanitized[:cls.HARD_LIMIT - 100]  # Leave room for notice
            sanitized = f"{preserved}\n\n[Note: Input truncated from {original_length:,} to {cls.HARD_LIMIT:,} characters for security. Please provide a more concise version if full context is needed.]"
            logger.warning(
                f"Input truncated from {original_length:,} to {cls.HARD_LIMIT:,} characters. "
                f"Original length suggests potential security concern."
            )
        elif len(sanitized) > cls.SOFT_LIMIT:
            # Don't truncate, but log for monitoring
            logger.info(
                f"Long input processed: {len(sanitized):,} characters "
                f"(exceeds soft limit of {cls.SOFT_LIMIT:,}). Full input preserved."
            )
        
        # Remove excessive whitespace (potential obfuscation technique)
        # But preserve intentional formatting (double newlines, etc.)
        # Only collapse 3+ spaces/tabs into single space
        sanitized = re.sub(r'[ \t]{3,}', ' ', sanitized)
        # Preserve intentional line breaks (2+ newlines)
        sanitized = re.sub(r'\n{3,}', '\n\n', sanitized)
        
        return sanitized.strip()


class PIIDetector:
    """Detect and redact Personally Identifiable Information (PII)."""
    
    # Email pattern
    EMAIL_PATTERN = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    
    # Phone number patterns (US format)
    PHONE_PATTERN = r'\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b'
    
    # Credit card pattern (basic - detects 13-19 digit sequences)
    CREDIT_CARD_PATTERN = r'\b(?:\d[ -]*?){13,19}\b'
    
    # SSN pattern (US)
    SSN_PATTERN = r'\b\d{3}-\d{2}-\d{4}\b'
    
    # IP address pattern - matches potential IP addresses
    # We use a simpler pattern and rely on _is_valid_ip() to filter false positives
    # This avoids regex lookbehind limitations while still catching real IPs
    IP_PATTERN = r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'
    
    @classmethod
    def _is_valid_ip(cls, ip_match: str) -> bool:
        """
        Validate that a matched pattern is actually an IP address.
        Additional validation beyond regex to catch edge cases.
        """
        parts = ip_match.split('.')
        if len(parts) != 4:
            return False
        try:
            for part in parts:
                num = int(part)
                if num < 0 or num > 255:
                    return False
            return True
        except ValueError:
            return False
    
    @classmethod
    def detect(cls, text: str) -> Tuple[bool, list[str]]:
        """
        Detect PII in text.
        
        Args:
            text: Text to scan for PII
            
        Returns:
            Tuple of (has_pii, list of detected PII types)
        """
        if not text or not isinstance(text, str):
            return False, []
        
        detected_types = []
        
        # Check for email addresses
        if re.search(cls.EMAIL_PATTERN, text):
            detected_types.append("email")
        
        # Check for phone numbers
        if re.search(cls.PHONE_PATTERN, text):
            detected_types.append("phone")
        
        # Check for credit card numbers
        if re.search(cls.CREDIT_CARD_PATTERN, text):
            detected_types.append("credit_card")
        
        # Check for SSN
        if re.search(cls.SSN_PATTERN, text):
            detected_types.append("ssn")
        
        # Check for IP addresses with validation to avoid false positives
        ip_matches = re.finditer(cls.IP_PATTERN, text)
        for match in ip_matches:
            ip_str = match.group()
            # Additional check: exclude if preceded by version/section keywords
            start_pos = match.start()
            if start_pos > 0:
                # Check preceding context (up to 20 chars) for false positive indicators
                context_start = max(0, start_pos - 20)
                context = text[context_start:start_pos].lower()
                # Skip if it looks like a version number or section reference
                # Check for full keywords or 'v' followed by whitespace before the IP
                if (any(keyword in context for keyword in ['version', 'section', 'chapter', '§']) or
                    (text[start_pos - 1].lower() == 'v' and 
                     (start_pos == 1 or text[start_pos - 2].isspace()))):
                    continue
            if cls._is_valid_ip(ip_str):
                detected_types.append("ip_address")
                break  # Only need to detect once
        
        return len(detected_types) > 0, detected_types
    
    @classmethod
    def redact(cls, text: str, redaction_char: str = "[REDACTED]") -> str:
        """
        Redact PII from text.
        
        Args:
            text: Text to redact
            redaction_char: String to replace PII with
            
        Returns:
            Text with PII redacted
        """
        if not text or not isinstance(text, str):
            return text
        
        redacted = text
        
        # Redact emails
        redacted = re.sub(cls.EMAIL_PATTERN, redaction_char, redacted)
        
        # Redact phone numbers
        redacted = re.sub(cls.PHONE_PATTERN, redaction_char, redacted)
        
        # Redact credit card numbers
        redacted = re.sub(cls.CREDIT_CARD_PATTERN, redaction_char, redacted)
        
        # Redact SSN
        redacted = re.sub(cls.SSN_PATTERN, redaction_char, redacted)
        
        # Redact IP addresses (with validation to avoid false positives)
        # Use finditer to check context before redacting
        ip_matches = list(re.finditer(cls.IP_PATTERN, redacted))
        # Process matches in reverse order to maintain correct positions
        for match in reversed(ip_matches):
            ip_str = match.group()
            start_pos = match.start()
            end_pos = match.end()
            
            # Additional check: exclude if preceded by version/section keywords
            should_redact = True
            if start_pos > 0:
                # Check preceding context (up to 20 chars) for false positive indicators
                context_start = max(0, start_pos - 20)
                context = text[context_start:start_pos].lower()
                # Skip if it looks like a version number or section reference
                # Check for full keywords or 'v' followed by whitespace before the IP
                if (any(keyword in context for keyword in ['version', 'section', 'chapter', '§']) or
                    (text[start_pos - 1].lower() == 'v' and 
                     (start_pos == 1 or text[start_pos - 2].isspace()))):
                    should_redact = False
            
            if should_redact and cls._is_valid_ip(ip_str):
                redacted = redacted[:start_pos] + redaction_char + redacted[end_pos:]
        
        return redacted


class ContentModerator:
    """Content moderation for toxic/NSFW content.
    
    NOTE: Currently disabled - using OpenRouter for LLM calls.
    OpenAI Moderation API is not being used at this time.
    """
    
    # Categories that should be BLOCKED immediately (high severity)
    BLOCK_CATEGORIES = {
        "sexual/minors": True,
        "violence": True,
        "self-harm": True,
        "hate/threatening": True,  # Clear threats, not just controversial topics
    }
    
    # Categories that should WARN but allow (medium severity - for legitimate debates)
    WARN_CATEGORIES = {
        "hate": True,  # General hate content (may be legitimate in debate context)
        "harassment": True,  # May be discussing harassment, not perpetrating it
        "self-harm/intent": True,  # May be discussing mental health
    }
    
    # Toxic keywords (basic list as fallback)
    TOXIC_KEYWORDS = [
        # Add your list of toxic keywords here as fallback
        # Currently disabled - using OpenRouter for LLM calls
    ]
    
    @classmethod
    async def check_async(cls, text: str) -> SecurityCheckResult:
        """
        Check if content is safe.
        
        NOTE: Currently disabled - returns safe for all content.
        OpenAI Moderation API is not being used at this time.
        
        Returns:
        - severity="safe": All content is currently allowed
        
        Args:
            text: Text to check
            
        Returns:
            SecurityCheckResult with severity level
        """
        if not text or not isinstance(text, str):
            return SecurityCheckResult(is_safe=True, severity="safe")
        
        # Content moderation currently disabled - using OpenRouter for LLM calls
        # OpenAI Moderation API is not being used at this time
        return SecurityCheckResult(is_safe=True, severity="safe")
    
    @classmethod
    def check(cls, text: str) -> SecurityCheckResult:
        """
        Check if content is safe using keyword matching (fallback).
        
        NOTE: Currently disabled - returns safe for all content.
        OpenAI Moderation API is not being used at this time.
        
        Args:
            text: Text to check
            
        Returns:
            SecurityCheckResult with severity level
        """
        if not text or not isinstance(text, str):
            return SecurityCheckResult(is_safe=True, severity="safe")
        
        # Content moderation currently disabled - using OpenRouter for LLM calls
        # OpenAI Moderation API is not being used at this time
        return SecurityCheckResult(is_safe=True, severity="safe")


def sanitize_user_input(
    user_input: str, 
    check_injection: bool = True, 
    redact_pii: bool = True,
    max_length: Optional[int] = None
) -> Tuple[str, SecurityCheckResult]:
    """
    Comprehensive input sanitization.
    
    This function prioritizes preserving input quality while maintaining security.
    - Control characters are removed (security)
    - PII is redacted (privacy)
    - Only extremely long inputs (>100K chars) are truncated
    - Normal inputs (<10K chars) are preserved fully
    
    Args:
        user_input: User input to sanitize
        check_injection: Whether to check for prompt injection
        redact_pii: Whether to redact PII
        max_length: Optional custom max length (overrides class default)
    
    Returns:
        Tuple of (sanitized_input, security_check_result)
    """
    if not user_input:
        return "", SecurityCheckResult(is_safe=True)
    
    # Use custom max length if provided, otherwise use class defaults
    original_soft_limit = PromptInjectionDetector.SOFT_LIMIT
    original_hard_limit = PromptInjectionDetector.HARD_LIMIT
    if max_length:
        PromptInjectionDetector.SOFT_LIMIT = max_length // 5  # 20% of max
        PromptInjectionDetector.HARD_LIMIT = max_length
    
    try:
        # Check for prompt injection
        if check_injection:
            injection_check = PromptInjectionDetector.detect(user_input)
            if not injection_check.is_safe:
                logger.warning(f"Prompt injection detected: {injection_check.reason}")
                # Don't return empty string - return sanitized version instead
                # This allows legitimate topics that might trigger false positives
                sanitized = PromptInjectionDetector.sanitize(user_input)
                # Only return empty if severity is "block" (actual security threat)
                if injection_check.severity == "block":
                    return "", injection_check
                # For "warn" severity, return sanitized input with warning
                return sanitized, injection_check
        
        # Redact PII if requested
        sanitized = user_input
        if redact_pii:
            has_pii, pii_types = PIIDetector.detect(user_input)
            if has_pii:
                logger.info(f"PII detected in input: {pii_types}")
                sanitized = PIIDetector.redact(sanitized)
        
        # Sanitize the input (removes control chars, handles length)
        sanitized = PromptInjectionDetector.sanitize(sanitized)
        
        return sanitized, SecurityCheckResult(is_safe=True)
    finally:
        # Restore original limits
        PromptInjectionDetector.SOFT_LIMIT = original_soft_limit
        PromptInjectionDetector.HARD_LIMIT = original_hard_limit


# JWT Token Creation Functions

def create_access_token(subject: str, expires_delta: Optional[timedelta] = None, **kwargs) -> str:
    """
    Create a JWT access token.
    
    Args:
        subject: Subject (usually user ID)
        expires_delta: Optional expiration time delta
        **kwargs: Additional claims to include in the token
        
    Returns:
        Encoded JWT token string
    """
    settings = get_settings()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expiry_minutes)
    
    payload = {
        "sub": subject,
        "exp": expire,
        **kwargs
    }
    
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT refresh token.
    
    Args:
        subject: Subject (usually user ID)
        expires_delta: Optional expiration time delta
        
    Returns:
        Encoded JWT refresh token string
    """
    settings = get_settings()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expiry_minutes)
    
    payload = {
        "sub": subject,
        "exp": expire,
    }
    
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm=settings.jwt_algorithm)
