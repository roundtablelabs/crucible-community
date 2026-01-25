# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Encryption utilities for sensitive data like API keys."""
import base64
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)


def _is_production_environment() -> bool:
    """Check if running in production environment.
    
    Checks both ROUNDTABLE_ENVIRONMENT (primary) and PRODUCTION (fallback)
    to ensure consistent production detection across the application.
    
    Returns:
        True if running in production, False otherwise
    """
    # Primary check: ROUNDTABLE_ENVIRONMENT (consistent with config.py)
    environment = os.getenv("ROUNDTABLE_ENVIRONMENT", "local").lower()
    if environment == "production":
        return True
    
    # Fallback check: PRODUCTION flag (for backward compatibility)
    production_flag = os.getenv("PRODUCTION", "").lower() in ("true", "1", "yes")
    if production_flag:
        return True
    
    return False


def _derive_fernet_key(password: str, salt: bytes = b"crucible_encryption_salt") -> bytes:
    """Derive a Fernet-compatible key from a password string.
    
    Fernet requires a URL-safe base64-encoded 32-byte key. This function
    derives such a key from a password using PBKDF2.
    
    Args:
        password: The password/secret to derive the key from
        salt: Salt for key derivation (should be constant for same password)
        
    Returns:
        URL-safe base64-encoded 32-byte key suitable for Fernet
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key


def get_encryption_key() -> bytes:
    """Get Fernet encryption key from environment variable.
    
    For production environments, API_KEY_ENCRYPTION_KEY must be set or startup will fail.
    For local/development environments, uses a default key (not secure, but functional).
    
    The default key fallback is ONLY allowed in local/development environments to prevent
    accidental use in production deployments.
    
    Returns:
        Fernet-compatible encryption key (URL-safe base64-encoded 32-byte key)
        
    Raises:
        ValueError: In production environment if API_KEY_ENCRYPTION_KEY is not set
    """
    key = os.getenv("API_KEY_ENCRYPTION_KEY")
    is_production = _is_production_environment()
    
    if not key:
        if is_production:
            raise ValueError(
                "❌ CRITICAL: API_KEY_ENCRYPTION_KEY environment variable is required in production. "
                "The application cannot start without a secure encryption key. "
                "Set API_KEY_ENCRYPTION_KEY to a secure random string (at least 32 characters). "
                "Generate a key using: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        
        # Only allow default key in local/development environments
        logger.warning(
            "⚠️  WARNING: API_KEY_ENCRYPTION_KEY not set. Using default key (NOT SECURE for production). "
            "This default key will make all encrypted API keys unreadable if the key changes between restarts. "
            "Set API_KEY_ENCRYPTION_KEY environment variable to a stable 32-byte key for production use."
        )
        # Default key for development only - NEVER use in production
        key = "default-dev-key-32-bytes-long!!"
    
    # Derive Fernet key from the password string
    return _derive_fernet_key(key)


def _get_fernet_instance() -> Fernet:
    """Get a Fernet instance with the current encryption key.
    
    Returns:
        Fernet instance configured with the current encryption key
    """
    key = get_encryption_key()
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key using Fernet symmetric encryption.
    
    Fernet provides authenticated encryption using AES-128 in CBC mode with
    HMAC-SHA256 for authentication. This is cryptographically secure and
    suitable for production use.
    
    Args:
        api_key: The API key to encrypt
        
    Returns:
        Encrypted string (URL-safe base64-encoded)
        
    Raises:
        ValueError: If encryption fails
    """
    if not api_key:
        return ""
    
    try:
        f = _get_fernet_instance()
        encrypted = f.encrypt(api_key.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Error encrypting API key: {e}", exc_info=True)
        raise ValueError(f"Failed to encrypt API key: {e}") from e


def _decrypt_xor_legacy(encrypted_key: str) -> Optional[str]:
    """Legacy XOR decryption for backward compatibility.
    
    This function attempts to decrypt using the old XOR method.
    Used as a fallback when Fernet decryption fails.
    
    Note: In production, this will only work if API_KEY_ENCRYPTION_KEY is set
    (it will not use the default key in production).
    
    Args:
        encrypted_key: The encrypted API key (base64-encoded)
        
    Returns:
        Decrypted API key string, or None if decryption fails
    """
    try:
        # Decode from base64
        encrypted = base64.b64decode(encrypted_key.encode())
        
        # Get the old-style key (32 bytes)
        # In production, require API_KEY_ENCRYPTION_KEY to be set
        key_str = os.getenv("API_KEY_ENCRYPTION_KEY")
        is_production = _is_production_environment()
        
        if not key_str:
            if is_production:
                # In production, don't allow default key for legacy decryption
                logger.error(
                    "Cannot decrypt legacy XOR-encrypted key in production: "
                    "API_KEY_ENCRYPTION_KEY is not set. "
                    "Set API_KEY_ENCRYPTION_KEY to the key used to encrypt this data."
                )
                return None
            # Only use default key in development
            key_str = "default-dev-key-32-bytes-long!!"
        
        key_bytes = key_str.encode()[:32].ljust(32, b'0')
        
        # Decrypt using XOR
        decrypted = bytearray()
        for i, byte in enumerate(encrypted):
            decrypted.append(byte ^ key_bytes[i % len(key_bytes)])
        
        return decrypted.decode()
    except Exception:
        # If XOR decryption fails, return None
        return None


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key.
    
    Attempts Fernet decryption first (new method). If that fails, falls back
    to XOR decryption for backward compatibility with existing encrypted keys.
    
    Args:
        encrypted_key: The encrypted API key
        
    Returns:
        Decrypted API key string
        
    Raises:
        ValueError: If decryption fails with both methods
    """
    if not encrypted_key:
        return ""
    
    # Try Fernet decryption first (new secure method)
    try:
        f = _get_fernet_instance()
        decrypted = f.decrypt(encrypted_key.encode())
        return decrypted.decode()
    except Exception as fernet_error:
        # If Fernet decryption fails, try legacy XOR decryption for backward compatibility
        logger.debug(
            f"Fernet decryption failed, attempting legacy XOR decryption: {fernet_error}"
        )
        legacy_result = _decrypt_xor_legacy(encrypted_key)
        
        if legacy_result is not None:
            logger.warning(
                "Successfully decrypted using legacy XOR method. "
                "Consider re-encrypting this API key with the new Fernet encryption. "
                "The key will be automatically re-encrypted on next save."
            )
            return legacy_result
        
        # Both methods failed
        logger.error(
            f"Failed to decrypt API key with both Fernet and legacy XOR methods: {fernet_error}",
            exc_info=True
        )
        raise ValueError(
            "Failed to decrypt API key. This may indicate the encryption key has changed "
            "or the data is corrupted."
        ) from fernet_error


def mask_api_key(api_key: str, visible_chars: int = 4) -> str:
    """Mask an API key showing only the last few characters.
    
    Args:
        api_key: The API key to mask
        visible_chars: Number of characters to show at the end
        
    Returns:
        Masked API key (e.g., "sk-...abcd")
    """
    if not api_key:
        return ""
    
    if len(api_key) <= visible_chars:
        return "*" * len(api_key)
    
    return f"{'*' * (len(api_key) - visible_chars)}{api_key[-visible_chars:]}"


def is_masked_key(api_key: str) -> bool:
    """Check if an API key appears to be a masked value.
    
    Detects both old format ("...") and new format (starts with "*").
    
    Args:
        api_key: The API key to check
        
    Returns:
        True if the key appears to be masked, False otherwise
    """
    if not api_key or not isinstance(api_key, str):
        return False
    
    trimmed = api_key.strip()
    
    # Check for old format with "..." (e.g., "sk-...abcd")
    if "..." in trimmed:
        return True
    
    # Check for new format: mostly asterisks (e.g., "****abcd")
    # Real API keys rarely start with asterisks and have mostly asterisks
    if trimmed.startswith("*") and len(trimmed) > 4:
        # Count asterisks - if more than 50% are asterisks, it's likely masked
        asterisk_count = trimmed.count("*")
        if asterisk_count > len(trimmed) * 0.5:
            return True
    
    return False
