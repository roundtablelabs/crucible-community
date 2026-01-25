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

"""Custom exceptions for LLM API key routing."""


class NoAPIKeyError(ValueError):
    """Raised when no API key is available for a required provider."""
    
    def __init__(self, model_id: str, native_provider: str, alternatives: list[str]):
        """Initialize NoAPIKeyError with helpful message.
        
        Args:
            model_id: The model identifier that requires an API key
            native_provider: The native provider for this model (e.g., "gemini", "anthropic")
            alternatives: List of alternative providers that could serve this model (e.g., ["openrouter", "eden_ai"])
        """
        self.model_id = model_id
        self.native_provider = native_provider
        self.alternatives = alternatives
        
        # Build helpful message with friendly provider names
        provider_names = {
            "gemini": "Google",
            "google": "Google",
            "anthropic": "Anthropic",
            "openai": "OpenAI",
            "openrouter": "OpenRouter",
            "eden_ai": "Eden AI",
            "xai": "xAI",
            "deepseek": "DeepSeek",
        }
        
        native_name = provider_names.get(native_provider, native_provider.title())
        alt_names = [provider_names.get(alt, alt.title()) for alt in alternatives]
        
        if alternatives:
            message = (
                f"Model '{model_id}' requires an API key. "
                f"Please add a {native_name} API key, or use an aggregator: {', '.join(alt_names)}. "
                f"Go to Settings > API Keys to configure."
            )
        else:
            message = (
                f"Model '{model_id}' requires a {native_name} API key. "
                f"Please add it in Settings > API Keys."
            )
        
        super().__init__(message)
