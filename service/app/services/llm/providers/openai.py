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

"""OpenAI LLM provider."""
import os
import logging
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from app.services.llm.providers.base import BaseLLMProvider, get_native_api_identifier

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """OpenAI provider for GPT models."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize OpenAI provider.
        
        Args:
            api_key: OpenAI API key. If None, uses OPENAI_API_KEY env var.
        """
        super().__init__(api_key)
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.model = "gpt-4o"
        logger.debug(f"[OpenAIProvider] Initialized with model: {self.model}")

    def _get_env_api_key(self) -> str | None:
        """Get OpenAI API key from environment variable."""
        return os.getenv("OPENAI_API_KEY")

    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text using OpenAI API.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature (0.0 to 2.0)
            json_mode: Force JSON output format
            model: Model identifier (e.g., "gpt-4o", "gpt-5.1")
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        # Extract database session from kwargs (if available)
        db: AsyncSession | None = kwargs.pop("db", None)
        
        # Default model if not specified
        model = model or self.model
        
        # Look up native_api_identifier from database if model has provider prefix
        # This allows native providers to use the database-stored native format
        if "/" in model and db:
            provider_prefix = model.split("/", 1)[0].lower()
            if provider_prefix == "openai":
                # Model has format "openai/gpt-4o" - look up native format
                native_format = await get_native_api_identifier(model, db)
                if native_format:
                    model = native_format
                    logger.debug(f"[OpenAIProvider.generate] Using native_api_identifier from database: {model}")
                else:
                    # Not found in database - strip prefix
                    model = model.split("/", 1)[1]
                    logger.debug(f"[OpenAIProvider.generate] Native format not found in DB, stripped prefix: {model}")
            else:
                # Not an OpenAI model prefix - strip prefix if present
                if "/" in model:
                    model = model.split("/", 1)[1]
        elif "/" in model:
            # Has prefix but no db - strip prefix
            model = model.split("/", 1)[1]
        
        model_to_use = model
        logger.debug(f"[OpenAIProvider.generate] model: {model_to_use}, temperature: {temperature}")
        
        # Check if web search is requested
        web_search_enabled = kwargs.pop("web_search", False) or "plugins" in kwargs
        
        # Remove plugins if present (OpenRouter format, not used in native API)
        if "plugins" in kwargs:
            kwargs.pop("plugins")
        
        try:
            # OpenAI supports web search via Responses API with tools parameter
            if web_search_enabled:
                logger.debug(f"[OpenAIProvider.generate] Using Responses API with web_search tool")
                
                # Use Responses API for web search
                response = await self.client.responses.create(
                    model=model_to_use,
                    tools=[{"type": "web_search"}],
                    input=prompt,
                    temperature=temperature,
                    **kwargs
                )
                
                # Extract output text from Responses API
                result = response.output_text or ""
                logger.debug(f"[OpenAIProvider.generate] SUCCESS - Response length: {len(result)}")
                return result
            else:
                # Use Chat Completions API for regular requests
                response = await self.client.chat.completions.create(
                    model=model_to_use,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    response_format={"type": "json_object"} if json_mode else None,
                    **kwargs
                )
                result = response.choices[0].message.content or ""
                logger.debug(f"[OpenAIProvider.generate] SUCCESS - Response length: {len(result)}")
                return result
        except Exception as e:
            logger.error(f"[OpenAIProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise

