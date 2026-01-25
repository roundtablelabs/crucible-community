#!/usr/bin/env python3
"""
Password hashing utility for Community Edition.

This script generates a bcrypt hash for the community authentication password.
Use this to securely hash your password before setting it in the environment variable.

Usage:
    python -m scripts.hash_password <password>
    python -m scripts.hash_password "my-secure-password"

Or run directly:
    python scripts/hash_password.py <password>

The output can be directly used as the value for ROUNDTABLE_COMMUNITY_AUTH_PASSWORD.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.password import hash_password, is_bcrypt_hash


def main():
    """Hash a password and output the result."""
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.hash_password <password>")
        print("\nExample:")
        print('  python -m scripts.hash_password "my-secure-password"')
        print("\nThe output hash can be used as the value for ROUNDTABLE_COMMUNITY_AUTH_PASSWORD")
        sys.exit(1)
    
    password = sys.argv[1]
    
    # Check if password is already hashed
    if is_bcrypt_hash(password):
        print("⚠️  WARNING: The provided password appears to already be a bcrypt hash.")
        print("   If you want to hash a new password, provide the plain text password.")
        sys.exit(1)
    
    try:
        # Hash the password
        hashed = hash_password(password)
        
        print("\n" + "=" * 70)
        print("Password Hash Generated")
        print("=" * 70)
        print("\nHashed password (bcrypt):")
        print(hashed)
        print("\n" + "=" * 70)
        print("Next Steps:")
        print("=" * 70)
        print("\n1. Copy the hash above")
        print("2. Set it in your environment variable or .env file:")
        print(f"   ROUNDTABLE_COMMUNITY_AUTH_PASSWORD={hashed}")
        print("\n3. Restart your application")
        print("\n" + "=" * 70)
        print("Security Notes:")
        print("=" * 70)
        print("✓ Password is now securely hashed using bcrypt")
        print("✓ The original password cannot be recovered from the hash")
        print("✓ Authentication will verify passwords against this hash")
        print("=" * 70 + "\n")
        
    except Exception as e:
        print(f"❌ Error hashing password: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
