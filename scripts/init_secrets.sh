#!/bin/bash
# Auto-generate secrets on first installation if .env doesn't exist

set -e

ENV_FILE="/app/.env"

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo "✓ .env file already exists, skipping secret generation"
    exit 0
fi

echo "=================================================="
echo "First-time setup: Generating secure secrets..."
echo "=================================================="

# Generate secure random keys
ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
JWT_REFRESH_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
AUTH_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(16))")
POSTGRES_USER=$(python3 -c "import secrets, string; print(''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(12)))")
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
REDIS_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Create .env file
cat > "$ENV_FILE" << EOF
# Crucible Community Edition Configuration
# Auto-generated on first installation

# ============================================================================
# SECURITY - DO NOT SHARE THESE VALUES!
# ============================================================================

# API Key Encryption Key (32 characters)
# WARNING: If this changes, all encrypted API keys will become unreadable!
API_KEY_ENCRYPTION_KEY=$ENCRYPTION_KEY

# Community Edition Authentication Password
# Auto-generated secure password - save this value!
# You can change it later by editing this file
ROUNDTABLE_COMMUNITY_AUTH_PASSWORD=$AUTH_PASSWORD

# JWT Secrets (used for token signing)
ROUNDTABLE_JWT_SECRET=$JWT_SECRET
ROUNDTABLE_JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Database Credentials
# IMPORTANT: Save these values - you'll need them if you need to access the database directly
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# Redis Credentials
# IMPORTANT: Save this value - Redis requires authentication
REDIS_PASSWORD=$REDIS_PASSWORD

# ============================================================================
# OPTIONAL - Provider API Keys (if you want server-side defaults)
# ============================================================================
# Users can also set their own API keys in the Settings page after login

# OpenRouter API Key (optional - users can provide their own)
ROUNDTABLE_OPENROUTER_API_KEY=

# Eden AI API Key (optional - for AI research features)
ROUNDTABLE_EDEN_AI_API_KEY=
EOF

chmod 600 "$ENV_FILE"

echo "✓ Secrets generated successfully!"
echo ""
echo "=================================================="
echo "IMPORTANT: Save your credentials!"
echo "=================================================="
echo ""
echo "Your secure credentials have been generated:"
echo "  - Authentication password: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD"
echo "  - Database user: POSTGRES_USER"
echo "  - Database password: POSTGRES_PASSWORD"
echo "  - Redis password: REDIS_PASSWORD"
echo ""
echo "⚠️  IMPORTANT: Save these values now!"
echo "   They are stored in: $ENV_FILE"
echo ""
echo "For production deployments:"
echo "  - Consider hashing the auth password: python -m scripts.hash_password <your-password>"
echo "  - Keep database credentials secure - never commit them to version control"
echo "  - Keep Redis password secure - required for Redis authentication"
echo ""
