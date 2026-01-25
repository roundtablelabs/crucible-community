from uuid import UUID
import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status, Query
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.core.redis import get_redis_client
from app.core.session_store import get_session, validate_session
import ipaddress
import hashlib
import secrets

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: str = "member"
    is_guest: bool = False
    password_change_required: bool = False


def _guest_user() -> CurrentUser:
    return CurrentUser(id="guest", role="guest", is_guest=True)


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
    except (ValueError, TypeError):
        return False
    return True


def _extract_token_from_request(request: Request) -> str | None:
    """Extract token from Authorization header as fallback."""
    auth_header = request.headers.get("authorization")
    if not auth_header:
        return None
    # Extract token from "Bearer <token>" format
    if auth_header.startswith("Bearer "):
        return auth_header[7:]  # Remove "Bearer " prefix
    # Maybe it's just the token without "Bearer " prefix
    return auth_header


async def _log_uuid_token_attempt(
    db: AsyncSession,
    request: Request,
    uuid_token: str,
    success: bool,
    user_id: UUID | None = None,
    reason: str | None = None,
) -> None:
    """
    Log UUID token authentication attempt to audit log.
    
    Args:
        db: Database session
        request: FastAPI request object
        uuid_token: The UUID token that was attempted
        success: Whether authentication succeeded
        user_id: User ID if authentication succeeded, None if failed
        reason: Reason for failure (e.g., "invalid_uuid", "inactive_user", "user_not_found")
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Extract IP and user agent
        ip_address = None
        user_agent = None
        
        if request:
            # Get client IP address
            if request.client:
                ip_address = request.client.host
            # Check for forwarded IP
            forwarded_for = request.headers.get("x-forwarded-for")
            if forwarded_for:
                ip_address = forwarded_for.split(",")[0].strip()
            # Get user agent
            user_agent = request.headers.get("user-agent")
        
        # Use resource_id as user_id if successful, otherwise generate a UUID for failed attempts
        resource_id = user_id if user_id else uuid.uuid4()
        log_id = uuid.uuid4()
        
        # Determine action based on success/failure
        if success:
            action = "uuid_token_auth_success"
        else:
            action = f"uuid_token_auth_failed_{reason}" if reason else "uuid_token_auth_failed"
        
        # Insert audit log entry
        # Use raw SQL to handle nullable user_id for failed attempts
        await db.execute(
            text("""
                INSERT INTO data_access_logs 
                (id, user_id, resource_type, resource_id, action, ip_address, user_agent, created_at)
                VALUES 
                (:id, :user_id, :resource_type, :resource_id, :action, :ip_address, :user_agent, NOW())
            """),
            {
                "id": log_id,
                "user_id": user_id,  # NULL for failed attempts
                "resource_type": "authentication",
                "resource_id": resource_id,
                "action": action,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
        )
        # Note: Don't commit here - let the caller commit to maintain transaction consistency
        logger.debug(f"[_log_uuid_token_attempt] Logged UUID token attempt: success={success}, user_id={user_id}, reason={reason}")
    except Exception as e:
        # Don't fail authentication if audit logging fails
        logger.warning(f"[_log_uuid_token_attempt] Failed to log UUID token attempt: {e}")


async def get_current_user_allow_uuid(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(None, alias="token"),
) -> CurrentUser:
    """
    Get current user, allowing UUID tokens for token exchange endpoint.
    
    This is a special version that allows UUID tokens (from NextAuth) to be used
    to authenticate and exchange for JWT tokens. This is ONLY for the /api/auth/token
    endpoint. All other endpoints should use get_current_user which requires JWT tokens.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Try to extract token from Authorization header if oauth2_scheme didn't work
    effective_token = token or query_token
    
    # Fallback: extract directly from Authorization header if oauth2_scheme returned None
    if not effective_token and request:
        fallback_token = _extract_token_from_request(request)
        if fallback_token:
            effective_token = fallback_token
    
    if not effective_token:
        logger.warning("[get_current_user_allow_uuid] No token found, returning guest user")
        return _guest_user()

    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try JWT decode first
    try:
        payload = jwt.decode(effective_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        # JWT decode succeeded - use normal flow
        subject = payload.get("sub")
        if not subject:
            raise credentials_exception

        # Check if subject is a UUID or an email (backward compatibility)
        if _looks_like_uuid(str(subject)):
            # Subject is a UUID (new format)
            email = payload.get("email")
            role = payload.get("role", "member")
            return CurrentUser(id=str(subject), email=email, role=role)
        else:
            # Subject is likely an email (old format) - look up user in database for backward compatibility
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(User).where(User.email == str(subject))
                )
                user = result.scalars().first()
                
                if not user:
                    raise credentials_exception
                
                email = payload.get("email") or user.email
                role = payload.get("role") or user.role
                return CurrentUser(id=str(user.id), email=email, role=role)
    except JWTError:
        # JWT decode failed - check if it's a UUID token (for token exchange endpoint only)
        is_uuid = _looks_like_uuid(effective_token)
        logger.info(f"[get_current_user_allow_uuid] JWT decode failed, checking if UUID token: {is_uuid}")
        if is_uuid:
            # Validate UUID exists and user is active
            async with AsyncSessionLocal() as db:
                try:
                    result = await db.execute(
                        select(User).where(
                            User.id == UUID(effective_token), 
                            or_(User.is_active == True, User.is_active.is_(None))
                        )
                    )
                    user = result.scalars().first()
                    if not user:
                        # Log failed attempt: user not found or inactive
                        await _log_uuid_token_attempt(
                            db=db,
                            request=request,
                            uuid_token=effective_token,
                            success=False,
                            user_id=None,
                            reason="user_not_found_or_inactive"
                        )
                        await db.commit()
                        logger.warning(f"[get_current_user_allow_uuid] UUID token corresponds to non-existent or inactive user: {effective_token[:8]}...")
                        raise credentials_exception
                    
                    # Log successful UUID token authentication
                    await _log_uuid_token_attempt(
                        db=db,
                        request=request,
                        uuid_token=effective_token,
                        success=True,
                        user_id=user.id,
                        reason=None
                    )
                    await db.commit()
                    logger.info(f"[get_current_user_allow_uuid] Authenticated user with UUID token: {effective_token[:8]}... (email={user.email}, role={user.role})")
                    return CurrentUser(id=str(user.id), email=user.email, role=user.role)
                except HTTPException:
                    # Re-raise HTTP exceptions (credentials_exception)
                    raise
                except Exception as e:
                    # Log error but don't fail authentication if audit logging fails
                    logger.warning(f"[get_current_user_allow_uuid] Error during UUID token validation or logging: {e}")
                    await db.rollback()
                    # Re-raise credentials exception if user was not found
                    raise credentials_exception
        else:
            # Not a UUID and not a valid JWT - reject
            # Log failed attempt: invalid token format
            try:
                async with AsyncSessionLocal() as db:
                    await _log_uuid_token_attempt(
                        db=db,
                        request=request,
                        uuid_token=effective_token or "none",
                        success=False,
                        user_id=None,
                        reason="invalid_token_format"
                    )
                    await db.commit()
            except Exception as log_error:
                # Don't fail authentication check if logging fails
                logger.warning(f"[get_current_user_allow_uuid] Failed to log invalid token format: {log_error}")
            
            logger.warning(f"[get_current_user_allow_uuid] Invalid token format (not JWT or UUID): {effective_token[:16] if effective_token else None}...")
            raise credentials_exception


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(None, alias="token"),
) -> CurrentUser:
    import logging
    logger = logging.getLogger(__name__)
    
    settings = get_settings()
    
    # Log incoming request details for debugging
    auth_header = request.headers.get("authorization") if request else None
    logger.debug(f"[get_current_user] Incoming request - auth_header: {auth_header[:20] if auth_header else None}..., oauth2_token: {token[:8] if token else None}...")
    
    # Try to extract token from Authorization header if oauth2_scheme didn't work
    effective_token = token or query_token
    
    # Fallback: extract directly from Authorization header if oauth2_scheme returned None
    if not effective_token and request:
        fallback_token = _extract_token_from_request(request)
        if fallback_token:
            effective_token = fallback_token
            logger.debug(f"[get_current_user] Extracted token from Authorization header (fallback): {fallback_token[:8] if fallback_token else None}...")
    
    if not effective_token:
        # If require_auth=True, we need a token
        if settings.require_auth:
            logger.warning("[get_current_user] No token found with require_auth=True")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please log in.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        logger.warning("[get_current_user] No token found, returning guest user")
        return _guest_user()

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try session token first, then fall back to JWT
    try:
        session_data = get_session(effective_token)
        if session_data:
            # Valid session token
            user_id = session_data.get("user_id", "community-user")
            email = session_data.get("email", "admin@community.local")
            
            # Check token expiry to warn about mismatches
            expires_at_str = session_data.get("expires_at")
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    if now >= expires_at:
                        logger.warning(
                            f"[get_current_user] Session token expired but still in store: "
                            f"expires_at={expires_at_str}, now={now.isoformat()}"
                        )
                    else:
                        time_until_expiry = (expires_at - now).total_seconds() / 3600
                        logger.debug(
                            f"[get_current_user] Valid session token for user: {email} "
                            f"(user_id: {user_id}, expires in {time_until_expiry:.1f}h)"
                        )
                except (ValueError, AttributeError) as parse_error:
                    logger.warning(
                        f"[get_current_user] Failed to parse session expiry: {parse_error}, "
                        f"expires_at_str={expires_at_str}"
                    )
            
            return CurrentUser(
                id=user_id,
                email=email,
                role="member",
                is_guest=False
            )
        # Session token invalid or not found
        logger.warning(
            f"[get_current_user] Session token not found or invalid: "
            f"{effective_token[:16] if effective_token else None}..."
        )
        # If require_auth is True, we should raise 401 here instead of falling back to JWT
        if settings.require_auth:
            logger.error(
                "[get_current_user] Session token validation failed with require_auth=True. "
                "Redis may be unavailable - check ROUNDTABLE_REDIS_URL configuration."
            )
            raise credentials_exception
        # Otherwise, try JWT for backward compatibility
        # This allows old JWT tokens to still work during transition
        logger.debug(f"[get_current_user] Session token not found, trying JWT fallback")
    except Exception as e:
        # Log any errors during session token validation with more context
        error_type = type(e).__name__
        logger.error(
            f"[get_current_user] Error validating session token: {error_type}: {e}. "
            f"This may indicate Redis connection issues. Session store will fall back to in-memory storage."
        )
        if settings.require_auth:
            # In production with require_auth, we should fail fast
            logger.error(
                "[get_current_user] Session validation failed with require_auth=True. "
                "Cannot proceed without valid session. Check Redis connectivity."
            )
            raise credentials_exception
        # Fall through to JWT validation
        logger.debug(f"[get_current_user] Session validation error, trying JWT fallback")
    
    # Try JWT validation (for backward compatibility during transition)
    # This allows old JWT tokens from previous logins to still work
    try:
        payload = jwt.decode(effective_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        logger.debug(f"[get_current_user] Valid JWT token (backward compatibility)")
    except JWTError as e:
        # JWT decode failed - reject invalid token
        logger.warning(f"[get_current_user] JWT decode failed: {type(e).__name__}, token_preview: {effective_token[:16] if effective_token else None}...")
        raise credentials_exception

    subject = payload.get("sub")
    if not subject:
        raise credentials_exception

    # Check if subject is a UUID or an email (backward compatibility)
    if _looks_like_uuid(str(subject)):
        # Subject is a UUID (new format)
        email = payload.get("email")
        role = payload.get("role", "member")
        return CurrentUser(id=str(subject), email=email, role=role)
    else:
        # Subject is likely an email (old format) - look up user in database for backward compatibility
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(User.email == str(subject))
            )
            user = result.scalars().first()
            
            if not user:
                raise credentials_exception
            
            email = payload.get("email") or user.email
            role = payload.get("role") or user.role
            return CurrentUser(
                id=str(user.id), 
                email=email, 
                role=role,
                password_change_required=user.password_change_required or False
            )


async def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(None, alias="token"),
) -> CurrentUser:
    """
    Get current user, but fall back to guest if token is invalid or missing.
    
    This is useful for endpoints that should work for both authenticated and guest users.
    Unlike get_current_user, this doesn't raise an error on invalid tokens - it just returns a guest user.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Try to extract token
    effective_token = token or query_token
    
    # Fallback: extract directly from Authorization header
    if not effective_token and request:
        fallback_token = _extract_token_from_request(request)
        if fallback_token:
            effective_token = fallback_token
    
    # If no token, return guest
    if not effective_token:
        return _guest_user()
    
    settings = get_settings()
    
    # Try session token first
    session_data = get_session(effective_token)
    if session_data:
        # Valid session token
        user_id = session_data.get("user_id", "community-user")
        email = session_data.get("email", "admin@community.local")
        logger.debug(f"[get_current_user_optional] Valid session token for user: {email}")
        return CurrentUser(
            id=user_id,
            email=email,
            role="member",
            is_guest=False
        )
    # Session token invalid - fall through to JWT for backward compatibility
    
    # Try JWT validation (for backward compatibility during transition)
    try:
        payload = jwt.decode(effective_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        subject = payload.get("sub")
        if not subject:
            logger.warning("[get_current_user_optional] Token missing subject, falling back to guest")
            return _guest_user()
        
        # Check if subject is a UUID or an email
        if _looks_like_uuid(str(subject)):
            email = payload.get("email")
            role = payload.get("role", "member")
            return CurrentUser(id=str(subject), email=email, role=role)
        else:
            # Subject is likely an email (old format) - look up user in database
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(User).where(User.email == str(subject))
                )
                user = result.scalars().first()
                
                if not user:
                    logger.warning("[get_current_user_optional] User not found for email, falling back to guest")
                    return _guest_user()
                
                email = payload.get("email") or user.email
                role = payload.get("role") or user.role
                return CurrentUser(id=str(user.id), email=email, role=role)
    except JWTError as e:
        # Invalid token - fall back to guest instead of raising error
        logger.debug(f"[get_current_user_optional] Invalid token, falling back to guest: {type(e).__name__}")
        return _guest_user()
    except Exception as e:
        # Any other error - fall back to guest
        logger.warning(f"[get_current_user_optional] Error validating token, falling back to guest: {e}")
        return _guest_user()


class AdminSession(BaseModel):
    """Admin session context."""
    session_id: str
    ip_address: str
    user_agent: str | None
    created_at: float


def _get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    # Check for forwarded IP (from proxy/load balancer)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(",")[0].strip()
    
    # Check for real IP header
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    
    # Fallback to direct client IP
    if request.client:
        return request.client.host
    
    return "unknown"


def _is_ip_allowed(ip: str, allowed_ips: str) -> bool:
    """Check if IP address is in the allowed list."""
    if not allowed_ips or not allowed_ips.strip():
        return True  # No restrictions if not configured
    
    allowed_list = [ip.strip() for ip in allowed_ips.split(",") if ip.strip()]
    if not allowed_list:
        return True
    
    try:
        client_ip_obj = ipaddress.ip_address(ip)
        for allowed in allowed_list:
            try:
                # Try as CIDR range
                if "/" in allowed:
                    network = ipaddress.ip_network(allowed, strict=False)
                    if client_ip_obj in network:
                        return True
                else:
                    # Try as single IP
                    allowed_ip_obj = ipaddress.ip_address(allowed)
                    if client_ip_obj == allowed_ip_obj:
                        return True
            except ValueError:
                # Invalid IP format in allowlist, skip
                continue
        return False
    except ValueError:
        # Invalid client IP format
        return False


def _is_token_blacklisted(token: str) -> bool:
    """Check if token is blacklisted in Redis."""
    redis = get_redis_client()
    if redis is None:
        return False  # If Redis unavailable, don't block (fail open)
    
    try:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        blacklist_key = f"admin_token_blacklist:{token_hash}"
        exists = redis.exists(blacklist_key)
        return bool(exists)
    except Exception:
        return False  # Fail open if Redis error


def _blacklist_token(token: str, expiry_seconds: int) -> None:
    """Blacklist a token in Redis."""
    redis = get_redis_client()
    if redis is None:
        return
    
    try:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        blacklist_key = f"admin_token_blacklist:{token_hash}"
        redis.setex(blacklist_key, expiry_seconds, "1")
    except Exception:
        pass  # Fail silently if Redis error


def _check_account_lockout(ip: str) -> tuple[bool, int | None]:
    """Check if account is locked out for this IP.
    
    Returns:
        Tuple of (is_locked, remaining_seconds)
    """
    redis = get_redis_client()
    if redis is None:
        return False, None
    
    try:
        lockout_key = f"admin_lockout:ip:{ip}"
        ttl = redis.ttl(lockout_key)
        if ttl > 0:
            return True, ttl
        return False, None
    except Exception:
        return False, None


def _lock_account(ip: str, duration_seconds: int) -> None:
    """Lock account for this IP."""
    redis = get_redis_client()
    if redis is None:
        return
    
    try:
        lockout_key = f"admin_lockout:ip:{ip}"
        redis.setex(lockout_key, duration_seconds, "1")
    except Exception:
        pass


def _record_failed_attempt(ip: str, max_attempts: int, lockout_duration: int) -> tuple[bool, int]:
    """Record a failed login attempt and check if account should be locked.
    
    Returns:
        Tuple of (should_lock, attempt_count)
    """
    redis = get_redis_client()
    if redis is None:
        return False, 0
    
    try:
        attempt_key = f"admin_login_attempts:ip:{ip}"
        attempts = redis.incr(attempt_key)
        redis.expire(attempt_key, lockout_duration)  # Reset attempts after lockout duration
        
        if attempts >= max_attempts:
            _lock_account(ip, lockout_duration)
            return True, attempts
        return False, attempts
    except Exception:
        return False, 0


def _clear_failed_attempts(ip: str) -> None:
    """Clear failed login attempts for this IP."""
    redis = get_redis_client()
    if redis is None:
        return
    
    try:
        attempt_key = f"admin_login_attempts:ip:{ip}"
        redis.delete(attempt_key)
    except Exception:
        pass


async def get_admin_session(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> AdminSession:
    """
    Get admin session from token.
    
    Validates:
    - Token signature and expiry
    - IP allowlisting (if configured)
    - Token blacklist
    - IP address match (from token payload)
    
    Raises HTTPException if validation fails.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    settings = get_settings()
    
    # Extract token
    effective_token = token
    if not effective_token:
        effective_token = _extract_token_from_request(request)
    
    if not effective_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check token blacklist
    if _is_token_blacklisted(effective_token):
        logger.warning(f"[get_admin_session] Blacklisted token used")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has been revoked",
        )
    
    # Validate JWT token
    if not settings.admin_session_secret:
        logger.error("[get_admin_session] Admin session secret not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin portal not configured",
        )
    
    try:
        payload = jwt.decode(
            effective_token,
            settings.admin_session_secret,
            algorithms=["HS256"]
        )
    except JWTError as e:
        logger.warning(f"[get_admin_session] Invalid token: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token",
        )
    
    # Extract session data
    session_id = payload.get("session_id")
    token_ip = payload.get("ip_address")
    token_user_agent = payload.get("user_agent")
    created_at = payload.get("created_at", 0)
    
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token format",
        )
    
    # Get client IP
    client_ip = _get_client_ip(request)
    
    # Check IP allowlisting
    if not _is_ip_allowed(client_ip, settings.admin_allowed_ips):
        logger.warning(f"[get_admin_session] Access denied for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied from this IP address",
        )
    
    # Verify IP matches token (optional but recommended for security)
    if token_ip and token_ip != client_ip:
        logger.warning(f"[get_admin_session] IP mismatch: token={token_ip}, request={client_ip}")
        # Don't block, but log the mismatch (IPs can change with mobile networks)
    
    # Get user agent
    user_agent = request.headers.get("user-agent")
    
    return AdminSession(
        session_id=session_id,
        ip_address=client_ip,
        user_agent=user_agent,
        created_at=created_at,
    )
