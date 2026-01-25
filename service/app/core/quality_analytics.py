"""Quality analytics for aggregating and analyzing quality metrics by model/provider."""
import logging
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from app.core.redis import get_redis_client
from app.core.quality_storage import quality_storage

logger = logging.getLogger(__name__)


def aggregate_quality_by_model(hours: int = 24) -> Dict[str, Any]:
    """
    Aggregate quality scores by model/provider.
    
    Args:
        hours: Number of hours to look back
        
    Returns:
        Dictionary with quality metrics per model/provider
    """
    redis = get_redis_client()
    if redis is None:
        logger.warning("Redis unavailable for quality analytics")
        return {}
    
    try:
        # Get all quality scores from the time window
        current_time = time.time()
        cutoff_time = current_time - (hours * 3600)
        
        # Query all quality events from Redis
        # We'll iterate through debate keys and aggregate
        model_stats: Dict[str, Dict[str, Any]] = {}
        
        # Get all debate keys
        debate_keys = []
        try:
            # Scan for quality:debate:* keys
            cursor = 0
            while True:
                if hasattr(redis, 'scan'):
                    cursor, keys = redis.scan(cursor, match="quality:debate:*", count=100)
                    debate_keys.extend(keys)
                    if cursor == 0:
                        break
                else:
                    # Fallback: try to get all keys (less efficient)
                    break
        except Exception as e:
            logger.warning(f"Error scanning debate keys: {e}")
        
        # For each debate, get scores and aggregate by model/provider
        for debate_key in debate_keys[:100]:  # Limit to first 100 debates for performance
            try:
                # Extract debate_id from key (format: quality:debate:{debate_id})
                if isinstance(debate_key, bytes):
                    debate_key = debate_key.decode('utf-8')
                debate_id = debate_key.split(':')[-1] if ':' in debate_key else None
                
                if not debate_id:
                    continue
                
                scores = quality_storage.get_debate_scores(debate_id)
                
                for score in scores:
                    # Check timestamp
                    score_timestamp = score.get('timestamp')
                    if score_timestamp:
                        try:
                            if float(score_timestamp) < cutoff_time:
                                continue
                        except (ValueError, TypeError):
                            pass
                    
                    model = score.get('model') or 'unknown'
                    provider = score.get('provider') or 'unknown'
                    model_key = f"{provider}:{model}"
                    
                    if model_key not in model_stats:
                        model_stats[model_key] = {
                            "model": model,
                            "provider": provider,
                            "scores": [],
                            "count": 0,
                            "total_score": 0.0
                        }
                    
                    overall_score = score.get('overall_score', 0.0)
                    if overall_score:
                        model_stats[model_key]["scores"].append(overall_score)
                        model_stats[model_key]["count"] += 1
                        model_stats[model_key]["total_score"] += overall_score
            except Exception as e:
                logger.debug(f"Error processing debate {debate_key}: {e}")
                continue
        
        # Calculate averages
        result = {}
        for model_key, stats in model_stats.items():
            if stats["count"] > 0:
                result[model_key] = {
                    "model": stats["model"],
                    "provider": stats["provider"],
                    "average_score": stats["total_score"] / stats["count"],
                    "event_count": stats["count"],
                    "min_score": min(stats["scores"]) if stats["scores"] else 0.0,
                    "max_score": max(stats["scores"]) if stats["scores"] else 0.0,
                }
        
        return result
        
    except Exception as e:
        logger.error(f"Error aggregating quality by model: {e}", exc_info=True)
        return {}


def get_quality_trends(hours: int = 24, interval_hours: int = 1) -> List[Dict[str, Any]]:
    """
    Get quality trends over time.
    
    Args:
        hours: Total hours to look back
        interval_hours: Interval for each data point
        
    Returns:
        List of quality metrics per interval
    """
    try:
        trends = []
        current_hour = int(time.time() // 3600)
        
        for i in range(0, hours, interval_hours):
            hour_timestamp = current_hour - i
            stats = quality_storage.get_stats(hours=interval_hours)
            
            if stats and stats.get("total_events", 0) > 0:
                trends.append({
                    "timestamp": hour_timestamp * 3600,
                    "average_score": stats.get("average_score", 0.0),
                    "event_count": stats.get("total_events", 0)
                })
        
        return sorted(trends, key=lambda x: x["timestamp"])
        
    except Exception as e:
        logger.error(f"Error getting quality trends: {e}", exc_info=True)
        return []


def get_model_recommendations(tier: str = "standard", min_events: int = 10) -> List[Dict[str, Any]]:
    """
    Get model recommendations based on quality scores.
    
    Args:
        tier: Model tier (cheap/standard/expensive)
        min_events: Minimum number of events to consider
        
    Returns:
        List of recommended models sorted by quality
    """
    model_stats = aggregate_quality_by_model(hours=168)  # Last 7 days
    
    recommendations = []
    for model_key, stats in model_stats.items():
        if stats["event_count"] >= min_events:
            recommendations.append({
                "model_key": model_key,
                "model": stats["model"],
                "provider": stats["provider"],
                "average_score": stats["average_score"],
                "event_count": stats["event_count"],
                "reliability": "high" if stats["event_count"] >= 50 else "medium" if stats["event_count"] >= 20 else "low"
            })
    
    # Sort by average score descending
    recommendations.sort(key=lambda x: x["average_score"], reverse=True)
    
    return recommendations


























