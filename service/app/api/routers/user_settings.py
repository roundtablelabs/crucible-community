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

"""User settings API endpoints."""
import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.user_settings import UserSettings
from app.core.encryption import encrypt_api_key, decrypt_api_key, mask_api_key, is_masked_key
from app.services.llm.api_key_resolver import APIKeyResolver

router = APIRouter(prefix="/user/settings", tags=["user-settings"])
logger = logging.getLogger(__name__)


def _require_member_user(user: CurrentUser) -> None:
    """Require authenticated member user (not guest)."""
    if user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    try:
        UUID(str(user.id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier"
        )


def _get_openrouter_encrypted(provider_api_keys: dict | None) -> Optional[str]:
    """Get OpenRouter encrypted key from provider_api_keys, trying common key names."""
    if not provider_api_keys:
        return None
    for k in ("openrouter", "OpenRouter", "open_router"):
        v = provider_api_keys.get(k)
        if v:
            return v
    return None


def _get_provider_key(provider_api_keys: dict | None, provider_name: str) -> Optional[str]:
    """Get encrypted key for a specific provider from provider_api_keys."""
    if not provider_api_keys:
        return None
    # Try exact match and common variations
    for k in (provider_name, provider_name.lower(), provider_name.replace("_", ""), provider_name.replace("-", "")):
        v = provider_api_keys.get(k)
        if v:
            return v
    return None


@router.get("/openrouter-key")
async def get_openrouter_key(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return the current user's decrypted OpenRouter API key for server-side use
    (e.g. intake chat). Requires authentication. Returns 404 if not configured.
    """
    _require_member_user(current_user)
    user_uuid = UUID(str(current_user.id))
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    encrypted = _get_openrouter_encrypted(settings.provider_api_keys if settings else None)
    if not encrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenRouter API key is not configured. Please add your OpenRouter API key in Settings.",
        )
    try:
        raw = decrypt_api_key(encrypted)
        key = raw.strip() if raw else None
    except Exception as e:
        logger.warning(f"Error decrypting OpenRouter key for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenRouter API key could not be read. Please re-add your key in Settings.",
        )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenRouter API key is not configured. Please add your OpenRouter API key in Settings.",
        )
    return {"key": key}


@router.get("/openai-key")
async def get_openai_key(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the current user's decrypted OpenAI API key for server-side use."""
    _require_member_user(current_user)
    user_uuid = UUID(str(current_user.id))
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    encrypted = _get_provider_key(settings.provider_api_keys if settings else None, "openai")
    if not encrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenAI API key is not configured.",
        )
    try:
        raw = decrypt_api_key(encrypted)
        key = raw.strip() if raw else None
    except Exception as e:
        logger.warning(f"Error decrypting OpenAI key for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenAI API key could not be read.",
        )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenAI API key is not configured.",
        )
    return {"key": key}


@router.get("/anthropic-key")
async def get_anthropic_key(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the current user's decrypted Anthropic API key for server-side use."""
    _require_member_user(current_user)
    user_uuid = UUID(str(current_user.id))
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    encrypted = _get_provider_key(settings.provider_api_keys if settings else None, "anthropic")
    if not encrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anthropic API key is not configured.",
        )
    try:
        raw = decrypt_api_key(encrypted)
        key = raw.strip() if raw else None
    except Exception as e:
        logger.warning(f"Error decrypting Anthropic key for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anthropic API key could not be read.",
        )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anthropic API key is not configured.",
        )
    return {"key": key}


@router.get("/provider-key/{provider}")
async def get_provider_key(
    provider: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the current user's decrypted API key for a specific provider.
    
    This endpoint allows users to view their own API keys. The provider name
    should match the provider identifier (e.g., 'openai', 'anthropic', 'openrouter', etc.).
    """
    _require_member_user(current_user)
    
    # Get user UUID - handle both UUID and community edition cases
    user_uuid = None
    try:
        parsed_uuid = UUID(str(current_user.id))
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.id == parsed_uuid)
        )
        user = result.scalar_one_or_none()
        if user:
            user_uuid = user.id
        else:
            # Look up default user
            result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            default_user = result.scalar_one_or_none()
            if default_user:
                user_uuid = default_user.id
    except ValueError:
        # Not a UUID - look up default user
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.email == "admin@localhost")
        )
        default_user = result.scalar_one_or_none()
        if default_user:
            user_uuid = default_user.id
    
    if not user_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    
    # Handle special cases for provider name mapping
    provider_lower = provider.lower()
    if provider_lower in ("openrouter", "open_router"):
        encrypted = _get_openrouter_encrypted(settings.provider_api_keys if settings else None)
    elif provider_lower in ("google", "gemini"):
        # Google/Gemini: try both "google" and "gemini" as keys might be stored under either name
        encrypted = _get_provider_key(settings.provider_api_keys if settings else None, "google")
        if not encrypted:
            encrypted = _get_provider_key(settings.provider_api_keys if settings else None, "gemini")
    else:
        encrypted = _get_provider_key(settings.provider_api_keys if settings else None, provider)
    
    if not encrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{provider} API key is not configured.",
        )
    
    try:
        raw = decrypt_api_key(encrypted)
        key = raw.strip() if raw else None
    except Exception as e:
        logger.warning(f"Error decrypting {provider} key for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{provider} API key could not be read.",
        )
    
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{provider} API key is not configured.",
        )
    
    # Validate that the decrypted key is not a masked value
    # This can happen if a masked key was accidentally saved instead of the real key
    # Check for both old format ("...") and new format (starts with "*")
    if "..." in key or (key.startswith("*") and len(key) > 4):
        logger.error(
            f"Decrypted {provider} key for user {current_user.id} appears to be a masked value. "
            "This indicates the stored key is corrupted. The key should be deleted and re-entered."
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{provider} API key appears to be corrupted (masked value stored). Please delete and re-enter your API key.",
        )
    
    return {"key": key}


async def _get_user_settings_impl(
    current_user: CurrentUser,
    db: AsyncSession,
) -> dict:
    """Implementation of get user settings (shared between routes)."""
    _require_member_user(current_user)
    
    # Always look up user in database to ensure they exist (handles reinstall case)
    from app.models.user import User
    try:
        parsed_uuid = UUID(str(current_user.id))
        user_result = await db.execute(
            select(User).where(User.id == parsed_uuid)
        )
        user = user_result.scalar_one_or_none()
        
        if not user:
            # User UUID from token doesn't exist - look up default user
            logger.warning(f"[get_user_settings] User UUID {parsed_uuid} not found, using default user")
            user_result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            user = user_result.scalar_one_or_none()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found in database"
                )
        
        user_uuid = user.id
    except ValueError:
        # Not a UUID - look up default user
        user_result = await db.execute(
            select(User).where(User.email == "admin@localhost")
        )
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Default user not found in database"
            )
        user_uuid = user.id
    
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    
    # Return default settings if not found
    if not settings:
        return {
            "artifactRetention": True,
            "retentionDays": 30,
            "excludedModelProviders": [],
            "providerApiKeys": {},
            "defaultProvider": "openrouter",
        }
    
    # Handle excluded_model_providers (can be None or empty list)
    excluded_providers = settings.excluded_model_providers or []
    
    # Mask API keys for security (show only last 4 characters)
    provider_api_keys = settings.provider_api_keys or {}
    masked_keys = {}
    for provider, encrypted_key in provider_api_keys.items():
        if encrypted_key:
            try:
                decrypted = decrypt_api_key(encrypted_key)
                masked_keys[provider] = mask_api_key(decrypted)
            except Exception as e:
                logger.warning(f"Error decrypting API key for provider {provider}: {e}")
                masked_keys[provider] = "***error***"
    
    return {
        "artifactRetention": settings.artifact_retention,
        "retentionDays": settings.retention_days,
        "excludedModelProviders": excluded_providers,
        "providerApiKeys": masked_keys,
        "defaultProvider": settings.default_provider or "openrouter",
    }


@router.get("")
async def get_user_settings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current user's settings (no trailing slash)."""
    return await _get_user_settings_impl(current_user, db)


@router.get("/")
async def get_user_settings_slash(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current user's settings (with trailing slash) - alias for compatibility."""
    return await _get_user_settings_impl(current_user, db)


async def _update_user_settings_impl(
    settings_update: dict,
    current_user: CurrentUser,
    db: AsyncSession,
) -> dict:
    """Implementation of update user settings (shared between routes)."""
    _require_member_user(current_user)
    
    # Get user UUID - ensure user exists in database
    # In community edition, session tokens might have user_ids that don't exist in DB
    user_uuid = None
    try:
        # Try to parse as UUID first
        parsed_uuid = UUID(str(current_user.id))
        # Verify user exists in database
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.id == parsed_uuid)
        )
        existing_user = result.scalar_one_or_none()
        if existing_user:
            user_uuid = parsed_uuid
            logger.debug(f"[update_user_settings] Using existing user UUID: {user_uuid}")
        else:
            # User ID from session doesn't exist in database - use default community user
            logger.warning(f"[update_user_settings] User {current_user.id} not found in database, using default community user")
            result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            default_user = result.scalar_one_or_none()
            if default_user:
                user_uuid = default_user.id
                logger.info(f"[update_user_settings] Using default community user UUID: {user_uuid}")
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Default community user not found. Please run database initialization."
                )
    except ValueError:
        # Not a valid UUID - look up default community user
        logger.debug(f"[update_user_settings] User ID is not UUID: {current_user.id}, looking up default user")
        from app.models.user import User
        result = await db.execute(
            select(User).where(User.email == "admin@localhost")
        )
        default_user = result.scalar_one_or_none()
        if default_user:
            user_uuid = default_user.id
            logger.info(f"[update_user_settings] Using default community user UUID: {user_uuid}")
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Default community user not found. Please run database initialization."
            )
    
    if not user_uuid:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not determine valid user UUID for settings"
        )
    
    # Validate input
    artifact_retention = settings_update.get("artifactRetention")
    retention_days = settings_update.get("retentionDays")
    excluded_model_providers = settings_update.get("excludedModelProviders")
    provider_api_keys = settings_update.get("providerApiKeys")
    default_provider = settings_update.get("defaultProvider")
    
    if artifact_retention is not None and not isinstance(artifact_retention, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid artifactRetention value"
        )
    
    if retention_days is not None:
        if not isinstance(retention_days, int) or retention_days < 1 or retention_days > 3650:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid retentionDays value (must be between 1 and 3650)"
            )
    
    if excluded_model_providers is not None:
        if not isinstance(excluded_model_providers, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid excludedModelProviders value (must be a list)"
            )
        if not all(isinstance(item, str) for item in excluded_model_providers):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid excludedModelProviders value (must be a list of strings)"
            )
    
    # Validate provider API keys
    if provider_api_keys is not None:
        if not isinstance(provider_api_keys, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid providerApiKeys value (must be a dictionary)"
            )
        # Validate that all values are strings
        for provider, api_key in provider_api_keys.items():
            if not isinstance(provider, str):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid provider name: {provider} (must be a string)"
                )
            if not isinstance(api_key, str):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid API key for provider {provider} (must be a string)"
                )
    
    # Validate default provider
    if default_provider is not None:
        if not isinstance(default_provider, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid defaultProvider value (must be a string)"
            )
        # Validate provider name (basic check)
        # Note: "google" maps to "gemini" in the router
        valid_providers = ["openrouter", "eden_ai", "anthropic", "openai", "deepseek", "gemini", "google", "xai", "mistral"]
        if default_provider.lower() not in [p.lower() for p in valid_providers]:
            logger.warning(f"Unknown default provider: {default_provider}, but allowing it")
    
    # Get or create settings
    try:
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_uuid)
        )
        settings = result.scalars().first()
    except Exception as e:
        logger.exception("update_user_settings: failed to load existing settings for user %s: %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load user settings",
        ) from e

    # Capture original keys BEFORE modifications for validation
    original_api_keys = dict(settings.provider_api_keys or {}) if settings else {}
    
    # Encrypt provider API keys before storing
    encrypted_provider_keys = None
    if provider_api_keys is not None:
        providers_updated = [p for p, k in provider_api_keys.items() if k and "..." not in k and k.strip()]
        providers_deleted = [p for p, k in provider_api_keys.items() if not k or (k.strip() == "" and "..." not in k)]
        if providers_updated:
            logger.info(
                "Saving API keys for user %s: providers=%s (new or updated, key values not logged)",
                current_user.id,
                providers_updated,
            )
        if providers_deleted:
            logger.info(
                "Deleting API keys for user %s: providers=%s",
                current_user.id,
                providers_deleted,
            )
        encrypted_provider_keys = {}
        for provider, api_key in provider_api_keys.items():
            # Empty string means delete this key
            if not api_key or (isinstance(api_key, str) and api_key.strip() == "" and not is_masked_key(api_key)):
                # Mark for deletion by not including it in encrypted_provider_keys
                # We'll remove it from existing_keys later
                continue
            
            # Validate that the key is not masked before encrypting
            # This prevents corrupted masked keys from being stored
            if is_masked_key(api_key):
                # If it's a masked key, check if it matches the existing saved key
                # (user didn't change it, so keep existing encrypted value)
                existing_keys = settings.provider_api_keys if settings else {}
                if provider in existing_keys:
                    # User didn't change this key, keep existing encrypted value
                    encrypted_provider_keys[provider] = existing_keys[provider]
                else:
                    # This is a new masked key - reject it
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot save masked API key for {provider}. Please enter the actual API key value, not a masked/display value."
                    )
            else:
                # Key is not masked, encrypt it
                try:
                    encrypted_provider_keys[provider] = encrypt_api_key(api_key)
                except Exception as e:
                    logger.exception("Error encrypting API key for provider %s: %s", provider, e)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Error encrypting API key for provider {provider}"
                    )
        if encrypted_provider_keys:
            logger.info(
                "API keys encrypted for user %s: providers=%s",
                current_user.id,
                list(encrypted_provider_keys.keys()),
            )

    if not settings:
        # Creating new settings - must have at least one API key
        final_provider_keys = encrypted_provider_keys or {}
        # Validate that at least one required key is provided for new settings
        required_providers = ["openrouter", "openai", "anthropic"]
        has_required_key = any(
            provider.lower() in [p.lower() for p in required_providers]
            for provider in final_provider_keys.keys()
            if final_provider_keys.get(provider)
        )
        if not has_required_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one API key is required (OpenRouter, OpenAI, or Anthropic). Please configure at least one API key to use the system."
            )
        settings = UserSettings(
            user_id=user_uuid,
            artifact_retention=artifact_retention if artifact_retention is not None else True,
            retention_days=retention_days if retention_days is not None else 30,
            excluded_model_providers=excluded_model_providers if excluded_model_providers is not None else [],
            provider_api_keys=final_provider_keys,
            default_provider=default_provider if default_provider is not None else "openrouter",
        )
        db.add(settings)
    else:
        if artifact_retention is not None:
            settings.artifact_retention = artifact_retention
        if retention_days is not None:
            settings.retention_days = retention_days
        if excluded_model_providers is not None:
            settings.excluded_model_providers = excluded_model_providers
        if encrypted_provider_keys is not None:
            # Merge with existing keys, but remove keys that were explicitly deleted (empty strings)
            # IMPORTANT: Create a new dict copy so SQLAlchemy detects the change
            existing_keys = dict(settings.provider_api_keys or {})
            logger.info(f"[update_user_settings] BEFORE UPDATE - Existing keys: {list(existing_keys.keys())}")
            
            # Remove keys that were sent as empty strings (deletion)
            keys_to_delete = [
                provider for provider, api_key in provider_api_keys.items()
                if not api_key or (isinstance(api_key, str) and api_key.strip() == "" and "..." not in api_key)
            ]
            logger.info(f"[update_user_settings] Keys to delete: {keys_to_delete}")
            for key_to_delete in keys_to_delete:
                was_present = key_to_delete in existing_keys
                existing_keys.pop(key_to_delete, None)
                if was_present:
                    logger.info(f"[update_user_settings] Deleted key for provider: {key_to_delete}")
            
            # Update with new/kept keys
            logger.info(f"[update_user_settings] New/updated keys to add: {list(encrypted_provider_keys.keys())}")
            existing_keys.update(encrypted_provider_keys)
            logger.info(f"[update_user_settings] AFTER MERGE - Final keys: {list(existing_keys.keys())}")
            
            # Create a completely new dictionary object to ensure SQLAlchemy detects the change
            final_keys = dict(existing_keys)
            settings.provider_api_keys = final_keys
            
            # Explicitly mark the JSON field as modified for SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(settings, "provider_api_keys")
            
            logger.info(f"[update_user_settings] ASSIGNED to settings.provider_api_keys: {list(settings.provider_api_keys.keys())}")
        if default_provider is not None:
            settings.default_provider = default_provider
    
    # Validate API key deletion rules:
    # 1. If OpenRouter key exists, can delete other provider keys (OpenAI, Anthropic)
    # 2. If OpenAI + Anthropic keys BOTH exist (bundle), can delete OpenRouter key
    # 3. OpenAI and Anthropic are a BUNDLE - you must have BOTH or NEITHER
    #    Cannot have only one without the other (unless you have OpenRouter)
    final_api_keys = settings.provider_api_keys or {}
    
    # Check which keys are present (non-empty) in the final state
    has_openrouter = bool(final_api_keys.get("openrouter"))
    has_openai = bool(final_api_keys.get("openai"))
    has_anthropic = bool(final_api_keys.get("anthropic"))
    
    # Valid configurations:
    # 1. OpenRouter only
    # 2. OpenRouter + OpenAI + Anthropic
    # 3. OpenAI + Anthropic (without OpenRouter)
    
    # Invalid configurations:
    # - Only OpenAI (without Anthropic)
    # - Only Anthropic (without OpenAI)
    # - No keys at all
    
    # Check if OpenAI and Anthropic are mismatched (one without the other)
    native_providers_mismatched = (has_openai and not has_anthropic) or (has_anthropic and not has_openai)
    
    if native_providers_mismatched and not has_openrouter:
        # Invalid: Only one of OpenAI/Anthropic without OpenRouter
        missing_provider = "Anthropic" if has_openai else "OpenAI"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OpenAI and Anthropic keys are a bundle - you must have BOTH or NEITHER. You cannot have only {missing_provider if not has_openai else 'OpenAI'} without {missing_provider}. Please either: (1) add an OpenRouter key, or (2) configure both OpenAI and Anthropic keys."
        )
    
    # Rule 1: OpenRouter alone is sufficient
    if has_openrouter:
        logger.info(f"[update_user_settings] Validation passed: OpenRouter key present (OpenAI: {has_openai}, Anthropic: {has_anthropic})")
    # Rule 2: OpenAI + Anthropic bundle (without OpenRouter)
    elif has_openai and has_anthropic:
        logger.info("[update_user_settings] Validation passed: OpenAI + Anthropic bundle present (OpenRouter can be deleted)")
    else:
        # No valid keys remain
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid API key configuration. You must have either: (1) OpenRouter key, or (2) BOTH OpenAI and Anthropic keys together."
        )
    
    logger.info(f"[update_user_settings] BEFORE COMMIT - settings.provider_api_keys keys: {list((settings.provider_api_keys or {}).keys())}")
    try:
        await db.commit()
        logger.info(f"[update_user_settings] AFTER COMMIT - settings.provider_api_keys keys: {list((settings.provider_api_keys or {}).keys())}")
        # Don't refresh - it reloads stale data from the database
        # We already have the correct data in memory after the commit
        # If we need updated timestamps, we can refresh only those fields, but for now we'll skip refresh
    except Exception as e:
        logger.exception("update_user_settings: db commit failed for user %s: %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save user settings",
        ) from e

    # Handle excluded_model_providers (can be None or empty list)
    excluded_providers = settings.excluded_model_providers or []

    # Mask API keys for response
    provider_api_keys = settings.provider_api_keys or {}
    logger.info(f"[update_user_settings] MASKING KEYS - provider_api_keys to mask: {list(provider_api_keys.keys())}")
    masked_keys = {}
    for provider, encrypted_key in provider_api_keys.items():
        try:
            decrypted = decrypt_api_key(encrypted_key)
            masked_keys[provider] = mask_api_key(decrypted)
        except Exception as e:
            logger.warning("Error decrypting API key for provider %s: %s", provider, e)
            masked_keys[provider] = "***error***"

    logger.info(
        "Updated settings for user %s: artifact_retention=%s, "
        "retention_days=%s, excluded_model_providers=%s, default_provider=%s, providers_with_keys=%s",
        current_user.id,
        settings.artifact_retention,
        settings.retention_days,
        excluded_providers,
        settings.default_provider,
        list(masked_keys.keys()),
    )
    if encrypted_provider_keys:
        logger.info("API keys saved successfully for user %s: providers=%s", current_user.id, list(encrypted_provider_keys.keys()))

    return {
        "artifactRetention": settings.artifact_retention,
        "retentionDays": settings.retention_days,
        "excludedModelProviders": excluded_providers,
        "providerApiKeys": masked_keys,
        "defaultProvider": settings.default_provider or "openrouter",
    }


@router.put("")
async def update_user_settings(
    settings_update: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update user's settings (no trailing slash)."""
    return await _update_user_settings_impl(settings_update, current_user, db)


@router.put("/")
async def update_user_settings_slash(
    settings_update: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update user's settings (with trailing slash) - alias for compatibility."""
    return await _update_user_settings_impl(settings_update, current_user, db)


@router.get("/check-api-keys")
async def check_api_keys(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Check if user has any API keys configured.
    Returns whether user has at least one of: OpenAI, Anthropic, or OpenRouter keys.
    
    Works for both regular users (UUID) and community edition users.
    """
    # Don't require UUID validation - allow community edition string IDs
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    # Get user UUID - always look up user in database to ensure they exist
    # This handles the case where session token has old UUID after reinstall
    user_uuid = None
    from app.models.user import User
    
    try:
        # Try to parse as UUID and check if user exists in database
        parsed_uuid = UUID(str(current_user.id))
        result = await db.execute(
            select(User).where(User.id == parsed_uuid)
        )
        user = result.scalar_one_or_none()
        
        if user:
            # User exists in database with this UUID
            user_uuid = str(user.id)
            logger.debug(f"[check-api-keys] Found user in database with UUID: {user_uuid}")
        else:
            # UUID is valid but user doesn't exist - look up default user instead
            logger.warning(f"[check-api-keys] User UUID {parsed_uuid} not found in database, looking up default user")
            result = await db.execute(
                select(User).where(User.email == "admin@localhost")
            )
            default_user = result.scalar_one_or_none()
            if default_user:
                user_uuid = str(default_user.id)
                logger.info(f"[check-api-keys] Using default user UUID instead: {user_uuid}")
            else:
                logger.warning(f"[check-api-keys] No default user found in database")
                return {
                    "hasApiKeys": False,
                    "hasOpenAI": False,
                    "hasAnthropic": False,
                    "hasOpenRouter": False,
                    "availableProviders": [],
                }
    except ValueError:
        # Not a UUID - likely community edition with string ID
        # Look up the default community user by email
        logger.debug(f"[check-api-keys] User ID is not UUID: {current_user.id}, looking up default user")
        result = await db.execute(
            select(User).where(User.email == "admin@localhost")
        )
        default_user = result.scalar_one_or_none()
        if default_user:
            user_uuid = str(default_user.id)
            logger.debug(f"[check-api-keys] Found default user UUID: {user_uuid}")
        else:
            # No default user exists yet - return no API keys
            logger.warning(f"[check-api-keys] No default user found for community edition")
            return {
                "hasApiKeys": False,
                "hasOpenAI": False,
                "hasAnthropic": False,
                "hasOpenRouter": False,
                "availableProviders": [],
            }
    
    if not user_uuid:
        logger.error(f"[check-api-keys] Could not determine user UUID for user: {current_user.id}")
        return {
            "hasApiKeys": False,
            "hasOpenAI": False,
            "hasAnthropic": False,
            "hasOpenRouter": False,
            "availableProviders": [],
        }
    
    resolver = APIKeyResolver()
    available_providers = await resolver.get_user_available_providers(user_uuid, db)
    
    logger.info(f"[check-api-keys] User {user_uuid} has API keys for: {list(available_providers.keys())}")
    
    # Check for required providers with bundle rule:
    # - OpenAI and Anthropic are a BUNDLE - must have BOTH or NEITHER
    # - Valid configs: (1) OpenRouter only, (2) OpenAI + Anthropic bundle, (3) All three
    # - Invalid: Only OpenAI without Anthropic, or only Anthropic without OpenAI
    has_openai = "openai" in available_providers
    has_anthropic = "anthropic" in available_providers
    has_openrouter = "openrouter" in available_providers
    
    # Valid configuration check: OpenRouter OR (OpenAI AND Anthropic bundle)
    has_valid_config = has_openrouter or (has_openai and has_anthropic)
    
    logger.info(f"[check-api-keys] Valid config: {has_valid_config} (OpenRouter: {has_openrouter}, OpenAI: {has_openai}, Anthropic: {has_anthropic})")
    
    return {
        "hasApiKeys": has_valid_config,
        "hasOpenAI": has_openai,
        "hasAnthropic": has_anthropic,
        "hasOpenRouter": has_openrouter,
        "availableProviders": list(available_providers.keys()),
    }

