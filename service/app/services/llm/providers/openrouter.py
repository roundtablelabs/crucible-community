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

"""OpenRouter LLM provider (aggregator)."""
import os
import logging
from typing import Any
from openai import AsyncOpenAI
from app.services.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(BaseLLMProvider):
    """OpenRouter provider - aggregates multiple LLM providers."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize OpenRouter provider.
        
        Args:
            api_key: OpenRouter API key. If None, uses OPENROUTER_API_KEY env var.
        """
        super().__init__(api_key)
        logger.debug(f"[OpenRouterProvider] API key found (length: {len(self.api_key)})")
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://openrouter.ai/api/v1"
        )
        self.default_model = os.getenv("ROUNDTABLE_OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")
        logger.debug(f"[OpenRouterProvider] Initialized with default model: {self.default_model}")

    def _get_env_api_key(self) -> str | None:
        """Get OpenRouter API key from environment variable."""
        return os.getenv("OPENROUTER_API_KEY") or os.getenv("ROUNDTABLE_OPENROUTER_API_KEY")

    async def generate(self, prompt: str, temperature: float = 0.2, json_mode: bool = False, model: str | None = None, **kwargs: Any) -> str:
        logger.debug(f"[OpenRouterProvider.generate] ENTER - model: {model or self.default_model}, json_mode: {json_mode}")
        logger.debug(f"[OpenRouterProvider.generate] Prompt length: {len(prompt)}")
        
        extra_body = kwargs.get("extra_body", {})
        
        # Handle plugins if passed directly in kwargs
        if "plugins" in kwargs:
            extra_body["plugins"] = kwargs["plugins"]
            logger.debug(f"[OpenRouterProvider.generate] Using plugins: {kwargs['plugins']}")

        try:
            logger.debug(f"[OpenRouterProvider.generate] Calling OpenRouter API...")
            response = await self.client.chat.completions.create(
                model=model or self.default_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                response_format={"type": "json_object"} if json_mode else None,
                extra_body=extra_body if extra_body else None,
                extra_headers={
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL") or os.getenv("ROUNDTABLE_OPENROUTER_SITE_URL", "https://roundtable.ai"),
                    "X-Title": os.getenv("OPENROUTER_APP_TITLE") or os.getenv("ROUNDTABLE_OPENROUTER_APP_TITLE", "Crucible"),
                }
            )
            result = response.choices[0].message.content or ""
            logger.debug(f"[OpenRouterProvider.generate] SUCCESS - Response length: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[OpenRouterProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise
