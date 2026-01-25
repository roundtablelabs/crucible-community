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

"""Debug endpoints for troubleshooting user settings and API keys."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.core.encryption import decrypt_api_key

router = APIRouter(prefix="/debug/settings", tags=["debug"])
logger = logging.getLogger(__name__)


@router.get("/check")
async def debug_check_settings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Debug endpoint to check user settings and API keys.
    Returns detailed information about what's stored.
    """
    debug_info = {
        "current_user_id": str(current_user.id),
        "current_user_email": current_user.email if hasattr(current_user, "email") else None,
        "is_guest": current_user.is_guest,
    }
    
    try:
        # Try to find user in database
        try:
            user_uuid = UUID(str(current_user.id))
            user_result = await db.execute(
                select(User).where(User.id == user_uuid)
            )
            user = user_result.scalar_one_or_none()
            
            if user:
                debug_info["user_found_by_uuid"] = True
                debug_info["user_uuid"] = str(user.id)
                debug_info["user_email_in_db"] = user.email
            else:
                debug_info["user_found_by_uuid"] = False
                # Try to find default user
                default_result = await db.execute(
                    select(User).where(User.email == "admin@localhost")
                )
                default_user = default_result.scalar_one_or_none()
                if default_user:
                    debug_info["default_user_found"] = True
                    debug_info["default_user_uuid"] = str(default_user.id)
                    user = default_user
                else:
                    debug_info["default_user_found"] = False
                    return debug_info
        except ValueError:
            # Not a UUID, try to find by email
            debug_info["user_id_is_uuid"] = False
            user_result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            user = user_result.scalar_one_or_none()
            if user:
                debug_info["user_found_by_email"] = True
                debug_info["user_uuid"] = str(user.id)
                debug_info["user_email_in_db"] = user.email
            else:
                debug_info["user_found_by_email"] = False
                return debug_info
        
        # Check for user settings
        settings_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user.id)
        )
        settings = settings_result.scalar_one_or_none()
        
        if settings:
            debug_info["settings_found"] = True
            debug_info["settings_id"] = str(settings.id)
            debug_info["artifact_retention"] = settings.artifact_retention
            debug_info["retention_days"] = settings.retention_days
            debug_info["default_provider"] = settings.default_provider
            
            # Check provider API keys
            if settings.provider_api_keys:
                debug_info["provider_api_keys_count"] = len(settings.provider_api_keys)
                debug_info["provider_keys"] = {}
                
                for provider, encrypted_key in settings.provider_api_keys.items():
                    if encrypted_key:
                        try:
                            decrypted = decrypt_api_key(encrypted_key)
                            # Mask the key for security (show only first 8 and last 4 characters)
                            if len(decrypted) > 12:
                                masked = f"{decrypted[:8]}...{decrypted[-4:]}"
                            else:
                                masked = "***masked***"
                            debug_info["provider_keys"][provider] = {
                                "has_key": True,
                                "key_length": len(decrypted),
                                "masked_key": masked,
                                "encrypted_length": len(encrypted_key),
                            }
                        except Exception as e:
                            debug_info["provider_keys"][provider] = {
                                "has_key": True,
                                "decryption_error": str(e),
                                "encrypted_length": len(encrypted_key),
                            }
                    else:
                        debug_info["provider_keys"][provider] = {"has_key": False}
            else:
                debug_info["provider_api_keys_count"] = 0
                debug_info["provider_keys"] = {}
        else:
            debug_info["settings_found"] = False
        
        return debug_info
    except Exception as e:
        logger.exception("Error in debug_check_settings")
        debug_info["error"] = str(e)
        return debug_info
