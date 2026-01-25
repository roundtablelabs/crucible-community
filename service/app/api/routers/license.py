# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.db.session import get_db, AsyncSessionLocal
from app.models.user import User
from typing import Optional
from fastapi import Request, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


async def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> Optional[CurrentUser]:
    """
    Optional version of get_current_user that returns None instead of raising exceptions.
    Used for endpoints that need to work with or without authentication.
    """
    from app.api.deps import _extract_token_from_request, _looks_like_uuid
    
    settings = get_settings()
    
    # Try to extract token from request if not provided
    if not token:
        token = _extract_token_from_request(request)
    
    # If we have a token, try to validate it
    if token:
        # Skip validation for placeholder tokens like "community-token"
        if token == "community-token":
            # Return default user for placeholder tokens
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(User).where(User.email == "admin@community.local")
                )
                user = result.scalar_one_or_none()
                if user:
                    return CurrentUser(id=str(user.id), email=user.email, role=user.role)
            return None
        
        # Try to decode JWT token
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            subject = payload.get("sub")
            if not subject:
                return None
            
            # Check if subject is UUID
            if _looks_like_uuid(str(subject)):
                email = payload.get("email")
                role = payload.get("role", "member")
                return CurrentUser(id=str(subject), email=email, role=role)
            else:
                # Subject is email - look up user
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(User).where(User.email == str(subject))
                    )
                    user = result.scalar_one_or_none()
                    if user:
                        return CurrentUser(id=str(user.id), email=user.email, role=user.role)
        except JWTError:
            # Invalid token - return None instead of raising
            # Fall back to default user
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(User).where(User.email == "admin@community.local")
                )
                user = result.scalar_one_or_none()
                if user:
                    return CurrentUser(id=str(user.id), email=user.email, role=user.role)
            return None
    
    # No token - return default user
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == "admin@community.local")
        )
        user = result.scalar_one_or_none()
        if user:
            return CurrentUser(id=str(user.id), email=user.email, role=user.role)
    
    return None

router = APIRouter(prefix="/license", tags=["license"])


class LicenseInfo(BaseModel):
    """License information response."""
    version: str
    content: str
    notice: str | None = None


class LicenseAcceptRequest(BaseModel):
    """License acceptance request."""
    version: str


class LicenseAcceptResponse(BaseModel):
    """License acceptance response."""
    accepted: bool
    version: str
    accepted_at: datetime


def _read_license_file() -> str:
    """Read LICENSE file content."""
    license_path = Path(__file__).parent.parent.parent.parent / "LICENSE"
    if license_path.exists():
        return license_path.read_text(encoding="utf-8")
    # Fallback: return AGPL-3.0 notice
    return """GNU Affero General Public License
Version 3, 19 November 2007

Copyright (C) 2026 Roundtable Labs Pty Ltd

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>."""


def _read_notice_file() -> str | None:
    """Read NOTICE.md file content."""
    notice_path = Path(__file__).parent.parent.parent.parent / "NOTICE.md"
    if notice_path.exists():
        return notice_path.read_text(encoding="utf-8")
    return None


@router.get("/current", response_model=LicenseInfo)
async def get_current_license() -> LicenseInfo:
    """
    Get current license information.
    
    This endpoint does not require authentication - users need to see the license
    before they can accept it.
    """
    settings = get_settings()
    
    return LicenseInfo(
        version=settings.license_version,
        content=_read_license_file(),
        notice=_read_notice_file()
    )


@router.post("/accept", response_model=LicenseAcceptResponse)
async def accept_license(
    payload: LicenseAcceptRequest,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> LicenseAcceptResponse:
    """
    Accept the license agreement.
    
    Updates the user's license_accepted_at and license_version fields.
    If no user is authenticated, updates the default admin user.
    """
    settings = get_settings()
    
    # Verify version matches current license version
    if payload.version != settings.license_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"License version mismatch. Current version is {settings.license_version}"
        )
    
    # Get user from database
    user = None
    if current_user and not current_user.is_guest:
        result = await db.execute(
            select(User).where(User.id == current_user.id)
        )
        user = result.scalar_one_or_none()
    
    # If no authenticated user, use default admin user
    if not user:
        result = await db.execute(
            select(User).where(User.email == "admin@community.local")
        )
        user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update license acceptance
    now = datetime.now(timezone.utc)
    user.license_accepted_at = now
    user.license_version = payload.version
    
    await db.commit()
    
    return LicenseAcceptResponse(
        accepted=True,
        version=payload.version,
        accepted_at=now
    )


@router.get("/status")
async def get_license_status(
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get current user's license acceptance status.
    
    Works with or without authentication. If no user is authenticated, checks the default admin user.
    """
    settings = get_settings()
    
    # If we have an authenticated user, use their status
    if current_user:
        result = await db.execute(
            select(User).where(User.id == current_user.id)
        )
        user = result.scalar_one_or_none()
        
        if user:
            needs_acceptance = (
                user.license_accepted_at is None or
                user.license_version != settings.license_version
            )
            return {
                "accepted": user.license_accepted_at is not None,
                "version": user.license_version,
                "accepted_at": user.license_accepted_at.isoformat() if user.license_accepted_at else None,
                "current_version": settings.license_version,
                "needs_acceptance": needs_acceptance
            }
    
    # If no authenticated user, check default admin user
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == "admin@community.local")
        )
        user = result.scalar_one_or_none()
        
        if user:
            needs_acceptance = (
                user.license_accepted_at is None or
                user.license_version != settings.license_version
            )
            return {
                "accepted": user.license_accepted_at is not None,
                "version": user.license_version,
                "accepted_at": user.license_accepted_at.isoformat() if user.license_accepted_at else None,
                "current_version": settings.license_version,
                "needs_acceptance": needs_acceptance
            }
    
    # Default: needs acceptance
    return {
        "accepted": False,
        "version": None,
        "accepted_at": None,
        "current_version": settings.license_version,
        "needs_acceptance": True
    }
