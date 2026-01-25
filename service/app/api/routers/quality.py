"""Admin-only endpoints for quality score monitoring."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentUser, get_current_user
from app.core.quality_storage import quality_storage

router = APIRouter(prefix="/admin/quality", tags=["admin", "quality"])
logger = logging.getLogger(__name__)


def ensure_admin(user: CurrentUser) -> None:
    """Require admin role for quality monitoring access."""
    if user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )


@router.get("/stats")
async def get_quality_stats(
    hours: int = Query(24, description="Number of hours to aggregate", ge=1, le=720),
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Get aggregated quality statistics.
    
    Requires admin role.
    """
    ensure_admin(current_user)
    
    stats = quality_storage.get_stats(hours=hours)
    return stats


@router.get("/debate/{debate_id}")
async def get_debate_quality(
    debate_id: str,
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Get quality scores for a specific debate.
    
    Requires admin role.
    """
    ensure_admin(current_user)
    
    scores = quality_storage.get_debate_scores(debate_id)
    avg_score = sum(s.get("overall_score", 0) for s in scores) / len(scores) if scores else 0.0
    
    return {
        "debate_id": debate_id,
        "event_count": len(scores),
        "events": scores,
        "average_score": avg_score
    }


@router.get("/alert")
async def check_quality_alert(
    threshold: float = Query(0.7, description="Quality threshold", ge=0.0, le=1.0),
    hours: int = Query(1, description="Time window in hours", ge=1, le=24),
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Check if quality has dropped below threshold.
    
    Useful for monitoring and alerting.
    Requires admin role.
    """
    ensure_admin(current_user)
    
    alert_info = quality_storage.check_quality_threshold(threshold=threshold, hours=hours)
    return alert_info


@router.get("/models")
async def get_quality_by_models(
    hours: int = Query(24, description="Number of hours to aggregate", ge=1, le=720),
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Get quality metrics aggregated by model/provider.
    
    Requires admin role.
    """
    ensure_admin(current_user)
    
    from app.core.quality_analytics import aggregate_quality_by_model
    
    model_stats = aggregate_quality_by_model(hours=hours)
    return {
        "period_hours": hours,
        "models": model_stats
    }


@router.get("/trends")
async def get_quality_trends(
    hours: int = Query(24, description="Number of hours to look back", ge=1, le=720),
    interval_hours: int = Query(1, description="Interval for each data point", ge=1, le=24),
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Get quality trends over time.
    
    Requires admin role.
    """
    ensure_admin(current_user)
    
    from app.core.quality_analytics import get_quality_trends
    
    trends = get_quality_trends(hours=hours, interval_hours=interval_hours)
    return {
        "period_hours": hours,
        "interval_hours": interval_hours,
        "trends": trends
    }


@router.get("/recommendations")
async def get_model_recommendations(
    tier: str = Query("standard", description="Model tier", regex="^(cheap|standard|expensive)$"),
    min_events: int = Query(10, description="Minimum events to consider", ge=1),
    current_user: CurrentUser = Depends(get_current_user)
) -> dict:
    """
    Get model recommendations based on quality scores.
    
    Requires admin role.
    """
    ensure_admin(current_user)
    
    from app.core.quality_analytics import get_model_recommendations
    
    recommendations = get_model_recommendations(tier=tier, min_events=min_events)
    return {
        "tier": tier,
        "min_events": min_events,
        "recommendations": recommendations
    }
