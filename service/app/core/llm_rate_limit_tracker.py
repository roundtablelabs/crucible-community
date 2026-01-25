"""Track LLM provider rate limits (TPM - Tokens Per Minute)."""
import logging
import time
from typing import Optional
from dataclasses import dataclass

from app.core.redis import get_redis_client
from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class RateLimitInfo:
    """Information about rate limit status."""
    tokens_used: int
    tokens_limit: int
    window_start: float
    window_seconds: int
    remaining: int
    reset_at: float


class LLMRateLimitTracker:
    """Track token usage for LLM providers to respect rate limits."""
    
    def __init__(self, provider: str, tpm_limit: int | None = None, window_seconds: int | None = None):
        """
        Initialize rate limit tracker.
        
        Args:
            provider: Provider name (e.g., "openrouter", "openai")
            tpm_limit: Tokens per minute limit (if None, reads from settings)
            window_seconds: Time window in seconds (if None, reads from settings, default 60 for TPM)
        """
        self.provider = provider
        self._tpm_limit = tpm_limit  # Store as private, read from settings if None
        self._window_seconds = window_seconds  # Store as private, read from settings if None
        self.redis_key_prefix = f"llm_rate_limit:{provider}"
    
    @property
    def tpm_limit(self) -> int:
        """Get TPM limit from settings or stored value."""
        if self._tpm_limit is None:
            try:
                settings = get_settings()
                return settings.llm_rate_limit_tpm
            except Exception:
                return 100000  # Default fallback
        return self._tpm_limit
    
    @property
    def window_seconds(self) -> int:
        """Get window seconds from settings or stored value."""
        if self._window_seconds is None:
            try:
                settings = get_settings()
                return settings.llm_rate_limit_window_seconds
            except Exception:
                return 60  # Default fallback
        return self._window_seconds
    
    def _get_redis_key(self, user_id: Optional[str] = None) -> str:
        """Get Redis key for rate limit tracking."""
        if user_id:
            return f"{self.redis_key_prefix}:user:{user_id}"
        return f"{self.redis_key_prefix}:global"
    
    def can_make_request(self, estimated_tokens: int, user_id: Optional[str] = None) -> tuple[bool, RateLimitInfo]:
        """
        Check if a request can be made without exceeding rate limits.
        
        Args:
            estimated_tokens: Estimated number of tokens for the request
            user_id: Optional user ID for per-user rate limiting
            
        Returns:
            Tuple of (can_make_request, rate_limit_info)
        """
        settings = get_settings()
        
        # Check if rate limiting is enabled
        if not settings.enable_rate_limiting:
            # Rate limiting disabled - allow request but still track usage
            logger.debug(f"Rate limiting disabled, allowing request")
            return True, RateLimitInfo(
                tokens_used=0,
                tokens_limit=self.tpm_limit,
                window_start=time.time(),
                window_seconds=self.window_seconds,
                remaining=self.tpm_limit,
                reset_at=time.time() + self.window_seconds
            )
        
        redis = get_redis_client()
        if redis is None:
            # If Redis unavailable, allow request but log warning
            logger.warning(f"Redis unavailable for rate limit tracking, allowing request (fail-open)")
            return True, RateLimitInfo(
                tokens_used=0,
                tokens_limit=self.tpm_limit,
                window_start=time.time(),
                window_seconds=self.window_seconds,
                remaining=self.tpm_limit,
                reset_at=time.time() + self.window_seconds
            )
        
        try:
            now = time.time()
            window_start = now - self.window_seconds
            redis_key = self._get_redis_key(user_id)
            
            # Get current token usage from Redis sorted set
            # We track actual token counts, not just request counts
            current_usage = 0
            try:
                if hasattr(redis, 'zrangebyscore'):
                    entries = redis.zrangebyscore(redis_key, window_start, now, withscores=True)
                    for entry in entries:
                        if isinstance(entry, tuple):
                            # Entry format: (member, score)
                            # Member is the token count as string, score is timestamp
                            member, score = entry
                            try:
                                # Parse token count from member
                                token_count = int(float(member))
                                current_usage += token_count
                            except (ValueError, TypeError):
                                # Fallback: if member is not a number, count as 1
                                current_usage += 1
                elif hasattr(redis, 'zcount'):
                    # Upstash Redis - use zcount (less accurate, counts entries not tokens)
                    entry_count = redis.zcount(redis_key, window_start, now)
                    # Estimate: assume average 2000 tokens per request
                    current_usage = entry_count * 2000
                elif hasattr(redis, 'zcard'):
                    # Fallback: count all entries (less accurate)
                    entry_count = redis.zcard(redis_key)
                    current_usage = entry_count * 2000  # Estimate
                else:
                    current_usage = 0
            except (AttributeError, TypeError) as e:
                logger.warning(f"Error reading rate limit entries: {e}")
                current_usage = 0
            
            # Calculate if request would exceed limit
            total_usage = current_usage + estimated_tokens
            can_make_request = total_usage <= self.tpm_limit
            remaining = max(0, self.tpm_limit - total_usage)
            
            # Calculate reset time (end of current window)
            reset_at = window_start + self.window_seconds + self.window_seconds
            
            if not can_make_request:
                logger.warning(
                    f"Rate limit exceeded for {self.provider}: "
                    f"current={current_usage}, estimated={estimated_tokens}, limit={self.tpm_limit}"
                )
            
            return can_make_request, RateLimitInfo(
                tokens_used=current_usage,
                tokens_limit=self.tpm_limit,
                window_start=window_start,
                window_seconds=self.window_seconds,
                remaining=remaining,
                reset_at=reset_at
            )
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {e}", exc_info=True)
            # Fail open - allow request if tracking fails
            return True, RateLimitInfo(
                tokens_used=0,
                tokens_limit=self.tpm_limit,
                window_start=time.time(),
                window_seconds=self.window_seconds,
                remaining=self.tpm_limit,
                reset_at=time.time() + self.window_seconds
            )
    
    def record_request(self, actual_tokens: int, user_id: Optional[str] = None) -> None:
        """
        Record a completed request's token usage.
        
        Args:
            actual_tokens: Actual number of tokens used
            user_id: Optional user ID for per-user rate limiting
        """
        redis = get_redis_client()
        if redis is None:
            return
        
        try:
            now = time.time()
            redis_key = self._get_redis_key(user_id)
            
            # Add token usage entry with current timestamp
            # Store actual token count as member, timestamp as score
            # This allows us to track actual token usage, not just request count
            try:
                if hasattr(redis, 'zadd'):
                    # Standard Redis - store token count as member, timestamp as score
                    redis.zadd(redis_key, {str(actual_tokens): now})
                elif hasattr(redis, 'zset_add'):
                    # Upstash Redis REST API
                    redis.zset_add(redis_key, str(actual_tokens), now)
                elif hasattr(redis, 'lpush'):
                    # Fallback: use list with token count
                    redis.lpush(redis_key, str(actual_tokens))
                else:
                    # Last resort: use set
                    redis.sadd(redis_key, f"{actual_tokens}:{now}")
            except (AttributeError, TypeError) as e:
                logger.warning(f"Error adding rate limit entry: {e}")
            
            # Clean up old entries
            try:
                window_start = now - self.window_seconds
                if hasattr(redis, 'zremrangebyscore'):
                    redis.zremrangebyscore(redis_key, 0, window_start)
            except (AttributeError, TypeError):
                pass
            
            # Set expiration
            try:
                if hasattr(redis, 'expire'):
                    redis.expire(redis_key, self.window_seconds + 10)
                elif hasattr(redis, 'expire_at'):
                    redis.expire_at(redis_key, int(now) + self.window_seconds + 10)
            except (AttributeError, TypeError):
                pass
            
        except Exception as e:
            logger.error(f"Error recording rate limit: {e}", exc_info=True)
    
    def get_status(self, user_id: Optional[str] = None) -> RateLimitInfo:
        """Get current rate limit status."""
        redis = get_redis_client()
        if redis is None:
            return RateLimitInfo(
                tokens_used=0,
                tokens_limit=self.tpm_limit,
                window_start=time.time(),
                window_seconds=self.window_seconds,
                remaining=self.tpm_limit,
                reset_at=time.time() + self.window_seconds
            )
        
        try:
            now = time.time()
            window_start = now - self.window_seconds
            redis_key = self._get_redis_key(user_id)
            
            # Count actual tokens in current window (not just entries)
            tokens_used = 0
            try:
                if hasattr(redis, 'zrangebyscore'):
                    entries = redis.zrangebyscore(redis_key, window_start, now, withscores=True)
                    for entry in entries:
                        if isinstance(entry, tuple):
                            member, score = entry
                            try:
                                token_count = int(float(member))
                                tokens_used += token_count
                            except (ValueError, TypeError):
                                tokens_used += 2000  # Fallback estimate
                elif hasattr(redis, 'zcount'):
                    # Upstash - estimate based on entry count
                    entry_count = redis.zcount(redis_key, window_start, now)
                    tokens_used = entry_count * 2000
                elif hasattr(redis, 'zcard'):
                    entry_count = redis.zcard(redis_key)
                    tokens_used = entry_count * 2000
                else:
                    tokens_used = 0
            except (AttributeError, TypeError):
                tokens_used = 0
            
            return RateLimitInfo(
                tokens_used=tokens_used,
                tokens_limit=self.tpm_limit,
                window_start=window_start,
                window_seconds=self.window_seconds,
                remaining=max(0, self.tpm_limit - tokens_used),
                reset_at=window_start + self.window_seconds + self.window_seconds
            )
        except Exception as e:
            logger.error(f"Error getting rate limit status: {e}", exc_info=True)
            return RateLimitInfo(
                tokens_used=0,
                tokens_limit=self.tpm_limit,
                window_start=time.time(),
                window_seconds=self.window_seconds,
                remaining=self.tpm_limit,
                reset_at=time.time() + self.window_seconds
            )


# Pre-configured trackers for common providers
# Rate limits are configurable via environment variables
# Default: 100,000 tokens per minute (configurable via ROUNDTABLE_LLM_RATE_LIMIT_TPM)
# Trackers read settings dynamically, so no initialization needed

OPENROUTER_TRACKER = LLMRateLimitTracker("openrouter")
OPENAI_TRACKER = LLMRateLimitTracker("openai")



