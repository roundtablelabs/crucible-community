"""Redis helper functions for session and task management."""
import logging
from uuid import UUID
from typing import Optional

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


# Session Topics
# Module-level cache to reduce Redis calls (Upstash charges per request)
_session_topic_cache: dict[str, tuple[str, float]] = {}
SESSION_TOPIC_CACHE_TTL = 60  # Cache for 60 seconds

def get_session_topic(session_id: str, use_cache: bool = True) -> Optional[str]:
    """Get session topic from Redis with caching to reduce API calls."""
    import time
    
    # Check cache first if enabled
    if use_cache and session_id in _session_topic_cache:
        topic, cache_timestamp = _session_topic_cache[session_id]
        current_time = time.time()
        if current_time - cache_timestamp < SESSION_TOPIC_CACHE_TTL:
            logger.debug(f"[redis] Using cached session topic for {session_id}")
            return topic
        else:
            # Cache expired, remove it
            _session_topic_cache.pop(session_id, None)
    
    # Cache miss or expired, query Redis
    try:
        redis = get_redis_client()
        if redis is None:
            logger.debug(f"[redis] Redis unavailable, cannot get topic for session {session_id}")
            return None
        key = f"session:topic:{session_id}"
        logger.debug(f"[redis] Getting topic from Redis: key={key}")
        topic = redis.get(key)
        if topic:
            logger.debug(f"[redis] Found topic in Redis for session {session_id}, length={len(topic)}")
            if use_cache:
                # Cache the result
                _session_topic_cache[session_id] = (topic, time.time())
        else:
            logger.debug(f"[redis] No topic found in Redis for session {session_id}")
        return topic if topic else None
    except Exception as e:
        logger.warning(f"[redis] Failed to get session topic from Redis: {e}, falling back to None")
        return None


def set_session_topic(session_id: str, topic: str, ttl: int = 3600) -> None:
    """Store session topic in Redis with TTL and update cache."""
    import time
    try:
        redis = get_redis_client()
        if redis is None:
            logger.warning(f"[redis] Redis unavailable, skipping topic storage for session {session_id}")
            # Still update cache for fallback
            _session_topic_cache[session_id] = (topic, time.time())
            return
        key = f"session:topic:{session_id}"
        logger.info(f"[redis] Storing topic in Redis: key={key}, ttl={ttl}s, topic_length={len(topic)}")
        redis.set(key, topic, ex=ttl)
        logger.info(f"[redis] Successfully stored topic in Redis for session {session_id}")
        # Update cache after successful Redis write
        _session_topic_cache[session_id] = (topic, time.time())
        logger.debug(f"Stored topic in Redis for session {session_id} (TTL: {ttl}s)")
    except Exception as e:
        logger.warning(f"Failed to store session topic in Redis: {e}, topic not persisted")
        # Still update cache for fallback even if Redis fails
        _session_topic_cache[session_id] = (topic, time.time())
        # Don't raise - graceful degradation


def clear_session_topic(session_id: str) -> None:
    """Clear session topic from Redis and cache."""
    try:
        redis = get_redis_client()
        if redis is None:
            # Still clear cache
            _session_topic_cache.pop(session_id, None)
            return
        key = f"session:topic:{session_id}"
        redis.delete(key)
        # Clear cache after successful Redis delete
        _session_topic_cache.pop(session_id, None)
        logger.debug(f"Cleared topic from Redis for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to clear session topic from Redis: {e}")
        # Still clear cache even if Redis fails
        _session_topic_cache.pop(session_id, None)


# Task Status Tracking
# Cache for task running status to reduce Redis calls
# Moved before functions that use it to avoid NameError
_task_running_cache: dict[str, tuple[bool, float]] = {}
TASK_RUNNING_CACHE_TTL = 10  # Cache for 10 seconds (shorter since task status changes)

def set_task_running(session_id: str, task_id: Optional[str] = None, ttl: int = 86400) -> None:
    """Mark debate task as running in Redis."""
    import time
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:task:{session_id}"
        value = task_id or "running"
        redis.set(key, value, ex=ttl)
        # IMPORTANT: Update the local cache immediately to prevent stale False values
        # This ensures is_task_running() returns True right after set_task_running() is called
        _task_running_cache[session_id] = (True, time.time())
        logger.info(f"[redis] Marked task as running in Redis for session {session_id} (task_id={task_id})")
    except Exception as e:
        logger.warning(f"Failed to set task status in Redis: {e}")


def clear_task_running(session_id: str) -> None:
    """Clear task running status from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:task:{session_id}"
        redis.delete(key)
        # IMPORTANT: Remove from local cache to ensure is_task_running() returns False
        _task_running_cache.pop(session_id, None)
        logger.info(f"[redis] Cleared task status from Redis for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to clear task status from Redis: {e}")
        # Still clear cache even if Redis fails
        _task_running_cache.pop(session_id, None)


def is_task_running(session_id: str, use_cache: bool = True) -> bool:
    """Check if debate task is running according to Redis with caching."""
    import time
    
    # Check cache first if enabled
    if use_cache and session_id in _task_running_cache:
        is_running, cache_timestamp = _task_running_cache[session_id]
        current_time = time.time()
        if current_time - cache_timestamp < TASK_RUNNING_CACHE_TTL:
            logger.debug(f"[redis] Using cached task running status for {session_id}: {is_running}")
            return is_running
        else:
            # Cache expired, remove it
            _task_running_cache.pop(session_id, None)
    
    # Cache miss or expired, query Redis
    try:
        redis = get_redis_client()
        if redis is None:
            return False
        key = f"session:task:{session_id}"
        is_running = redis.exists(key) > 0
        if use_cache:
            # Cache the result
            _task_running_cache[session_id] = (is_running, time.time())
        return is_running
    except Exception as e:
        logger.warning(f"Failed to check task status in Redis: {e}, assuming not running")
        return False


def get_task_id(session_id: str) -> Optional[str]:
    """Get Celery task ID from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return None
        key = f"session:task:{session_id}"
        task_id = redis.get(key)
        return task_id if task_id else None
    except Exception as e:
        logger.warning(f"Failed to get task ID from Redis: {e}")
        return None


# User Active Sessions
def set_user_active_session(user_id: UUID, session_id: str, ttl: int = 86400) -> None:
    """Set user's active session in Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"user:active_session:{user_id}"
        redis.set(key, session_id, ex=ttl)
        logger.debug(f"Set active session in Redis for user {user_id}: {session_id}")
    except Exception as e:
        logger.warning(f"Failed to set user active session in Redis: {e}")


def get_user_active_session(user_id: UUID) -> Optional[str]:
    """Get user's active session from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return None
        key = f"user:active_session:{user_id}"
        session_id = redis.get(key)
        return session_id if session_id else None
    except Exception as e:
        logger.warning(f"Failed to get user active session from Redis: {e}")
        return None


def clear_user_active_session(user_id: UUID) -> None:
    """Clear user's active session from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"user:active_session:{user_id}"
        redis.delete(key)
        logger.debug(f"Cleared active session from Redis for user {user_id}")
    except Exception as e:
        logger.warning(f"Failed to clear user active session from Redis: {e}")


# SSE Stream Connections
def add_stream_connection(session_id: str, connection_id: str) -> None:
    """Add SSE stream connection to Redis Set."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:streams:{session_id}"
        redis.sadd(key, connection_id)
        redis.expire(key, 3600)  # TTL of 1 hour
        logger.debug(f"Added stream connection {connection_id} for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to add stream connection in Redis: {e}")


def remove_stream_connection(session_id: str, connection_id: str) -> None:
    """Remove SSE stream connection from Redis Set."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:streams:{session_id}"
        redis.srem(key, connection_id)
        logger.debug(f"Removed stream connection {connection_id} for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to remove stream connection from Redis: {e}")


def get_stream_connections(session_id: str) -> set[str]:
    """Get all SSE stream connections for a session from Redis Set."""
    try:
        redis = get_redis_client()
        if redis is None:
            return set()
        key = f"session:streams:{session_id}"
        members = redis.smembers(key)
        return set(members) if members else set()
    except Exception as e:
        logger.warning(f"Failed to get stream connections from Redis: {e}")
        return set()


# Event Caching
def cache_events(session_id: str, last_sequence_id: int, events_data: list[dict], ttl: int = 60) -> None:
    """Cache events in Redis for faster retrieval."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:events:{session_id}:{last_sequence_id}"
        # Store as JSON string
        import json
        redis.set(key, json.dumps(events_data), ex=ttl)
        logger.debug(f"Cached {len(events_data)} events in Redis for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to cache events in Redis: {e}")


def get_cached_events(session_id: str, last_sequence_id: int) -> Optional[list[dict]]:
    """Get cached events from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return None
        key = f"session:events:{session_id}:{last_sequence_id}"
        cached_data = redis.get(key)
        if cached_data:
            import json
            events = json.loads(cached_data)
            logger.debug(f"Retrieved {len(events)} cached events from Redis for session {session_id}")
            return events
        return None
    except Exception as e:
        logger.warning(f"Failed to get cached events from Redis: {e}")
        return None


def append_event_to_cache(session_id: str, event_data: dict, ttl: int = 3600) -> None:
    """Append a new event to the Redis cache list."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:events:{session_id}"
        import json
        # Use Redis List to append events
        redis.rpush(key, json.dumps(event_data))
        redis.expire(key, ttl)
        logger.debug(f"Appended event to cache for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to append event to cache in Redis: {e}")


# Session Knights (for unpaid sessions)
def get_session_knights(session_id: str) -> Optional[list[str]]:
    """Get session knight IDs from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return None
        key = f"session:knights:{session_id}"
        knights_json = redis.get(key)
        if knights_json:
            import json
            knights = json.loads(knights_json)
            logger.debug(f"Retrieved {len(knights)} knights from Redis for session {session_id}")
            return knights
        return None
    except Exception as e:
        logger.warning(f"Failed to get session knights from Redis: {e}")
        return None


def set_session_knights(session_id: str, knight_ids: list[str], ttl: int = 86400) -> None:
    """Store session knight IDs in Redis with TTL (24 hours by default).
    
    Raises:
        Exception: If Redis is unavailable or write fails.
    """
    redis = get_redis_client()
    if redis is None:
        raise ConnectionError("Redis client is unavailable - cannot store knights")
    try:
        key = f"session:knights:{session_id}"
        import json
        redis.set(key, json.dumps(knight_ids), ex=ttl)
        logger.debug(f"Stored {len(knight_ids)} knights in Redis for session {session_id} (TTL: {ttl}s)")
    except Exception as e:
        logger.error(f"Failed to store session knights in Redis: {e}")
        raise


def clear_session_knights(session_id: str) -> None:
    """Clear session knight IDs from Redis."""
    try:
        redis = get_redis_client()
        if redis is None:
            return
        key = f"session:knights:{session_id}"
        redis.delete(key)
        logger.debug(f"Cleared knights from Redis for session {session_id}")
    except Exception as e:
        logger.warning(f"Failed to clear session knights from Redis: {e}")

