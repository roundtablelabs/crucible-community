# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
from datetime import timedelta, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
# JWT token creation removed - using session tokens instead
from app.core.session_store import create_session, store_session, delete_session
from app.core.password import verify_password_with_fallback, hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import SimpleLoginRequest, TokenResponse, ChangePasswordRequest, ChangePasswordResponse

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# OAuth token exchange endpoint removed - using password authentication with bcrypt hashing for security

@router.post("/login", response_model=TokenResponse)
async def simple_login(
    payload: SimpleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Simple login endpoint.
    
    Authenticates user with password against configured community_auth_password.
    Uses bcrypt password hashing for secure authentication.
    Creates a simple session token (no JWT complexity).
    """
    settings = get_settings()
    
    # Verify password using secure bcrypt hashing (with backward compatibility for plain text)
    if not verify_password_with_fallback(payload.password, settings.community_auth_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    # Get or create default user (for compatibility with existing code)
    try:
        result = await db.execute(
            select(User).where(User.email == "admin@community.local")
        )
        user = result.scalar_one_or_none()
        
        if not user:
            # Create default user if it doesn't exist
            user = User(
                email="admin@community.local",
                role="member",
                is_active=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # Update last login (if column exists)
        try:
            user.last_login_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as update_error:
            # If last_login_at update fails (e.g., column doesn't exist), log but continue
            logger.warning(f"Failed to update last_login_at: {update_error}")
            await db.rollback()
    except Exception as db_error:
        logger.error(f"Database error during login: {db_error}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A database error occurred. Please try again later."
        )
    
    # Create session token
    session_token = create_session()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.session_token_expiry_hours)
    
    # Store session
    store_session(
        token=session_token,
        user_id=str(user.id),
        email=user.email,
        expires_at=expires_at
    )
    
    # Return token (using TokenResponse for frontend compatibility)
    # Set access_token to session token, refresh_token to empty (not used)
    return TokenResponse(
        access_token=session_token,
        refresh_token="",  # Not used with session tokens
        token_type="bearer"
    )


@router.get("/me", response_model=CurrentUser)
async def read_current_user(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return current_user


@router.post("/logout")
async def logout(
    current_user: CurrentUser = Depends(get_current_user),
    request: Request = None,
) -> dict:
    """
    Logout endpoint - invalidates the current session token.
    """
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    # Extract token from request
    from app.api.deps import _extract_token_from_request
    token = _extract_token_from_request(request) if request else None
    
    if token:
        delete_session(token)
    
    return {"message": "Logged out successfully"}


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> ChangePasswordResponse:
    """
    Change password endpoint.
    
    Verifies the current password and generates a bcrypt hash for the new password.
    The user must manually update the ROUNDTABLE_COMMUNITY_AUTH_PASSWORD in their .env file.
    
    This endpoint does NOT update the .env file automatically for security reasons.
    Users must update the file and restart the service manually.
    """
    settings = get_settings()
    
    # Verify current password
    if not verify_password_with_fallback(payload.current_password, settings.community_auth_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long"
        )
    
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Hash the new password
    try:
        hashed_password = hash_password(payload.new_password)
    except Exception as e:
        logger.error(f"Error hashing password: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to hash password. Please try again."
        )
    
    # Generate instructions
    instructions = (
        "1. Open your .env file in the project root directory\n"
        "2. Find the line: ROUNDTABLE_COMMUNITY_AUTH_PASSWORD=...\n"
        "3. Replace the value with the hashed password provided below\n"
        "4. Save the file\n"
        "5. Restart your services: docker compose restart api"
    )
    
    return ChangePasswordResponse(
        hashed_password=hashed_password,
        instructions=instructions
    )
