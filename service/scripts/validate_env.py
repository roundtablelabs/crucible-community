#!/usr/bin/env python3
"""
Startup environment variable validation script.
This script validates required environment variables before the application starts.

It ensures that critical environment variables are set and fail fast with clear error messages
if they are missing, preventing the application from starting with insecure defaults.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

def validate_encryption_key():
    """Validate API_KEY_ENCRYPTION_KEY is set and not empty.
    
    This is critical for secure API key storage. If missing, the application
    will fall back to an insecure default key that changes on restart.
    """
    encryption_key = os.getenv("API_KEY_ENCRYPTION_KEY")
    
    if not encryption_key or encryption_key.strip() == "":
        print("=" * 70, file=sys.stderr)
        print("❌ CRITICAL: API_KEY_ENCRYPTION_KEY is not set!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print("", file=sys.stderr)
        print("The API_KEY_ENCRYPTION_KEY environment variable is required for", file=sys.stderr)
        print("secure storage of user API keys. Without it, the application will", file=sys.stderr)
        print("use an insecure default key that changes on restart, making all", file=sys.stderr)
        print("encrypted API keys unreadable.", file=sys.stderr)
        print("", file=sys.stderr)
        print("To generate a secure key, run:", file=sys.stderr)
        print("  python -c \"import secrets; print(secrets.token_urlsafe(32))\"", file=sys.stderr)
        print("", file=sys.stderr)
        print("Then set it in your .env file or environment:", file=sys.stderr)
        print("  API_KEY_ENCRYPTION_KEY=<generated-key>", file=sys.stderr)
        print("", file=sys.stderr)
        print("For first-time setup, the init_secrets.sh script can generate", file=sys.stderr)
        print("this key automatically. Check your .env file.", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        return False
    
    # Check if it's the default insecure key
    if encryption_key == "default-dev-key-32-bytes-long!!":
        print("=" * 70, file=sys.stderr)
        print("⚠️  WARNING: API_KEY_ENCRYPTION_KEY is set to the default insecure key!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print("", file=sys.stderr)
        print("The default key is NOT SECURE for production use. It will make", file=sys.stderr)
        print("all encrypted API keys unreadable if the key changes between restarts.", file=sys.stderr)
        print("", file=sys.stderr)
        print("To generate a secure key, run:", file=sys.stderr)
        print("  python -c \"import secrets; print(secrets.token_urlsafe(32))\"", file=sys.stderr)
        print("", file=sys.stderr)
        print("Then update your .env file:", file=sys.stderr)
        print("  API_KEY_ENCRYPTION_KEY=<generated-key>", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        # Don't fail for default key - just warn (allows development to continue)
        # In production, the encryption.py module will fail if key is missing
        return True
    
    # Check minimum length (at least 32 characters recommended)
    if len(encryption_key) < 32:
        print("=" * 70, file=sys.stderr)
        print("⚠️  WARNING: API_KEY_ENCRYPTION_KEY is shorter than recommended (32 chars)", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print("", file=sys.stderr)
        print(f"Current length: {len(encryption_key)} characters", file=sys.stderr)
        print("Recommended: At least 32 characters for security", file=sys.stderr)
        print("", file=sys.stderr)
        print("To generate a secure key, run:", file=sys.stderr)
        print("  python -c \"import secrets; print(secrets.token_urlsafe(32))\"", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        # Don't fail for short key - just warn
        return True
    
    return True


def validate_production_requirements():
    """Validate required environment variables in production mode."""
    environment = os.getenv("ROUNDTABLE_ENVIRONMENT", "local").lower()
    is_production = environment == "production" or os.getenv("PRODUCTION", "").lower() in ("true", "1", "yes")
    
    if not is_production:
        # In development, just warn about missing keys
        return True
    
    # In production, fail fast if critical variables are missing
    missing_vars = []
    
    encryption_key = os.getenv("API_KEY_ENCRYPTION_KEY")
    if not encryption_key or encryption_key.strip() == "":
        missing_vars.append("API_KEY_ENCRYPTION_KEY")
    
    jwt_secret = os.getenv("ROUNDTABLE_JWT_SECRET")
    if not jwt_secret or jwt_secret.strip() == "":
        missing_vars.append("ROUNDTABLE_JWT_SECRET")
    
    jwt_refresh_secret = os.getenv("ROUNDTABLE_JWT_REFRESH_SECRET")
    if not jwt_refresh_secret or jwt_refresh_secret.strip() == "":
        missing_vars.append("ROUNDTABLE_JWT_REFRESH_SECRET")
    
    if missing_vars:
        print("=" * 70, file=sys.stderr)
        print("❌ CRITICAL: Missing required environment variables in production!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print("", file=sys.stderr)
        print("The following required variables are not set:", file=sys.stderr)
        for var in missing_vars:
            print(f"  - {var}", file=sys.stderr)
        print("", file=sys.stderr)
        print("The application cannot start in production without these variables.", file=sys.stderr)
        print("Please set them in your production environment or .env file.", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        return False
    
    return True


def main():
    """Main validation function."""
    print("🔍 Validating environment variables...")
    
    # Always validate encryption key (critical for security)
    if not validate_encryption_key():
        print("", file=sys.stderr)
        print("❌ Environment validation failed!", file=sys.stderr)
        sys.exit(1)
    
    # Validate production requirements if in production mode
    if not validate_production_requirements():
        print("", file=sys.stderr)
        print("❌ Environment validation failed!", file=sys.stderr)
        sys.exit(1)
    
    print("✅ Environment validation passed!")
    sys.exit(0)


if __name__ == "__main__":
    main()
