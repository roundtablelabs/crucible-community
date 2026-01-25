"""Utilities for audit logging data access."""
import logging
from uuid import UUID
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request

from app.models.audit_log import DataAccessLog

logger = logging.getLogger(__name__)


async def log_data_access(
    db: AsyncSession,
    user_id: UUID,
    resource_type: str,
    resource_id: UUID,
    action: str,
    request: Optional[Request] = None,
) -> None:
    """
    Log data access for audit trail.
    
    Args:
        db: Database session
        user_id: ID of user performing the action
        resource_type: Type of resource (e.g., "session", "event", "artifact")
        resource_id: ID of the resource being accessed
        action: Action performed (e.g., "read", "delete", "export")
        request: Optional FastAPI request object to extract IP and user agent
    """
    try:
        ip_address = None
        user_agent = None
        
        if request:
            # Get client IP address
            if request.client:
                ip_address = request.client.host
            # Get user agent
            user_agent = request.headers.get("user-agent")
        
        audit_log = DataAccessLog(
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        db.add(audit_log)
        # Don't commit here - let the caller commit to avoid nested transactions
        # This allows the audit log to be part of the same transaction
        
    except Exception as e:
        # Don't fail the main operation if audit logging fails
        logger.error(f"Failed to log data access: {e}", exc_info=True)

