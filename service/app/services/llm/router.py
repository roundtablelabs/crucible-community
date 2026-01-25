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

"""LLM Router for routing requests to appropriate providers."""
from dataclasses import dataclass
from typing import Literal, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.llm.providers.base import BaseLLMProvider
from app.services.llm.providers.openai import OpenAIProvider
from app.services.llm.providers.openrouter import OpenRouterProvider
from app.services.llm.providers.anthropic import AnthropicProvider
from app.services.llm.providers.xai import xAIProvider
from app.services.llm.providers.deepseek import DeepSeekProvider
from app.services.llm.providers.gemini import GeminiProvider
from app.services.llm.providers.eden_ai import EdenAIProvider
from app.models.model_catalog import LLMModel
from app.models.user_settings import UserSettings
from app.core.encryption import decrypt_api_key, is_masked_key
from app.core.circuit_breaker import get_llm_circuit_breaker, CircuitBreakerOpenError
from app.core.llm_rate_limit_tracker import OPENROUTER_TRACKER, OPENAI_TRACKER
from app.core.exceptions import RateLimitExceededError
from app.core.metrics import record_llm_metrics
from app.services.llm.api_key_resolver import APIKeyResolver
from app.services.llm.exceptions import NoAPIKeyError
import logging
import time

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
ModelTier = Literal["cheap", "standard", "expensive"]

# Map provider names from database to router provider names
PROVIDER_MAP = {
    "anthropic": "anthropic",
    "Anthropic": "anthropic",
    "openai": "openai",
    "OpenAI": "openai",
    "xai": "xai",
    "xAI": "xai",
    "XAI": "xai",
    "deepseek": "deepseek",
    "Deepseek": "deepseek",
    "DeepSeek": "deepseek",
    "google": "gemini",
    "Google": "gemini",
    "gemini": "gemini",
    "Gemini": "gemini",
    "openrouter": "openrouter",
    "OpenRouter": "openrouter",
    "eden_ai": "eden_ai",
    "edenai": "eden_ai",
    "EdenAI": "eden_ai",
    "Eden AI": "eden_ai",
}

@dataclass
class LLMRequest:
    prompt: str
    provider: ProviderName | None = None
    model: str | None = None
    tier: ModelTier = "standard"
    temperature: float = 0.2
    json_mode: bool = False
    web_search: bool = False
    _provider_used: str | None = None  # Internal: track which provider was actually used

class LLMRouter:
    """Route LLM calls to the appropriate provider based on prompt hints with automatic failover."""

    def __init__(self) -> None:
        self.default_provider: ProviderName = "openrouter"
        # Lazy-load providers to avoid initializing unused providers
        # Providers are created per-call with user API keys, so we don't cache them
        self._tier_map: dict[ModelTier, str] = {
            "cheap": "openai/gpt-4o-mini",
            "standard": "anthropic/claude-sonnet-4.5",
            "expensive": "anthropic/claude-sonnet-4.5",
        }
        # Provider health tracking
        self._provider_health: dict[ProviderName, dict] = {
            "openai": {"errors": 0, "last_error": None, "available": True},
            "anthropic": {"errors": 0, "last_error": None, "available": True},
            "xai": {"errors": 0, "last_error": None, "available": True},
            "deepseek": {"errors": 0, "last_error": None, "available": True},
            "gemini": {"errors": 0, "last_error": None, "available": True},
            "openrouter": {"errors": 0, "last_error": None, "available": True},
            "eden_ai": {"errors": 0, "last_error": None, "available": True},
        }
        self._health_check_threshold = 3  # Mark unavailable after 3 consecutive errors
        # Quality-based routing configuration
        self.quality_routing_enabled: bool = True  # Can be disabled via config
        self.min_quality_threshold: float = 0.5  # Minimum quality to consider
        self.quality_weight: float = 0.7  # Weight for quality vs cost (0.0 = cost only, 1.0 = quality only)
        # API Key Resolver for intelligent routing
        self._api_key_resolver = APIKeyResolver()

    async def _get_provider_for_model(
        self,
        model_id: str,
        user_id: str | None,
        db: AsyncSession | None
    ) -> tuple[ProviderName, str]:
        """Look up model in database and return provider name and api_identifier.
        
        Args:
            model_id: Model ID from database (e.g., "claude-4-5-sonnet")
            user_id: Optional user ID for context
            db: Database session for model lookup
            
        Returns:
            Tuple of (provider_name, api_identifier)
            api_identifier is in OpenRouter format (e.g., "anthropic/claude-sonnet-4.5")
            Native providers will look up native_api_identifier themselves
        """
        if not db:
            logger.warning(f"[LLMRouter._get_provider_for_model] No DB session, cannot lookup model: {model_id}")
            return ("openrouter", model_id)  # Fallback
        
        try:
            # Try to lookup by id first
            model_record = await db.get(LLMModel, model_id)
            if model_record:
                provider = PROVIDER_MAP.get(model_record.provider.lower(), "openrouter")
                logger.debug(f"[LLMRouter._get_provider_for_model] Found model {model_id}: provider={provider}, api_identifier={model_record.api_identifier}")
                return (provider, model_record.api_identifier)
            
            # Fallback: try lookup by api_identifier
            result = await db.execute(select(LLMModel).where(LLMModel.api_identifier == model_id))
            model_record = result.scalar_one_or_none()
            if model_record:
                provider = PROVIDER_MAP.get(model_record.provider.lower(), "openrouter")
                logger.debug(f"[LLMRouter._get_provider_for_model] Found model by api_identifier {model_id}: provider={provider}")
                return (provider, model_record.api_identifier)
            
            # Model not found in database - try to infer provider from model_id format
            # Check if model_id has format "provider/model" (e.g., "anthropic/claude-sonnet-4.5")
            if "/" in model_id:
                provider_prefix = model_id.split("/", 1)[0].lower()
                if provider_prefix in PROVIDER_MAP:
                    inferred_provider = PROVIDER_MAP[provider_prefix]
                    logger.debug(f"[LLMRouter._get_provider_for_model] Inferred provider {inferred_provider} from model_id prefix '{provider_prefix}'")
                    return (inferred_provider, model_id)
            
            logger.warning(f"[LLMRouter._get_provider_for_model] Model {model_id} not found in database and could not infer provider")
            return ("openrouter", model_id)  # Fallback to openrouter only if no prefix matches
        except Exception as e:
            logger.error(f"[LLMRouter._get_provider_for_model] Error looking up model {model_id}: {e}")
            return ("openrouter", model_id)  # Fallback
    
    async def _get_user_api_key(
        self,
        provider: ProviderName,
        user_id: str | None,
        db: AsyncSession | None
    ) -> str | None:
        """Get user's API key for provider from UserSettings.
        
        Args:
            provider: Provider name
            user_id: User ID
            db: Database session
            
        Returns:
            Decrypted API key, or None if not found
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
            
            # Map provider name to settings key
            provider_key_map = {
                "anthropic": "anthropic",
                "openai": "openai",
                "xai": "xai",
                "deepseek": "deepseek",
                "gemini": "google",  # Gemini uses "google" in settings
                "openrouter": "openrouter",
                "eden_ai": "eden_ai",
            }
            
            settings_key = provider_key_map.get(provider, provider)
            encrypted_key = settings.provider_api_keys.get(settings_key)
            
            if not encrypted_key:
                return None
            
            # Decrypt the API key
            api_key = decrypt_api_key(encrypted_key)
            if not api_key:
                return None
            
            api_key = api_key.strip()
            if not api_key:
                return None
            
            # Validate that the decrypted key is not a masked value
            # This prevents using corrupted masked keys that were accidentally saved
            if is_masked_key(api_key):
                logger.error(
                    f"[LLMRouter._get_user_api_key] Decrypted API key for {provider} appears to be a masked value. "
                    f"This indicates the stored key is corrupted. Returning None. "
                    f"User should delete and re-enter this key in Settings > API Keys."
                )
                return None
            
            logger.debug(f"[LLMRouter._get_user_api_key] Found API key for provider {provider}")
            return api_key
        except Exception as e:
            logger.error(f"[LLMRouter._get_user_api_key] Error getting API key for {provider}: {e}")
            return None
    
    def _get_provider(self, provider_name: ProviderName, api_key: str | None = None) -> BaseLLMProvider:
        """Create provider instance with API key.
        
        Args:
            provider_name: Name of the provider
            api_key: Required API key (must be provided, no env var fallback)
            
        Returns:
            Provider instance
            
        Raises:
            ValueError: If api_key is None or empty
        """
        logger.debug(f"[LLMRouter._get_provider] Creating provider: {provider_name}")
        
        if not api_key:
            raise ValueError(
                f"API key required for {provider_name}. "
                "Please configure your API key in Settings > API Keys."
            )
        
        try:
            if provider_name == "openai":
                return OpenAIProvider(api_key=api_key)
            elif provider_name == "anthropic":
                return AnthropicProvider(api_key=api_key)
            elif provider_name == "xai":
                return xAIProvider(api_key=api_key)
            elif provider_name == "deepseek":
                return DeepSeekProvider(api_key=api_key)
            elif provider_name == "gemini":
                return GeminiProvider(api_key=api_key)
            elif provider_name == "openrouter":
                return OpenRouterProvider(api_key=api_key)
            elif provider_name == "eden_ai":
                return EdenAIProvider(api_key=api_key)
            else:
                logger.warning(f"[LLMRouter._get_provider] Unknown provider {provider_name}, falling back to openrouter")
                return OpenRouterProvider(api_key=api_key)
        except ValueError as e:
            logger.error(f"[LLMRouter._get_provider] FAILED to initialize {provider_name}: {e}")
            raise ValueError(
                f"Failed to initialize LLM provider '{provider_name}': {e}. "
                "Please check your API keys in Settings > API Keys."
            ) from e

    async def _get_user_default_provider(
        self,
        user_id: str | None,
        db: AsyncSession | None
    ) -> ProviderName | None:
        """Get user's default provider from UserSettings.
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            User's default provider name, or None if not set or unavailable
        """
        if not user_id or not db:
            return None
        
        try:
            user_uuid = UUID(str(user_id))
            result = await db.execute(
                select(UserSettings).where(UserSettings.user_id == user_uuid)
            )
            settings = result.scalar_one_or_none()
            
            if not settings or not settings.default_provider:
                return None
            
            # Map provider name to router provider name
            provider = PROVIDER_MAP.get(settings.default_provider.lower(), None)
            if provider and provider in self._provider_health:
                logger.debug(f"[LLMRouter._get_user_default_provider] Found user default provider: {provider}")
                return provider
            
            logger.debug(f"[LLMRouter._get_user_default_provider] User default provider '{settings.default_provider}' not valid, using system default")
            return None
        except Exception as e:
            logger.warning(f"[LLMRouter._get_user_default_provider] Error getting user default provider: {e}")
            return None

    async def generate(
        self, 
        request: LLMRequest, 
        user_id: str | None = None,
        db: AsyncSession | None = None
    ) -> str:
        """Generate response with automatic provider failover.
        
        Uses API key resolver to proactively check available keys before attempting calls.
        Only uses user-configured API keys (no environment variable fallback).
        
        Args:
            request: LLM request with prompt, model, etc.
            user_id: Optional user ID for API key resolution
            db: Optional database session for model/provider lookup
            
        Returns:
            Generated text response
            
        Raises:
            NoAPIKeyError: If no suitable API key is available for the requested model
        """
        logger.debug(f"[LLMRouter.generate] ENTER - model: {request.model}, tier: {request.tier}")
        
        # Use specific model if requested, otherwise fallback to tier mapping
        model = request.model
        original_model = model
        
        # If model is provided and we have DB access, look up provider
        provider_from_model: ProviderName | None = None
        api_identifier = model or self._tier_map.get(request.tier, "anthropic/claude-sonnet-4.5")
        
        if model and db:
            try:
                provider_from_model, api_identifier = await self._get_provider_for_model(model, user_id, db)
                logger.debug(f"[LLMRouter.generate] Model lookup: provider={provider_from_model}, api_identifier={api_identifier}")
            except Exception as e:
                logger.warning(f"[LLMRouter.generate] Model lookup failed: {e}, using model as-is")
                api_identifier = model
        
        if not model:
            api_identifier = self._tier_map.get(request.tier, "anthropic/claude-sonnet-4.5")
            logger.debug(f"[LLMRouter.generate] No model specified, using tier mapping: {api_identifier}")
        
        # Determine native provider for the model
        # If we have provider_from_model, use it; otherwise infer or use request.provider
        native_provider: ProviderName
        if provider_from_model:
            native_provider = provider_from_model
        elif request.provider:
            native_provider = request.provider
        else:
            # Infer from model name or use default
            # First check if api_identifier has format "provider/model" (e.g., "anthropic/claude-sonnet-4.5")
            if "/" in api_identifier:
                provider_prefix = api_identifier.split("/", 1)[0].lower()
                model_name_part = api_identifier.split("/", 1)[1]
                if provider_prefix in PROVIDER_MAP:
                    native_provider = PROVIDER_MAP[provider_prefix]
                    logger.debug(f"[LLMRouter.generate] Inferred provider {native_provider} from api_identifier prefix '{provider_prefix}'")
                elif model_name_part.startswith("gpt"):
                    native_provider = "openai"
                elif model_name_part.startswith("claude"):
                    native_provider = "anthropic"
                elif "gemini" in model_name_part.lower():
                    native_provider = "gemini"
                else:
                    native_provider = self.default_provider
            elif api_identifier.startswith("gpt"):
                native_provider = "openai"
            elif api_identifier.startswith("claude"):
                native_provider = "anthropic"
            elif "gemini" in api_identifier.lower():
                native_provider = "gemini"
            else:
                native_provider = self.default_provider
        
        logger.debug(f"[LLMRouter.generate] Native provider: {native_provider}, api_identifier: {api_identifier}")
        
        # PROACTIVE VALIDATION: Resolve provider chain BEFORE attempting any calls
        # This will raise NoAPIKeyError if no suitable provider is available
        try:
            provider_chain = await self._api_key_resolver.resolve_provider_chain(
                model_id=original_model or api_identifier,
                native_provider=native_provider,
                user_id=user_id,
                db=db
            )
            
            # If web search is enabled, check if we have OpenRouter (only provider that supports it)
            # Note: Users typically only provide native keys (OpenAI, Anthropic), not OpenRouter
            if request.web_search:
                has_openrouter = any(p[0] == "openrouter" for p in provider_chain)
                
                if has_openrouter:
                    # Reorder provider chain to prioritize OpenRouter for web search
                    openrouter_provider = None
                    other_providers = []
                    
                    for provider_name, api_key in provider_chain:
                        if provider_name == "openrouter":
                            openrouter_provider = (provider_name, api_key)
                        else:
                            other_providers.append((provider_name, api_key))
                    
                    provider_chain = [openrouter_provider] + other_providers
                    logger.info(
                        f"[LLMRouter.generate] Web search enabled - prioritizing OpenRouter "
                        f"(only provider that supports web search plugins)"
                    )
                else:
                    # No OpenRouter key available, but web search requested
                    # Native providers (OpenAI, Anthropic) don't support web search plugins
                    # Since users typically only provide native keys, we'll proceed without web search
                    logger.warning(
                        f"[LLMRouter.generate] Web search requested but OpenRouter key not available. "
                        f"Native providers (OpenAI, Anthropic) don't support web search plugins. "
                        f"Proceeding without web search functionality. "
                        f"Available providers: {[p[0] for p in provider_chain]}. "
                        f"To enable web search, add an OpenRouter API key in Settings."
                    )
                    # Note: We won't add plugins to kwargs, so native providers won't receive it
            
            logger.info(
                f"[LLMRouter.generate] Resolved provider chain: "
                f"{[p[0] for p in provider_chain]} for model {original_model or api_identifier}"
            )
        except NoAPIKeyError:
            # Re-raise with full context
            raise
        except Exception as e:
            logger.error(f"[LLMRouter.generate] Error resolving provider chain: {e}", exc_info=True)
            # Fall back to old behavior if resolver fails (shouldn't happen, but safety net)
            logger.warning("[LLMRouter.generate] Resolver failed, falling back to legacy provider selection")
            provider_chain = None
        
        kwargs = {}
        # Handle web search based on provider type
        if request.web_search:
            # Check if first provider in chain is OpenRouter
            if provider_chain and provider_chain[0][0] == "openrouter":
                # OpenRouter uses plugins parameter
                kwargs["plugins"] = [{"id": "web"}]
                logger.debug(f"[LLMRouter.generate] Web search enabled - adding plugins parameter for OpenRouter")
            else:
                # Native providers (OpenAI, Anthropic) support web search via their native APIs
                # Pass web_search flag to provider (they'll handle it appropriately)
                kwargs["web_search"] = True
                logger.debug(f"[LLMRouter.generate] Web search enabled - using native provider web search capability")
        
        # Estimate tokens (rough: ~4 characters per token)
        estimated_tokens = len(request.prompt) // 4 + 100  # Add buffer for response
        
        last_error = None
        
        # Use resolved provider chain if available, otherwise fall back to legacy behavior
        if provider_chain:
            providers_to_try = [(p[0], p[1]) for p in provider_chain]  # List of (provider_name, api_key)
            logger.debug(f"[LLMRouter.generate] Using resolved provider chain: {[p[0] for p in providers_to_try]}")
        else:
            # Legacy fallback (shouldn't happen, but keep for safety)
            logger.warning("[LLMRouter.generate] Using legacy provider selection")
            primary_provider_name = await self.select_provider(request, user_id, db)
            providers_to_try = [(primary_provider_name, None)]  # Will try to get key later
        
        logger.info(
            f"[LLMRouter] Starting generate() - model: {original_model or model}, "
            f"tier: {request.tier}, providers to try: {[p[0] for p in providers_to_try]}"
        )
        
        for provider_name, api_key in providers_to_try:
            try:
                logger.info(f"[LLMRouter] Attempting provider: {provider_name}")
                
                # If api_key not provided in chain, try to get it (legacy fallback)
                if not api_key:
                    api_key = await self._get_user_api_key(provider_name, user_id, db)
                    if not api_key:
                        logger.warning(f"[LLMRouter] No API key found for {provider_name}, skipping")
                        continue
                
                # Check rate limit before making request
                tracker = OPENROUTER_TRACKER if provider_name == "openrouter" else OPENAI_TRACKER
                can_make_request, rate_info = tracker.can_make_request(estimated_tokens)
                
                if not can_make_request:
                    # Rate limit exceeded - raise error with reset time
                    raise RateLimitExceededError(
                        message=f"Rate limit exceeded for {provider_name}. Please try again later.",
                        reset_at=rate_info.reset_at,
                        details={
                            "provider": provider_name,
                            "tokens_used": rate_info.tokens_used,
                            "tokens_limit": rate_info.tokens_limit,
                            "remaining": rate_info.remaining,
                            "estimated_tokens": estimated_tokens
                        }
                    )
                
                logger.debug(f"[LLMRouter] API key resolved for {provider_name}: found")
                
                logger.info(f"[LLMRouter] Creating provider instance for: {provider_name}")
                provider = self._get_provider(provider_name, api_key=api_key)
                logger.info(f"[LLMRouter] Provider {provider_name} initialized, calling generate()")
                
                # Normalize model name for provider compatibility
                # Use api_identifier if we looked it up, otherwise use model as-is
                provider_model = api_identifier
                
                # For native providers (openai, anthropic, xai, deepseek, gemini):
                # Pass the full api_identifier (with provider prefix) and let the provider
                # look up native_api_identifier from database if needed
                # Providers will handle their own normalization logic
                
                # For aggregators (OpenRouter, Eden AI), ensure provider prefix is present
                if provider_name in ["openrouter", "eden_ai"]:
                    if "/" not in provider_model:
                        # If we know the provider from model lookup, add prefix
                        if provider_from_model and provider_from_model not in ["openrouter", "eden_ai"]:
                            # Map native provider to aggregator format
                            if provider_from_model == "gemini":
                                aggregator_provider = "google"
                            else:
                                aggregator_provider = provider_from_model
                            provider_model = f"{aggregator_provider}/{provider_model}"
                            logger.debug(f"Added provider prefix for aggregator: {provider_model}")
                        # If we don't have provider info, try to infer from model name or use default
                        elif not provider_from_model and "/" not in provider_model:
                            # Default to openai if no prefix (backward compatibility)
                            if provider_model.startswith("gpt"):
                                provider_model = f"openai/{provider_model}"
                            elif provider_model.startswith("claude"):
                                provider_model = f"anthropic/{provider_model}"
                            elif "gemini" in provider_model.lower():
                                provider_model = f"google/{provider_model}"
                            logger.debug(f"Inferred provider prefix for aggregator: {provider_model}")
                
                # Measure latency for metrics
                start_time = time.time()
                
                # Wrap LLM call with provider-specific circuit breaker
                # This ensures failures in one provider don't block others
                circuit_breaker = get_llm_circuit_breaker(provider_name)
                logger.info(f"[LLMRouter] Calling provider.generate() - model: {provider_model}, prompt length: {len(request.prompt)}")
                
                # Pass database session to provider so native providers can look up native_api_identifier
                provider_kwargs = {**kwargs, "db": db}
                
                result = await circuit_breaker.call_async(
                    provider.generate,
                    request.prompt,
                    request.temperature,
                    request.json_mode,
                    model=provider_model,
                    **provider_kwargs
                )
                logger.info(f"[LLMRouter] Provider.generate() returned result (length: {len(result) if result else 0})")
                
                latency_ms = (time.time() - start_time) * 1000
                
                # Record successful request (estimate actual tokens for tracking)
                # Estimate: input tokens + output tokens (roughly 4 chars per token)
                actual_tokens_estimate = estimated_tokens + len(result) // 4
                tracker.record_request(actual_tokens_estimate)
                
                # Community Edition: Rate limiting disabled - tracking only for monitoring
                
                # Record metrics (use original model name for tracking)
                record_llm_metrics(
                    provider=provider_name,
                    model=original_model or model,  # Track original model name
                    tokens_used=actual_tokens_estimate,
                    latency_ms=latency_ms,
                    success=True
                )
                
                # Success - record it and return
                self._record_provider_success(provider_name)
                if len(providers_to_try) > 1 and provider_name != providers_to_try[0][0]:
                    logger.info(f"Successfully used fallback provider: {provider_name}")
                
                # Store provider info in request for quality tracking (if attribute exists)
                if hasattr(request, '_provider_used'):
                    request._provider_used = provider_name
                
                return result
                
            except CircuitBreakerOpenError as e:
                logger.warning(f"[LLMRouter] Circuit breaker open for provider {provider_name}: {e}")
                self._record_provider_error(provider_name, e)
                last_error = e
                # Continue to next provider
                continue
            except Exception as e:
                logger.error(f"[LLMRouter] Provider {provider_name} failed: {type(e).__name__}: {e}", exc_info=True)
                self._record_provider_error(provider_name, e)
                
                # Record failed metrics (use original model name for tracking)
                record_llm_metrics(
                    provider=provider_name,
                    model=original_model or model,  # Track original model name
                    tokens_used=0,
                    latency_ms=0,
                    success=False,
                    error_type=type(e).__name__
                )
                
                last_error = e
                # Continue to next provider
                continue
        
        # All providers failed
        logger.error(f"[LLMRouter] All providers failed. Last error: {type(last_error).__name__}: {last_error}", exc_info=True)
        raise RuntimeError(f"All LLM providers unavailable. Last error: {last_error}") from last_error

    async def select_provider(
        self, 
        request: LLMRequest,
        user_id: str | None = None,
        db: AsyncSession | None = None
    ) -> ProviderName:
        """Select provider with health-based failover and optional quality-based routing.
        
        Args:
            request: LLM request
            user_id: Optional user ID for checking user's default provider
            db: Optional database session for checking user's default provider
            
        Returns:
            Selected provider name
        """
        if request.provider:
            # Check if requested provider is healthy
            if self._is_provider_healthy(request.provider):
                return request.provider
            else:
                logger.warning(f"Requested provider {request.provider} is unhealthy, using fallback")
        
        # Check user's default provider preference if available
        user_default_provider = await self._get_user_default_provider(user_id, db)
        if user_default_provider and self._is_provider_healthy(user_default_provider):
            logger.debug(f"[LLMRouter.select_provider] Using user's default provider: {user_default_provider}")
            return user_default_provider
        
        # Quality-based routing (if enabled)
        if self.quality_routing_enabled:
            try:
                from app.core.model_quality_tracker import model_quality_tracker
                
                # Determine model to use
                model = request.model
                if not model:
                    model = self._tier_map.get(request.tier, "anthropic/claude-sonnet-4.5")
                
                # Try to find best model based on quality
                best_model = model_quality_tracker.get_best_model(
                    tier=request.tier,
                    min_quality=self.min_quality_threshold
                )
                
                if best_model:
                    best_provider, best_model_name = best_model
                    # Check if best provider is healthy
                    if self._is_provider_healthy(best_provider):
                        logger.info(f"Quality-based routing: selected {best_provider}:{best_model_name} for tier {request.tier}")
                        return best_provider
                    else:
                        logger.debug(f"Best quality provider {best_provider} is unhealthy, falling back to default")
            except Exception as e:
                logger.debug(f"Quality-based routing failed: {e}, using default selection")
        
        # Select healthy provider (prefer system default, fallback to others)
        if self._is_provider_healthy(self.default_provider):
            return self.default_provider
        
        # Try other providers in order
        fallback_providers: list[ProviderName] = ["openrouter", "eden_ai", "openai", "anthropic", "gemini"]
        for provider_name in fallback_providers:
            if provider_name != self.default_provider and self._is_provider_healthy(provider_name):
                logger.info(f"Using fallback provider: {provider_name}")
                return provider_name
        
        # All providers unhealthy, but try default anyway (circuit breaker will handle it)
        logger.warning("All providers appear unhealthy, attempting default provider anyway")
        return self.default_provider
    
    def _is_provider_healthy(self, provider_name: ProviderName) -> bool:
        """Check if a provider is considered healthy."""
        health = self._provider_health.get(provider_name, {})
        return health.get("available", True) and health.get("errors", 0) < self._health_check_threshold
    
    def _record_provider_error(self, provider_name: ProviderName, error: Exception) -> None:
        """Record an error for a provider."""
        import time
        health = self._provider_health.get(provider_name, {"errors": 0, "last_error": None, "available": True})
        health["errors"] = health.get("errors", 0) + 1
        health["last_error"] = time.time()
        
        if health["errors"] >= self._health_check_threshold:
            health["available"] = False
            logger.warning(f"Provider {provider_name} marked as unavailable after {health['errors']} errors")
        
        self._provider_health[provider_name] = health
    
    def _record_provider_success(self, provider_name: ProviderName) -> None:
        """Record a successful call for a provider."""
        health = self._provider_health.get(provider_name, {"errors": 0, "last_error": None, "available": True})
        health["errors"] = 0  # Reset error count on success
        health["available"] = True
        self._provider_health[provider_name] = health

