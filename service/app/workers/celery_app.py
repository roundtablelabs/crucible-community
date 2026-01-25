from celery import Celery
from celery.schedules import crontab
import logging
import ssl

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Check if Redis URL uses SSL (rediss://)
redis_url = settings.broker_url or settings.redis_url
backend_url = settings.redis_url
# Check if either broker or backend uses SSL
uses_ssl = (redis_url and redis_url.startswith("rediss://")) or (backend_url and backend_url.startswith("rediss://"))

# For rediss:// URLs, we need to add ssl_cert_reqs parameter to the URL itself
# Celery's Redis backend requires this parameter in the URL when using rediss://
if uses_ssl:
    # Add ssl_cert_reqs parameter to URLs if not already present
    if redis_url and redis_url.startswith("rediss://") and "ssl_cert_reqs" not in redis_url:
        separator = "&" if "?" in redis_url else "?"
        redis_url = f"{redis_url}{separator}ssl_cert_reqs=none"
    if backend_url and backend_url.startswith("rediss://") and "ssl_cert_reqs" not in backend_url:
        separator = "&" if "?" in backend_url else "?"
        backend_url = f"{backend_url}{separator}ssl_cert_reqs=none"

# Celery uses Redis protocol endpoint (not REST API)
# If ROUNDTABLE_REDIS_URL is set to Upstash Redis protocol endpoint, it will work automatically
celery_app = Celery(
    "roundtable",
    broker=redis_url,
    backend=backend_url,
)

# Configure Celery for better Redis connection handling (especially for Upstash)
# Upstash-specific optimizations:
# 1. Disable pub/sub for result backend (use polling instead) - Upstash has issues with long-lived pub/sub
# 2. Increase retry limits and delays for connection recovery
# 3. Use shorter timeouts to fail fast and retry
# 4. Enable connection pooling with health checks
celery_app.conf.update(
    task_track_started=True,
    # Redis connection settings for Upstash compatibility
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=20,  # Increased for Upstash (was 10)
    broker_connection_retry_delay=3.0,  # Increased delay between retries (was 2.0)
    broker_connection_timeout=10,  # Connection timeout for faster failure detection
    # Suppress deprecation warning about worker_cancel_long_running_tasks_on_connection_loss
    worker_cancel_long_running_tasks_on_connection_loss=False,
    # Connection pool limits for better connection management
    broker_pool_limit=10,  # Limit broker connections to avoid Upstash limits
    result_backend_pool_limit=10,  # Limit result backend connections
    # Result backend settings - CRITICAL: Disable pub/sub for Upstash
    result_backend_transport_options={
        'retry_policy': {
            'timeout': 10.0,  # Increased timeout for Upstash (was 5.0)
            'max_retries': 10,  # Increased retries (was 5)
            'interval_start': 1.0,  # Start with 1s delay
            'interval_step': 0.5,  # Increase by 0.5s each retry
            'interval_max': 5.0,  # Max 5s between retries
        },
        'visibility_timeout': 3600,  # Task visibility timeout
        # SSL configuration for rediss:// URLs (required by Celery)
        # Must be at top level, not in connection_pool_kwargs
        **({'ssl_cert_reqs': ssl.CERT_NONE} if uses_ssl else {}),  # CERT_NONE for Upstash (they manage certs)
        'connection_pool_kwargs': {
            'retry_on_timeout': True,
            'health_check_interval': 10,  # More frequent health checks to detect closed connections faster (was 20s)
            'socket_connect_timeout': 10,  # Increased for Upstash (was 5)
            'socket_timeout': 10,  # Increased for Upstash (was 5)
            'socket_keepalive': True,  # Keep connections alive
            'socket_keepalive_options': {
                1: 1,  # TCP_KEEPIDLE
                2: 1,  # TCP_KEEPINTVL
                3: 3,  # TCP_KEEPCNT
            },
            'max_connections': 10,  # Limit connections to avoid Upstash limits
        },
        # CRITICAL: Disable pub/sub for result backend (Upstash doesn't handle it well)
        # This makes Celery poll for results instead of using pub/sub
        'master_name': None,  # Disable pub/sub
    },
    # Broker transport options (for message queue)
    broker_transport_options={
        'retry_policy': {
            'timeout': 10.0,  # Increased for Upstash (was 5.0)
            'max_retries': 5,  # Increased (was 3)
        },
        # SSL configuration for rediss:// URLs (required by Celery)
        # Must be at top level, not in connection_pool_kwargs
        **({'ssl_cert_reqs': ssl.CERT_NONE} if uses_ssl else {}),  # CERT_NONE for Upstash (they manage certs)
        'connection_pool_kwargs': {
            'retry_on_timeout': True,
            'health_check_interval': 10,  # More frequent health checks to detect closed connections faster (was 20s)
            'socket_connect_timeout': 10,  # Increased (was 5)
            'socket_timeout': 10,  # Increased (was 5)
            'socket_keepalive': True,
            'socket_keepalive_options': {
                1: 1,
                2: 1,
                3: 3,
            },
            'max_connections': 10,  # Limit connections
        },
    },
    # Disable result backend pub/sub if not needed (reduces connection overhead)
    # Upstash may have issues with long-lived pub/sub connections
    result_backend_always_retry=True,
    result_expires=3600,  # Results expire after 1 hour
    # Use polling instead of pub/sub for result backend (better for Upstash)
    # This is set via transport_options above, but also ensure result_persistent is False
    result_persistent=False,  # Don't persist results in Redis (we use database)
    # Task routing configuration - routes tasks to specific queues
    # Use registered task names (from @celery_app.task(name="...")) or function paths
    # Both should work, but using registered names is more explicit
    task_routes={
        'run_debate': {'queue': 'debate'},
        'app.workers.tasks.run_debate_task': {'queue': 'debate'},  # Also support function path
        'generate_decision_brief': {'queue': 'debate'},
        'app.workers.tasks.generate_decision_brief': {'queue': 'debate'},  # Also support function path
    },
    task_default_queue='debate',  # Default queue for any unmapped tasks
    # Celery Beat schedule for periodic tasks
    # Use registered task names (from @celery_app.task(name="..."))
    beat_schedule={
        # No periodic tasks scheduled for community edition
        # All removed tasks were payment-related or user management tasks
        # not needed for single-user BYOK setup
    },
)

# Import tasks module to ensure all tasks are registered
# This is critical - without this import, tasks won't be registered and workers won't recognize them
try:
    from app.workers import tasks  # noqa: F401
    logger.info("Tasks module imported successfully - all tasks should be registered")
except ImportError as e:
    logger.error(f"Failed to import tasks module: {e}")
    raise

# Log Redis connection info (without exposing credentials)
if settings.redis_url:
    redis_host = settings.redis_url.split("@")[-1].split("/")[0] if "@" in settings.redis_url else settings.redis_url.split("://")[-1].split("/")[0]
    logger.info(f"Celery configured with Redis broker/backend: {redis_host}")
    if uses_ssl:
        logger.info("Celery SSL enabled (rediss://) with ssl_cert_reqs=CERT_NONE for Upstash compatibility")
    logger.info("Celery configured with connection retry and health checks for Upstash compatibility")
