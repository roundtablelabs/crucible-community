# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

from functools import lru_cache
import json
from typing import Annotated, Any

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import BeforeValidator, model_validator, Field, computed_field
import os
from dotenv import load_dotenv

load_dotenv()


def parse_cors_origins(v):
    """Parse CORS origins from various formats.
    
    Supports:
    - JSON array: ["https://example.com","http://localhost:3000"]
    - Comma-separated: https://example.com,http://localhost:3000
    - Single value: https://example.com
    - Python list (already parsed): ["https://example.com"]
    - Invalid JSON with brackets: [https://example.com,http://localhost:3000]
    """
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        # Handle empty string
        v = v.strip()
        if not v:
            return ["http://localhost:3000"]
        
        # Remove outer brackets if present (handles [url1,url2] format without quotes)
        original_v = v
        if v.startswith("[") and v.endswith("]"):
            v = v[1:-1].strip()
        
        # Try JSON format first (for properly formatted JSON arrays)
        try:
            # Try parsing the original string as JSON
            parsed = json.loads(original_v)
            if isinstance(parsed, list):
                return [str(origin).strip() for origin in parsed if origin]
        except (json.JSONDecodeError, ValueError):
            pass
        
        # Handle comma-separated values (most common format)
        if "," in v:
            origins = []
            for origin in v.split(","):
                origin = origin.strip()
                # Remove quotes if present
                origin = origin.strip('"').strip("'")
                if origin:
                    # Ensure all origins have protocol
                    if not origin.startswith(("http://", "https://")):
                        origin = f"https://{origin}"
                    origins.append(origin)
            return origins if origins else ["http://localhost:3000"]
        
        # Single value
        origin = v.strip().strip('"').strip("'")
        if origin:
            if not origin.startswith(("http://", "https://")):
                origin = f"https://{origin}"
            return [origin]
        return ["http://localhost:3000"]
    
    # Fallback for any other type
    return v if isinstance(v, list) else ["http://localhost:3000"]


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    api_name: str = "Roundtable API"
    environment: str = "local"
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    broker_url: str | None = None
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None
    jwt_secret: str = ""
    jwt_refresh_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expiry_minutes: int = 30
    refresh_token_expiry_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000"  # Stored as string to avoid JSON parsing errors
    frontend_url: str = "http://localhost:3000"  # Default for local dev; set ROUNDTABLE_FRONTEND_URL env var in production
    pdf_bucket: str = "roundtable-artifacts"
    log_level: str = "INFO"
    openrouter_api_key: str | None = os.getenv('ROUNDTABLE_OPENROUTER_API_KEY') or None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "anthropic/claude-sonnet-4.5"
    openrouter_site_url: str | None = None
    openrouter_app_title: str | None = None
    db_pool_size: int = 10  # Database connection pool size (default increased after fixing leaks)
    db_max_overflow: int = 5  # Maximum overflow connections (default increased after fixing leaks)
    
    # Community Edition configuration
    community_edition: bool = True  # Always enabled - this is a Community Edition
    require_auth: bool = True  # Require authentication in community edition (default: true)
    admin_username: str = "admin"  # Default admin username for community edition
    admin_password: str = ""  # Deprecated/unused - kept for backward compatibility only
    community_auth_password: str = ""  # REQUIRED - must be set via ROUNDTABLE_COMMUNITY_AUTH_PASSWORD environment variable
    session_token_expiry_hours: int = 24  # Session token expiry in hours (default: 24)
    license_version: str = "1.0.0"  # Current license version for acceptance tracking
    
    # Admin portal configuration
    admin_password_hash: str = ""  # SHA256 hash of admin portal password
    admin_session_secret: str = ""  # Secret key for signing admin session tokens
    admin_session_expiry_minutes: int = 60  # Admin session token expiry in minutes
    admin_allowed_ips: str = ""  # Comma-separated list of allowed IP addresses/CIDR ranges (optional)
    admin_max_login_attempts: int = 5  # Maximum failed login attempts before lockout
    admin_lockout_duration_minutes: int = 15  # Account lockout duration in minutes
    admin_session_inactivity_timeout_minutes: int = 30  # Session timeout after inactivity in minutes
    
    # LLM rate limiting configuration
    enable_rate_limiting: bool = False  # Enable rate limiting for LLM providers (default: disabled)
    llm_rate_limit_tpm: int = 100000  # Tokens per minute limit for LLM providers
    llm_rate_limit_window_seconds: int = 60  # Time window in seconds for rate limiting (default: 60 for TPM)
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ROUNDTABLE_",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    @model_validator(mode="after")
    def validate_frontend_url(self) -> "Settings":
        """Ensure frontend_url uses HTTPS in production (not localhost)."""
        if self.frontend_url and not self.frontend_url.startswith("http://localhost") and not self.frontend_url.startswith("https://"):
            # Auto-convert HTTP to HTTPS for production URLs
            if self.frontend_url.startswith("http://"):
                import warnings
                warnings.warn(
                    f"frontend_url uses HTTP: {self.frontend_url}. "
                    "Converting to HTTPS. Set ROUNDTABLE_FRONTEND_URL to HTTPS in production.",
                    UserWarning
                )
                self.frontend_url = self.frontend_url.replace("http://", "https://", 1)
        return self
    
    @model_validator(mode="after")
    def validate_internal_api_token(self) -> "Settings":
        """Validate INTERNAL_API_TOKEN is configured in production environment."""
        if self.environment != "local":
            internal_api_token = os.getenv("INTERNAL_API_TOKEN")
            if not internal_api_token:
                import warnings
                warnings.warn(
                    "INTERNAL_API_TOKEN not configured. "
                    "Automatic PDF generation after artifact ready will not work. "
                    "Set INTERNAL_API_TOKEN environment variable in production.",
                    UserWarning
                )
        return self
    
    @model_validator(mode="after")
    def validate_community_edition_config(self) -> "Settings":
        """Validate configuration for Community Edition."""
        import warnings
        
        # Check encryption key - critical for API key storage
        encryption_key = os.getenv("API_KEY_ENCRYPTION_KEY")
        if not encryption_key:
            warnings.warn(
                "⚠️  WARNING: API_KEY_ENCRYPTION_KEY is not set. "
                "A default key will be used, but it will change on restart, "
                "making all encrypted API keys unreadable. "
                "Set API_KEY_ENCRYPTION_KEY environment variable to a stable 32-byte key "
                "for production use.",
                UserWarning
            )
        
        # Check Redis URL for session store
        # Note: We don't actually test the connection here to avoid circular dependency
        # (get_redis_client() calls get_settings(), which would cause infinite recursion)
        # The connection will be tested lazily when Redis is first used
        if not self.redis_url:
            warnings.warn(
                "⚠️  WARNING: ROUNDTABLE_REDIS_URL is not set. "
                "Session store will fall back to in-memory storage if Redis is unavailable, "
                "which means sessions will be lost on server restart. "
                "Set ROUNDTABLE_REDIS_URL to a valid Redis connection string "
                "for persistent sessions.",
                UserWarning
            )
        elif self.environment == "production" and "localhost" in self.redis_url:
            warnings.warn(
                "⚠️  WARNING: ROUNDTABLE_REDIS_URL uses localhost in production. "
                "This will not work in a production environment. "
                "Set ROUNDTABLE_REDIS_URL to a valid remote Redis connection string.",
                UserWarning
            )
        
        # Check for weak secrets
        weak_secrets = {
            "community-secret",
            "community-refresh-secret",
            "change-me-in-production",
            "admin",
            "password",
            "secret",
            "default",
        }
        
        # Check JWT secrets for weak values
        if self.jwt_secret and (self.jwt_secret.lower() in weak_secrets or len(self.jwt_secret) < 32):
            if self.environment == "production":
                raise ValueError(
                    f"❌ CRITICAL: ROUNDTABLE_JWT_SECRET is set to a weak or default value. "
                    f"JWT secrets must be at least 32 characters long and not use common defaults. "
                    f"Generate a secure secret using: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            else:
                warnings.warn(
                    f"⚠️  WARNING: ROUNDTABLE_JWT_SECRET appears to be a weak or default value. "
                    f"Use a secure random secret (at least 32 characters) in production.",
                    UserWarning
                )
        
        if self.jwt_refresh_secret and (self.jwt_refresh_secret.lower() in weak_secrets or len(self.jwt_refresh_secret) < 32):
            if self.environment == "production":
                raise ValueError(
                    f"❌ CRITICAL: ROUNDTABLE_JWT_REFRESH_SECRET is set to a weak or default value. "
                    f"JWT refresh secrets must be at least 32 characters long and not use common defaults. "
                    f"Generate a secure secret using: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            else:
                warnings.warn(
                    f"⚠️  WARNING: ROUNDTABLE_JWT_REFRESH_SECRET appears to be a weak or default value. "
                    f"Use a secure random secret (at least 32 characters) in production.",
                    UserWarning
                )
        
        # CRITICAL: Explicitly reject "admin" password in ALL environments
        # This prevents the insecure default from being used even in development
        if self.community_auth_password == "admin":
            raise ValueError(
                "❌ CRITICAL SECURITY ERROR: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD cannot be set to 'admin'. "
                "This is an insecure default password that must never be used. "
                "Please set ROUNDTABLE_COMMUNITY_AUTH_PASSWORD to a strong password in your .env file or environment variables. "
                "Generate a secure password using: python -c \"import secrets; print(secrets.token_urlsafe(16))\" "
                "Or hash a password using: cd service && python -m scripts.hash_password <your-password>"
            )
        
        # Check community auth password for other weak values
        if self.community_auth_password and (self.community_auth_password.lower() in weak_secrets or len(self.community_auth_password) < 8):
            if self.environment == "production":
                raise ValueError(
                    f"❌ CRITICAL: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD is set to a weak or default value. "
                    f"Authentication passwords must be strong (at least 8 characters) and not use common defaults. "
                    f"Generate a secure password or use the hash_password utility script."
                )
            else:
                warnings.warn(
                    f"⚠️  WARNING: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD appears to be a weak or default value. "
                    f"Use a strong password (at least 8 characters) in production.",
                    UserWarning
                )
        
        # Check if password is stored in plain text (not hashed)
        # Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
        is_hashed = (
            self.community_auth_password.startswith(("$2a$", "$2b$", "$2y$")) 
            and len(self.community_auth_password) == 60
        )
        
        if not is_hashed and self.community_auth_password:
            # Password is set but not hashed - warn about security
            if self.environment == "production":
                warnings.warn(
                    "⚠️  SECURITY WARNING: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD is stored in plain text. "
                    "For production security, please hash your password using the hash_password utility script. "
                    "Run: python -m scripts.hash_password <your-password>",
                    UserWarning
                )
            else:
                warnings.warn(
                    "⚠️  WARNING: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD is stored in plain text. "
                    "For better security, consider hashing it using: python -m scripts.hash_password <your-password>",
                    UserWarning
                )
        
        # Validate required variables
        if self.environment == "production":
            missing_vars = []
            if not self.database_url:
                missing_vars.append("ROUNDTABLE_DATABASE_URL")
            if not self.jwt_secret:
                missing_vars.append("ROUNDTABLE_JWT_SECRET")
            elif self.jwt_secret.lower() in weak_secrets or len(self.jwt_secret) < 32:
                missing_vars.append("ROUNDTABLE_JWT_SECRET (must be at least 32 characters, not a default value)")
            if not self.jwt_refresh_secret:
                missing_vars.append("ROUNDTABLE_JWT_REFRESH_SECRET")
            elif self.jwt_refresh_secret.lower() in weak_secrets or len(self.jwt_refresh_secret) < 32:
                missing_vars.append("ROUNDTABLE_JWT_REFRESH_SECRET (must be at least 32 characters, not a default value)")
            if not self.community_auth_password:
                missing_vars.append("ROUNDTABLE_COMMUNITY_AUTH_PASSWORD")
            elif self.community_auth_password.lower() in weak_secrets or len(self.community_auth_password) < 8:
                missing_vars.append("ROUNDTABLE_COMMUNITY_AUTH_PASSWORD (must be strong, at least 8 characters, not a default value)")
            
            if missing_vars:
                error_msg = (
                    f"❌ CRITICAL: Missing or weak required environment variables:\n"
                    f"  {', '.join(missing_vars)}\n\n"
                    f"The application cannot start without these variables set to secure values. "
                    f"Please set them in your production environment."
                )
                raise ValueError(error_msg)
        
        return self
    
    @model_validator(mode="after")
    def validate_production_requirements(self) -> "Settings":
        """Validate critical environment variables in production - fail fast if missing."""
        if self.environment == "production":
            missing_vars = []
            
            # Critical variables that must be set in production
            if not self.database_url:
                missing_vars.append("ROUNDTABLE_DATABASE_URL")
            
            if not self.jwt_secret:
                missing_vars.append("ROUNDTABLE_JWT_SECRET")
            
            if not self.jwt_refresh_secret:
                missing_vars.append("ROUNDTABLE_JWT_REFRESH_SECRET")
            
            # API key encryption key is critical for securing user API keys
            encryption_key = os.getenv("API_KEY_ENCRYPTION_KEY")
            if not encryption_key:
                missing_vars.append("API_KEY_ENCRYPTION_KEY (required for secure API key storage)")
            
            # OpenRouter API key is optional (users provide their own API keys)
            # No validation needed - users configure their own API keys
            
            # Frontend URL should be set and use HTTPS in production
            if not self.frontend_url or self.frontend_url.startswith("http://localhost"):
                missing_vars.append("ROUNDTABLE_FRONTEND_URL (must be HTTPS URL, not localhost)")
            
            # CORS origins should be configured
            cors_origins_list = self.cors_origins_list
            if not cors_origins_list or cors_origins_list == ["http://localhost:3000"]:
                missing_vars.append("ROUNDTABLE_CORS_ORIGINS (must be configured for production)")
            
            if missing_vars:
                error_msg = (
                    f"❌ CRITICAL: Missing required environment variables in production:\n"
                    f"  {', '.join(missing_vars)}\n\n"
                    f"The application cannot start without these variables. "
                    f"Please set them in your production environment."
                )
                raise ValueError(error_msg)
        
        return self
    
    @model_validator(mode="before")
    @classmethod
    def fix_cors_origins_format(cls, data: Any) -> Any:
        """Ensure cors_origins is always a string (not parsed as JSON by pydantic_settings)."""
        if isinstance(data, dict):
            # Check if we have the cors_origins key
            cors_key = "cors_origins"
            if cors_key in data:
                value = data[cors_key]
                # If it's already a list (from previous parsing), convert back to string
                if isinstance(value, list):
                    # Convert list back to comma-separated string
                    data[cors_key] = ",".join(str(v) for v in value)
                # If it's a string, ensure it's not empty (use default if empty)
                elif isinstance(value, str) and not value.strip():
                    data[cors_key] = "http://localhost:3000"
        return data

    @property
    def cors_origins_list(self) -> list[str]:
        """Get CORS origins as a list. Parses the string value on access."""
        return parse_cors_origins(self.cors_origins)
    
    @property
    def use_upstash(self) -> bool:
        """Check if Upstash Redis credentials are provided."""
        return self.upstash_redis_rest_url is not None and self.upstash_redis_rest_token is not None


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
