"""Quality score storage for debate event evaluations."""
import logging
import time
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


@dataclass
class QualityScore:
    """Quality score for a debate event."""
    debate_id: str
    event_id: str
    overall_score: float
    faithfulness: Optional[float] = None
    citation_quality: Optional[float] = None
    hallucination_risk: Optional[float] = None
    relevance: Optional[float] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    timestamp: float = field(default_factory=lambda: time.time())


class QualityStorage:
    """Store and retrieve quality scores."""
    
    def __init__(self):
        self.redis_key_prefix = "quality"
        # Default TTL: 90 days (longer than metrics for historical analysis)
        self.ttl_seconds = 90 * 24 * 60 * 60
    
    def store_score(self, score: QualityScore) -> None:
        """
        Store a quality score.
        
        Args:
            score: Quality score to store
        """
        redis = get_redis_client()
        if redis is None:
            logger.warning("Redis unavailable, quality score not stored")
            return
        
        try:
            # Store individual event score
            event_key = f"{self.redis_key_prefix}:event:{score.debate_id}:{score.event_id}"
            data = {
                "debate_id": score.debate_id,
                "event_id": score.event_id,
                "overall_score": str(score.overall_score),
                "faithfulness": str(score.faithfulness) if score.faithfulness is not None else "",
                "citation_quality": str(score.citation_quality) if score.citation_quality is not None else "",
                "hallucination_risk": str(score.hallucination_risk) if score.hallucination_risk is not None else "",
                "relevance": str(score.relevance) if score.relevance is not None else "",
                "model": score.model or "",
                "provider": score.provider or "",
                "timestamp": str(score.timestamp)
            }
            
            # Store as hash
            # Check if it's Upstash Redis by checking the module/class name
            redis_type = str(type(redis))
            is_upstash = 'upstash' in redis_type.lower()
            
            if is_upstash:
                # Upstash Redis - store as JSON string with expiration in one call
                redis.set(event_key, json.dumps(data), ex=self.ttl_seconds)
            elif hasattr(redis, 'hset'):
                # Standard Redis - try with mapping first
                try:
                    redis.hset(event_key, mapping=data)
                    # Set expiration separately for standard Redis
                    if hasattr(redis, 'expire'):
                        redis.expire(event_key, self.ttl_seconds)
                    elif hasattr(redis, 'expire_at'):
                        redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
                except (TypeError, AttributeError):
                    # Fallback: set each field individually
                    for key, value in data.items():
                        redis.hset(event_key, key, value)
                    if hasattr(redis, 'expire'):
                        redis.expire(event_key, self.ttl_seconds)
                    elif hasattr(redis, 'expire_at'):
                        redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
            else:
                # Final fallback - store as JSON string with expiration
                try:
                    redis.set(event_key, json.dumps(data), ex=self.ttl_seconds)
                except TypeError:
                    # If ex parameter not supported, use separate calls
                    redis.set(event_key, json.dumps(data))
                    if hasattr(redis, 'expire'):
                        redis.expire(event_key, self.ttl_seconds)
                    elif hasattr(redis, 'expire_at'):
                        redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
            
            # Also update debate-level aggregation
            debate_key = f"{self.redis_key_prefix}:debate:{score.debate_id}"
            events_list_key = f"{debate_key}:events"
            if hasattr(redis, 'lpush'):
                # Store event IDs in a list for this debate
                redis.lpush(events_list_key, score.event_id)
                # Set expiration (check if key exists first to avoid unnecessary expire calls)
                if hasattr(redis, 'expire'):
                    redis.expire(events_list_key, self.ttl_seconds)
                elif hasattr(redis, 'expire_at'):
                    redis.expire_at(events_list_key, int(score.timestamp) + self.ttl_seconds)
            
            # Update hourly aggregation for statistics
            hour_timestamp = int(score.timestamp // 3600)
            hour_key = f"{self.redis_key_prefix}:hourly:{hour_timestamp}"
            
            try:
                # Check if it's Upstash Redis (must check first to avoid hash operations)
                redis_type = str(type(redis))
                is_upstash = 'upstash' in redis_type.lower()
                
                if is_upstash:
                    # Upstash Redis - use JSON storage with expiration in one call
                    # Upstash REST API doesn't support hset/hincrby operations
                    try:
                        existing = redis.get(hour_key)
                        if existing:
                            if isinstance(existing, bytes):
                                existing = existing.decode('utf-8')
                            hour_data = json.loads(existing)
                        else:
                            hour_data = {"total_events": 0, "total_score": 0.0}
                        hour_data["total_events"] = hour_data.get("total_events", 0) + 1
                        hour_data["total_score"] = hour_data.get("total_score", 0.0) + score.overall_score
                        redis.set(hour_key, json.dumps(hour_data), ex=self.ttl_seconds)
                    except Exception as e:
                        logger.warning(f"Error updating hourly aggregation (Upstash): {e}")
                elif hasattr(redis, 'hincrby') and not is_upstash:
                    # Standard Redis - use hash operations (only if NOT Upstash)
                    try:
                        redis.hincrby(hour_key, "total_events", 1)
                        # Use hincrbyfloat if available
                        if hasattr(redis, 'hincrbyfloat'):
                            redis.hincrbyfloat(hour_key, "total_score", score.overall_score)
                        else:
                            # Fallback: get current, add, set
                            if hasattr(redis, 'hget'):
                                current = redis.hget(hour_key, "total_score")
                                new_total = (float(current) if current else 0.0) + score.overall_score
                                # Use mapping parameter for hset to avoid argument count issues
                                if hasattr(redis, 'hset'):
                                    try:
                                        redis.hset(hour_key, mapping={"total_score": str(new_total)})
                                    except (TypeError, AttributeError):
                                        # Fallback to individual field set
                                        redis.hset(hour_key, "total_score", str(new_total))
                        
                        # Set expiration (check if key exists first to avoid unnecessary expire calls)
                        if hasattr(redis, 'expire'):
                            redis.expire(hour_key, self.ttl_seconds)
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(hour_key, int(score.timestamp) + self.ttl_seconds)
                    except Exception as e:
                        logger.warning(f"Error updating hourly aggregation (standard Redis): {e}")
                else:
                    # Final fallback - use JSON storage
                    try:
                        existing = redis.get(hour_key)
                        if existing:
                            if isinstance(existing, bytes):
                                existing = existing.decode('utf-8')
                            hour_data = json.loads(existing)
                        else:
                            hour_data = {"total_events": 0, "total_score": 0.0}
                        hour_data["total_events"] = hour_data.get("total_events", 0) + 1
                        hour_data["total_score"] = hour_data.get("total_score", 0.0) + score.overall_score
                        redis.set(hour_key, json.dumps(hour_data), ex=self.ttl_seconds)
                    except Exception as e:
                        logger.warning(f"Error updating hourly aggregation (fallback): {e}")
            except Exception as e:
                logger.warning(f"Error updating hourly aggregation: {e}", exc_info=True)
            
        except Exception as e:
            logger.error(f"Error storing quality score: {e}", exc_info=True)
    
    def store_scores_batch(self, scores: List[QualityScore]) -> None:
        """
        Store multiple quality scores efficiently by batching Redis operations.
        
        This method significantly reduces the number of Redis requests by:
        - Batching event writes
        - Reading hourly aggregations once per unique hour
        - Updating debate-level lists efficiently
        
        Args:
            scores: List of quality scores to store
        """
        if not scores:
            return
        
        redis = get_redis_client()
        if redis is None:
            logger.warning("Redis unavailable, quality scores not stored")
            return
        
        try:
            redis_type = str(type(redis))
            is_upstash = 'upstash' in redis_type.lower()
            
            # Group scores by debate_id and hour_timestamp for efficient aggregation
            debate_events: Dict[str, List[str]] = {}  # debate_id -> list of event_ids
            debate_first_timestamp: Dict[str, float] = {}  # debate_id -> first timestamp for expiration
            hour_aggregations: Dict[int, Dict[str, Any]] = {}  # hour_timestamp -> aggregation data
            hour_first_timestamp: Dict[int, float] = {}  # hour_timestamp -> first timestamp for expiration
            
            # First pass: prepare all data structures
            for score in scores:
                # Track debate-level events
                if score.debate_id not in debate_events:
                    debate_events[score.debate_id] = []
                    debate_first_timestamp[score.debate_id] = score.timestamp
                debate_events[score.debate_id].append(score.event_id)
                
                # Track hourly aggregations
                hour_timestamp = int(score.timestamp // 3600)
                if hour_timestamp not in hour_aggregations:
                    hour_aggregations[hour_timestamp] = {"total_events": 0, "total_score": 0.0}
                    hour_first_timestamp[hour_timestamp] = score.timestamp
                hour_aggregations[hour_timestamp]["total_events"] += 1
                hour_aggregations[hour_timestamp]["total_score"] += score.overall_score
            
            # Read existing hourly aggregations (one read per unique hour)
            for hour_timestamp, hour_data in hour_aggregations.items():
                hour_key = f"{self.redis_key_prefix}:hourly:{hour_timestamp}"
                try:
                    if is_upstash:
                        existing = redis.get(hour_key)
                        if existing:
                            if isinstance(existing, bytes):
                                existing = existing.decode('utf-8')
                            existing_data = json.loads(existing)
                            hour_data["total_events"] += existing_data.get("total_events", 0)
                            hour_data["total_score"] += existing_data.get("total_score", 0.0)
                    elif hasattr(redis, 'hget'):
                        existing_events = redis.hget(hour_key, "total_events")
                        existing_score = redis.hget(hour_key, "total_score")
                        if existing_events:
                            hour_data["total_events"] += int(existing_events)
                        if existing_score:
                            hour_data["total_score"] += float(existing_score)
                except Exception as e:
                    logger.warning(f"Error reading hourly aggregation for {hour_key}: {e}")
            
            # Batch write all event scores
            for score in scores:
                event_key = f"{self.redis_key_prefix}:event:{score.debate_id}:{score.event_id}"
                data = {
                    "debate_id": score.debate_id,
                    "event_id": score.event_id,
                    "overall_score": str(score.overall_score),
                    "faithfulness": str(score.faithfulness) if score.faithfulness is not None else "",
                    "citation_quality": str(score.citation_quality) if score.citation_quality is not None else "",
                    "hallucination_risk": str(score.hallucination_risk) if score.hallucination_risk is not None else "",
                    "relevance": str(score.relevance) if score.relevance is not None else "",
                    "model": score.model or "",
                    "provider": score.provider or "",
                    "timestamp": str(score.timestamp)
                }
                
                if is_upstash:
                    # Upstash Redis - store as JSON string with expiration
                    redis.set(event_key, json.dumps(data), ex=self.ttl_seconds)
                elif hasattr(redis, 'hset'):
                    try:
                        redis.hset(event_key, mapping=data)
                        if hasattr(redis, 'expire'):
                            redis.expire(event_key, self.ttl_seconds)
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
                    except (TypeError, AttributeError):
                        for key, value in data.items():
                            redis.hset(event_key, key, value)
                        if hasattr(redis, 'expire'):
                            redis.expire(event_key, self.ttl_seconds)
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
                else:
                    try:
                        redis.set(event_key, json.dumps(data), ex=self.ttl_seconds)
                    except TypeError:
                        redis.set(event_key, json.dumps(data))
                        if hasattr(redis, 'expire'):
                            redis.expire(event_key, self.ttl_seconds)
                        elif hasattr(redis, 'expire_at'):
                            redis.expire_at(event_key, int(score.timestamp) + self.ttl_seconds)
            
            # Batch update debate-level event lists
            for debate_id, event_ids in debate_events.items():
                debate_key = f"{self.redis_key_prefix}:debate:{debate_id}"
                events_list_key = f"{debate_key}:events"
                if hasattr(redis, 'lpush'):
                    # Push all event IDs for this debate
                    for event_id in event_ids:
                        redis.lpush(events_list_key, event_id)
                    # Set expiration once per debate
                    if hasattr(redis, 'expire'):
                        redis.expire(events_list_key, self.ttl_seconds)
                    elif hasattr(redis, 'expire_at'):
                        # Use timestamp from first score for this debate
                        first_timestamp = debate_first_timestamp.get(debate_id, time.time())
                        redis.expire_at(events_list_key, int(first_timestamp) + self.ttl_seconds)
            
            # Batch write hourly aggregations (one write per unique hour)
            for hour_timestamp, hour_data in hour_aggregations.items():
                hour_key = f"{self.redis_key_prefix}:hourly:{hour_timestamp}"
                try:
                    if is_upstash:
                        redis.set(hour_key, json.dumps(hour_data), ex=self.ttl_seconds)
                    elif hasattr(redis, 'hset'):
                        redis.hset(hour_key, mapping={
                            "total_events": str(hour_data["total_events"]),
                            "total_score": str(hour_data["total_score"])
                        })
                        if hasattr(redis, 'expire'):
                            redis.expire(hour_key, self.ttl_seconds)
                        elif hasattr(redis, 'expire_at'):
                            # Use timestamp from first score for this hour
                            first_timestamp = hour_first_timestamp.get(hour_timestamp, time.time())
                            redis.expire_at(hour_key, int(first_timestamp) + self.ttl_seconds)
                except Exception as e:
                    logger.warning(f"Error writing hourly aggregation for {hour_key}: {e}")
            
            logger.debug(f"Batch stored {len(scores)} quality scores with {len(debate_events)} debates and {len(hour_aggregations)} hourly aggregations")
            
        except Exception as e:
            logger.error(f"Error batch storing quality scores: {e}", exc_info=True)
    
    def get_debate_scores(self, debate_id: str) -> List[Dict[str, Any]]:
        """
        Get all quality scores for a debate.
        
        Args:
            debate_id: Debate session ID
            
        Returns:
            List of quality score dictionaries
        """
        redis = get_redis_client()
        if redis is None:
            return []
        
        try:
            debate_key = f"{self.redis_key_prefix}:debate:{debate_id}"
            events_key = f"{debate_key}:events"
            
            # Get list of event IDs
            if hasattr(redis, 'lrange'):
                event_ids = redis.lrange(events_key, 0, -1)
            elif hasattr(redis, 'get'):
                # Upstash fallback - would need different structure
                event_ids = []
            else:
                event_ids = []
            
            scores = []
            for event_id in event_ids:
                if isinstance(event_id, bytes):
                    event_id = event_id.decode('utf-8')
                
                event_key = f"{self.redis_key_prefix}:event:{debate_id}:{event_id}"
                
                # Check if it's Upstash Redis
                redis_type = str(type(redis))
                is_upstash = 'upstash' in redis_type.lower()
                
                if is_upstash or not hasattr(redis, 'hgetall'):
                    # Upstash Redis or no hgetall - use get with JSON
                    data_str = redis.get(event_key)
                    if data_str:
                        if isinstance(data_str, bytes):
                            data_str = data_str.decode('utf-8')
                        score_data = json.loads(data_str)
                        # Convert numeric strings back to floats
                        if 'overall_score' in score_data:
                            score_data['overall_score'] = float(score_data['overall_score'])
                        for key in ['faithfulness', 'citation_quality', 'hallucination_risk', 'relevance']:
                            if key in score_data and score_data[key]:
                                try:
                                    score_data[key] = float(score_data[key])
                                except (ValueError, TypeError):
                                    score_data[key] = None
                        scores.append(score_data)
                elif hasattr(redis, 'hgetall'):
                    # Standard Redis - use hgetall
                    data = redis.hgetall(event_key)
                    if data:
                        # Convert bytes to strings
                        score_data = {
                            k.decode('utf-8') if isinstance(k, bytes) else k: 
                            v.decode('utf-8') if isinstance(v, bytes) else v
                            for k, v in data.items()
                        }
                        # Convert numeric strings back to floats
                        if 'overall_score' in score_data:
                            score_data['overall_score'] = float(score_data['overall_score'])
                        for key in ['faithfulness', 'citation_quality', 'hallucination_risk', 'relevance']:
                            if key in score_data and score_data[key]:
                                try:
                                    score_data[key] = float(score_data[key])
                                except (ValueError, TypeError):
                                    score_data[key] = None
                        scores.append(score_data)
            
            return scores
            
        except Exception as e:
            logger.error(f"Error getting debate scores: {e}", exc_info=True)
            return []
    
    def get_stats(self, hours: int = 24) -> Dict[str, Any]:
        """
        Get aggregated quality statistics.
        
        Args:
            hours: Number of hours to aggregate
            
        Returns:
            Dictionary with statistics
        """
        redis = get_redis_client()
        if redis is None:
            return {}
        
        try:
            current_hour = int(time.time() // 3600)
            total_events = 0
            total_score = 0.0
            
            for hour_offset in range(hours):
                hour_key = f"{self.redis_key_prefix}:hourly:{current_hour - hour_offset}"
                
                try:
                    # Check if it's Upstash Redis
                    redis_type = str(type(redis))
                    is_upstash = 'upstash' in redis_type.lower()
                    
                    if is_upstash:
                        # Upstash Redis - use JSON storage
                        data_str = redis.get(hour_key)
                        if data_str:
                            if isinstance(data_str, bytes):
                                data_str = data_str.decode('utf-8')
                            data = json.loads(data_str)
                            events = data.get("total_events")
                            score = data.get("total_score")
                        else:
                            events = score = None
                    elif hasattr(redis, 'hget'):
                        # Standard Redis - use hash operations
                        events = redis.hget(hour_key, "total_events")
                        score = redis.hget(hour_key, "total_score")
                    else:
                        # Fallback
                        events = score = None
                    
                    if events:
                        total_events += int(events)
                    if score:
                        total_score += float(score)
                except (AttributeError, TypeError, ValueError) as e:
                    logger.warning(f"Error reading quality stats for {hour_key}: {e}")
                    continue
            
            avg_score = total_score / total_events if total_events > 0 else 0.0
            
            return {
                "period_hours": hours,
                "total_events": total_events,
                "average_score": avg_score,
                "total_score": total_score
            }
        except Exception as e:
            logger.error(f"Error getting quality stats: {e}", exc_info=True)
            return {}
    
    def check_quality_threshold(self, threshold: float = 0.7, hours: int = 1) -> Dict[str, Any]:
        """
        Check if quality has dropped below threshold.
        
        Args:
            threshold: Quality threshold (0.0 to 1.0)
            hours: Time window to check
            
        Returns:
            Dictionary with alert information if threshold breached
        """
        stats = self.get_stats(hours=hours)
        
        if not stats or stats.get("total_events", 0) == 0:
            return {"alert": False}
        
        avg_score = stats.get("average_score", 0.0)
        total_events = stats.get("total_events", 0)
        
        if avg_score < threshold:
            return {
                "alert": True,
                "threshold": threshold,
                "current_average": avg_score,
                "events_checked": total_events,
                "period_hours": hours,
                "message": f"Quality dropped below threshold: {avg_score:.2f} < {threshold:.2f}"
            }
        
        return {
            "alert": False,
            "current_average": avg_score,
            "events_checked": total_events
        }
    
    def get_model_stats(self, hours: int = 168) -> Dict[str, Any]:
        """
        Get quality statistics aggregated by model/provider.
        
        This is a helper method for Phase 3 analytics.
        Since we already store model/provider with each score,
        we can query existing data.
        
        Args:
            hours: Number of hours to look back (default 7 days)
            
        Returns:
            Dictionary with model/provider statistics
        """
        # This leverages existing data structure
        # Individual scores already have model/provider
        # Analytics module can query and aggregate
        # This method is a convenience wrapper
        from app.core.quality_analytics import aggregate_quality_by_model
        return aggregate_quality_by_model(hours=hours)


# Global quality storage instance
quality_storage = QualityStorage()


def store_quality_score(
    debate_id: str,
    event_id: str,
    overall_score: float,
    metrics: Optional[Dict[str, float]] = None,
    model: Optional[str] = None,
    provider: Optional[str] = None
) -> None:
    """
    Convenience function to store quality score.
    
    Args:
        debate_id: Debate session ID
        event_id: Event ID
        overall_score: Overall quality score (0.0 to 1.0)
        metrics: Optional dictionary with individual metric scores
        model: Model used
        provider: Provider used
    """
    score = QualityScore(
        debate_id=debate_id,
        event_id=event_id,
        overall_score=overall_score,
        faithfulness=metrics.get("faithfulness") if metrics else None,
        citation_quality=metrics.get("citation_quality") if metrics else None,
        hallucination_risk=metrics.get("hallucination_rate") if metrics else None,
        relevance=metrics.get("relevance") if metrics else None,
        model=model,
        provider=provider
    )
    quality_storage.store_score(score)


def store_quality_scores_batch(
    scores: List[Dict[str, Any]]
) -> None:
    """
    Convenience function to batch store quality scores.
    
    Args:
        scores: List of dictionaries with keys: debate_id, event_id, overall_score,
                and optionally: metrics, model, provider
    """
    quality_scores = []
    for score_dict in scores:
        metrics = score_dict.get("metrics")
        score = QualityScore(
            debate_id=score_dict["debate_id"],
            event_id=score_dict["event_id"],
            overall_score=score_dict["overall_score"],
            faithfulness=metrics.get("faithfulness") if metrics else None,
            citation_quality=metrics.get("citation_quality") if metrics else None,
            hallucination_risk=metrics.get("hallucination_rate") if metrics else None,
            relevance=metrics.get("relevance") if metrics else None,
            model=score_dict.get("model"),
            provider=score_dict.get("provider")
        )
        quality_scores.append(score)
    
    if quality_scores:
        quality_storage.store_scores_batch(quality_scores)

