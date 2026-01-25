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

"""
Password hashing utilities for Community Edition authentication.

Uses bcrypt for secure password hashing. Supports both hashed and plain text
passwords for backward compatibility during migration.
"""

import bcrypt
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def is_bcrypt_hash(password: str) -> bool:
    """
    Check if a string is a bcrypt hash.
    
    Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long.
    
    Args:
        password: String to check
        
    Returns:
        True if the string appears to be a bcrypt hash, False otherwise
    """
    if not password or len(password) < 10:
        return False
    
    # Bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost parameter
    return password.startswith(("$2a$", "$2b$", "$2y$")) and len(password) == 60


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Bcrypt hash string (60 characters, starts with $2b$)
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    # Generate salt and hash password
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a bcrypt hash.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hash to compare against
        
    Returns:
        True if password matches, False otherwise
    """
    if not plain_password or not hashed_password:
        return False
    
    try:
        # Use bcrypt to verify password
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        logger.warning(f"Password verification error: {e}")
        return False


def verify_password_with_fallback(plain_password: str, stored_password: str) -> bool:
    """
    Verify a password with backward compatibility support.
    
    This function supports both:
    - Hashed passwords (bcrypt): Secure, recommended for production
    - Plain text passwords: For backward compatibility during migration
    
    Args:
        plain_password: Plain text password to verify
        stored_password: Stored password (either hash or plain text)
        
    Returns:
        True if password matches, False otherwise
    """
    if not plain_password or not stored_password:
        return False
    
    # Check if stored password is already a bcrypt hash
    if is_bcrypt_hash(stored_password):
        # Use secure bcrypt verification
        return verify_password(plain_password, stored_password)
    else:
        # Backward compatibility: plain text comparison
        # Log a warning in production to encourage migration
        logger.warning(
            "Using plain text password comparison. "
            "Please hash your password using the hash_password utility script."
        )
        return plain_password == stored_password
