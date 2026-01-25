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

"""Simple session store for community edition authentication."""
import json
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.redis import get_redis_client
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# In-memory fallback store (used when Redis is unavailable)
# Key: session token, Value: session data dict
_in_memory_sessions: dict[str, dict] = {}


def create_session() -> str:
    """
    Create a new session token.
    
    Returns:
        A cryptographically secure random token (32 bytes, URL-safe base64 encoded)
    """
    token = secrets.token_urlsafe(32)
    return token


def store_session(token: str, user_id: str, email: str, expires_at: datetime) -> bool:
    """
    Store a session in Redis or in-memory fallback.
    
    Args:
        token: Session token
        user_id: User ID
        email: User email
        expires_at: Expiration datetime
        
    Returns:
        True if stored successfully, False otherwise
    """
    session_data = {
        "user_id": user_id,
        "email": email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    
    # Try Redis first
    redis = get_redis_client()
    if redis is not None:
        try:
            key = f"session:{token}"
            # Calculate TTL in seconds
            ttl = int((expires_at - datetime.now(timezone.utc)).total_seconds())
            if ttl > 0:
                redis.set(key, json.dumps(session_data), ex=ttl)
                logger.debug(f"Stored session in Redis: {token[:8]}... (TTL: {ttl}s)")
                return True
            else:
                logger.warning(f"Session expiry is in the past, not storing: {token[:8]}...")
                return False
        except Exception as e:
            logger.warning(f"Failed to store session in Redis: {e}, using in-memory fallback")
    
    # Fallback to in-memory store
    _in_memory_sessions[token] = session_data
    logger.debug(f"Stored session in memory: {token[:8]}...")
    return True


def get_session(token: str) -> Optional[dict]:
    """
    Get session data by token.
    
    Args:
        token: Session token
        
    Returns:
        Session data dict if found and valid, None otherwise
    """
    # Try Redis first
    redis = get_redis_client()
    if redis is not None:
        try:
            key = f"session:{token}"
            data_str = redis.get(key)
            if data_str:
                session_data = json.loads(data_str)
                # Check if expired (shouldn't happen with Redis TTL, but check anyway)
                expires_at_str = session_data.get("expires_at")
                if expires_at_str:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    if datetime.now(timezone.utc) >= expires_at:
                        logger.debug(f"Session expired: {token[:8]}...")
                        return None
                return session_data
        except Exception as e:
            logger.warning(f"Failed to get session from Redis: {e}, checking in-memory fallback")
    
    # Fallback to in-memory store
    if token in _in_memory_sessions:
        session_data = _in_memory_sessions[token]
        # Check if expired
        expires_at_str = session_data.get("expires_at")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= expires_at:
                # Remove expired session
                del _in_memory_sessions[token]
                logger.debug(f"Removed expired session from memory: {token[:8]}...")
                return None
        return session_data
    
    return None


def validate_session(token: str) -> bool:
    """
    Validate that a session token exists and is not expired.
    
    Args:
        token: Session token
        
    Returns:
        True if session is valid, False otherwise
    """
    session = get_session(token)
    return session is not None


def delete_session(token: str) -> bool:
    """
    Delete a session token.
    
    Args:
        token: Session token
        
    Returns:
        True if deleted successfully, False otherwise
    """
    # Try Redis first
    redis = get_redis_client()
    if redis is not None:
        try:
            key = f"session:{token}"
            redis.delete(key)
            logger.debug(f"Deleted session from Redis: {token[:8]}...")
            return True
        except Exception as e:
            logger.warning(f"Failed to delete session from Redis: {e}, removing from in-memory fallback")
    
    # Fallback to in-memory store
    if token in _in_memory_sessions:
        del _in_memory_sessions[token]
        logger.debug(f"Deleted session from memory: {token[:8]}...")
        return True
    
    return False


def cleanup_expired_sessions() -> int:
    """
    Clean up expired sessions from in-memory store.
    This is called periodically to prevent memory leaks.
    
    Returns:
        Number of sessions cleaned up
    """
    now = datetime.now(timezone.utc)
    expired_tokens = []
    
    for token, session_data in _in_memory_sessions.items():
        expires_at_str = session_data.get("expires_at")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if now >= expires_at:
                expired_tokens.append(token)
    
    for token in expired_tokens:
        del _in_memory_sessions[token]
    
    if expired_tokens:
        logger.debug(f"Cleaned up {len(expired_tokens)} expired sessions from memory")
    
    return len(expired_tokens)
