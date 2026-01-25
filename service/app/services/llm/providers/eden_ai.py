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

"""Eden AI LLM provider (aggregator)."""
import os
import logging
import json
from typing import Any
from openai import AsyncOpenAI
from app.services.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class EdenAIProvider(BaseLLMProvider):
    """Eden AI provider - aggregates multiple LLM providers (OpenAI-compatible V3 API)."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize Eden AI provider.
        
        Args:
            api_key: Eden AI API key. If None, uses EDEN_AI_API_KEY or ROUNDTABLE_EDEN_AI_API_KEY env var.
        """
        super().__init__(api_key)
        # Eden AI V3 has OpenAI-compatible endpoint
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://api.edenai.run/v3/llm"
        )
        logger.debug("[EdenAIProvider] Initialized with V3 OpenAI-compatible endpoint")

    def _get_env_api_key(self) -> str | None:
        """Get Eden AI API key from environment variable."""
        return os.getenv("EDEN_AI_API_KEY") or os.getenv("ROUNDTABLE_EDEN_AI_API_KEY")

    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text using Eden AI V3 API (OpenAI-compatible).
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature (0.0 to 2.0)
            json_mode: Force JSON output format
            model: Model identifier in format "provider/model" (e.g., "openai/gpt-4", "anthropic/claude-sonnet-4.5")
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        if not model:
            raise ValueError("Model is required for Eden AI provider. Format: 'provider/model'")
        
        # Eden AI V3 uses "provider/model" format directly (e.g., "openai/gpt-4")
        # No need to parse - use model as-is
        logger.debug(f"[EdenAIProvider.generate] model: {model}, temperature: {temperature}")
        
        # Check if web search is requested
        web_search_enabled = kwargs.pop("web_search", False) or "plugins" in kwargs
        
        # Remove plugins if present (OpenRouter format, not used in Eden AI API)
        if "plugins" in kwargs:
            kwargs.pop("plugins")
        
        try:
            # Eden AI V3 is OpenAI-compatible, so we can use Responses API for web search
            if web_search_enabled:
                logger.debug(f"[EdenAIProvider.generate] Attempting Responses API with web_search tool")
                
                try:
                    # Try Responses API for web search (OpenAI-compatible)
                    # Note: Eden AI V3 may or may not support Responses API endpoint
                    response = await self.client.responses.create(
                        model=model,
                        tools=[{"type": "web_search"}],
                        input=prompt,
                        temperature=temperature,
                        **kwargs
                    )
                    
                    # Extract output text from Responses API
                    result = response.output_text or ""
                    logger.debug(f"[EdenAIProvider.generate] SUCCESS - Response length: {len(result)}")
                    return result
                except Exception as responses_error:
                    # If Responses API is not supported, fall back to chat completions
                    # Web search may not be available in this case
                    logger.warning(
                        f"[EdenAIProvider.generate] Responses API not available or failed: {responses_error}. "
                        f"Falling back to chat completions (web search may not work)."
                    )
                    # Fall through to chat completions
                    web_search_enabled = False  # Disable web search flag for fallback
            
            # Use Chat Completions API for regular requests (OpenAI-compatible)
            # Note: Eden AI V3 supports tool calling via chat completions, but web_search tool
            # may need to be passed differently or may not be supported
            response = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                response_format={"type": "json_object"} if json_mode else None,
                **kwargs
            )
            result = response.choices[0].message.content or ""
            logger.debug(f"[EdenAIProvider.generate] SUCCESS - Response length: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[EdenAIProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise
