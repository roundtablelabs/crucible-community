"""Metrics API endpoints for monitoring."""
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.deps import get_current_user, CurrentUser
from app.core.metrics import metrics_collector
from typing import Optional

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/llm/stats")
async def get_llm_stats(
    provider: Optional[str] = None,
    hours: int = 24,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Get LLM provider statistics.
    
    Requires authentication.
    """
    # Only allow authenticated users (not guests)
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    if provider:
        stats = metrics_collector.get_llm_stats(provider, hours)
        return {"provider": provider, "stats": stats}
    else:
        # Get stats for all providers
        all_stats = {}
        for provider_name in ["openrouter", "openai"]:
            stats = metrics_collector.get_llm_stats(provider_name, hours)
            if stats:
                all_stats[provider_name] = stats
        return {"providers": all_stats}



