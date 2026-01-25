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

"""Base LLM provider interface."""
from abc import ABC, abstractmethod
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)


class BaseLLMProvider(ABC):
    """Base class for all LLM providers.
    
    All providers must implement the generate method and optionally
    provide an environment variable fallback for API keys.
    """
    
    def __init__(self, api_key: str | None = None):
        """Initialize provider with API key.
        
        Args:
            api_key: User's API key for this provider. Must be provided (no env var fallback).
            
        Raises:
            ValueError: If api_key is None or empty
        """
        if not api_key:
            raise ValueError(
                f"API key required for {self.__class__.__name__}. "
                f"Please configure your API key in Settings > API Keys."
            )
        self.api_key = api_key
    
    @abstractmethod
    def _get_env_api_key(self) -> str | None:
        """Get API key from environment variable (fallback).
        
        Returns:
            API key from environment variable, or None if not set.
        """
        pass
    
    def _get_env_key_name(self) -> str:
        """Get the environment variable name for this provider's API key.
        
        Returns:
            Environment variable name (e.g., "ANTHROPIC_API_KEY").
        """
        # Default implementation - subclasses should override
        provider_name = self.__class__.__name__.replace("Provider", "").upper()
        return f"{provider_name}_API_KEY"
    
    @abstractmethod
    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text from the LLM.
        
        Args:
            prompt: The input prompt/text to send to the LLM
            temperature: Sampling temperature (0.0 to 2.0)
            json_mode: Whether to force JSON output format
            model: Model identifier to use (provider-specific, may include provider prefix)
            **kwargs: Additional provider-specific parameters
                - db: Optional database session for model lookup (native providers can use this
                      to look up native_api_identifier from database)
            
        Returns:
            Generated text response from the LLM
        """
        pass


async def get_native_api_identifier(
    api_identifier: str,
    db: AsyncSession | None
) -> str | None:
    """Look up native_api_identifier from database based on api_identifier.
    
    This helper function is used by native providers to look up the native API format
    for a model from the database. Aggregators (OpenRouter, Eden AI) should not use this.
    
    Args:
        api_identifier: Model identifier in OpenRouter format (e.g., "anthropic/claude-sonnet-4.5")
        db: Database session (optional)
        
    Returns:
        Native API identifier if found in database, None otherwise
    """
    if not db:
        return None
    
    try:
        from app.models.model_catalog import LLMModel
        from sqlalchemy import select
        
        result = await db.execute(
            select(LLMModel).where(LLMModel.api_identifier == api_identifier)
        )
        model_record = result.scalar_one_or_none()
        if model_record and model_record.native_api_identifier:
            logger.debug(f"[get_native_api_identifier] Found native format for {api_identifier}: {model_record.native_api_identifier}")
            return model_record.native_api_identifier
    except Exception as e:
        logger.debug(f"[get_native_api_identifier] Error looking up native_api_identifier for {api_identifier}: {e}")
    
    return None
