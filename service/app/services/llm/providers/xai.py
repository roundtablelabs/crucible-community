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

"""xAI Grok LLM provider."""
import os
import logging
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from app.services.llm.providers.base import BaseLLMProvider, get_native_api_identifier

logger = logging.getLogger(__name__)


class xAIProvider(BaseLLMProvider):
    """xAI provider for Grok models (OpenAI-compatible API)."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize xAI provider.
        
        Args:
            api_key: xAI API key. If None, uses XAI_API_KEY env var.
        """
        super().__init__(api_key)
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://api.x.ai/v1"
        )
        self.default_model = "grok-4"
        logger.debug(f"[xAIProvider] Initialized with default model: {self.default_model}")

    def _get_env_api_key(self) -> str | None:
        """Get xAI API key from environment variable."""
        return os.getenv("XAI_API_KEY")

    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text using xAI API.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature (0.0 to 2.0)
            json_mode: Force JSON output format
            model: Model identifier (e.g., "grok-4", "grok-4.1-fast")
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        # Extract database session from kwargs (if available)
        db: AsyncSession | None = kwargs.pop("db", None)
        
        # Default model if not specified
        model = model or self.default_model
        
        # Look up native_api_identifier from database if model has provider prefix
        # This allows native providers to use the database-stored native format
        # Note: OpenRouter uses "x-ai" (with hyphen) but we also support "xai" (without hyphen)
        if "/" in model and db:
            provider_prefix = model.split("/", 1)[0].lower()
            if provider_prefix in ["xai", "x-ai"]:
                # Model has format "xai/grok-4" or "x-ai/grok-4" - look up native format
                native_format = await get_native_api_identifier(model, db)
                if native_format:
                    model = native_format
                    logger.debug(f"[xAIProvider.generate] Using native_api_identifier from database: {model}")
                else:
                    # Not found in database - strip prefix
                    model = model.split("/", 1)[1]
                    logger.debug(f"[xAIProvider.generate] Native format not found in DB, stripped prefix: {model}")
            else:
                # Not an xAI model prefix - strip prefix if present
                if "/" in model:
                    model = model.split("/", 1)[1]
        elif "/" in model:
            # Has prefix but no db - strip prefix
            model = model.split("/", 1)[1]
        
        logger.debug(f"[xAIProvider.generate] model: {model}, temperature: {temperature}")
        
        # Check if web search is requested
        web_search_enabled = kwargs.pop("web_search", False) or "plugins" in kwargs
        
        # Remove plugins if present (OpenRouter format, not used in native API)
        if "plugins" in kwargs:
            kwargs.pop("plugins")
        
        try:
            # xAI (Grok) uses OpenAI-compatible API, so we can use Responses API for web search
            if web_search_enabled:
                logger.debug(f"[xAIProvider.generate] Using Responses API with web_search tool")
                
                # Use Responses API for web search (OpenAI-compatible)
                response = await self.client.responses.create(
                    model=model,
                    tools=[{"type": "web_search"}],
                    input=prompt,
                    temperature=temperature,
                    **kwargs
                )
                
                # Extract output text from Responses API
                result = response.output_text or ""
                logger.debug(f"[xAIProvider.generate] SUCCESS - Response length: {len(result)}")
                return result
            else:
                # Use Chat Completions API for regular requests
                response = await self.client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    response_format={"type": "json_object"} if json_mode else None,
                    **kwargs
                )
                result = response.choices[0].message.content or ""
                logger.debug(f"[xAIProvider.generate] SUCCESS - Response length: {len(result)}")
                return result
        except Exception as e:
            logger.error(f"[xAIProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise
