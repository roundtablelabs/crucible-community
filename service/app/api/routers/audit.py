"""Admin endpoints for querying audit logs."""
import logging
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.audit_log import DataAccessLog

router = APIRouter(prefix="/audit", tags=["audit"])
logger = logging.getLogger(__name__)


def _require_admin_user(user: CurrentUser) -> None:
    """Require admin role for audit log access."""
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


@router.get("/logs")
async def get_audit_logs(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_id: Optional[UUID] = Query(None, description="Filter by user ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    action: Optional[str] = Query(None, description="Filter by action"),
    days: int = Query(30, description="Number of days to look back", ge=1, le=365),
    limit: int = Query(100, description="Maximum number of logs to return", ge=1, le=1000),
) -> list[dict]:
    """
    Get audit logs. Requires admin role.
    """
    _require_admin_user(current_user)
    
    cutoff_date = datetime.now() - timedelta(days=days)
    
    query = select(DataAccessLog).where(
        DataAccessLog.created_at >= cutoff_date
    )
    
    if user_id:
        query = query.where(DataAccessLog.user_id == user_id)
    if resource_type:
        query = query.where(DataAccessLog.resource_type == resource_type)
    if action:
        query = query.where(DataAccessLog.action == action)
    
    query = query.order_by(DataAccessLog.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id),
            "resource_type": log.resource_type,
            "resource_id": str(log.resource_id),
            "action": log.action,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/logs/stats")
async def get_audit_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, description="Number of days to analyze", ge=1, le=365),
) -> dict:
    """Get audit log statistics."""
    _require_admin_user(current_user)
    
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Count by action
    action_counts = await db.execute(
        select(
            DataAccessLog.action,
            func.count(DataAccessLog.id).label("count")
        )
        .where(DataAccessLog.created_at >= cutoff_date)
        .group_by(DataAccessLog.action)
    )
    
    # Count by resource type
    resource_counts = await db.execute(
        select(
            DataAccessLog.resource_type,
            func.count(DataAccessLog.id).label("count")
        )
        .where(DataAccessLog.created_at >= cutoff_date)
        .group_by(DataAccessLog.resource_type)
    )
    
    return {
        "period_days": days,
        "actions": {row.action: row.count for row in action_counts.all()},
        "resource_types": {row.resource_type: row.count for row in resource_counts.all()},
    }

