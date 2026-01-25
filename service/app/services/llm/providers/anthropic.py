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

"""Anthropic Claude LLM provider."""
import os
import re
import logging
import json
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.llm.providers.base import BaseLLMProvider, get_native_api_identifier

logger = logging.getLogger(__name__)

try:
    from anthropic import AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("anthropic package not installed. Install with: pip install anthropic")


# Map common model identifiers to Anthropic API model names
# Anthropic uses hyphens (claude-sonnet-4-5) not dots (claude-sonnet-4.5)
MODEL_NAME_MAP = {
    # Claude 4.5 models (with dots -> with hyphens)
    "claude-sonnet-4.5": "claude-sonnet-4-5",
    "claude-opus-4.5": "claude-opus-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5",
    # Claude 4.1 models
    "claude-opus-4.1": "claude-opus-4-1",
    # Claude 3.7 - following the 4.5 naming pattern (claude-sonnet-X-Y)
    "claude-sonnet-3.7": "claude-sonnet-3-7",
    "claude-3.7-sonnet": "claude-sonnet-3-7",
    "claude-3-7-sonnet": "claude-sonnet-3-7",  # Also handle already normalized format
    # Claude 3.5 models (legacy)
    "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3.5-haiku": "claude-3-5-haiku",
    "claude-3-5-haiku": "claude-3-5-haiku",
    # Claude 3 Opus (legacy)
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-3.0-opus": "claude-3-opus-20240229",
}


def normalize_anthropic_model_name(model: str) -> str:
    """Normalize model identifier to Anthropic API model name.
    
    Converts common model identifiers (with dots) to Anthropic's native API format (with hyphens).
    This function is ONLY used by the native AnthropicProvider, NOT by aggregators like OpenRouter.
    
    OpenRouter uses dot notation (e.g., "anthropic/claude-sonnet-4.5") and should never
    call this function. The router ensures aggregators use their own provider classes.
    
    If model is already in correct format or not in map, returns as-is.
    
    Args:
        model: Model identifier (e.g., "claude-sonnet-4.5" or "claude-sonnet-4-5")
        
    Returns:
        Normalized model name for Anthropic native API (e.g., "claude-sonnet-4-5")
    """
    # Check if model is already in the map
    if model in MODEL_NAME_MAP:
        return MODEL_NAME_MAP[model]
    
    # If model contains dots in version numbers, try to convert to hyphens
    # e.g., "claude-sonnet-4.5" -> "claude-sonnet-4-5"
    if "." in model and model not in MODEL_NAME_MAP:
        # Try replacing dots with hyphens in version-like patterns
        # Only replace dots that are between numbers (version numbers)
        normalized = re.sub(r'(\d+)\.(\d+)', r'\1-\2', model)
        if normalized != model:
            logger.debug(f"[normalize_anthropic_model_name] Converted {model} -> {normalized}")
            return normalized
    
    # Return as-is if no mapping found
    return model


class AnthropicProvider(BaseLLMProvider):
    """Anthropic provider for Claude models."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize Anthropic provider.
        
        Args:
            api_key: Anthropic API key. If None, uses ANTHROPIC_API_KEY env var.
        """
        if not ANTHROPIC_AVAILABLE:
            raise ImportError(
                "anthropic package is required. Install with: pip install anthropic"
            )
        super().__init__(api_key)
        self.client = AsyncAnthropic(api_key=self.api_key)
        logger.debug("[AnthropicProvider] Initialized")

    def _get_env_api_key(self) -> str | None:
        """Get Anthropic API key from environment variable."""
        return os.getenv("ANTHROPIC_API_KEY")

    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text using Anthropic API.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature (0.0 to 1.0 for Anthropic)
            json_mode: Force JSON output format (uses system prompt)
            model: Model identifier (e.g., "claude-sonnet-4.5", "claude-opus-4.5")
            **kwargs: Additional parameters (max_tokens, etc.)
            
        Returns:
            Generated text response
        """
        # Anthropic uses messages API, not chat completions
        # Default model if not specified
        model = model or "claude-sonnet-4-5"
        
        # Extract database session from kwargs (if available)
        db: AsyncSession | None = kwargs.pop("db", None)
        
        # Look up native_api_identifier from database if model has provider prefix
        # This allows native providers to use the database-stored native format
        if "/" in model and db:
            provider_prefix = model.split("/", 1)[0].lower()
            if provider_prefix == "anthropic":
                # Model has format "anthropic/claude-sonnet-4.5" - look up native format
                native_format = await get_native_api_identifier(model, db)
                if native_format:
                    model = native_format
                    logger.debug(f"[AnthropicProvider.generate] Using native_api_identifier from database: {model}")
                else:
                    # Not found in database - strip prefix and normalize
                    model = model.split("/", 1)[1]
                    logger.debug(f"[AnthropicProvider.generate] Native format not found in DB, normalizing: {model}")
                    model = normalize_anthropic_model_name(model)
            else:
                # Not an Anthropic model prefix - normalize as-is
                model = normalize_anthropic_model_name(model)
        else:
            # No provider prefix or no db - normalize as before
            # This handles cases where model is already stripped (e.g., "claude-sonnet-4.5")
            logger.debug(f"[AnthropicProvider.generate] Before normalization: {model}")
            model = normalize_anthropic_model_name(model)
            logger.debug(f"[AnthropicProvider.generate] After normalization: {model}")
        
        # Clamp temperature to Anthropic's range (0.0 to 1.0)
        temperature = max(0.0, min(1.0, temperature))
        
        logger.debug(f"[AnthropicProvider.generate] Final model: {model}, temperature: {temperature}")
        
        # Check if web search is requested
        web_search_enabled = kwargs.pop("web_search", False) or "plugins" in kwargs
        
        # Anthropic supports web search via tools parameter in Messages API
        tools = []
        if web_search_enabled:
            # Add web search tool (Anthropic's native web search)
            tools.append({
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": kwargs.pop("web_search_max_uses", 5)  # Default to 5 searches
            })
            logger.debug(f"[AnthropicProvider.generate] Web search enabled - adding web_search tool")
        
        # Remove plugins if present (OpenRouter format, not used in native API)
        if "plugins" in kwargs:
            kwargs.pop("plugins")
        
        # Prepare system prompt for JSON mode
        system_prompt = None
        if json_mode:
            system_prompt = "You must respond with valid JSON only. Do not include any text outside of JSON."
        
        # Get max_tokens from kwargs or use default
        max_tokens = kwargs.get("max_tokens", 4096)
        
        try:
            # Build request parameters
            request_params = {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            }
            
            # Add system prompt if provided
            if system_prompt:
                request_params["system"] = system_prompt
            
            # Add tools if web search is enabled
            if tools:
                request_params["tools"] = tools
            
            # Add any remaining kwargs
            request_params.update({k: v for k, v in kwargs.items() if k != "max_tokens"})
            
            response = await self.client.messages.create(**request_params)
            
            # Extract text from response
            # Anthropic returns content as a list of text blocks
            result = ""
            if response.content:
                for content_block in response.content:
                    if content_block.type == "text":
                        result += content_block.text
            
            # If JSON mode, try to parse and return clean JSON
            if json_mode and result:
                try:
                    # Try to extract JSON if wrapped in markdown
                    if "```json" in result:
                        start = result.find("```json") + 7
                        end = result.find("```", start)
                        result = result[start:end].strip()
                    elif "```" in result:
                        start = result.find("```") + 3
                        end = result.find("```", start)
                        result = result[start:end].strip()
                    # Validate JSON
                    json.loads(result)
                except (json.JSONDecodeError, ValueError):
                    # If not valid JSON, return as-is (let caller handle)
                    logger.warning("[AnthropicProvider] JSON mode requested but response is not valid JSON")
            
            logger.debug(f"[AnthropicProvider.generate] SUCCESS - Response length: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[AnthropicProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise
