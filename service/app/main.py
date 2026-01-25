# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

from contextlib import asynccontextmanager
import asyncio
import logging
import re
from urllib.parse import urlparse

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import DatabaseError, IntegrityError

from app.api.routers import api_router
from app.api.routers.sessions import cleanup_stale_memory_entries
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.security_middleware import SecurityHeadersMiddleware
from app.core.scan_filter_middleware import ScanFilterMiddleware
from app.core.exceptions import APIError, InternalServerError
from app.db.session import log_pool_status
from app.services.debate.recovery import recover_incomplete_debates

logger = logging.getLogger(__name__)


def extract_session_id_from_request(request: Request) -> str | None:
    """Extract session ID from request path for logging context.
    
    Handles common session routes:
    - /api/sessions/{session_db_id} (UUID)
    - /api/sessions/external/{session_identifier} (string)
    - /api/sessions/{session_id}/stream (string)
    - /api/sessions/{session_id}/task-status (string)
    """
    try:
        path = request.url.path
        # Pattern: /api/sessions/{id} or /api/sessions/external/{id} or /api/sessions/{id}/stream
        if "/sessions/" in path:
            parts = path.split("/sessions/")
            if len(parts) > 1:
                session_part = parts[1].split("/")[0]
                # Skip empty strings and common path segments
                if session_part and session_part not in ["external", "stream", "task-status"]:
                    return session_part
                # Handle /api/sessions/external/{id}
                if session_part == "external" and len(parts[1].split("/")) > 1:
                    return parts[1].split("/")[1]
    except Exception:
        pass
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[override]
    settings = get_settings()
    configure_logging(settings.log_level)
    
    # Startup: Check Redis connectivity
    logger.info("[startup] Checking Redis connectivity...")
    try:
        from app.core.redis import get_redis_client
        redis = get_redis_client()
        if redis is None:
            logger.warning("[startup] ⚠️ Redis is unavailable - using in-memory fallback storage")
            logger.warning("[startup] Some features may be limited. Check ROUNDTABLE_REDIS_URL configuration.")
        else:
            try:
                ping_result = redis.ping()
                logger.info(f"[startup] ✅ Redis connection successful! (ping: {ping_result})")
            except Exception as ping_error:
                logger.error(f"[startup] ❌ Redis ping failed: {ping_error}")
    except Exception as e:
        logger.error(f"[startup] ❌ Failed to check Redis connectivity: {e}", exc_info=True)
    
    # Startup: Recover incomplete debates
    logger.info("[startup] Starting debate recovery process...")
    try:
        recovered_sessions = await recover_incomplete_debates()
        if recovered_sessions:
            logger.info(f"[startup] Found {len(recovered_sessions)} incomplete debates to recover: {recovered_sessions}")
            logger.info("[startup] These debates will be automatically resumed when users reconnect to the stream")
        else:
            logger.info("[startup] No incomplete debates found to recover")
    except Exception as e:
        logger.error(f"[startup] Error during debate recovery: {e}", exc_info=True)
        # Don't fail startup if recovery fails - app should still start
    
    # Start background cleanup task for memory management
    cleanup_task = None
    pool_monitor_task = None
    try:
        async def periodic_cleanup():
            """Run cleanup every hour"""
            try:
                while True:
                    await asyncio.sleep(3600)  # Wait 1 hour
                    await cleanup_stale_memory_entries()
            except asyncio.CancelledError:
                # Expected during shutdown
                logger.debug("[cleanup] Periodic cleanup task cancelled (shutdown)")
                raise
            except Exception as e:
                logger.error(f"[cleanup] Error in periodic cleanup: {e}", exc_info=True)
        
        async def periodic_pool_monitoring():
            """Log connection pool status every 15 minutes to detect leaks early"""
            try:
                while True:
                    await asyncio.sleep(900)  # Wait 15 minutes
                    log_pool_status(logger)
            except asyncio.CancelledError:
                # Expected during shutdown
                logger.debug("[pool-monitor] Pool monitoring task cancelled (shutdown)")
                raise
            except Exception as e:
                logger.error(f"[pool-monitor] Error in pool monitoring: {e}", exc_info=True)
        
        cleanup_task = asyncio.create_task(periodic_cleanup())
        pool_monitor_task = asyncio.create_task(periodic_pool_monitoring())
        logger.info("[startup] Started periodic memory cleanup task")
        logger.info("[startup] Started periodic connection pool monitoring task")
        
        yield
    except (asyncio.CancelledError, KeyboardInterrupt):
        # Handle graceful shutdown on interruption
        # This is expected during server shutdown (Ctrl+C, etc.)
        logger.info("[shutdown] Shutdown signal received, cleaning up...")
        # Don't re-raise - these are expected during shutdown
    except Exception as e:
        # Log unexpected errors during lifespan
        logger.error(f"[shutdown] Unexpected error during shutdown: {e}", exc_info=True)
    finally:
        # Shutdown: Clean up if needed
        try:
            if cleanup_task and not cleanup_task.done():
                cleanup_task.cancel()
                try:
                    await cleanup_task
                except (asyncio.CancelledError, KeyboardInterrupt):
                    # Expected - task was cancelled during shutdown
                    pass
                except Exception as e:
                    logger.debug(f"[shutdown] Error waiting for cleanup task: {e}")
                else:
                    logger.info("[shutdown] Stopped periodic memory cleanup task")
            if pool_monitor_task and not pool_monitor_task.done():
                pool_monitor_task.cancel()
                try:
                    await pool_monitor_task
                except (asyncio.CancelledError, KeyboardInterrupt):
                    # Expected - task was cancelled during shutdown
                    pass
                except Exception as e:
                    logger.debug(f"[shutdown] Error waiting for pool monitor task: {e}")
                else:
                    logger.info("[shutdown] Stopped connection pool monitoring task")
            logger.info("[shutdown] Application shutting down gracefully")
        except (asyncio.CancelledError, KeyboardInterrupt):
            # Expected during shutdown - suppress these errors
            logger.debug("[shutdown] Shutdown interrupted (expected)")
        except Exception as shutdown_error:
            # Log unexpected errors during shutdown
            logger.debug(f"[shutdown] Error during cleanup: {shutdown_error}")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Crucible Community Edition API",
        description="AI-powered debate engine API. Intellectual Property © 2025 Roundtable Labs Pty Ltd. Licensed under AGPL-3.0.",
        version="1.0.0",
        lifespan=lifespan,
        # Disable automatic trailing slash redirects to prevent Authorization header loss
        # When redirect_slashes=True (default), FastAPI redirects /api/sessions -> /api/sessions/
        # This 307 redirect can strip Authorization headers in production (proxies/load balancers)
        # With redirect_slashes=False, routes must match exactly (no redirects)
        redirect_slashes=False,
        # Security: Disable automatic docs in production
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
        # Request size limits (10MB for JSON, 50MB for file uploads)
        # Note: File uploads are handled per-route, but this sets a global limit
    )

    # Security headers middleware (should be first to apply to all responses)
    app.add_middleware(SecurityHeadersMiddleware)
    
    # Filter out noisy security scan requests (before CORS to avoid unnecessary processing)
    app.add_middleware(ScanFilterMiddleware)
    
    # CORS middleware with automatic subdomain support
    # Automatically allow subdomains of configured main domains
    # e.g., if https://roundtablelabs.ai is configured, also allow https://crucible.roundtablelabs.ai
    expanded_origins = list(settings.cors_origins_list)
    origin_regex_patterns = []
    
    for origin in settings.cors_origins_list:
        if origin.startswith(("http://", "https://")):
            try:
                parsed = urlparse(origin)
                domain = parsed.netloc
                
                # If it's a main domain (not already a subdomain), create regex for subdomains
                # Main domain format: example.com (2 parts), subdomain: sub.example.com (3+ parts)
                parts = domain.split(".")
                if len(parts) == 2:  # Main domain like roundtablelabs.ai
                    # Create regex pattern to match main domain and all subdomains
                    # e.g., https://(.*\.)?roundtablelabs\.ai
                    regex_pattern = f"{parsed.scheme}://([^.]+\\.)?{re.escape(domain)}"
                    origin_regex_patterns.append(regex_pattern)
                    logger.info(f"[CORS] Added regex pattern for subdomains: {regex_pattern}")
                    
                    # Also add common subdomains explicitly for better compatibility
                    common_subdomains = ["crucible", "www", "app", "admin", "staging"]
                    for subdomain in common_subdomains:
                        subdomain_origin = f"{parsed.scheme}://{subdomain}.{domain}"
                        if subdomain_origin not in expanded_origins:
                            expanded_origins.append(subdomain_origin)
            except Exception as e:
                logger.debug(f"[CORS] Could not process origin {origin} for subdomain expansion: {e}")
    
    logger.info(f"[CORS] Configured origins: {expanded_origins}")
    if origin_regex_patterns:
        logger.info(f"[CORS] Regex patterns for subdomains: {origin_regex_patterns}")
    
    # Use both explicit origins and regex patterns for subdomain support
    app.add_middleware(
        CORSMiddleware,
        allow_origins=expanded_origins,
        allow_origin_regex="|".join([f"^{pattern}$" for pattern in origin_regex_patterns]) if origin_regex_patterns else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Trusted host middleware (optional - can restrict to specific domains)
    # Uncomment if you want to restrict access to specific hostnames
    # app.add_middleware(
    #     TrustedHostMiddleware,
    #     allowed_hosts=["api.roundtablelabs.ai", "*.railway.app", "localhost"]
    # )

    app.include_router(api_router, prefix="/api")
    
    # Global exception handlers for standardized error responses
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        """Handle APIError exceptions with standardized format."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.detail.get("code", "API_ERROR"),
                "message": exc.detail.get("message", "An error occurred"),
                "details": exc.detail.get("details", {})
            }
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Handle request validation errors with standardized format."""
        errors = exc.errors()
        error_details = {
            "field_errors": {err["loc"][-1]: err["msg"] for err in errors if err["loc"]}
        }
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "code": "VALIDATION_ERROR",
                "message": "Invalid request data",
                "details": error_details
            }
        )
    
    @app.exception_handler(DatabaseError)
    async def database_error_handler(request: Request, exc: DatabaseError) -> JSONResponse:
        """Handle database errors - don't expose internal details."""
        session_id = extract_session_id_from_request(request)
        session_context = f" (session_id={session_id})" if session_id else ""
        logger.error(f"Database error{session_context}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "DATABASE_ERROR",
                "message": "A database error occurred. Please try again later.",
                "details": {}
            }
        )
    
    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        """Handle database integrity errors (e.g., unique constraint violations)."""
        session_id = extract_session_id_from_request(request)
        session_context = f" (session_id={session_id})" if session_id else ""
        logger.error(f"Integrity error{session_context}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "code": "CONFLICT",
                "message": "A conflict occurred. The resource may already exist.",
                "details": {}
            }
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch-all handler for unhandled exceptions."""
        session_id = extract_session_id_from_request(request)
        session_context = f" (session_id={session_id})" if session_id else ""
        logger.error(f"Unhandled exception{session_context}: {exc}", exc_info=True)
        # Don't expose internal error details to users
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "INTERNAL_ERROR",
                "message": "An internal error occurred. Please try again later.",
                "details": {}
            }
        )
    
    return app


app = create_app()
