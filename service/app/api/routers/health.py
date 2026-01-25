# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

import logging
from fastapi import APIRouter, Depends, Request

from app.core.redis import get_redis_client
from app.api.deps import get_current_user, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/redis", summary="Redis connectivity check")
async def redis_health_check() -> dict[str, str | bool]:
    """Check Redis connectivity."""
    try:
        redis = get_redis_client()
        if redis is None:
            return {"status": "unavailable", "connected": False}
        
        # Test connection (handle both standard Redis and UpstashRedis)
        try:
            redis.ping()
        except AttributeError:
            # UpstashRedis might not have ping, test with a simple get
            redis.get("__health_check__")
        return {"status": "ok", "connected": True}
    except Exception as e:
        return {"status": "error", "connected": False, "error": str(e)}


@router.get("/version", summary="Get API version and copyright information")
async def get_version() -> dict[str, str | int]:
    """Returns version information and copyright details for Crucible Community Edition."""
    return {
        "product": "Crucible",
        "edition": "community",
        "version": "0.1.0",
        "copyright": "Roundtable Labs Pty Ltd",
        "license": "AGPL-3.0",
        "year": 2025,
    }


@router.get("/version/check", summary="Check for latest version from main product")
async def check_latest_version() -> dict[str, str | bool]:
    """Check for the latest community edition version from the main product API.
    
    Fetches version information from https://api.roundtablelabs.ai/api/version
    and compares it with the current local version.
    
    Returns:
    - latest_version: Latest version from main product (or "unknown" if fetch fails)
    - current_version: Current local version
    - update_available: Boolean indicating if an update is available
    - error: Error message if the check failed (optional)
    """
    current_version = "0.1.0"  # Match the version from /version endpoint
    
    try:
        import httpx
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("https://api.roundtablelabs.ai/api/version")
            
            if response.is_success:
                data = response.json()
                latest_version = data.get("crucible_community_edition_version", "unknown")
                
                # Simple version comparison (assumes semantic versioning)
                update_available = _compare_versions(current_version, latest_version)
                
                return {
                    "latest_version": latest_version,
                    "current_version": current_version,
                    "update_available": update_available,
                }
            else:
                logger.warning(f"Failed to fetch version: HTTP {response.status_code}")
                return {
                    "latest_version": "unknown",
                    "current_version": current_version,
                    "update_available": False,
                    "error": f"HTTP {response.status_code}",
                }
    except httpx.TimeoutException:
        logger.warning("Timeout while fetching latest version from main product API")
        return {
            "latest_version": "unknown",
            "current_version": current_version,
            "update_available": False,
            "error": "timeout",
        }
    except httpx.RequestError as e:
        logger.warning(f"Network error while fetching latest version: {e}")
        return {
            "latest_version": "unknown",
            "current_version": current_version,
            "update_available": False,
            "error": "network_error",
        }
    except Exception as e:
        logger.error(f"Unexpected error while checking version: {e}", exc_info=True)
        return {
            "latest_version": "unknown",
            "current_version": current_version,
            "update_available": False,
            "error": str(e),
        }


def _compare_versions(current: str, latest: str) -> bool:
    """Compare two semantic versions.
    
    Returns True if latest > current, False otherwise.
    Handles simple semantic versioning (e.g., "1.0.0", "0.1.0").
    """
    try:
        # Split version strings into parts
        current_parts = [int(x) for x in current.split(".")]
        latest_parts = [int(x) for x in latest.split(".")]
        
        # Pad with zeros to ensure same length
        max_len = max(len(current_parts), len(latest_parts))
        current_parts.extend([0] * (max_len - len(current_parts)))
        latest_parts.extend([0] * (max_len - len(latest_parts)))
        
        # Compare each part
        for c, l in zip(current_parts, latest_parts):
            if l > c:
                return True
            elif l < c:
                return False
        
        # Versions are equal
        return False
    except (ValueError, AttributeError):
        # If version format is unexpected, assume no update available
        logger.warning(f"Could not compare versions: current={current}, latest={latest}")
        return False


@router.get("/health/auth-debug", summary="Debug authentication headers")
async def auth_debug(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Debug endpoint to check what authentication info is received.
    
    Returns information about:
    - Authorization header presence
    - User info extracted from token
    - Is guest status
    """
    auth_header = request.headers.get("authorization")
    return {
        "has_auth_header": auth_header is not None,
        "auth_header_preview": auth_header[:20] + "..." if auth_header and len(auth_header) > 20 else auth_header,
        "user_id": current_user.id[:8] + "..." if current_user.id and len(current_user.id) > 8 else current_user.id,
        "user_id_length": len(current_user.id) if current_user.id else 0,
        "is_guest": current_user.is_guest,
        "role": current_user.role,
        "email": current_user.email,
    }

