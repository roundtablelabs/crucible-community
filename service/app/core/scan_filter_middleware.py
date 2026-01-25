"""Middleware to filter out noisy security scan requests from logs."""
import logging
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Common security scan patterns that generate noisy 404s
SCAN_PATTERNS = [
    "/.env",
    "/.env.local",
    "/.env.prod",
    "/.env.dev",
    "/.env.production",
    "/.env.development",
    "/.env.test",
    "/.env.staging",
    "/.git/config",
    "/.git/HEAD",
    "/.gitignore",
    "/.htaccess",
    "/.htpasswd",
    "/wp-admin",
    "/wp-login.php",
    "/phpmyadmin",
    "/admin",
    "/administrator",
    "/.well-known/security.txt",
    "/robots.txt",  # This one is legitimate, but bots scan it frequently
]


class ScanFilterMiddleware(BaseHTTPMiddleware):
    """Middleware to silently handle security scan requests.
    
    This middleware intercepts requests to common security scan paths
    and returns 404 responses without logging, reducing log noise from
    automated bot scans.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check if request is a known scan pattern and handle silently."""
        path = request.url.path
        
        # Check if path matches any scan pattern
        if any(path.startswith(pattern) or path == pattern for pattern in SCAN_PATTERNS):
            # Return 404 without processing further
            # This prevents uvicorn from logging these requests
            return Response(status_code=404, content="Not Found")
        
        # For all other requests, proceed normally
        return await call_next(request)

