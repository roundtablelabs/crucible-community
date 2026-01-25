import logging
import re

import structlog

# Common security scan patterns that generate noisy 404s
SCAN_PATTERNS = [
    r"/\.env",
    r"/\.env\.local",
    r"/\.env\.prod",
    r"/\.env\.dev",
    r"/\.env\.production",
    r"/\.env\.development",
    r"/\.env\.test",
    r"/\.env\.staging",
    r"/\.git/",
    r"/\.gitignore",
    r"/\.htaccess",
    r"/\.htpasswd",
    r"/wp-admin",
    r"/wp-login\.php",
    r"/phpmyadmin",
    r"/administrator",
    r"/\.well-known/security\.txt",
]


class ScanFilterAccessLogger(logging.Filter):
    """Filter to suppress access logs for known security scan patterns."""
    
    def __init__(self):
        super().__init__()
        # Compile regex patterns for efficient matching
        self.patterns = [re.compile(pattern) for pattern in SCAN_PATTERNS]
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Filter out log records that match scan patterns."""
        # Check the log message for scan patterns
        message = record.getMessage()
        
        # Uvicorn access log format: "100.64.0.x:port - "METHOD /path HTTP/1.1" status"
        # We want to filter 404s for scan paths
        if "404" in message or "Not Found" in message:
            for pattern in self.patterns:
                if pattern.search(message):
                    # Suppress this log entry
                    return False
        
        # Allow all other log entries
        return True


def configure_logging(level: str = "INFO") -> None:
    """Configure structured logging for the API and background workers."""
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level.upper(), logging.INFO)),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO))
    
    # Suppress verbose HTTP logging from third-party libraries
    # These libraries log every HTTP request at INFO level, creating massive log noise
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    # Suppress Ragas progress bars and verbose evaluation logs
    logging.getLogger("ragas").setLevel(logging.WARNING)
    
    # Filter out noisy security scan requests from uvicorn access logs
    # Uvicorn uses "uvicorn.access" logger for access logs
    access_logger = logging.getLogger("uvicorn.access")
    scan_filter = ScanFilterAccessLogger()
    access_logger.addFilter(scan_filter)