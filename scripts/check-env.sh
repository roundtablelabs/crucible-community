#!/bin/bash
# Quick check script to verify .env file exists and has required variables
# Run from project root: ./scripts/check-env.sh

set -e

# Get the project root directory (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ ERROR: .env file not found!"
    echo ""
    echo "Please generate secrets first:"
    echo "  Linux/macOS: ./docker-compose.sh up -d"
    echo "  Windows:     .\\docker-compose.ps1 up -d"
    echo ""
    echo "Or manually:"
    echo "  python3 scripts/generate_secrets.py"
    exit 1
fi

# Check for required variables
REQUIRED_VARS=(
    "API_KEY_ENCRYPTION_KEY"
    "ROUNDTABLE_JWT_SECRET"
    "ROUNDTABLE_JWT_REFRESH_SECRET"
    "ROUNDTABLE_COMMUNITY_AUTH_PASSWORD"
    "POSTGRES_USER"
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE" || grep -q "^${var}=$" "$ENV_FILE" || grep -q "^${var}=\"\"$" "$ENV_FILE"; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ ERROR: Missing or empty required variables in .env:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please regenerate secrets:"
    echo "  Linux/macOS: ./docker-compose.sh up -d"
    echo "  Windows:     .\\docker-compose.ps1 up -d"
    exit 1
fi

echo "✅ .env file exists and has all required variables"
exit 0
