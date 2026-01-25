# Quick Start Guide

Get Crucible Community Edition running in 3 simple steps.

## Prerequisites

- **Docker** 20.10+ and **Docker Compose** v2+ (or `docker-compose` v1.29+)
- **Python** 3.8+ (only needed for automatic secret generation)
- **4GB RAM** minimum, 8GB recommended
- **Ports available**: 3000 (frontend), 8000 (API)

> **Note**: API keys from OpenRouter or other providers are **optional** - you can set them later in the Settings page after login.

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/roundtable-labs/crucible-community.git
cd crucible-community
```

### 2. Start Services

The wrapper scripts automatically generate secure secrets and start all services.

**Linux/macOS:**
```bash
./docker-compose.sh up -d
```

**Windows PowerShell:**
```powershell
.\docker-compose.ps1 up -d
```

**Windows Command Prompt:**
```cmd
.\docker-compose.bat up -d
```

> **Windows Users:** Always use `.\` prefix when running scripts. Do NOT use `docker-compose.sh` on Windows - use `.ps1` (PowerShell) or `.bat` (Command Prompt) instead.

### 3. Access Crucible

- Open http://localhost:3000 in your browser
- Login credentials will be displayed in your terminal
- Default email: `admin@community.local`
- Password: Generated secure password (shown during setup)

**That's it!** The wrapper scripts automatically:
- ✅ Generate `.env` file with secure secrets (if missing)
- ✅ Start all Docker services
- ✅ Display your login credentials
- ✅ No manual configuration needed!

## What Gets Created

When you run the installation, Crucible creates:

- **6 Docker containers:**
  - `postgres` - PostgreSQL 15 database
  - `redis` - Redis 7 cache and session storage
  - `api` - FastAPI backend service
  - `worker` - Celery worker for background tasks
  - `beat` - Celery beat scheduler
  - `frontend` - Next.js frontend application

- **Docker volumes** (data persists between restarts):
  - `postgres_data` - Database files
  - `artifacts` - Generated PDFs and documents

- **Configuration file:**
  - `.env` - Environment variables with auto-generated secrets

## Next Steps

- [First Steps](first-steps.md) - What to do after installation
- [Configuration Guide](../configuration/README.md) - Customize your deployment
- [Troubleshooting](../deployment/troubleshooting.md) - Common issues and solutions
