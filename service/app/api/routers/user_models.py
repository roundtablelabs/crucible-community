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

"""User LLM models API endpoints. All models live in llm_models; user_id is set when user adds."""
import logging
import uuid as _uuid
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.model_catalog import LLMModel
from app.models.user_settings import UserSettings
from app.core.encryption import decrypt_api_key

router = APIRouter(prefix="/user/models", tags=["user-models"])
logger = logging.getLogger(__name__)


def handle_external_api_error(response, provider_name: str, default_message: str) -> HTTPException:
    """
    Handle errors from external API providers.
    
    Converts 401 errors to 400 to avoid triggering frontend logout.
    External API 401s are about invalid API keys (bad request), not our auth system.
    
    Args:
        response: httpx Response object
        provider_name: Name of the provider (e.g., "OpenAI", "OpenRouter")
        default_message: Default error message if we can't extract a better one
        
    Returns:
        HTTPException with appropriate status code and message
    """
    status_code = response.status_code
    
    # Extract error message from response if possible
    error_detail = default_message
    try:
        error_data = response.json()
        if "error" in error_data:
            error_detail = error_data["error"].get("message", error_detail)
        elif "message" in error_data:
            error_detail = error_data["message"]
    except:
        pass
    
    # Convert 401 to 400 - external API auth failures are bad requests, not our auth issues
    if status_code == 401:
        logger.error(f"{provider_name} API authentication failed: {error_detail}")
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_detail
        )
    
    # For other errors, return 500 with details
    logger.error(f"HTTP error from {provider_name} API: {status_code} - {response.text}")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Failed to fetch models from {provider_name}: HTTP {status_code}"
    )


class UserModelRead(BaseModel):
    id: str
    provider: str
    api_identifier: str
    display_name: str
    description: Optional[str]
    enabled: bool
    metadata: Optional[dict]  # Keep as 'metadata' in API response for frontend compatibility

    class Config:
        from_attributes = True


class UserModelUpdate(BaseModel):
    enabled: bool


class UserModelCreate(BaseModel):
    provider: str
    api_identifier: str
    display_name: str
    description: Optional[str] = None


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


async def fetch_models_from_openrouter(api_key: str) -> list[dict]:
    """Fetch models from OpenRouter API."""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "https://roundtablelabs.ai",
                    "X-Title": "Crucible Community Edition",
                },
                timeout=30.0,
            )
            
            # Check for errors before raising
            if not response.is_success:
                raise handle_external_api_error(
                    response,
                    "OpenRouter",
                    "Invalid API key. Please check your OpenRouter API key."
                )
            
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])
    except HTTPException:
        # Re-raise HTTP exceptions (like 400)
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching models from OpenRouter: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch models from OpenRouter: HTTP {e.response.status_code}"
        )
    except Exception as e:
        logger.error(f"Error fetching models from OpenRouter: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch models from OpenRouter: {str(e)}"
        )


async def fetch_models_from_openai(api_key: str) -> list[dict]:
    """Fetch models from OpenAI API."""
    try:
        import httpx
        
        # Strip whitespace from API key
        api_key = api_key.strip()
        
        # Basic validation - OpenAI keys typically start with "sk-"
        if not api_key.startswith("sk-"):
            logger.warning(f"OpenAI API key doesn't start with 'sk-': {api_key[:10]}...")
            # Still try anyway, in case of different key formats
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={
                    "Authorization": f"Bearer {api_key}",
                },
                timeout=30.0,
            )
            
            # Check for errors before raising
            if not response.is_success:
                raise handle_external_api_error(
                    response,
                    "OpenAI",
                    "Invalid API key. Please check your OpenAI API key."
                )
            
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])
    except HTTPException:
        # Re-raise HTTP exceptions (like 401)
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching models from OpenAI: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch models from OpenAI: HTTP {e.response.status_code}"
        )
    except Exception as e:
        logger.error(f"Error fetching models from OpenAI: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch models from OpenAI: {str(e)}"
        )


@router.post("/fetch/{provider}")
async def fetch_models_from_provider(
    provider: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch models from a provider using the user's API key and store them."""
    _require_member_user(current_user)
    
    user_uuid = UUID(str(current_user.id))
    
    # Get user settings to retrieve API key
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_uuid)
    )
    settings = result.scalars().first()
    
    if not settings or not settings.provider_api_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key found for provider: {provider}"
        )
    
    encrypted_key = settings.provider_api_keys.get(provider)
    if not encrypted_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key found for provider: {provider}"
        )
    
    try:
        api_key = decrypt_api_key(encrypted_key)
        # Strip whitespace that might have been accidentally included
        api_key = api_key.strip()
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"API key for provider {provider} is empty after decryption"
            )
        
        # Validate API key format matches provider
        if provider == "openai":
            # OpenAI keys start with "sk-" but NOT "sk-or-" (which is OpenRouter)
            if api_key.startswith("sk-or-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This appears to be an OpenRouter API key. Please use an OpenAI API key (starts with 'sk-' but not 'sk-or-'). You can get one at https://platform.openai.com/account/api-keys"
                )
            if not api_key.startswith("sk-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid OpenAI API key format. OpenAI keys should start with 'sk-'. You can get one at https://platform.openai.com/account/api-keys"
                )
        elif provider == "openrouter":
            # OpenRouter keys start with "sk-or-v1-"
            if not api_key.startswith("sk-or-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid OpenRouter API key format. OpenRouter keys should start with 'sk-or-'. You can get one at https://openrouter.ai/keys"
                )
        elif provider == "anthropic":
            # Anthropic keys start with "sk-ant-"
            if not api_key.startswith("sk-ant-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Anthropic API key format. Anthropic keys should start with 'sk-ant-'. You can get one at https://console.anthropic.com/settings/keys"
                )
        elif provider == "google":
            # Google API keys are typically longer and don't have a specific prefix
            # But they're usually base64-like strings, so we'll just check they're not empty
            if len(api_key) < 20:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Google API key format. Google API keys are typically longer strings. You can get one at https://aistudio.google.com/app/apikey"
                )
        # Note: Other providers (mistral, deepseek, etc.) can be added here when implemented
        
        # Log first few characters for debugging (not the full key)
        logger.debug(f"Decrypted API key for {provider}: {api_key[:10]}... (length: {len(api_key)})")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error decrypting API key for provider {provider}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt API key"
        )
    
    # Fetch models based on provider
    if provider == "openrouter":
        models_data = await fetch_models_from_openrouter(api_key)
    elif provider == "openai":
        models_data = await fetch_models_from_openai(api_key)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider {provider} is not yet supported for model fetching"
        )
    
    # Delete existing models for this provider (only rows this user added)
    await db.execute(
        delete(LLMModel).where(
            LLMModel.user_id == user_uuid,
            LLMModel.provider == provider,
        )
    )

    # Store fetched models into llm_models
    stored_count = 0
    for model_data in models_data:
        model_id = model_data.get("id", "")
        if not model_id:
            continue

        display_name = model_data.get("name") or model_data.get("id", "")
        description = model_data.get("description") or None
        metadata = {
            "context_length": model_data.get("context_length"),
            "pricing": model_data.get("pricing"),
            "architecture": model_data.get("architecture"),
        }

        row = LLMModel(
            id=str(_uuid.uuid4()),
            user_id=user_uuid,
            provider=provider,
            api_identifier=model_id,
            display_name=display_name,
            description=description,
            enabled=True,
            model_metadata=metadata,
        )
        db.add(row)
        stored_count += 1
    
    await db.commit()
    
    return {
        "message": f"Successfully fetched and stored {stored_count} models from {provider}",
        "count": stored_count,
    }


@router.get("", response_model=list[UserModelRead])
@router.get("/", response_model=list[UserModelRead])
async def get_user_models(
    provider: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserModelRead]:
    """Get user's LLM models from llm_models (rows where user_id=current user)."""
    _require_member_user(current_user)

    user_uuid = UUID(str(current_user.id))
    query = select(LLMModel).where(LLMModel.user_id == user_uuid)
    if provider:
        query = query.where(LLMModel.provider == provider)
    query = query.order_by(LLMModel.provider, LLMModel.display_name)

    result = await db.execute(query)
    models = result.scalars().all()

    return [
        UserModelRead(
            id=model.id,
            provider=model.provider,
            api_identifier=model.api_identifier,
            display_name=model.display_name,
            description=model.description,
            enabled=model.enabled,
            metadata=model.model_metadata,
        )
        for model in models
    ]


@router.post("", response_model=UserModelRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserModelRead, status_code=status.HTTP_201_CREATED)
async def create_user_model(
    body: UserModelCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserModelRead:
    """Add a model manually to the user's model list."""
    _require_member_user(current_user)

    provider = (body.provider or "").strip().lower()
    api_identifier = (body.api_identifier or "").strip()
    display_name = (body.display_name or "").strip() or api_identifier

    if not provider or not api_identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="provider and api_identifier are required",
        )

    valid_providers = {"openrouter", "openai", "anthropic", "google", "deepseek", "mistral", "eden_ai", "xai"}
    if provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"provider must be one of: {', '.join(sorted(valid_providers))}",
        )

    user_uuid = UUID(str(current_user.id))

    # Check for duplicate (provider, api_identifier) in llm_models
    existing = await db.execute(
        select(LLMModel).where(
            LLMModel.provider == provider,
            LLMModel.api_identifier == api_identifier,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This model is already in the catalog",
        )

    model = LLMModel(
        id=str(_uuid.uuid4()),
        user_id=user_uuid,
        provider=provider,
        api_identifier=api_identifier,
        display_name=display_name,
        description=(body.description or "").strip() or None,
        enabled=True,
        model_metadata=None,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)

    return UserModelRead(
        id=model.id,
        provider=model.provider,
        api_identifier=model.api_identifier,
        display_name=model.display_name,
        description=model.description,
        enabled=model.enabled,
        metadata=model.model_metadata,
    )


@router.patch("/{model_id}", response_model=UserModelRead)
async def update_user_model(
    model_id: str,
    update: UserModelUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserModelRead:
    """Update a user-added model (enable/disable). Only rows with user_id=current user."""
    _require_member_user(current_user)

    user_uuid = UUID(str(current_user.id))
    result = await db.execute(
        select(LLMModel).where(
            LLMModel.id == model_id,
            LLMModel.user_id == user_uuid,
        )
    )
    model = result.scalars().first()

    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    model.enabled = update.enabled
    await db.commit()
    await db.refresh(model)

    return UserModelRead(
        id=model.id,
        provider=model.provider,
        api_identifier=model.api_identifier,
        display_name=model.display_name,
        description=model.description,
        enabled=model.enabled,
        metadata=model.model_metadata,
    )


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_model(
    model_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a model from llm_models. Only allowed when user_id=current user (seeded rows cannot be removed)."""
    _require_member_user(current_user)

    user_uuid = UUID(str(current_user.id))
    logger.info(f"[delete_user_model] Attempting to delete model {model_id} for user {user_uuid}")
    
    result = await db.execute(
        select(LLMModel).where(
            LLMModel.id == model_id,
            LLMModel.user_id == user_uuid,
        )
    )
    model = result.scalars().first()

    if not model:
        logger.warning(f"[delete_user_model] Model {model_id} not found or not owned by user {user_uuid}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )

    try:
        await db.execute(delete(LLMModel).where(LLMModel.id == model_id, LLMModel.user_id == user_uuid))
        await db.commit()
        logger.info(f"[delete_user_model] Successfully deleted model {model_id} for user {user_uuid}")
    except Exception as e:
        logger.exception(f"[delete_user_model] Error deleting model {model_id}: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete model",
        )


@router.delete("/provider/{provider}")
async def delete_provider_models(
    provider: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete all models for a specific provider."""
    _require_member_user(current_user)
    
    user_uuid = UUID(str(current_user.id))
    
    await db.execute(
        delete(LLMModel).where(
            LLMModel.user_id == user_uuid,
            LLMModel.provider == provider,
        )
    )
    await db.commit()

    return {"message": f"Deleted all models for provider: {provider}"}
