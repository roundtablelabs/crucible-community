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

"""Google Gemini LLM provider."""
import os
import logging
import json
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.llm.providers.base import BaseLLMProvider, get_native_api_identifier

logger = logging.getLogger(__name__)

# Try newer google-genai SDK first (supports grounding/web search)
try:
    from google import genai
    from google.genai import types
    GEMINI_NEW_SDK_AVAILABLE = True
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_NEW_SDK_AVAILABLE = False
    # Fallback to older google-generativeai SDK
    try:
        import google.generativeai as genai
        GEMINI_AVAILABLE = True
    except ImportError:
        GEMINI_AVAILABLE = False
        logger.warning(
            "Google Gemini SDK not installed. Install with: "
            "pip install google-genai (recommended) or pip install google-generativeai"
        )


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider."""
    
    def __init__(self, api_key: str | None = None):
        """Initialize Gemini provider.
        
        Args:
            api_key: Google API key. If None, uses GOOGLE_API_KEY env var.
        """
        if not GEMINI_AVAILABLE:
            raise ImportError(
                "Google Gemini SDK is required. Install with: "
                "pip install google-genai (recommended) or pip install google-generativeai"
            )
        super().__init__(api_key)
        
        if GEMINI_NEW_SDK_AVAILABLE:
            # Use newer SDK with Client
            self.client = genai.Client(api_key=self.api_key)
            logger.debug("[GeminiProvider] Using newer google-genai SDK with Client")
        else:
            # Use older SDK with configure
            genai.configure(api_key=self.api_key)
            logger.debug("[GeminiProvider] Using older google-generativeai SDK")
        
        self.default_model = "gemini-2.5-pro"
        logger.debug(f"[GeminiProvider] Initialized with default model: {self.default_model}")

    def _get_env_api_key(self) -> str | None:
        """Get Google API key from environment variable."""
        return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    async def generate(
        self, 
        prompt: str, 
        temperature: float = 0.2, 
        json_mode: bool = False, 
        model: str | None = None, 
        **kwargs: Any
    ) -> str:
        """Generate text using Gemini API.
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature (0.0 to 2.0)
            json_mode: Force JSON output format
            model: Model identifier (e.g., "gemini-2.5-pro", "gemini-2.5-flash")
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
        # Note: Gemini models may have "google/" or "gemini/" prefix in OpenRouter format
        if "/" in model and db:
            provider_prefix = model.split("/", 1)[0].lower()
            if provider_prefix in ["gemini", "google"]:
                # Model has format "google/gemini-2.5-pro" or "gemini/gemini-2.5-pro" - look up native format
                native_format = await get_native_api_identifier(model, db)
                if native_format:
                    model = native_format
                    logger.debug(f"[GeminiProvider.generate] Using native_api_identifier from database: {model}")
                else:
                    # Not found in database - strip prefix
                    model = model.split("/", 1)[1]
                    logger.debug(f"[GeminiProvider.generate] Native format not found in DB, stripped prefix: {model}")
            else:
                # Not a Gemini/Google model prefix - strip prefix if present
                if "/" in model:
                    model = model.split("/", 1)[1]
        elif "/" in model:
            # Has prefix but no db - strip prefix
            model = model.split("/", 1)[1]
        
        logger.debug(f"[GeminiProvider.generate] model: {model}, temperature: {temperature}")
        
        # Check if web search is requested
        web_search_enabled = kwargs.pop("web_search", False) or "plugins" in kwargs
        
        # Remove plugins if present (OpenRouter format, not used in native API)
        if "plugins" in kwargs:
            kwargs.pop("plugins")
        
        try:
            import asyncio
            
            if GEMINI_NEW_SDK_AVAILABLE:
                # Use newer SDK with Client and GenerateContentConfig
                # This supports grounding/web search via tools
                
                # Prepare tools for web search if enabled
                tools = None
                if web_search_enabled:
                    try:
                        # Create grounding tool using GoogleSearch
                        grounding_tool = types.Tool(
                            google_search=types.GoogleSearch()
                        )
                        tools = [grounding_tool]
                        logger.debug(f"[GeminiProvider.generate] Web search enabled - using GoogleSearch tool")
                    except (AttributeError, TypeError) as e:
                        logger.warning(
                            f"[GeminiProvider.generate] Web search requested but Tool/GoogleSearch not available: {e}. "
                            f"Proceeding without web search."
                        )
                        tools = None
                
                # Create GenerateContentConfig
                config = types.GenerateContentConfig(
                    temperature=temperature,
                )
                
                # Add tools to config if web search is enabled
                if tools:
                    config.tools = tools
                
                # If JSON mode, set response MIME type
                if json_mode:
                    config.response_mime_type = "application/json"
                
                # Generate content using newer SDK
                response = await asyncio.to_thread(
                    self.client.models.generate_content,
                    model=model,
                    contents=prompt,
                    config=config
                )
                
                # Extract text from response
                result = response.text or ""
                
            else:
                # Fallback to older SDK (google-generativeai)
                # Get the model instance
                genai_model = genai.GenerativeModel(model)
                
                # Prepare generation config
                generation_config = genai.types.GenerationConfig(
                    temperature=temperature,
                )
                
                # If JSON mode, set response MIME type
                if json_mode:
                    generation_config.response_mime_type = "application/json"
                
                # Older SDK may not support tools/web search
                if web_search_enabled:
                    logger.warning(
                        f"[GeminiProvider.generate] Web search requested but older SDK (google-generativeai) "
                        f"may not support grounding. Consider upgrading to google-genai SDK. "
                        f"Proceeding without web search."
                    )
                
                # Build generate_content arguments
                generate_kwargs = {
                    "prompt": prompt,
                    "generation_config": generation_config,
                }
                
                # Add any remaining kwargs (filter unsupported params)
                generate_kwargs.update({k: v for k, v in kwargs.items() if k != "max_tokens"})
                
                response = await asyncio.to_thread(
                    genai_model.generate_content,
                    **generate_kwargs
                )
                
                # Extract text from response
                result = ""
                if response.text:
                    result = response.text
                elif response.candidates and response.candidates[0].content:
                    result = response.candidates[0].content.parts[0].text if response.candidates[0].content.parts else ""
            
            # Validate JSON if json_mode
            if json_mode and result:
                try:
                    json.loads(result)
                except json.JSONDecodeError:
                    logger.warning("[GeminiProvider] JSON mode requested but response is not valid JSON")
            
            logger.debug(f"[GeminiProvider.generate] SUCCESS - Response length: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[GeminiProvider.generate] FAILED: {type(e).__name__}: {e}")
            raise
