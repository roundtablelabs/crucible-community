from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models.knight import (
    OFFICIAL_AUTHOR_NAME,
    Knight,
    KnightOrigin,
    KnightSource,
)
from app.models.model_catalog import LLMModel
from app.schemas.knight import KnightCreate, KnightInstallRequest, KnightRead, KnightUpdate
from app.services.llm.api_key_resolver import APIKeyResolver
from app.services.llm.router import PROVIDER_MAP
from app.services.llm.exceptions import NoAPIKeyError

router = APIRouter(prefix="/knights", tags=["knights"])
logger = logging.getLogger(__name__)

DEFAULT_TEMPERATURE = 0.7


def _resolve_temperature(value: float | None) -> float:
    return value if value is not None else DEFAULT_TEMPERATURE


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sanitize_domain_tags(tags: list[str] | None) -> list[str] | None:
    if not tags:
        return None
    cleaned = []
    for tag in tags:
        if not tag:
            continue
        token = tag.strip()
        if not token:
            continue
        cleaned.append(token)
    return cleaned or None


def _sanitize_social_media_urls(social_media_urls: dict | None) -> dict | None:
    """Sanitize social media URLs by trimming whitespace and converting empty strings to None."""
    if not social_media_urls:
        return None
    sanitized = {}
    for key, value in social_media_urls.items():
        if value and isinstance(value, str):
            trimmed = value.strip()
            sanitized[key] = trimmed if trimmed else None
        else:
            sanitized[key] = None
    # Return None if all values are None/empty
    if not any(sanitized.values()):
        return None
    return sanitized



async def _require_model(model_identifier: str, db: AsyncSession) -> LLMModel:
    model = await db.get(LLMModel, model_identifier)
    if model:
        return model
    alt = await db.execute(select(LLMModel).where(LLMModel.api_identifier == model_identifier))
    model = alt.scalar_one_or_none()
    if model:
        return model
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown model identifier.")

async def _filter_knights_by_api_keys(
    knights: list[Knight],
    user_id: str,
    db: AsyncSession,
) -> list[Knight]:
    """Filter knights to only include those whose models have available API keys.
    
    Args:
        knights: List of knights to filter
        user_id: User ID for API key lookup
        db: Database session
        
    Returns:
        Filtered list of knights with available API keys
    """
    if not knights:
        return knights
    
    resolver = APIKeyResolver()
    
    # Get user's available providers once
    available_providers = await resolver.get_user_available_providers(user_id, db)
    
    if not available_providers:
        # User has no API keys - filter out all knights
        logger.debug(f"[_filter_knights_by_api_keys] User {user_id} has no API keys, filtering out all knights")
        return []
    
    # Collect all unique model IDs for batch lookup
    model_ids = {knight.model for knight in knights if knight.model}
    if not model_ids:
        # No models to check
        return [k for k in knights if not k.model]  # Return knights without models
    
    # Batch lookup all models
    models_result = await db.execute(
        select(LLMModel).where(
            or_(
                LLMModel.id.in_(model_ids),
                LLMModel.api_identifier.in_(model_ids),
            )
        )
    )
    models = models_result.scalars().all()
    
    # Create lookup maps: model_id -> model_record, api_identifier -> model_record
    model_by_id: dict[str, LLMModel] = {}
    model_by_api_id: dict[str, LLMModel] = {}
    for model in models:
        model_by_id[model.id] = model
        model_by_api_id[model.api_identifier] = model
    
    filtered_knights: list[Knight] = []
    
    for knight in knights:
        if not knight.model:
            # Knight has no model - include it
            filtered_knights.append(knight)
            continue
        
        try:
            # Look up model (try by id first, then by api_identifier)
            model_record = model_by_id.get(knight.model) or model_by_api_id.get(knight.model)
            
            if model_record:
                provider = PROVIDER_MAP.get(model_record.provider.lower(), None)
                if provider:
                    # Check if user has key for this provider or an aggregator
                    try:
                        provider_chain = await resolver.resolve_provider_chain(
                            model_id=knight.model,
                            native_provider=provider,
                            user_id=user_id,
                            db=db
                        )
                        # If we get here, at least one provider is available
                        filtered_knights.append(knight)
                        logger.debug(
                            f"[_filter_knights_by_api_keys] ✓ Knight {knight.id} "
                            f"({knight.name}) model {knight.model} has available API key"
                        )
                    except NoAPIKeyError:
                        # No API key available for this model - filter it out
                        logger.debug(
                            f"[_filter_knights_by_api_keys] ✗ Knight {knight.id} "
                            f"({knight.name}) model {knight.model} missing API key - filtered out"
                        )
                        continue
                else:
                    # Unknown provider - include it (let it fail later if needed)
                    logger.warning(
                        f"[_filter_knights_by_api_keys] Unknown provider for model {knight.model}, "
                        f"including knight {knight.id}"
                    )
                    filtered_knights.append(knight)
            else:
                # Model not found in database - include it (let it fail later if needed)
                logger.debug(
                    f"[_filter_knights_by_api_keys] Model {knight.model} not found in database, "
                    f"including knight {knight.id}"
                )
                filtered_knights.append(knight)
        except Exception as e:
            # On error, include the knight (fail-safe - let it fail later if needed)
            logger.warning(
                f"[_filter_knights_by_api_keys] Error checking API key for knight {knight.id}: {e}, "
                "including knight anyway"
            )
            filtered_knights.append(knight)
    
    logger.info(
        f"[_filter_knights_by_api_keys] Filtered {len(knights)} knights to {len(filtered_knights)} "
        f"with available API keys"
    )
    return filtered_knights


def _map_to_read(knight: Knight) -> KnightRead:
    from app.schemas.knight import SocialMediaUrls
    
    author_payload = {"name": knight.author_name}
    temperature = float(knight.temperature) if knight.temperature is not None else None
    
    # Handle social_media_urls - convert from dict to SocialMediaUrls model if present
    social_media_urls = None
    if knight.social_media_urls:
        social_media_urls = SocialMediaUrls(**knight.social_media_urls)
    
    return KnightRead.model_validate(
        {
            "id": knight.id,
            "name": knight.name,
            "role": knight.role,
            "prompt": knight.prompt,
            "goal": knight.goal,
            "backstory": knight.backstory,
            "model": knight.model,
            "websearch_enabled": knight.websearch_enabled,
            "created_at": knight.created_at,
            "author": author_payload,
            "verified": knight.verified,
            "origin": knight.origin,
            "sourced_from": knight.sourced_from,
            "version": knight.version,
            "owner_id": knight.owner_id,
            "temperature": temperature if temperature is not None else DEFAULT_TEMPERATURE,
            "linkedin_profile_url": knight.linkedin_profile_url,
            "social_media_urls": social_media_urls,
            "seniority_level": knight.seniority_level,
            "primary_domain": knight.primary_domain,
            "domain_tags": knight.domain_tags or [],
            "revenue_share_bps": knight.revenue_share_bps,
            "last_profile_refresh": knight.last_profile_refresh,
        }
    )


@router.get("/official", response_model=list[KnightRead])
async def list_official_knights(
    filter_by_api_keys: bool = False,
    current_user: CurrentUser | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> list[KnightRead]:
    """List official knights, optionally filtered by user's available API keys.
    
    Args:
        filter_by_api_keys: If True, filter out knights using models without available API keys.
                           Defaults to False to show all knights (API keys resolved at runtime via balance model approach).
                           Only applies if current_user is authenticated.
        current_user: Optional authenticated user for API key filtering
        db: Database session
    """
    result = await db.execute(
        select(Knight).where(
            Knight.author_name.isnot(None),
            func.lower(Knight.author_name) == OFFICIAL_AUTHOR_NAME,
        )
    )
    knights = result.scalars().all()
    
    # Filter by API keys if requested and user is authenticated
    if filter_by_api_keys and current_user and not current_user.is_guest:
        knights = await _filter_knights_by_api_keys(knights, str(current_user.id), db)
    
    return [_map_to_read(knight) for knight in knights]


@router.get("/mine", response_model=list[KnightRead])
async def list_workspace_knights(
    filter_by_api_keys: bool = False,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[KnightRead]:
    """List workspace knights, optionally filtered by user's available API keys.
    
    Args:
        filter_by_api_keys: If True, filter out knights using models without available API keys.
                           Defaults to False to show all knights (API keys resolved at runtime via balance model approach).
        current_user: Authenticated user
        db: Database session
    """
    workspace_pattern = f"%::workspace::{current_user.id}"
    result = await db.execute(
        select(Knight).where(
            or_(
                Knight.owner_id == current_user.id,
                Knight.id.like(workspace_pattern),
            )
        )
    )
    knights = result.scalars().all()
    
    # Filter by API keys if requested
    if filter_by_api_keys:
        knights = await _filter_knights_by_api_keys(knights, str(current_user.id), db)
    
    return [_map_to_read(knight) for knight in knights]


@router.post("", response_model=KnightRead, status_code=status.HTTP_201_CREATED)
async def create_knight(
    payload: KnightCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnightRead:
    # Community Edition: Deletion cooldown removed - allow immediate knight creation/deletion
    
    identifier = payload.id or f"knight_{uuid.uuid4().hex[:12]}"
    existing = await db.get(Knight, identifier)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Knight with this id already exists.")

    author = payload.author
    await _require_model(payload.model, db)
    name = payload.name or payload.role

    # Handle social_media_urls - sanitize and maintain backward compatibility with linkedin_profile_url
    social_media_urls_dict = None
    if payload.social_media_urls:
        social_media_urls_dict = payload.social_media_urls.model_dump(exclude_none=True)
        social_media_urls_dict = _sanitize_social_media_urls(social_media_urls_dict)
    
    # Maintain backward compatibility: if social_media_urls has linkedin, also set linkedin_profile_url
    linkedin_url = payload.linkedin_profile_url
    if social_media_urls_dict and social_media_urls_dict.get("linkedin"):
        linkedin_url = social_media_urls_dict["linkedin"]
    elif not linkedin_url and payload.linkedin_profile_url:
        linkedin_url = payload.linkedin_profile_url

    record = Knight(
        id=identifier,
        name=name,
        role=payload.role,
        prompt=payload.prompt,
        goal=payload.goal,
        backstory=payload.backstory,
        model=payload.model,
        websearch_enabled=payload.websearch_enabled,
        author_name=author.name,
        verified=payload.verified,
        version=payload.version,
        owner_id=current_user.id,
        temperature=_resolve_temperature(payload.temperature),
        sourced_from=payload.sourced_from,
        linkedin_profile_url=linkedin_url,
        social_media_urls=social_media_urls_dict,
        seniority_level=payload.seniority_level,
        primary_domain=payload.primary_domain,
        domain_tags=_sanitize_domain_tags(payload.domain_tags),
        revenue_share_bps=payload.revenue_share_bps,
        last_profile_refresh=_now() if payload.sourced_from == KnightSource.LINKEDIN_CV else None,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _map_to_read(record)


@router.get("/{knight_id}", response_model=KnightRead)
async def read_knight(
    knight_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnightRead:
    from app.models.knight import OFFICIAL_AUTHOR_NAME
    
    record = await db.get(Knight, knight_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knight not found.")

    # Official knights (owner_id is None or "roundtablelabs") are readable by everyone
    # Only workspace/marketplace knights owned by other users are restricted
    is_official = (
        record.owner_id is None or 
        record.owner_id == "roundtablelabs" or
        (record.author_name and record.author_name.lower() == OFFICIAL_AUTHOR_NAME)
    )
    
    # Check ownership: either owner_id matches, or user ID is embedded in knight ID (marketplace installs)
    user_owns_knight = False
    if record.owner_id is not None:
        # Compare as strings (both are strings)
        # Log for debugging
        logger.debug(f"Knight ownership check: owner_id={record.owner_id}, current_user.id={current_user.id}, is_guest={current_user.is_guest}")
        user_owns_knight = str(record.owner_id) == str(current_user.id)
    
    # Also check if user ID is embedded in knight ID (format: {original_id}::{user_id})
    if not user_owns_knight and "::" in knight_id:
        parts = knight_id.split("::")
        if len(parts) >= 2:
            # Check if the last part (or any part after ::) matches user ID
            embedded_user_id = parts[-1]
            user_owns_knight = str(embedded_user_id) == str(current_user.id)
    
    if not is_official and not user_owns_knight:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view this Knight.")

    return _map_to_read(record)


# Install endpoint removed for Community Edition - marketplace functionality not available

@router.put("/{knight_id}", response_model=KnightRead)
async def update_knight(
    knight_id: str,
    payload: KnightUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnightRead:
    record = await db.get(Knight, knight_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knight not found.")

    author = payload.author
    await _require_model(payload.model, db)

    if record.owner_id is None:
        fork_id = f"{knight_id}::workspace::{current_user.id}"
        existing_fork = await db.get(Knight, fork_id)
        if existing_fork:
            target = existing_fork
        else:
            target = Knight(
                id=fork_id,
                owner_id=current_user.id,
                verified=False,
                created_at=_now(),
            )
            db.add(target)
    else:
        if record.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to edit this Knight.")
        target = record

    target.name = payload.name or payload.role
    target.role = payload.role
    target.prompt = payload.prompt
    target.goal = payload.goal
    target.backstory = payload.backstory
    target.model = payload.model
    target.websearch_enabled = payload.websearch_enabled
    target.author_name = author.name
    if target.owner_id is not None:
        target.verified = payload.verified
    target.version = payload.version
    target.temperature = _resolve_temperature(payload.temperature)
    target.sourced_from = payload.sourced_from
    
    # Handle social_media_urls - sanitize and maintain backward compatibility
    if payload.social_media_urls:
        social_media_urls_dict = payload.social_media_urls.model_dump(exclude_none=True)
        target.social_media_urls = _sanitize_social_media_urls(social_media_urls_dict)
        # Maintain backward compatibility: if social_media_urls has linkedin, also set linkedin_profile_url
        if target.social_media_urls and target.social_media_urls.get("linkedin"):
            target.linkedin_profile_url = target.social_media_urls["linkedin"]
        else:
            target.linkedin_profile_url = payload.linkedin_profile_url
    else:
        target.social_media_urls = None
        target.linkedin_profile_url = payload.linkedin_profile_url
    
    target.seniority_level = payload.seniority_level
    target.primary_domain = payload.primary_domain
    target.domain_tags = _sanitize_domain_tags(payload.domain_tags)
    target.revenue_share_bps = payload.revenue_share_bps
    if payload.sourced_from == KnightSource.LINKEDIN_CV:
        target.last_profile_refresh = _now()

    await db.commit()
    await db.refresh(target)
    return _map_to_read(target)


@router.delete("/{knight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knight(
    knight_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    from app.models.user import User
    from uuid import UUID
    
    record = await db.get(Knight, knight_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knight not found.")
    if record.owner_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Official Knights cannot be deleted.")
    if record.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this Knight.")

    # If this is a LinkedIn-sourced knight, preserve original refresh date for cooldown
    # This ensures deletion doesn't reset the clock - next upload uses same date as refresh would
    if record.sourced_from == KnightSource.LINKEDIN_CV:
        user_uuid = UUID(str(current_user.id))
        user = await db.get(User, user_uuid)
        if user:
            # Use the original refresh date (or created_at if never refreshed)
            # This preserves the original refresh timeline
            original_refresh_date = record.last_profile_refresh or record.created_at
            if original_refresh_date:
                # Store the original refresh date so cooldown uses the same timeline
                user.studio_attempt_window_start = original_refresh_date
                await db.commit()
                await db.refresh(user)

    await db.delete(record)
    await db.commit()

