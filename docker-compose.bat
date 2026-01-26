@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM Crucible Community Edition
REM Copyright (C) 2026 Roundtable Labs Pty Ltd
REM 
REM This program is free software: you can redistribute it and/or modify
REM it under the terms of the GNU Affero General Public License as published by
REM the Free Software Foundation, either version 3 of the License, or
REM (at your option) any later version.
REM
REM This program is distributed in the hope that it will be useful,
REM but WITHOUT ANY WARRANTY; without even the implied warranty of
REM MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
REM GNU Affero General Public License for more details.
REM
REM You should have received a copy of the GNU Affero General Public License
REM along with this program.  If not, see https://www.gnu.org/licenses/
REM
REM Version: 0.1.0
REM License: AGPL-3.0
REM Documentation: https://github.com/roundtable-labs/crucible-community
REM ============================================================================
REM
REM Wrapper script that auto-generates .env if missing, then runs docker-compose
REM This allows true one-click: docker-compose up

echo.
echo ============================================================================
echo.
echo  _______  _______           _______ _________ ______   _        _______ 
echo ^(  ____ \^(  ____ ^)^|^ \     /^|^(  ____ \^__   __/^(  ___ \ ^( \      ^(  ____ \
echo ^| ^(    \/^| ^(    ^)^|^| ^)   ^( ^|^| ^(    \/   ^) ^(   ^| ^(   ^) ^)^| ^(      ^| ^(    \/
echo ^| ^|      ^| ^(____^)^|^| ^|   ^| ^|^| ^|         ^| ^|   ^| ^(__/ / ^| ^|      ^| ^(__    
echo ^| ^|      ^|     __^)^| ^|   ^| ^|^| ^|         ^| ^|   ^|  __ ^(  ^| ^|      ^|  __^)   
echo ^| ^|      ^| ^(\ ^(   ^| ^|   ^| ^|^| ^|         ^| ^|   ^| ^(  \ \ ^| ^|      ^| ^(      
echo ^| ^(____/\^| ^) \ \__^| ^(___^)^| ^|^| ^(____/\___^) ^(___^| ^)^)___) ^)^| ^(____/\^| ^(____/\
echo ^(_______/^|/   \__/^(_______^)^(_______/\_______/^|/ \___/ ^(_______/^(_______/
echo                                                                        
echo.
echo   Community Edition v0.1.0
echo   AI-Powered Multi-Agent Debate Platform
echo.
echo   Copyright (C^) 2026 Roundtable Labs Pty Ltd
echo   Licensed under AGPL-3.0
echo ============================================================================
echo.

if not exist ".env" (
    echo ==================================================
    echo First-time setup: Generating secure secrets...
    echo ==================================================
    echo.
    
    REM Check if Python is available
    python --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python is required but not found.
        echo Please install Python 3 and try again.
        exit /b 1
    )
    
    REM Generate secure random keys
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(32))"') do set ENCRYPTION_KEY=%%i
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(48))"') do set JWT_SECRET=%%i
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(48))"') do set JWT_REFRESH_SECRET=%%i
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(16))"') do set AUTH_PASSWORD=%%i
    for /f "delims=" %%i in ('python -c "import secrets, string; print(''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(12)))"') do set POSTGRES_USER=%%i
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(24))"') do set POSTGRES_PASSWORD=%%i
    for /f "delims=" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(32))"') do set REDIS_PASSWORD=%%i
    
    REM Create .env file
    (
        echo # Crucible Community Edition Configuration
        echo # Auto-generated on first docker-compose run
        echo.
        echo # ============================================================================
        echo # SECURITY - DO NOT SHARE THESE VALUES!
        echo # ============================================================================
        echo.
        echo # API Key Encryption Key (32 characters^)
        echo # WARNING: If this changes, all encrypted API keys will become unreadable!
        echo API_KEY_ENCRYPTION_KEY=!ENCRYPTION_KEY!
        echo.
        echo # Community Edition Authentication Password
        echo # Auto-generated secure password - save this value!
        echo ROUNDTABLE_COMMUNITY_AUTH_PASSWORD=!AUTH_PASSWORD!
        echo.
        echo # JWT Secrets (used for token signing^)
        echo ROUNDTABLE_JWT_SECRET=!JWT_SECRET!
        echo ROUNDTABLE_JWT_REFRESH_SECRET=!JWT_REFRESH_SECRET!
        echo.
        echo # Database Credentials
        echo POSTGRES_USER=!POSTGRES_USER!
        echo POSTGRES_PASSWORD=!POSTGRES_PASSWORD!
        echo.
        echo # Redis Credentials
        echo REDIS_PASSWORD=!REDIS_PASSWORD!
        echo.
        echo # Optional API Keys
        echo ROUNDTABLE_OPENROUTER_API_KEY=
        echo ROUNDTABLE_EDEN_AI_API_KEY=
        echo.
        echo # ============================================================================
        echo # OPTIONAL - LLM Rate Limiting Configuration
        echo # ============================================================================
        echo # Configure rate limiting for LLM API calls to prevent exceeding provider limits.
        echo.
        echo # Enable Rate Limiting (default: true - rate limiting enabled^)
        echo # You can change this in .env file if needed.
        echo ROUNDTABLE_ENABLE_RATE_LIMITING=true
        echo.
        echo # LLM Rate Limit (Tokens Per Minute^) - default: 100000
        echo ROUNDTABLE_LLM_RATE_LIMIT_TPM=100000
        echo.
        echo # LLM Rate Limit Window (Seconds^) - default: 60 (one minute window^)
        echo ROUNDTABLE_LLM_RATE_LIMIT_WINDOW_SECONDS=60
    ) > .env
    
    echo ??Secrets generated successfully!
    echo.
    echo ==================================================
    echo IMPORTANT: Save your credentials!
    echo ==================================================
    echo.
    echo Your secure credentials have been generated:
    echo   - Authentication password: !AUTH_PASSWORD!
    echo   - Database user: !POSTGRES_USER!
    echo   - Database password: !POSTGRES_PASSWORD!
    echo   - Redis password: !REDIS_PASSWORD!
    echo.
    echo ?ая?  These values are saved in: .env
    echo    Keep this file secure and never commit it to version control!
    echo.
    echo Starting services...
    echo.
)

REM Use docker compose (newer) or docker-compose (older)
docker compose version >nul 2>&1
if errorlevel 1 (
    REM Try docker-compose (older syntax)
    docker-compose --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Neither 'docker compose' nor 'docker-compose' is available.
        echo Please install Docker Compose and try again.
        exit /b 1
    )
    set COMPOSE_CMD=docker-compose
) else (
    REM docker compose works (newer syntax)
    set COMPOSE_CMD=docker compose
)

REM Try production compose file first (pre-built images)
REM If images aren't available, fall back to building from source
set COMPOSE_FILE=docker-compose.prod.yml
set FALLBACK_FILE=docker-compose.yml

REM For 'up' command, check if production images are available
echo %* | findstr /C:"up" >nul
if %errorlevel% equ 0 (
    echo Checking for pre-built images...
    %COMPOSE_CMD% -f %COMPOSE_FILE% pull api >nul 2>&1
    if errorlevel 1 (
        echo Pre-built images not available. Building from source...
        echo (This may take a few minutes on first run^)
        echo.
        set COMPOSE_FILE=%FALLBACK_FILE%
    ) else (
        echo Using pre-built images from GitHub Container Registry
        echo.
    )
)

REM Pass all arguments to docker-compose
%COMPOSE_CMD% -f %COMPOSE_FILE% %*
