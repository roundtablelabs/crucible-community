"""
Database initialization script for Community Edition.
This script runs automatically when the postgres container starts for the first time.

It:
1. Creates all database tables
2. Seeds LLM models
3. Seeds prebuilt knights
4. Creates a default user for single-user mode
"""

import asyncio
import sys
import os
from pathlib import Path
from uuid import uuid4

# Set default environment variables before importing app modules
# This ensures settings validation doesn't fail during initialization
if "ROUNDTABLE_ENVIRONMENT" not in os.environ:
    os.environ["ROUNDTABLE_ENVIRONMENT"] = "local"
# Use localhost for local development, postgres for Docker
if "ROUNDTABLE_DATABASE_URL" not in os.environ:
    # Try to detect if we're in Docker by checking if 'postgres' hostname resolves
    # Otherwise default to localhost for local development
    os.environ["ROUNDTABLE_DATABASE_URL"] = "postgresql+asyncpg://postgres:postgres@localhost:5432/roundtable"
if "ROUNDTABLE_REDIS_URL" not in os.environ:
    os.environ["ROUNDTABLE_REDIS_URL"] = "redis://localhost:6379/0"
if "ROUNDTABLE_JWT_SECRET" not in os.environ:
    os.environ["ROUNDTABLE_JWT_SECRET"] = "community-secret"
if "ROUNDTABLE_JWT_REFRESH_SECRET" not in os.environ:
    os.environ["ROUNDTABLE_JWT_REFRESH_SECRET"] = "community-refresh-secret"
if "ROUNDTABLE_CORS_ORIGINS" not in os.environ:
    os.environ["ROUNDTABLE_CORS_ORIGINS"] = "http://localhost:3000"
# OpenRouter API key is optional for init (only needed for actual debates)
if "ROUNDTABLE_OPENROUTER_API_KEY" not in os.environ:
    os.environ["ROUNDTABLE_OPENROUTER_API_KEY"] = ""

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.base import Base
from app.db.session import engine, AsyncSessionLocal
from scripts.seed_models import seed as seed_models
from scripts.seed_knights import seed as seed_knights

# Import all models so SQLAlchemy knows about them
# This ensures Base.metadata includes all table definitions
from app.models import (
    audit_log as audit_log_model,
    knight as knight_model,
    model_catalog as model_catalog_model,
    session as session_model,
    session_event as session_event_model,
    share_token as share_token_model,
    user as user_model,
    user_account as user_account_model,
    user_settings as user_settings_model,
)


async def init_database() -> None:
    """Create all database tables if they don't exist."""
    from sqlalchemy import text, inspect
    
    print("[*] Checking database connection and tables...")
    
    # Check if database is accessible and if tables already exist
    try:
        async with engine.begin() as conn:
            # Test connection
            await conn.execute(text("SELECT 1"))
            
            # Get all expected table names from Base.metadata
            expected_tables = set(Base.metadata.tables.keys())
            
            # Check which tables exist in the database
            def check_tables(sync_conn):
                inspector = inspect(sync_conn)
                return set(inspector.get_table_names())
            
            existing_tables = await conn.run_sync(check_tables)
            
            # Check if all expected tables exist
            missing_tables = expected_tables - existing_tables
            
            if not missing_tables:
                print(f"[OK] All {len(expected_tables)} database tables already exist, skipping table creation")
                return
            
            # Some tables are missing, create all tables (create_all is idempotent)
            print(f"[*] Found {len(missing_tables)} missing table(s): {', '.join(sorted(missing_tables))}")
            print("[*] Creating database tables...")
            await conn.run_sync(Base.metadata.create_all)
            print(f"[OK] Database tables initialized ({len(expected_tables)} tables)")
    except Exception as e:
        print(f"[ERROR] Failed to initialize database: {e}")
        import traceback
        traceback.print_exc()
        raise


async def create_default_user() -> None:
    """Create a default user for single-user mode."""
    from app.models.user import User
    from app.core.config import get_settings
    from app.core.password import verify_password_with_fallback, hash_password
    
    from sqlalchemy import select
    
    # Get password from settings (must be configured via ROUNDTABLE_COMMUNITY_AUTH_PASSWORD)
    settings = get_settings()
    if not settings.community_auth_password:
        raise ValueError(
            "❌ CRITICAL: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD must be set before creating the default user. "
            "Please set this environment variable in your .env file or environment. "
            "Generate a secure password using: python -c \"import secrets; print(secrets.token_urlsafe(16))\" "
            "Or hash a password using: cd service && python -m scripts.hash_password <your-password>"
        )
    
    async with AsyncSessionLocal() as session:
        # Check if default user already exists
        result = await session.execute(
            select(User).where(User.email == "admin@community.local")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print("[OK] Default user already exists")
            return
        
        # Create default user
        from datetime import datetime, timezone
        
        # Hash password using the password utility (supports both plain text and already-hashed passwords)
        # If password is already hashed (bcrypt), use it directly; otherwise hash it
        from app.core.password import is_bcrypt_hash
        if is_bcrypt_hash(settings.community_auth_password):
            # Password is already hashed, use it directly
            hashed_password = settings.community_auth_password
        else:
            # Password is plain text, hash it
            hashed_password = hash_password(settings.community_auth_password)
        
        default_user = User(
            id=uuid4(),
            email="admin@community.local",
            full_name="Community Edition Admin",
            hashed_password=hashed_password,
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),  # Mark email as verified
            license_accepted_at=None,  # User must accept license on first login
            license_version=None,
            password_change_required=True,  # Force password change on first login
            role="admin",
        )
        session.add(default_user)
        await session.commit()
        print("[OK] Default user created (email: admin@community.local)")
        print("      Password: Set via ROUNDTABLE_COMMUNITY_AUTH_PASSWORD environment variable")


async def init_community_db() -> None:
    """Initialize database for community edition."""
    try:
        # Step 1: Initialize database tables
        await init_database()
        
        # Step 2: Seed models (required before knights)
        print("\n[*] Seeding LLM models...")
        await seed_models()
        print("[OK] Models seeded")
        
        # Step 3: Seed knights
        print("\n[*] Seeding knights...")
        await seed_knights()
        print("[OK] Knights seeded")
        
        # Step 4: Create default user
        print("\n[*] Creating default user...")
        await create_default_user()
        
        print("\n[SUCCESS] Community Edition database setup complete!")
        print("\nDefault credentials:")
        print("  Email: admin@community.local")
        print("  Password: Set via ROUNDTABLE_COMMUNITY_AUTH_PASSWORD environment variable")
                
    except Exception as e:
        print(f"\n[ERROR] Error during initialization: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(init_community_db())
