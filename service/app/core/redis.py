"""Redis client factory for Upstash and standard Redis."""
import logging
from typing import Optional, Union

from redis import Redis as StandardRedis

# Try to import Upstash Redis client
try:
    from upstash_redis import Redis as UpstashRedis
except ImportError:
    # If upstash_redis is not available, set to None
    UpstashRedis = None

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Optional[Union[StandardRedis, "UpstashRedis"]] = None


def get_redis_client() -> Union[StandardRedis, "UpstashRedis", None]:
    """
    Get Redis client - Upstash REST API or standard Redis.
    
    Returns:
        UpstashRedis if Upstash credentials are provided, otherwise standard Redis client.
        Returns None if Redis is unavailable (allows graceful degradation).
    """
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    settings = get_settings()
    
    # Try Upstash REST API first if credentials are provided
    if settings.use_upstash:
        if UpstashRedis is None:
            logger.warning("UpstashRedis is not available (package not installed or import failed), falling back to standard Redis")
        else:
            try:
                logger.info("Initializing Upstash Redis client (REST API)")
                _redis_client = UpstashRedis(
                    url=settings.upstash_redis_rest_url,
                    token=settings.upstash_redis_rest_token,
                )
                # Test connection (UpstashRedis may not have ping, use get instead)
                try:
                    _redis_client.ping()
                except AttributeError:
                    # UpstashRedis might not have ping, test with a simple get
                    _redis_client.get("__health_check__")
                return _redis_client
            except Exception as e:
                logger.warning(f"Failed to initialize Upstash Redis client: {e}, falling back to standard Redis")
    
    # Fallback to standard Redis client
    try:
        logger.info(f"[redis] Initializing standard Redis client from URL: {settings.redis_url}")
        _redis_client = StandardRedis.from_url(settings.redis_url, decode_responses=True)
        # Test connection
        ping_result = _redis_client.ping()
        logger.info(f"[redis] ✅ Redis connection successful! Ping result: {ping_result}")
        return _redis_client
    except Exception as e:
        logger.error(f"[redis] ❌ Failed to initialize Redis client: {e}", exc_info=True)
        logger.warning(f"[redis] Redis features will be disabled - using in-memory fallback")
        # Return None to allow graceful degradation
        return None


def reset_redis_client() -> None:
    """Reset the Redis client (useful for testing)."""
    global _redis_client
    _redis_client = None

