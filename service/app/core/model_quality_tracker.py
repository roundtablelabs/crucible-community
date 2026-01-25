"""Model quality tracking for routing decisions."""
import logging
import time
from typing import Dict, Optional, List
from dataclasses import dataclass

from app.core.redis import get_redis_client
from app.core.quality_analytics import aggregate_quality_by_model

logger = logging.getLogger(__name__)


@dataclass
class ModelQuality:
    """Quality metrics for a model."""
    model: str
    provider: str
    average_score: float
    event_count: int
    last_updated: float


class ModelQualityTracker:
    """Track and cache model quality metrics for routing decisions."""
    
    def __init__(self):
        self.redis_key_prefix = "quality:model"
        self.cache_ttl = 3600  # 1 hour cache
        self._cache: Dict[str, ModelQuality] = {}
        self._cache_timestamp: Dict[str, float] = {}
    
    def _get_cache_key(self, model: str, provider: str) -> str:
        """Generate cache key for model/provider."""
        return f"{self.redis_key_prefix}:{provider}:{model}"
    
    def get_model_quality(self, model: str, provider: str) -> Optional[ModelQuality]:
        """
        Get quality metrics for a specific model/provider.
        
        Args:
            model: Model name
            provider: Provider name
            
        Returns:
            ModelQuality if available, None otherwise
        """
        cache_key = self._get_cache_key(model, provider)
        current_time = time.time()
        
        # Check in-memory cache first
        if cache_key in self._cache:
            if cache_key in self._cache_timestamp:
                if current_time - self._cache_timestamp[cache_key] < self.cache_ttl:
                    return self._cache[cache_key]
        
        # Check Redis cache
        redis = get_redis_client()
        if redis:
            try:
                redis_key = cache_key
                redis_type = str(type(redis))
                is_upstash = 'upstash' in redis_type.lower()
                
                if is_upstash:
                    data_str = redis.get(redis_key)
                    if data_str:
                        import json
                        if isinstance(data_str, bytes):
                            data_str = data_str.decode('utf-8')
                        data = json.loads(data_str)
                        quality = ModelQuality(
                            model=data["model"],
                            provider=data["provider"],
                            average_score=float(data["average_score"]),
                            event_count=int(data["event_count"]),
                            last_updated=float(data.get("last_updated", current_time))
                        )
                        self._cache[cache_key] = quality
                        self._cache_timestamp[cache_key] = current_time
                        return quality
            except Exception as e:
                logger.debug(f"Error reading from Redis cache: {e}")
        
        # Query from analytics (slower)
        try:
            model_stats = aggregate_quality_by_model(hours=168)  # Last 7 days
            model_key = f"{provider}:{model}"
            
            if model_key in model_stats:
                stats = model_stats[model_key]
                quality = ModelQuality(
                    model=stats["model"],
                    provider=stats["provider"],
                    average_score=stats["average_score"],
                    event_count=stats["event_count"],
                    last_updated=current_time
                )
                
                # Cache it
                self._cache[cache_key] = quality
                self._cache_timestamp[cache_key] = current_time
                
                # Store in Redis
                if redis:
                    try:
                        import json
                        data = {
                            "model": quality.model,
                            "provider": quality.provider,
                            "average_score": quality.average_score,
                            "event_count": quality.event_count,
                            "last_updated": quality.last_updated
                        }
                        if is_upstash:
                            redis.set(redis_key, json.dumps(data))
                            redis.expire(redis_key, self.cache_ttl)
                    except Exception as e:
                        logger.debug(f"Error caching in Redis: {e}")
                
                return quality
        except Exception as e:
            logger.debug(f"Error querying analytics: {e}")
        
        return None
    
    def get_best_model(self, tier: str = "standard", min_quality: float = 0.5) -> Optional[tuple[str, str]]:
        """
        Get the best performing model for a given tier.
        
        Args:
            tier: Model tier (cheap/standard/expensive)
            min_quality: Minimum quality threshold
            
        Returns:
            Tuple of (provider, model) or None if no suitable model found
        """
        # Map tier to common models
        tier_models = {
            "cheap": [
                ("openrouter", "openai/gpt-4o-mini"),
                ("openai", "gpt-4o-mini"),
            ],
            "standard": [
                ("openrouter", "openai/gpt-4o"),
                ("openai", "gpt-4o"),
            ],
            "expensive": [
                ("openrouter", "openai/gpt-4o"),
                ("openai", "gpt-4o"),
            ]
        }
        
        candidates = tier_models.get(tier, tier_models["standard"])
        best_model = None
        best_score = min_quality
        
        for provider, model in candidates:
            quality = self.get_model_quality(model, provider)
            if quality and quality.average_score >= best_score and quality.event_count >= 10:
                if quality.average_score > best_score:
                    best_score = quality.average_score
                    best_model = (provider, model)
        
        return best_model
    
    def get_models_by_quality(self, min_events: int = 10) -> List[ModelQuality]:
        """
        Get all models sorted by quality.
        
        Args:
            min_events: Minimum number of events to consider
            
        Returns:
            List of ModelQuality sorted by average_score descending
        """
        model_stats = aggregate_quality_by_model(hours=168)
        
        qualities = []
        for model_key, stats in model_stats.items():
            if stats["event_count"] >= min_events:
                qualities.append(ModelQuality(
                    model=stats["model"],
                    provider=stats["provider"],
                    average_score=stats["average_score"],
                    event_count=stats["event_count"],
                    last_updated=time.time()
                ))
        
        qualities.sort(key=lambda x: x.average_score, reverse=True)
        return qualities


# Global instance
model_quality_tracker = ModelQualityTracker()


























