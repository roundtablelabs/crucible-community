<div align="center">

<img src="frontend/public/logos/roundtable-mark.svg" alt="Crucible Logo" width="200"/>

# 🔥 Crucible Community Edition

**Decision Intelligence Platform**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](docker-compose.prod.yml)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

[Quick Start](#quick-start) • [Documentation](#documentation) • [Contributing](#contributing) • [License](#license)

</div>

---

## 🎯 What is Crucible?

**Crucible** is an advanced AI debate engine that orchestrates multiple AI "knights" (expert personas) to analyze complex topics from diverse perspectives. Watch as AI experts debate, challenge each other, and converge on nuanced insights—all in real-time.

### Why Crucible?

- 🤖 **Multi-Agent Intelligence**: Multiple AI personas with distinct expertise debate your questions
- ⚡ **Real-Time Streaming**: Watch debates unfold live with streaming responses
- 📊 **Executive Briefs**: Generate comprehensive PDF decision briefs from debates
- 🏰 **Prebuilt Knights**: Access to a library of expert AI personas
- 🔒 **Self-Hosted**: Full control over your data and infrastructure
- 🔑 **BYOK Model**: Bring your own API keys—no vendor lock-in

### Perfect For

- **Power Users** who want to self-host and customize
- **Enterprises** requiring internal deployment and data control
- **Developers** who want to extend and contribute
- **Researchers** exploring multi-agent AI systems
- **Decision Makers** who need comprehensive analysis from multiple perspectives

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎭 **Multi-Agent Debates** | Orchestrate debates between multiple AI personas with distinct expertise |
| 📡 **Live Streaming** | Real-time debate sessions with streaming responses and live updates |
| 📄 **PDF Briefs** | Generate comprehensive executive decision briefs from completed debates |
| 🏰 **Prebuilt Knights** | Library of expert AI personas ready to use |
| 🔄 **Phase-Based Workflow** | Research → Position Cards → Challenges → Rebuttals → Convergence |
| 🔐 **Self-Hosted** | Full control over your data, infrastructure, and deployment |
| 🔑 **BYOK Model** | Bring your own API keys—support for OpenAI, Anthropic, OpenRouter, and more |
| 🎨 **Customizable** | Branding, configuration, and extensible architecture |
| 🐳 **Docker Ready** | One-command deployment with Docker Compose |
| ⚡ **Fast Setup** | Get running in 3 steps—no complex configuration needed |

## 🚀 Quick Start

Get Crucible running in **3 simple steps**!

### Prerequisites

- 🐳 **Docker** 20.10+ and **Docker Compose** v2+ (or `docker-compose` v1.29+)
  - Install from https://docker.com/products/docker-desktop
  - Verify: `docker --version` and `docker compose version`
- 🐍 **Python** 3.11+ (only needed for automatic secret generation on first run)
  - The wrapper scripts use Python to generate secure secrets
  - After `.env` is created, Python is no longer needed
  - Install from https://python.org if missing
- 💾 **4GB RAM** minimum, **8GB recommended**
- 🔌 **Ports available**: `3000` (frontend), `8000` (API)
  - Check with: `lsof -i :3000` (Linux/macOS) or `netstat -ano | findstr :3000` (Windows)

> 💡 **Tip**: API keys are **optional** during setup—you can configure them later in the Settings page after login.

### Installation (3 Steps)

**Estimated time:** 5-10 minutes (depending on internet speed for Docker image downloads)

#### 1️⃣ Clone the Repository

**Time:** ~30 seconds

```bash
git clone https://github.com/roundtable-labs/crucible-community.git
cd crucible-community
```

#### 2️⃣ Start Services

**What are wrapper scripts?**
The wrapper scripts (`docker-compose.sh`, `docker-compose.ps1`, `docker-compose.bat`) are convenience scripts included in this repository that:
- ✅ Automatically generate secure secrets (if `.env` doesn't exist)
- ✅ Start all Docker services with one command
- ✅ Display your login credentials after setup

**Why use them?** They eliminate manual configuration—just run one command and everything is set up!

**Estimated time:** 2-5 minutes (depending on internet speed for Docker image downloads)

**What happens:**
1. Script checks if `.env` file exists
2. If missing, generates secure secrets (requires Python)
3. Starts 6 Docker containers (PostgreSQL, Redis, API, Worker, Beat, Frontend)
4. Displays login credentials in terminal
5. Services take 30-60 seconds to fully start

**Expected output:** You'll see Docker pulling images, starting containers, and then your login credentials.

**Linux/macOS:**
```bash
./docker-compose.sh up -d
```

**Windows PowerShell (Recommended):**
```powershell
# Open PowerShell (not Command Prompt)
.\docker-compose.ps1 up -d
```

**Windows Command Prompt:**
```cmd
# Open Command Prompt (cmd.exe)
.\docker-compose.bat up -d
```

**Windows with WSL2:**
```bash
# If using WSL2, you can use the Linux script
./docker-compose.sh up -d
```

> ⚠️ **Windows Users:** 
> - Always use `.\` prefix when running scripts
> - Do NOT use `docker-compose.sh` on Windows (unless using WSL2)
> - Use `.ps1` (PowerShell) or `.bat` (Command Prompt) instead
> - PowerShell is recommended for better error messages

#### 3️⃣ Access Crucible

1. **Wait for services to start** (30-60 seconds)
   - Verify: `docker compose ps` - all services should show "healthy" or "running"

2. **Open http://localhost:3000** in your browser

3. **Find your login credentials:**
   - **Default email:** `admin@community.local`
   - **Password:** Look in your terminal output for a section that says:
     ```
     ==================================================
     IMPORTANT: Save your credentials!
     ==================================================
     
     Your secure credentials have been generated:
       - Authentication password: [YOUR_PASSWORD_HERE]
     ```
   - The password is the value shown after "Authentication password:"

4. **Can't find the password?** It's also saved in your `.env` file:
   ```bash
   # Linux/macOS
   grep ROUNDTABLE_COMMUNITY_AUTH_PASSWORD .env
   
   # Windows PowerShell
   Select-String "ROUNDTABLE_COMMUNITY_AUTH_PASSWORD" .env
   ```

> ❓ **Having trouble?** See the [Troubleshooting](#troubleshooting) section below for common issues and solutions.

#### 4️⃣ Verify Installation (Optional but Recommended)

**Check all services are running:**
```bash
docker compose ps
```
All 6 services should show "healthy" or "running" status.

**Test the API:**
- Open http://localhost:8000/docs in your browser
- You should see the interactive API documentation (Swagger UI)

**If services aren't healthy:**
- Check logs: `docker compose logs -f`
- See [Troubleshooting](#troubleshooting) section for common issues

### 📋 First Install Output

When you run the setup for the first time, you'll see output like this in your terminal:

```
==================================================
IMPORTANT: Save your credentials!
==================================================

Your secure credentials have been generated:
  - Authentication password: [Login Password]
  - Database user: [Database Username]
  - Database password: [Database Password]
  - Redis password: [Redis Password]

⚠️  These values are saved in: .env
   Keep this file secure and never commit it to version control!
```

**Important:** Save your authentication password - you'll need it to log in!

### 🎉 That's It!

The wrapper scripts automatically:
- ✅ Generate `.env` file with secure secrets (if missing)
- ✅ Start all Docker services (PostgreSQL, Redis, API, Worker, Frontend)
- ✅ Display your login credentials
- ✅ No manual configuration needed!

**What's Next?**
1. ✅ Log in at http://localhost:3000 using the credentials from your terminal
2. ⚙️ Configure API keys in Settings (optional - you can add them later)
3. 🚀 Start creating your first debate session!

> 💡 **Pro Tip:** The wrapper scripts work exactly like `docker-compose`—they accept all the same arguments (`up`, `down`, `logs`, `ps`, etc.).

## 🏗️ Architecture

When you run the installation, Crucible creates:

### Docker Services

| Service | Description | Port |
|---------|-------------|------|
| 🐘 **postgres** | PostgreSQL 15 database | 5432 (internal) |
| 🔴 **redis** | Redis 7 cache and session storage | 6379 (internal) |
| 🚀 **api** | FastAPI backend service | 8000 |
| ⚙️ **worker** | Celery worker for background tasks | - |
| ⏰ **beat** | Celery beat scheduler | - |
| 🎨 **frontend** | Next.js frontend application | 3000 |

### Data Persistence

- 📦 **Docker volumes** (data persists between restarts):
  - `postgres_data` - Database files
  - `artifacts` - Generated PDFs and documents

### Configuration

- ⚙️ **`.env`** - Environment variables with auto-generated secrets

## Environment Variables Reference

### Auto-Generated (Required)

These are automatically generated by the setup scripts. You don't need to set them manually.

| Variable | Purpose | Generated Value |
|----------|---------|----------------|
| `API_KEY_ENCRYPTION_KEY` | Encrypts user API keys stored in database | 32-character URL-safe token |
| `ROUNDTABLE_JWT_SECRET` | JWT token signing for authentication | 48-character URL-safe token |
| `ROUNDTABLE_JWT_REFRESH_SECRET` | JWT refresh token signing | 48-character URL-safe token |
| `ROUNDTABLE_COMMUNITY_AUTH_PASSWORD` | Login password for `admin@community.local` | 16-character URL-safe token |
| `POSTGRES_USER` | PostgreSQL database username | 12-character alphanumeric |
| `POSTGRES_PASSWORD` | PostgreSQL database password | 24-character URL-safe token |
| `REDIS_PASSWORD` | Redis authentication password | 32-character URL-safe token |

### Optional (User-Provided)

These can be set in `.env` or configured later in the UI Settings page.

| Variable | Purpose | Notes |
|----------|---------|-------|
| `ROUNDTABLE_OPENROUTER_API_KEY` | OpenRouter API key for LLM access | Can be set in UI Settings after login |
| `ROUNDTABLE_EDEN_AI_API_KEY` | Eden AI API key for AI research features | Optional, can be set in UI Settings |
| `ROUNDTABLE_ENABLE_RATE_LIMITING` | Enable rate limiting for LLM API calls | Default: `true`. Set to `false` in `.env` to disable |
| `ROUNDTABLE_LLM_RATE_LIMIT_TPM` | Rate limit in tokens per minute | Default: `100000`. Adjust in `.env` if needed |
| `ROUNDTABLE_LLM_RATE_LIMIT_WINDOW_SECONDS` | Rate limit time window in seconds | Default: `60`. Adjust in `.env` if needed |

> **Security Note:** For production deployments, consider hashing the password using:
> ```bash
> cd service && python -m scripts.hash_password <your-password>
> ```
> Then update `ROUNDTABLE_COMMUNITY_AUTH_PASSWORD` in `.env` with the generated hash.

## Common Operations

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f frontend
```

### Stop Services
```bash
docker compose down
```

### Update to Latest Version
```bash
# Pull latest images and restart
docker compose pull && docker compose up -d
```

### Check Service Status
```bash
# Verify all services are running
docker compose ps
```

### Reset Everything (WARNING: Deletes All Data)
```bash
# Stop and remove all containers, volumes, and networks
docker compose down -v
```

### Backup Data
```bash
# Backup PostgreSQL database
# Replace YOUR_POSTGRES_USER with the value from your .env file
docker compose exec postgres pg_dump -U YOUR_POSTGRES_USER roundtable > backup.sql

# Or use the environment variable directly (if available in shell)
docker compose exec -e PGPASSWORD="$POSTGRES_PASSWORD" postgres pg_dump -U "$POSTGRES_USER" roundtable > backup.sql

# Backup .env file (contains encryption keys!)
cp .env .env.backup
```

## Customization (For Power Users)

### Change the Default Password

1. Generate a password hash:
   ```bash
   cd service && python -m scripts.hash_password <your-new-password>
   ```

2. Update `.env` file:
   ```bash
   ROUNDTABLE_COMMUNITY_AUTH_PASSWORD=<generated-hash>
   ```

3. Restart services:
   ```bash
   docker compose restart api
   ```

### Use Custom Domain / HTTPS

1. Update `ROUNDTABLE_CORS_ORIGINS` in `.env`:
   ```bash
   ROUNDTABLE_CORS_ORIGINS=https://yourdomain.com
   ```

2. Update `NEXT_PUBLIC_API_URL` in `docker-compose.prod.yml` or frontend environment:
   ```bash
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
   ```

3. Use a reverse proxy (nginx, Traefik, etc.) to handle SSL/TLS termination.

### Connect External PostgreSQL/Redis

1. Update connection strings in `.env` file (replace placeholders with your actual values):
   ```bash
   # Replace user, pass, and external-host with your PostgreSQL credentials
   ROUNDTABLE_DATABASE_URL=postgresql+asyncpg://user:pass@external-host:5432/roundtable
   
   # Replace password and external-host with your Redis credentials
   ROUNDTABLE_REDIS_URL=redis://:password@external-host:6379/0
   ```

2. Edit `docker-compose.prod.yml` and remove or comment out the `postgres` and `redis` service definitions (since you're using external services).

3. Ensure external databases are accessible and initialized (run `python -m scripts.init_community_db` manually if needed).

### Manual Secret Generation

If you prefer to generate secrets manually instead of using wrapper scripts:

**Option 1: Using setup scripts (generates secrets and starts services):**
```bash
# Linux/macOS
./scripts/setup.sh

# Windows PowerShell
.\scripts\setup.ps1
```

**Option 2: Generate secrets only, then start services manually:**
```bash
# Generate .env file with secrets
python3 scripts/generate_secrets.py  # or python on Windows

# Then use regular docker-compose
docker compose -f docker-compose.prod.yml up -d
```

## Production vs Development

### Production (Default - Recommended)

Uses pre-built images from GitHub Container Registry. Faster startup, no local builds required.

**File:** `docker-compose.prod.yml`

**Usage:**
```bash
# Wrapper scripts automatically use production compose file
./docker-compose.sh up -d
```

### Development

Builds from source code. Use this if you're contributing or need to modify the codebase.

**File:** `docker-compose.yml`

**Usage:**
```bash
# Build and run from source
docker compose up -d --build
```

> **Note:** The wrapper scripts (`docker-compose.sh`, `docker-compose.ps1`, `docker-compose.bat`) automatically use the production compose file. For development, use `docker compose` directly with `docker-compose.yml`.

## Troubleshooting

### "Python not found" Error
- Install Python 3.8+ from https://python.org
- Ensure `python` or `python3` is in your PATH
- Restart your terminal after installing

### "Docker not found" Error
- Install Docker Desktop from https://docker.com
- Ensure Docker is running
- Restart your terminal after installing

### Windows: Script Asks Which Application to Open
- **Don't use `.sh` files on Windows!**
- Use `.\docker-compose.ps1` (PowerShell) or `.\docker-compose.bat` (Command Prompt)

### Services Won't Start
1. Check Docker is running: `docker ps`
2. Check logs: `docker compose logs`
3. Verify `.env` file exists: `ls -la .env` (Linux/macOS) or `dir .env` (Windows)
4. Try regenerating secrets: Delete `.env` and run `./docker-compose.sh up -d` again (or `.\docker-compose.ps1 up -d` on Windows)

### Database "does not exist" Error
If you see an error like `FATAL: database "username" does not exist`:
1. This usually means there's an old PostgreSQL volume with conflicting data
2. **Solution**: Remove the old volume and restart:
   ```bash
   docker compose down -v
   docker compose up -d
   ```
   This will delete all data and start fresh. Make sure to backup your `.env` file first!

### Can't Access http://localhost:3000
1. Check services are running: `docker compose ps`
2. Check frontend logs: `docker compose logs frontend`
3. Verify port 3000 is not in use by another application
4. Try accessing http://localhost:8000/docs to verify API is running

### Forgot Password
1. Check `.env` file for `ROUNDTABLE_COMMUNITY_AUTH_PASSWORD`
2. If password is hashed, you'll need to reset it (see "Change the Default Password" section)
3. Or delete `.env` and regenerate (WARNING: This makes existing encrypted API keys unreadable!)

## Security Notes

- **Never commit `.env` to version control** - It contains sensitive secrets
- **Backup your `.env` file** - If lost, encrypted API keys become unrecoverable
- **Save your password** - Displayed during setup, also stored in `.env` file
- **For production**: Hash passwords using `python -m scripts.hash_password <password>`
- **Keep encryption keys secure** - If `API_KEY_ENCRYPTION_KEY` changes, users must re-enter their API keys

## API Usage Responsibility

This software uses a **"Bring Your Own Key" (BYOK)** model. You are responsible for:

- Obtaining and managing your own API keys
- **All costs associated with API usage**
- Complying with API provider terms of service

**Roundtable Labs is NOT liable for API costs or provider issues.**

See [NOTICE.md](NOTICE.md) for complete disclaimers.

## Documentation

### Getting Started
- [Quick Start Guide](docs/getting-started/quick-start.md) - 3-step installation
- [First Steps](docs/getting-started/first-steps.md) - Post-installation guide

### Deployment
- [Environment Variables](docs/deployment/environment-variables.md) - Complete variable reference
- [Troubleshooting](docs/deployment/troubleshooting.md) - Common issues and solutions

### Configuration
- [API Keys](docs/configuration/api-keys.md) - Manage LLM provider keys
- [Security](docs/configuration/security.md) - Security configuration

### API
- Interactive Docs: http://localhost:8000/docs (when running)

### Additional Resources
- [.env.example](.env.example) - Environment variables template
- [NOTICE.md](NOTICE.md) - Disclaimers and attribution

> **Note**: For development documentation, API reference, and detailed deployment guides, see `internal_dev_docs/` folder.

## 🤝 Contributing

We welcome contributions! Crucible is open source and built by the community.

### How to Contribute

1. 📖 Read our [Contributing Guidelines](CONTRIBUTING.md)
2. 🔍 Check existing [Issues](https://github.com/roundtable-labs/crucible-community/issues) and [Pull Requests](https://github.com/roundtable-labs/crucible-community/pulls)
3. 🍴 Fork the repository and create a feature branch
4. ✅ Sign our [Contributor License Agreement (CLA)](CLA.md)
5. 💻 Make your changes and add tests
6. 📝 Submit a Pull Request

### Resources

- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines and workflow
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Community standards and expectations
- [CLA.md](CLA.md) - Contributor License Agreement
- [CHANGELOG.md](CHANGELOG.md) - Version history and changes

### Development Setup

For local development, use `docker-compose.yml` to build from source:

```bash
docker compose up -d --build
```

See [Development Setup Guide](docs/development/setup.md) for detailed instructions.

## License

This project is licensed under the **AGPL-3.0** (GNU Affero General Public License v3.0) - see the [LICENSE](LICENSE) file for details.

### Proprietary Content

Note: While the source code is licensed under AGPL-3.0, certain content (knight prompts, personas) is proprietary. See [PROMPTS_LICENSE.md](PROMPTS_LICENSE.md) for details.

## 💼 Commercial Version

Looking for enterprise features, support, SLA guarantees, or managed hosting?

**Visit [Roundtable Labs](https://roundtablelabs.ai)** for:
- 🏢 Enterprise features and support
- 📞 Dedicated support and SLA
- ☁️ Managed hosting options
- 🔐 Advanced security features
- 🚀 Priority updates and new features

---

## 📞 Support & Community

- 🌐 **Website**: [roundtablelabs.ai](https://roundtablelabs.ai)
- 📧 **Issues**: [GitHub Issues](https://github.com/roundtable-labs/crucible-community/issues)
- 📖 **Documentation**: See [Documentation](#documentation) section below
- 💬 **Questions**: Open a [Discussion](https://github.com/roundtable-labs/crucible-community/discussions)

---

<div align="center">

**Built with ❤️ by [Roundtable Labs](https://roundtablelabs.ai)**

Copyright © 2026 Roundtable Labs Pty Ltd

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

</div>
