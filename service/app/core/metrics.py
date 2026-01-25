"""Metrics collection for LLM operations and system monitoring."""
import logging
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


@dataclass
class LLMMetrics:
    """Metrics for a single LLM call."""
    provider: str
    model: str
    tokens_used: int
    latency_ms: float
    success: bool
    error_type: Optional[str] = None
    timestamp: float = field(default_factory=lambda: time.time())


class MetricsCollector:
    """Collect and store metrics for monitoring."""
    
    def __init__(self):
        self.redis_key_prefix = "metrics"
    
    def record_llm_call(self, metrics: LLMMetrics) -> None:
        """
        Record LLM call metrics.
        
        Args:
            metrics: LLM call metrics
        """
        redis = get_redis_client()
        if redis is None:
            # Log metrics if Redis unavailable
            logger.info(
                f"LLM Metrics: provider={metrics.provider}, model={metrics.model}, "
                f"tokens={metrics.tokens_used}, latency={metrics.latency_ms}ms, "
                f"success={metrics.success}"
            )
            return
        
        try:
            # Store metrics in Redis with timestamp
            key = f"{self.redis_key_prefix}:llm:{metrics.provider}:{int(metrics.timestamp)}"
            data = {
                "provider": metrics.provider,
                "model": metrics.model,
                "tokens_used": metrics.tokens_used,
                "latency_ms": metrics.latency_ms,
                "success": "1" if metrics.success else "0",
                "error_type": metrics.error_type or "",
                "timestamp": metrics.timestamp
            }
            
            # Store as hash with TTL (keep for 7 days)
            try:
                # Check if it's Upstash Redis (doesn't support hash operations - must use JSON)
                redis_type = str(type(redis))
                is_upstash = 'upstash' in redis_type.lower()
                
                if is_upstash:
                    # Upstash Redis - use JSON storage (doesn't support hset operations)
                    import json
                    redis.set(key, json.dumps(data), ex=7 * 24 * 60 * 60)  # 7 days TTL
                elif hasattr(redis, 'hset'):
                    # Standard Redis - try with mapping first
                    try:
                        redis.hset(key, mapping=data)
                        # Set expiration separately for standard Redis
                        if hasattr(redis, 'expire'):
                            redis.expire(key, 7 * 24 * 60 * 60)  # 7 days
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(key, int(metrics.timestamp) + 7 * 24 * 60 * 60)
                    except (TypeError, AttributeError) as e:
                        # Fallback: set each field individually (for older Redis clients)
                        for field, value in data.items():
                            redis.hset(key, field, value)
                        if hasattr(redis, 'expire'):
                            redis.expire(key, 7 * 24 * 60 * 60)
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(key, int(metrics.timestamp) + 7 * 24 * 60 * 60)
                elif hasattr(redis, 'set'):
                    # Final fallback - store as JSON string
                    import json
                    redis.set(key, json.dumps(data))
                    if hasattr(redis, 'expire'):
                        redis.expire(key, 7 * 24 * 60 * 60)
                    elif hasattr(redis, 'expire_at'):
                        redis.expire_at(key, int(metrics.timestamp) + 7 * 24 * 60 * 60)
            except Exception as e:
                # Catch all Redis errors
                logger.warning(f"Error storing metrics: {e}", exc_info=True)
            
            # Also update aggregated counters
            try:
                hour_key = f"{self.redis_key_prefix}:llm:hourly:{metrics.provider}:{int(metrics.timestamp // 3600)}"
                redis_type = str(type(redis))
                is_upstash = 'upstash' in redis_type.lower()
                
                if is_upstash:
                    # Upstash Redis - use JSON storage for aggregations
                    import json
                    existing = redis.get(hour_key)
                    if existing:
                        if isinstance(existing, bytes):
                            existing = existing.decode('utf-8')
                        hour_data = json.loads(existing)
                    else:
                        hour_data = {
                            "total_calls": 0,
                            "total_tokens": 0,
                            "total_latency_ms": 0,
                            "successful_calls": 0,
                            "failed_calls": 0
                        }
                    hour_data["total_calls"] = hour_data.get("total_calls", 0) + 1
                    hour_data["total_tokens"] = hour_data.get("total_tokens", 0) + metrics.tokens_used
                    hour_data["total_latency_ms"] = hour_data.get("total_latency_ms", 0) + int(metrics.latency_ms)
                    if metrics.success:
                        hour_data["successful_calls"] = hour_data.get("successful_calls", 0) + 1
                    else:
                        hour_data["failed_calls"] = hour_data.get("failed_calls", 0) + 1
                    redis.set(hour_key, json.dumps(hour_data), ex=30 * 24 * 60 * 60)  # 30 days
                elif hasattr(redis, 'hincrby'):
                    # Standard Redis - use hash operations
                    redis.hincrby(hour_key, "total_calls", 1)
                    redis.hincrby(hour_key, "total_tokens", metrics.tokens_used)
                    redis.hincrby(hour_key, "total_latency_ms", int(metrics.latency_ms))
                    if metrics.success:
                        redis.hincrby(hour_key, "successful_calls", 1)
                    else:
                        redis.hincrby(hour_key, "failed_calls", 1)
                    if hasattr(redis, 'expire'):
                        redis.expire(hour_key, 30 * 24 * 60 * 60)  # 30 days
            except (AttributeError, TypeError) as e:
                logger.warning(f"Error updating aggregated metrics: {e}", exc_info=True)
            
        except Exception as e:
            logger.error(f"Error recording metrics: {e}", exc_info=True)
    
    def get_llm_stats(self, provider: str, hours: int = 24) -> Dict[str, Any]:
        """
        Get aggregated LLM statistics.
        
        Args:
            provider: Provider name
            hours: Number of hours to aggregate
            
        Returns:
            Dictionary with statistics
        """
        redis = get_redis_client()
        if redis is None:
            return {}
        
        try:
            current_hour = int(time.time() // 3600)
            total_calls = 0
            total_tokens = 0
            total_latency = 0
            successful_calls = 0
            failed_calls = 0
            
            for hour_offset in range(hours):
                hour_key = f"{self.redis_key_prefix}:llm:hourly:{provider}:{current_hour - hour_offset}"
                try:
                    if hasattr(redis, 'hget'):
                        calls = redis.hget(hour_key, "total_calls")
                        tokens = redis.hget(hour_key, "total_tokens")
                        latency = redis.hget(hour_key, "total_latency_ms")
                        success = redis.hget(hour_key, "successful_calls")
                        failed = redis.hget(hour_key, "failed_calls")
                    else:
                        # Upstash fallback
                        data_str = redis.get(hour_key)
                        if data_str:
                            import json
                            data = json.loads(data_str)
                            calls = data.get("total_calls")
                            tokens = data.get("total_tokens")
                            latency = data.get("total_latency_ms")
                            success = data.get("successful_calls")
                            failed = data.get("failed_calls")
                        else:
                            calls = tokens = latency = success = failed = None
                    
                    if calls:
                        total_calls += int(calls)
                    if tokens:
                        total_tokens += int(tokens)
                    if latency:
                        total_latency += int(latency)
                    if success:
                        successful_calls += int(success)
                    if failed:
                        failed_calls += int(failed)
                except (AttributeError, TypeError, ValueError) as e:
                    logger.warning(f"Error reading metrics for {hour_key}: {e}")
                    continue
            
            avg_latency = total_latency / total_calls if total_calls > 0 else 0
            success_rate = successful_calls / total_calls if total_calls > 0 else 0
            
            return {
                "provider": provider,
                "period_hours": hours,
                "total_calls": total_calls,
                "total_tokens": total_tokens,
                "successful_calls": successful_calls,
                "failed_calls": failed_calls,
                "success_rate": success_rate,
                "avg_latency_ms": avg_latency,
                "tokens_per_call": total_tokens / total_calls if total_calls > 0 else 0
            }
        except Exception as e:
            logger.error(f"Error getting LLM stats: {e}", exc_info=True)
            return {}


# Global metrics collector instance
metrics_collector = MetricsCollector()


def record_llm_metrics(
    provider: str,
    model: str,
    tokens_used: int,
    latency_ms: float,
    success: bool,
    error_type: Optional[str] = None
) -> None:
    """
    Convenience function to record LLM metrics.
    
    Args:
        provider: Provider name
        model: Model name
        tokens_used: Number of tokens used
        latency_ms: Latency in milliseconds
        success: Whether call was successful
        error_type: Error type if failed
    """
    metrics = LLMMetrics(
        provider=provider,
        model=model,
        tokens_used=tokens_used,
        latency_ms=latency_ms,
        success=success,
        error_type=error_type
    )
    metrics_collector.record_llm_call(metrics)



