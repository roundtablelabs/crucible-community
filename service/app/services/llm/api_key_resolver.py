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

"""API Key Resolver for intelligent provider routing based on user's available API keys."""
from typing import Literal
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user_settings import UserSettings
from app.core.encryption import decrypt_api_key, is_masked_key
from app.services.llm.exceptions import NoAPIKeyError
import logging

logger = logging.getLogger(__name__)

ProviderName = Literal[
    "openai",
    "anthropic",
    "xai",
    "deepseek",
    "gemini",
    "openrouter",
    "eden_ai"
]

# Map provider names from router to settings keys
PROVIDER_TO_SETTINGS_KEY = {
    "anthropic": "anthropic",
    "openai": "openai",
    "xai": "xai",
    "deepseek": "deepseek",
    "gemini": "google",  # Gemini uses "google" in settings
    "openrouter": "openrouter",
    "eden_ai": "eden_ai",
}

# Map which aggregators support which native providers
# Note: "google" and "gemini" both refer to Google/Gemini models
AGGREGATOR_SUPPORT = {
    "openrouter": ["anthropic", "openai", "google", "gemini", "deepseek", "xai", "meta", "mistral"],
    "eden_ai": ["anthropic", "openai", "google", "gemini"],
}

# Map native provider names to aggregator provider names
NATIVE_TO_AGGREGATOR_PROVIDER = {
    "google": "gemini",  # Google models are accessed as "gemini" in aggregators
    "gemini": "gemini",
}


class APIKeyResolver:
    """Resolves API keys and builds provider chains for LLM routing."""
    
    def __init__(self):
        """Initialize the API key resolver."""
        pass
    
    async def get_user_available_providers(
        self,
        user_id: str,
        db: AsyncSession
    ) -> dict[ProviderName, str]:
        """Get all providers user has API keys for.
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            Dictionary mapping provider_name to decrypted_api_key.
            Only includes providers where user has a key configured.
        """
        if not user_id or not db:
            logger.debug("[APIKeyResolver] No user_id or db, returning empty providers")
            return {}
        
        try:
            user_uuid = UUID(str(user_id))
            result = await db.execute(
                select(UserSettings).where(UserSettings.user_id == user_uuid)
            )
            settings = result.scalar_one_or_none()
            
            if not settings:
                logger.warning(
                    f"[APIKeyResolver] No UserSettings record found for user {user_id}. "
                    f"User needs to configure API keys in settings."
                )
                return {}
            
            if not settings.provider_api_keys:
                logger.warning(
                    f"[APIKeyResolver] UserSettings exists but provider_api_keys is empty for user {user_id}. "
                    f"User needs to add API keys in settings."
                )
                return {}
            
            available_providers: dict[ProviderName, str] = {}
            decryption_errors = []
            
            # Check each provider
            for provider_name, settings_key in PROVIDER_TO_SETTINGS_KEY.items():
                encrypted_key = settings.provider_api_keys.get(settings_key)
                if encrypted_key:
                    # Validate encrypted key is not empty
                    if not encrypted_key.strip():
                        logger.warning(
                            f"[APIKeyResolver] Empty encrypted key found for provider {provider_name} "
                            f"(settings_key: {settings_key})"
                        )
                        continue
                    
                    try:
                        api_key = decrypt_api_key(encrypted_key)
                        if not api_key:
                            logger.warning(
                                f"[APIKeyResolver] Decryption returned empty key for provider {provider_name}"
                            )
                            continue
                        
                        # Validate decrypted key is not empty or whitespace
                        api_key = api_key.strip()
                        if not api_key:
                            logger.warning(
                                f"[APIKeyResolver] Decrypted API key is empty/whitespace for provider {provider_name}"
                            )
                            continue
                        
                        # Validate that the decrypted key is not a masked value
                        # This prevents using corrupted masked keys that were accidentally saved
                        if is_masked_key(api_key):
                            logger.error(
                                f"[APIKeyResolver] Decrypted API key for {provider_name} appears to be a masked value. "
                                f"This indicates the stored key is corrupted. The key will be skipped. "
                                f"User should delete and re-enter this key in Settings > API Keys."
                            )
                            continue
                        
                        available_providers[provider_name] = api_key
                        logger.debug(f"[APIKeyResolver] Found valid API key for provider {provider_name}")
                    except ValueError as e:
                        # Decryption failed - likely wrong encryption key or corrupted data
                        error_msg = f"Decryption failed for {provider_name}: {e}"
                        logger.error(
                            f"[APIKeyResolver] {error_msg}. "
                            f"This may indicate ROUNDTABLE_ENCRYPTION_KEY has changed or data is corrupted."
                        )
                        decryption_errors.append(provider_name)
                    except Exception as e:
                        # Other decryption errors
                        error_type = type(e).__name__
                        logger.error(
                            f"[APIKeyResolver] Unexpected error decrypting API key for {provider_name}: "
                            f"{error_type}: {e}"
                        )
                        decryption_errors.append(provider_name)
            
            if decryption_errors:
                logger.warning(
                    f"[APIKeyResolver] Failed to decrypt API keys for providers: {decryption_errors}. "
                    f"User may need to re-enter these keys."
                )
            
            if available_providers:
                logger.debug(
                    f"[APIKeyResolver] User {user_id} has {len(available_providers)} valid API key(s) "
                    f"for providers: {list(available_providers.keys())}"
                )
            else:
                logger.warning(
                    f"[APIKeyResolver] User {user_id} has no valid API keys configured. "
                    f"User needs to add API keys in settings to start debates."
                )
            
            return available_providers
            
        except ValueError as e:
            # UUID parsing error
            logger.error(
                f"[APIKeyResolver] Invalid user_id format: {user_id}. Error: {e}"
            )
            return {}
        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"[APIKeyResolver] Unexpected error getting user available providers for user {user_id}: "
                f"{error_type}: {e}",
                exc_info=True
            )
            return {}
    
    async def resolve_provider_chain(
        self,
        model_id: str,
        native_provider: ProviderName,
        user_id: str | None,
        db: AsyncSession | None
    ) -> list[tuple[ProviderName, str]]:
        """Resolve provider chain for a model based on user's available API keys.
        
        Priority order:
        1. Native provider (if user has key)
        2. OpenRouter (if user has key and supports this provider)
        3. Eden AI (if user has key and supports this provider)
        
        Args:
            model_id: Model identifier (for error messages)
            native_provider: The native provider for this model
            user_id: Optional user ID
            db: Optional database session
            
        Returns:
            Ordered list of (provider_name, api_key) tuples.
            Only includes providers user has keys for.
            
        Raises:
            NoAPIKeyError: If no suitable provider is available.
        """
        logger.debug(f"[APIKeyResolver.resolve_provider_chain] model_id={model_id}, native_provider={native_provider}")
        
        # Get all available providers for this user
        available_providers = await self.get_user_available_providers(user_id, db)
        
        if not available_providers:
            # No API keys at all - raise error with helpful message
            alternatives = []
            if native_provider in AGGREGATOR_SUPPORT.get("openrouter", []):
                alternatives.append("openrouter")
            if native_provider in AGGREGATOR_SUPPORT.get("eden_ai", []):
                alternatives.append("eden_ai")
            
            logger.error(
                f"[APIKeyResolver] No API keys available for user {user_id}. "
                f"Cannot resolve provider chain for model {model_id} (native: {native_provider}). "
                f"User needs to configure API keys in settings."
            )
            raise NoAPIKeyError(model_id, native_provider, alternatives)
        
        provider_chain: list[tuple[ProviderName, str]] = []
        
        # 1. Check native provider first
        if native_provider in available_providers:
            provider_chain.append((native_provider, available_providers[native_provider]))
            logger.debug(f"[APIKeyResolver] Added native provider {native_provider} to chain")
        
        # 2. Check aggregators that support this native provider
        # Map native provider to aggregator provider name (e.g., "google" -> "gemini")
        aggregator_provider_name = NATIVE_TO_AGGREGATOR_PROVIDER.get(native_provider, native_provider)
        
        # Check OpenRouter
        if "openrouter" in available_providers:
            openrouter_supports = AGGREGATOR_SUPPORT.get("openrouter", [])
            # Check both native_provider and aggregator_provider_name (e.g., "gemini" and "google")
            if (native_provider in openrouter_supports or 
                aggregator_provider_name in openrouter_supports or
                (native_provider == "gemini" and "google" in openrouter_supports) or
                (native_provider == "google" and "gemini" in openrouter_supports)):
                provider_chain.append(("openrouter", available_providers["openrouter"]))
                logger.debug(f"[APIKeyResolver] Added OpenRouter to chain (supports {native_provider})")
        
        # Check Eden AI
        if "eden_ai" in available_providers:
            eden_ai_supports = AGGREGATOR_SUPPORT.get("eden_ai", [])
            # Check both native_provider and aggregator_provider_name (e.g., "gemini" and "google")
            if (native_provider in eden_ai_supports or 
                aggregator_provider_name in eden_ai_supports or
                (native_provider == "gemini" and "google" in eden_ai_supports) or
                (native_provider == "google" and "gemini" in eden_ai_supports)):
                provider_chain.append(("eden_ai", available_providers["eden_ai"]))
                logger.debug(f"[APIKeyResolver] Added Eden AI to chain (supports {native_provider})")
        
        # If no providers in chain, raise error
        if not provider_chain:
            alternatives = []
            if native_provider in AGGREGATOR_SUPPORT.get("openrouter", []):
                alternatives.append("openrouter")
            if native_provider in AGGREGATOR_SUPPORT.get("eden_ai", []):
                alternatives.append("eden_ai")
            
            logger.warning(
                f"[APIKeyResolver] No suitable provider found for model {model_id} "
                f"(native: {native_provider}). User has keys for: {list(available_providers.keys())}"
            )
            raise NoAPIKeyError(model_id, native_provider, alternatives)
        
        logger.debug(
            f"[APIKeyResolver] Resolved provider chain for {model_id}: "
            f"{[p[0] for p in provider_chain]}"
        )
        return provider_chain
    
    def get_required_keys_message(
        self,
        model_id: str,
        native_provider: ProviderName
    ) -> str:
        """Generate helpful error message listing which API keys are needed.
        
        Args:
            model_id: Model identifier
            native_provider: Native provider name
            
        Returns:
            Helpful error message string
        """
        alternatives = []
        if native_provider in AGGREGATOR_SUPPORT.get("openrouter", []):
            alternatives.append("openrouter")
        if native_provider in AGGREGATOR_SUPPORT.get("eden_ai", []):
            alternatives.append("eden_ai")
        
        # This will be used to create the error message
        # The actual message is generated in NoAPIKeyError
        error = NoAPIKeyError(model_id, native_provider, alternatives)
        return str(error)
