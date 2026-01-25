# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

from uuid import UUID, uuid4
import logging
import json
import time
from typing import Optional
from datetime import datetime, timezone, timedelta
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi import Request as FastAPIRequest

from app.core.exceptions import NotFoundError, UnauthorizedError, ConflictError, ValidationError, ForbiddenError, InternalServerError, APIError
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.api.utils.audit import log_data_access
from app.core.redis_helpers import (
    get_session_topic,
    set_session_topic,
    clear_session_topic,
    get_session_knights,
    set_session_knights,
    clear_session_knights,
    set_task_running,
    clear_task_running,
    is_task_running,
    get_task_id,
    set_user_active_session,
    get_user_active_session,
    clear_user_active_session,
    add_stream_connection,
    remove_stream_connection,
    get_stream_connections,
    cache_events,
    get_cached_events,
    append_event_to_cache,
)
from app.db.session import get_db
from app.models import RoundtableSession, SessionKnight
from app.models.share_token import ShareToken
import secrets
from app.schemas.session import SessionCreate, SessionRead, SessionStatus, SessionUpdate
from app.services.artifacts.audit import get_audit_topic
from sqlalchemy.orm import selectinload
from celery.result import AsyncResult
from app.workers.tasks import run_debate_task
from app.workers.celery_app import celery_app

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)

# Fallback in-memory store for session topics (used if Redis fails)
# Key: session_id, Value: (topic string, timestamp)
# This is a fallback - Redis is preferred
_session_topics_fallback: dict[str, tuple[str, float]] = {}

# Track active debate tasks running in background
# Key: session_id, Value: (asyncio.Task, creation_timestamp)
# Note: Task objects stay in memory (can't serialize), but status is tracked in Redis
# Timestamp is used for TTL-based cleanup to prevent memory leaks
_active_debate_tasks: dict[str, tuple[asyncio.Task, float]] = {}

# Lock for atomic task creation to prevent race conditions
_task_creation_lock = asyncio.Lock()

# Track active sessions per user (enforce single active debate per user)
# Key: user_id (UUID), Value: (session_id, last_activity_timestamp)
# This is a fallback - Redis is preferred for persistence
# Timestamp is used for TTL-based cleanup to prevent memory leaks
_user_active_sessions: dict[UUID, tuple[str, float]] = {}

# Track active SSE streams (for client connections)
# Key: session_id, Value: set of client connection IDs (for tracking, not blocking)
# This is a fallback - Redis Sets are preferred for persistence
# Currently not actively used, but Redis helpers are available if needed
_active_sse_streams: dict[str, set[str]] = {}

# Cache for Celery task state checks to reduce Redis/Celery result backend queries
# Key: celery_task_id, Value: (state, timestamp)
_celery_task_state_cache: dict[str, tuple[str, float]] = {}
CELERY_STATE_CACHE_TTL = 30  # Cache task state for 30 seconds

# Cache for session topics to reduce Redis calls (Upstash charges per request)
# Key: session_id, Value: (topic, timestamp)
_session_topic_cache: dict[str, tuple[str, float]] = {}
SESSION_TOPIC_CACHE_TTL = 60  # Cache session topics for 60 seconds


async def cleanup_stale_memory_entries():
    """Remove stale entries from in-memory fallback stores to prevent memory leaks."""
    current_time = time.time()
    cutoff_time = current_time - 86400  # 24 hours
    
    # Clean up session topics older than 24 hours
    stale_topics = [
        key for key, value in _session_topics_fallback.items()
        if value[1] < cutoff_time
    ]
    for key in stale_topics:
        del _session_topics_fallback[key]
    if stale_topics:
        logger.info(f"[cleanup] Removed {len(stale_topics)} stale session topics from memory")
    
    # Clean up completed debate tasks and tasks older than 2 hours (max debate duration)
    max_debate_duration = 7200  # 2 hours in seconds
    completed_tasks = []
    old_tasks = []
    for session_id, (task, creation_time) in _active_debate_tasks.items():
        if task.done():
            completed_tasks.append(session_id)
        elif current_time - creation_time > max_debate_duration:
            old_tasks.append(session_id)
            logger.warning(f"[cleanup] Found stale debate task for session {session_id} (older than {max_debate_duration}s), cleaning up")
    
    for session_id in completed_tasks + old_tasks:
        _active_debate_tasks.pop(session_id, None)
    if completed_tasks or old_tasks:
        logger.info(f"[cleanup] Removed {len(completed_tasks)} completed and {len(old_tasks)} stale debate tasks from memory")
    
    # Clean up user active sessions older than 24 hours
    user_session_ttl = 86400  # 24 hours in seconds
    stale_user_sessions = [
        user_id for user_id, (session_id, last_activity) in _user_active_sessions.items()
        if current_time - last_activity > user_session_ttl or session_id not in _active_debate_tasks
    ]
    for user_id in stale_user_sessions:
        _user_active_sessions.pop(user_id, None)
    if stale_user_sessions:
        logger.info(f"[cleanup] Removed {len(stale_user_sessions)} stale user active sessions from memory")
    
    # Clean up stale Celery task state cache entries (older than TTL)
    stale_cache_entries = [
        task_id for task_id, (state, timestamp) in _celery_task_state_cache.items()
        if current_time - timestamp > CELERY_STATE_CACHE_TTL
    ]
    for task_id in stale_cache_entries:
        _celery_task_state_cache.pop(task_id, None)
    if stale_cache_entries:
        logger.debug(f"[cleanup] Removed {len(stale_cache_entries)} stale Celery task state cache entries")
        logger.debug(f"[cleanup] Removed {len(stale_user_sessions)} stale user session mappings")


async def verify_session_ownership(
    session: RoundtableSession | None,
    user_id: UUID,
    session_identifier: str | UUID | None = None,
) -> RoundtableSession:
    """
    Verify that a user owns a session. Raises HTTPException if not.
    
    Args:
        session: The session object (can be None)
        user_id: The user ID to verify ownership against
        session_identifier: Optional identifier for error messages
        
    Returns:
        The session if ownership is verified
        
    Raises:
        HTTPException: 403 if user doesn't own session, 404 if session not found
    """
    if not session:
        identifier = session_identifier or "session"
        raise NotFoundError(resource="Session", identifier=identifier)
    
    if str(session.user_id) != str(user_id):
        logger.warning(
            f"Access denied: User {user_id} attempted to access session {session.session_id} "
            f"owned by {session.user_id}"
        )
        raise ForbiddenError(message="You do not have permission to access this session")
    
    return session


def _map_session(record: RoundtableSession, strategic_question: str | None = None, topic_summary: str | None = None) -> SessionRead:
    # Get topic from database, fallback to in-memory store, then audit log if not available
    topic = record.topic
    if not topic:
        # Check Redis first, then fallback to in-memory store
        topic = get_session_topic(record.session_id)
        if not topic:
            topic_tuple = _session_topics_fallback.get(record.session_id)
            if topic_tuple:
                topic = topic_tuple[0]  # Extract topic string from tuple
    if not topic and record.audit_log_uri:
        topic = get_audit_topic(record.audit_log_uri)
    
    # Get knight_ids: Check Redis first (knights stored there during session creation)
    # In Community Edition, knights are stored in Redis during session creation, not in database yet
    knight_ids: list[str] = []
    redis_knights = get_session_knights(record.session_id)
    if redis_knights:
        knight_ids = redis_knights
    else:
        # If Redis doesn't have knights, they might be in database
        # But we need to avoid lazy loading in async context, so we'll return empty list here
        # The knights will be available from Redis when the session is accessed later
        # If we really need database knights, the caller should eagerly load the relationship first
        knight_ids = []
    
    # Fetch quality breakdown from Redis if quality_score exists
    quality_breakdown = None
    if record.quality_score is not None:
        try:
            from app.core.quality_storage import quality_storage
            scores = quality_storage.get_debate_scores(record.session_id)
            if scores:
                # Aggregate metrics from all events
                metrics = {}
                for score in scores:
                    for key in ['faithfulness', 'citation_quality', 'hallucination_risk', 'relevance']:
                        if key in score and score[key] is not None:
                            if key not in metrics:
                                metrics[key] = []
                            metrics[key].append(score[key])
                
                # Calculate averages
                quality_breakdown = {
                    key: sum(values) / len(values) if values else None
                    for key, values in metrics.items()
                }
        except Exception as e:
            logger.debug(f"Failed to fetch quality breakdown: {e}")
    
    return SessionRead(
        id=record.id,
        user_id=record.user_id,
        session_id=record.session_id,
        knight_ids=knight_ids,
        artifact_uri=record.artifact_uri,
        audit_log_uri=record.audit_log_uri,
        topic=topic,
        status=SessionStatus(record.status),
        topic_summary=topic_summary,
        strategic_question=strategic_question,
        created_at=record.created_at,
        updated_at=record.updated_at,
        completed_at=record.completed_at,
        quality_score=record.quality_score,
        quality_tier=record.quality_tier,
        quality_breakdown=quality_breakdown,
    )


def _apply_updates(record: RoundtableSession, payload: SessionUpdate) -> None:
    if payload.status is not None:
        record.status = payload.status.value
    if payload.artifact_uri is not None:
        record.artifact_uri = payload.artifact_uri
    if payload.audit_log_uri is not None:
        record.audit_log_uri = payload.audit_log_uri
    if payload.completed_at is not None:
        record.completed_at = payload.completed_at


def _require_member_user(user: CurrentUser) -> None:
    import logging
    logger = logging.getLogger(__name__)
    
    if user.is_guest:
        logger.warning(f"[_require_member_user] Rejecting guest user: id={user.id[:8] if user.id else None}..., is_guest={user.is_guest}")
        raise UnauthorizedError("Authentication required")
    try:
        UUID(str(user.id))
    except ValueError as exc:  # pragma: no cover - defensive
        logger.error(f"[_require_member_user] Invalid user ID format: {user.id}")
        raise UnauthorizedError(message="Invalid user identifier") from exc
    
    logger.info(f"[_require_member_user] User authenticated: id={user.id[:8]}..., is_guest={user.is_guest}")


@router.get("", response_model=list[SessionRead])
async def list_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionRead]:
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession)
        .options(selectinload(RoundtableSession.knights))
        .where(RoundtableSession.user_id == current_user.id)
        .order_by(RoundtableSession.created_at.desc())
    )
    sessions = result.scalars().unique().all()
    return [_map_session(session) for session in sessions]


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionRead:
    _require_member_user(current_user)
    session_id = payload.session_id or uuid4().hex

    existing = await db.scalar(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    if existing:
        raise ConflictError("Session already exists", details={"session_id": session_id})

    try:
        record = RoundtableSession(
            session_id=session_id,
            user_id=current_user.id,
            topic=None,  # Don't store topic in database for security
            artifact_uri=payload.artifact_uri,
            audit_log_uri=payload.audit_log_uri,
            status=(payload.status.value if payload.status else SessionStatus.RUNNING.value),
        )
        # Community Edition: Knights are created directly in database
        
        db.add(record)
        await db.flush()  # Flush to get the record.id without committing

        # Create SESSION_INITIALIZATION event if intake/moderator data is provided
        if payload.intake_summary or payload.intake_conversation or payload.moderator_brief:
            from app.schemas.events import SessionInitializationEvent, EventType
            from app.services.debate.phases import DebatePhase
            from app.services.debate.ledger import DatabaseLedger
            from app.services.debate.engine import StreamEnvelope
            
            initialization_event = SessionInitializationEvent(
                type=EventType.SESSION_INITIALIZATION,
                phase=DebatePhase.IDLE,
                session_id=session_id,
                sequence_id=0,
                intake_summary=payload.intake_summary,
                intake_conversation=payload.intake_conversation,
                moderator_brief=payload.moderator_brief,
            )
            
            # Create envelope for the event
            from app.services.debate.engine import ConfidenceSnapshot
            envelope = StreamEnvelope(
                payload=initialization_event,
                phase=DebatePhase.IDLE,
                sequence_id=0,
                deadline_at=datetime.now(timezone.utc),
                grace_deadline_at=datetime.now(timezone.utc),
                quality_gates={},
                confidence=ConfidenceSnapshot(),  # Empty confidence snapshot for initialization
            )
            
            # Write event using DatabaseLedger
            ledger = DatabaseLedger(session_pk=record.id)
            await ledger.write(envelope, db)
            logger.info(f"[create_session] Created SESSION_INITIALIZATION event for session {session_id}")

        # Store topic in Redis BEFORE database commit to ensure transaction isolation
        # If Redis write fails, we can rollback the database transaction
        # Use longer TTL (24 hours) to allow recovery after server restart
        if payload.topic:
            topic_ttl = 86400  # 24 hours - allows recovery after server restarts
            redis_write_success = False
            redis_error = None
            
            # Retry Redis write with exponential backoff
            for attempt in range(3):
                try:
                    set_session_topic(session_id, payload.topic, ttl=topic_ttl)
                    redis_write_success = True
                    logger.info(f"[create_session] Stored topic in Redis for session {session_id} (TTL: {topic_ttl}s, attempt {attempt + 1})")
                    break
                except Exception as e:
                    redis_error = e
                    if attempt < 2:
                        logger.warning(f"[create_session] Redis write failed (attempt {attempt + 1}/3): {redis_error}, retrying...")
                        await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff
                    else:
                        logger.error(f"[create_session] Failed to store topic in Redis after 3 attempts: {redis_error}")
            
            # If Redis write failed after all retries, use database as fallback
            # This maintains transaction isolation - we store in DB before commit
            if not redis_write_success:
                logger.warning(f"[create_session] Redis unavailable, storing topic in database as fallback for session {session_id}")
                # Store topic in database as fallback (security note: this is a fallback, topic should ideally not be in DB)
                record.topic = payload.topic
            
            # Always store in memory fallback regardless of Redis success
            _session_topics_fallback[session_id] = (payload.topic, time.time())  # Fallback with timestamp
        
        # Store knights in Redis (not in database yet)
        if payload.knight_ids:
            knights_ttl = 86400  # 24 hours - same as topic
            knights_redis_success = False
            knights_redis_error = None
            
            # Retry Redis write with exponential backoff
            for attempt in range(3):
                try:
                    from app.core.redis_helpers import set_session_knights
                    set_session_knights(session_id, payload.knight_ids, ttl=knights_ttl)
                    knights_redis_success = True
                    logger.info(f"[create_session] Stored {len(payload.knight_ids)} knights in Redis for session {session_id} (TTL: {knights_ttl}s, attempt {attempt + 1})")
                    break
                except Exception as e:
                    knights_redis_error = e
                    if attempt < 2:
                        logger.warning(f"[create_session] Redis knights write failed (attempt {attempt + 1}/3): {knights_redis_error}, retrying...")
                        await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff
                    else:
                        logger.error(f"[create_session] Failed to store knights in Redis after 3 attempts: {knights_redis_error}")
            
            if not knights_redis_success:
                logger.warning(f"[create_session] Redis unavailable for knights, session {session_id} created without knight storage")
                # Don't fail the session creation - knights can be restored from frontend if needed
        
        # Commit database transaction only after Redis write succeeds or DB fallback is set
        await db.commit()
        
        # Refresh the record to ensure it's properly loaded from database
        # Note: We don't need to eagerly load knights here because _map_session will get them from Redis
        await db.refresh(record)

        return _map_session(record)
    except Exception as e:
        logger.error(f"[create_session] Error creating session: {e}", exc_info=True)
        await db.rollback()
        raise InternalServerError(message="Failed to create session")


@router.get("/{session_db_id}", response_model=SessionRead)
async def get_session(
    session_db_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: FastAPIRequest = None,
) -> SessionRead:
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession)
        .options(selectinload(RoundtableSession.knights))
        .where(
            RoundtableSession.id == session_db_id,
            RoundtableSession.user_id == current_user.id,
        )
    )
    record = result.scalars().unique().first()
    if record is None:
        raise NotFoundError("session", str(session_db_id))
    
    # Log access for audit trail
    try:
        await log_data_access(
            db=db,
            user_id=current_user.id,
            resource_type="session",
            resource_id=record.id,
            action="read",
            request=request,
        )
        await db.commit()
    except Exception as audit_error:
        # Don't fail the main operation if audit logging fails
        logger.warning(f"Failed to log audit for session {record.session_id}: {audit_error}")
        await db.rollback()
    
    return _map_session(record)


@router.get("/external/{session_identifier}", response_model=SessionRead)
async def get_session_by_external_id(
    session_identifier: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: FastAPIRequest = None,
) -> SessionRead:
    """Get session by external session_id (not database UUID)."""
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession)
            .options(
                selectinload(RoundtableSession.knights),
            )
            .where(
                RoundtableSession.session_id == session_identifier,
                RoundtableSession.user_id == current_user.id,
            )
    )
    record = result.scalars().unique().first()
    if record is None:
        raise NotFoundError("session", session_identifier)
    
    # Log when frontend checks a completed session
    if record.status == SessionStatus.COMPLETED.value:
        logger.info(f"[sessions/external] Frontend checking completed session: {session_identifier} (user_id={current_user.id}, db_id={record.id})")
    
    # Try to fetch topicSummary and strategicQuestion from SESSION_INITIALIZATION event
    # First try sequence 0 (most common), then try any SESSION_INITIALIZATION event
    topic_summary = None
    strategic_question = None
    try:
        from app.models.session_event import SessionEvent
        import json as json_module
        
        # First, try sequence 0 (fastest path)
        event_result = await db.execute(
            select(SessionEvent)
            .where(
                SessionEvent.session_id == record.id,
                SessionEvent.sequence_id == 0
            )
            .limit(1)
        )
        init_event = event_result.scalars().first()
        
        # If not found, try to find any SESSION_INITIALIZATION event
        if not init_event:
            event_result = await db.execute(
                select(SessionEvent)
                .where(SessionEvent.session_id == record.id)
                .order_by(SessionEvent.sequence_id)
                .limit(50)  # Check first 50 events
            )
            events = event_result.scalars().all()
            for event in events:
                if event.payload:
                    payload = event.payload if isinstance(event.payload, dict) else json_module.loads(event.payload)
                    event_type = payload.get("type") if isinstance(payload, dict) else None
                    if event_type == "SESSION_INITIALIZATION":
                        init_event = event
                        logger.debug(f"[get_session_by_external_id] Found SESSION_INITIALIZATION event at sequence_id={event.sequence_id}")
                        break
        
        if init_event and init_event.payload:
            # Extract topicSummary and strategicQuestion from moderator_brief in the payload
            payload = init_event.payload if isinstance(init_event.payload, dict) else json_module.loads(init_event.payload)
            moderator_brief = payload.get("moderator_brief") or payload.get("moderatorBrief")
            if moderator_brief and isinstance(moderator_brief, dict):
                topic_summary = moderator_brief.get("topicSummary") or moderator_brief.get("topic_summary")
                strategic_question = moderator_brief.get("strategicQuestion") or moderator_brief.get("strategic_question")
                if topic_summary:
                    logger.debug(f"[get_session_by_external_id] Found topicSummary from event: {topic_summary[:50]}...")
                if strategic_question:
                    logger.debug(f"[get_session_by_external_id] Found strategicQuestion from event: {strategic_question[:50]}...")
            # Also check if topicSummary/strategicQuestion are directly in the payload (fallback)
            if not topic_summary:
                topic_summary = payload.get("topicSummary") or payload.get("topic_summary")
            if not strategic_question:
                strategic_question = payload.get("strategicQuestion") or payload.get("strategic_question")
    except Exception as e:
        logger.warning(f"[get_session_by_external_id] Failed to fetch moderator brief from events for session {session_identifier}: {e}")
        # Don't fail the request if we can't get moderator brief data
    
    # Fallback: Use topic from database/Redis as strategic_question if event doesn't exist yet
    # This is especially important for sessions that haven't started yet
    if not strategic_question:
        # Get topic from _map_session helper (which checks database, Redis, and fallback store)
        topic = record.topic
        if not topic:
            topic = get_session_topic(record.session_id)
            if not topic:
                topic_tuple = _session_topics_fallback.get(record.session_id)
                if topic_tuple:
                    topic = topic_tuple[0]  # Extract topic string from tuple
        if topic:
            strategic_question = topic
            logger.debug(f"[get_session_by_external_id] Using topic as fallback for strategic_question: {topic[:50]}...")
    
    # Log access for audit trail
    try:
        await log_data_access(
            db=db,
            user_id=current_user.id,
            resource_type="session",
            resource_id=record.id,
            action="read",
            request=request,
        )
        await db.commit()
    except Exception as audit_error:
        # Don't fail the main operation if audit logging fails
        logger.warning(f"Failed to log audit for session {session_identifier}: {audit_error}")
        await db.rollback()
    
    return _map_session(record, strategic_question=strategic_question, topic_summary=topic_summary)


@router.patch("/external/{session_identifier}", response_model=SessionRead)
async def update_session_by_external_id(
    session_identifier: str,
    payload: SessionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionRead:
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession)
            .options(
                selectinload(RoundtableSession.knights),
                selectinload(RoundtableSession.user),  # optional if referenced
            )
            .where(
                RoundtableSession.session_id == session_identifier,
                RoundtableSession.user_id == current_user.id,
            )
    )
    record = result.scalars().first()
    if record is None:
        raise NotFoundError(resource="Session", identifier=str(session_db_id))

    _apply_updates(record, payload)
    await db.commit()
    await db.refresh(record, attribute_names=["knights"])
    return _map_session(record)


@router.patch("/{session_db_id}", response_model=SessionRead)
async def update_session(
    session_db_id: UUID,
    payload: SessionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionRead:
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession)
        .options(selectinload(RoundtableSession.knights))
        .where(
            RoundtableSession.id == session_db_id,
            RoundtableSession.user_id == current_user.id,
        )
    )
    record = result.scalars().unique().first()
    if record is None:
        raise NotFoundError("session", str(session_db_id))

    _apply_updates(record, payload)
    await db.commit()
    await db.refresh(record, attribute_names=["knights"])
    return _map_session(record)


@router.delete("/{session_db_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_db_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: FastAPIRequest = None,
):
    _require_member_user(current_user)
    result = await db.execute(
        select(RoundtableSession).where(
            RoundtableSession.id == session_db_id,
            RoundtableSession.user_id == current_user.id,
        )
    )
    record = result.scalars().unique().first()
    if record is None:
        raise NotFoundError("session", str(session_db_id))
    
    # Log deletion for audit trail (before actual deletion)
    try:
        await log_data_access(
            db=db,
            user_id=current_user.id,
            resource_type="session",
            resource_id=record.id,
            action="delete",
            request=request,
        )
    except Exception as audit_error:
        logger.warning(f"Failed to log audit for session {record.session_id}: {audit_error}")
    
    # Clean up topic from Redis and fallback store
    clear_session_topic(record.session_id)
    if record.session_id in _session_topics_fallback:
        _session_topics_fallback.pop(record.session_id, None)
    
    # Clean up active debate task if exists
    if record.session_id in _active_debate_tasks:
        task, _ = _active_debate_tasks[record.session_id]
        if not task.done():
            task.cancel()
        _active_debate_tasks.pop(record.session_id, None)
    # Also clear from Redis
    clear_task_running(record.session_id)
    
    # Clean up user-session mapping if this was the active session
    if current_user.id in _user_active_sessions:
        active_session_id, _ = _user_active_sessions[current_user.id]
        if active_session_id == record.session_id:
            _user_active_sessions.pop(current_user.id, None)
    clear_user_active_session(current_user.id)
    
    # Clean up artifact if it exists (S3 or local file)
    if record.artifact_uri and (record.artifact_uri.startswith("s3://") or record.artifact_uri.startswith("file://")):
        try:
            from app.services.artifacts.s3_upload import delete_json_from_s3_async
            await delete_json_from_s3_async(record.artifact_uri)
            logger.info(f"[delete_session] Deleted artifact: {record.artifact_uri}")
        except Exception as artifact_error:
            # Log error but don't fail the deletion - artifact cleanup is best effort
            logger.warning(f"[delete_session] Failed to delete artifact {record.artifact_uri}: {artifact_error}")
    
    # Also clean up audit_log_uri if it exists and is different from artifact_uri
    if record.audit_log_uri and record.audit_log_uri != record.artifact_uri:
        if record.audit_log_uri.startswith("s3://") or record.audit_log_uri.startswith("file://"):
            try:
                from app.services.artifacts.s3_upload import delete_json_from_s3_async
                await delete_json_from_s3_async(record.audit_log_uri)
                logger.info(f"[delete_session] Deleted audit log artifact: {record.audit_log_uri}")
            except Exception as audit_error:
                # Log error but don't fail the deletion - artifact cleanup is best effort
                logger.warning(f"[delete_session] Failed to delete audit log artifact {record.audit_log_uri}: {audit_error}")
    
    # Clean up all files in file explorer directory that match this session ID
    # Files are named with patterns like: {session_id}_debate_output.json, {session_id}_executive_brief.pdf, etc.
    try:
        from app.services.artifacts.s3_upload import LOCAL_ARTIFACTS_PATH
        from pathlib import Path
        
        artifacts_dir = Path(LOCAL_ARTIFACTS_PATH)
        if artifacts_dir.exists():
            session_id = record.session_id
            # Find all files that start with the session_id pattern
            # This covers: {session_id}_debate_output.json, {session_id}_executive_brief.pdf, {session_id}_decision_brief.pdf, etc.
            pattern = f"{session_id}_*"
            matching_files = list(artifacts_dir.glob(pattern))
            
            deleted_count = 0
            for file_path in matching_files:
                if file_path.is_file():
                    try:
                        file_path.unlink()
                        deleted_count += 1
                        logger.info(f"[delete_session] Deleted file explorer file: {file_path.name}")
                    except Exception as file_error:
                        logger.warning(f"[delete_session] Failed to delete file {file_path.name}: {file_error}")
            
            if deleted_count > 0:
                logger.info(f"[delete_session] Deleted {deleted_count} file(s) from file explorer for session {session_id}")
    except Exception as file_explorer_error:
        # Log error but don't fail the deletion - file explorer cleanup is best effort
        logger.warning(f"[delete_session] Failed to clean up file explorer files for session {record.session_id}: {file_explorer_error}")
    
    from sqlalchemy import delete
    await db.execute(delete(RoundtableSession).where(RoundtableSession.id == session_db_id))
    await db.commit()
    logger.info(f"[delete_session] Deleted session {record.session_id} for user {current_user.id}")


from sse_starlette.sse import EventSourceResponse
from app.services.debate.engine import DebateEngine
from app.db.session import AsyncSessionLocal
from app.models.session_event import SessionEvent
from app.services.debate.phases import DebatePhase
from dataclasses import asdict
import json

@router.get("/{session_id}/stream")
async def stream_session_events(
    session_id: str,
    topic: Optional[str] = Query(None, description="Debate topic/question (not stored in database for security)"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    
    logger.info(f"[stream] Starting stream for session {session_id}, user {current_user.id if current_user else 'unknown'}, is_guest={current_user.is_guest if current_user else True}")
    
    # Check if user is guest (no token provided)
    if current_user.is_guest:
        logger.warning(f"[stream] Guest user attempted to access stream for session {session_id}")
        raise UnauthorizedError(message="Authentication required")
    
    try:
        _require_member_user(current_user)
    except HTTPException as e:
        logger.error(f"[stream] Authentication failed for session {session_id}: {e.detail}")
        raise
    
    # Fetch session early and close the session before long-running stream
    # This prevents connection timeout issues during the stream
    try:
        result = await db.execute(
            select(RoundtableSession)
            .options(selectinload(RoundtableSession.knights))
            .where(RoundtableSession.session_id == session_id)
        )
        session = result.scalars().first()
        
        # Verify session ownership before proceeding
        session = await verify_session_ownership(session, current_user.id, session_id)
        
        # Log access for audit trail (before closing db connection)
        # Note: Request is not available in this context, so we'll log without it
        try:
            await log_data_access(
                db=db,
                user_id=current_user.id,
                resource_type="session",
                resource_id=session.id,
                action="read",
                request=None,  # Request not available in this context
            )
            await db.commit()
        except Exception as audit_error:
            # Don't fail the main operation if audit logging fails
            logger.warning(f"Failed to log audit: {audit_error}")
        
        # Store session data we need before closing
        session_id_str = session.session_id
        knight_ids = [kn.knight_id for kn in session.knights]
        
        logger.info(f"[stream] Session found: {session_id_str}, knights: {len(knight_ids)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[stream] Error fetching session {session_id}: {e}", exc_info=True)
        await db.rollback()
        raise InternalServerError(message="Failed to fetch session")
    finally:
        # Close the database session early - we'll create a new one for the engine
        await db.close()

    # Get topic from query parameter, Redis, or fallback store
    session_topic = topic or get_session_topic(session_id) or (_session_topics_fallback.get(session_id)[0] if _session_topics_fallback.get(session_id) else None)
    
    if not session_topic:
        logger.error(f"[stream] No topic provided for session {session_id}")
        raise ValidationError(
            "Debate topic/question is required. Please provide it via 'topic' query parameter.",
            field="topic"
        )
    
    # If topic was provided as query parameter, store it in Redis with extended TTL
    if topic:
        set_session_topic(session_id, topic, ttl=86400)  # 24 hours
        logger.info(f"[stream] Stored topic in Redis for session {session_id} (24h TTL)")
    
    logger.info(f"[stream] Using topic from request/memory/Redis")

    # Check if session is already completed
    session_status = SessionStatus(session.status)
    if session_status == SessionStatus.COMPLETED:
        logger.info(f"[stream] Session {session_id} is already completed, streaming existing events only")
        # Stream existing events from database
        async def event_generator():
            async with AsyncSessionLocal() as engine_db:
                # Fetch existing events
                result = await engine_db.execute(
                    select(SessionEvent)
                    .where(SessionEvent.session_id == session.id)
                    .order_by(SessionEvent.sequence_id)
                )
                existing_events = result.scalars().all()
                
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "STREAM_STARTED",
                        "message": f"Streaming {len(existing_events)} existing events from completed session",
                        "session_id": session_id
                    })
                }
                
                for event in existing_events:
                    # Convert SessionEvent to StreamEnvelope-like format
                    envelope_dict = {
                        "payload": event.payload,
                        "phase": event.phase,
                        "sequence_id": event.sequence_id,
                        "deadline_at": event.created_at.isoformat(),
                        "grace_deadline_at": event.created_at.isoformat(),
                        "quality_gates": {},
                        "confidence": {"per_claim": {}, "calibration_bias": {}}
                    }
                    yield {
                        "event": "message",
                        "data": json.dumps(envelope_dict)
                    }
                
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "STREAM_COMPLETE",
                        "message": "All existing events streamed",
                        "session_id": session_id,
                        "total_events": len(existing_events)
                    })
                }
        
        return EventSourceResponse(event_generator())
    
    # Clean up stale debate tasks (older than 30 minutes - debates should complete much faster)
    current_time_utc = datetime.now(timezone.utc)
    current_time_seconds = time.time()
    stale_tasks = []
    for sid, (task, creation_time) in list(_active_debate_tasks.items()):
        if task.done():
            stale_tasks.append(sid)
    for stale_sid in stale_tasks:
        _active_debate_tasks.pop(stale_sid, None)
        clear_task_running(stale_sid)  # Clear from Redis
        # Also clean up user tracking if this was the active session
        # Check both Redis and in-memory fallback
        for uid, (active_sid, _) in list(_user_active_sessions.items()):
            if active_sid == stale_sid:
                _user_active_sessions.pop(uid, None)
                clear_user_active_session(uid)
        # Also check Redis for any user with this session
        # Note: This is a best-effort cleanup - Redis TTL will handle stale entries
        logger.info(f"[stream] Cleaned up completed debate task for session {stale_sid}")
    
    # Enforce single active debate per user: cancel existing debate if user starts a new one
    user_id = current_user.id
    existing_session_id = get_user_active_session(user_id)
    if not existing_session_id and user_id in _user_active_sessions:
        existing_session_id, _ = _user_active_sessions[user_id]
    if existing_session_id and existing_session_id != session_id:
        # User has a different active session - cancel it
        if existing_session_id in _active_debate_tasks:
            old_task, _ = _active_debate_tasks[existing_session_id]
            if not old_task.done():
                old_task.cancel()
                logger.info(f"[stream] Cancelling existing debate for user {user_id}: session {existing_session_id}")
            _active_debate_tasks.pop(existing_session_id, None)
        clear_task_running(existing_session_id)
        if user_id in _user_active_sessions:
            _user_active_sessions.pop(user_id, None)
        clear_user_active_session(user_id)
        logger.info(f"[stream] Cleared previous active session {existing_session_id} for user {user_id}")
    
    # Check if there are existing events
    existing_events_count = 0
    last_sequence_id = 0
    try:
        async with AsyncSessionLocal() as engine_db_check:
            result = await engine_db_check.execute(
                select(SessionEvent)
                .where(SessionEvent.session_id == session.id)
                .order_by(SessionEvent.sequence_id.desc())
                .limit(1)
            )
            last_event = result.scalars().first()
            if last_event:
                # Count total events and get last sequence_id
                count_result = await engine_db_check.execute(
                    select(func.count(SessionEvent.id))
                    .where(SessionEvent.session_id == session.id)
                )
                existing_events_count = count_result.scalar() or 0
                last_sequence_id = last_event.sequence_id
                logger.info(f"[stream] Session {session_id} already has {existing_events_count} events (last sequence_id: {last_sequence_id})")
    except Exception as e:
        logger.error(f"[stream] Error checking existing events: {e}")
    
    # Import background debate function
    from app.services.debate.background import run_debate_background
    
    # Track if task dispatch failed (for warning message)
    task_dispatch_failed = False
    
    # Start debate in background if not already running (Resume if partial events exist)
    # Use lock to prevent race condition when multiple stream connections check simultaneously
    async with _task_creation_lock:
        # Check if debate task is already running (INSIDE lock to prevent race conditions)
        debate_task_running = False
        if session_id in _active_debate_tasks:
            task, _ = _active_debate_tasks[session_id]
            if not task.done():
                debate_task_running = True
                logger.info(f"[stream] Debate task already running in background for session {session_id}")
            else:
                # Task completed, clean it up
                _active_debate_tasks.pop(session_id, None)
                clear_task_running(session_id)
                if user_id in _user_active_sessions:
                    active_session_id, _ = _user_active_sessions[user_id]
                    if active_session_id == session_id:
                        _user_active_sessions.pop(user_id, None)
                clear_user_active_session(user_id)
                logger.info(f"[stream] Debate task completed, cleaned up for session {session_id}")
        elif is_task_running(session_id):
            # Task status in Redis but not in memory (server restart scenario)
            # This means the server restarted but the debate should still be running
            # However, since asyncio tasks don't survive restarts, we need to restart it
            debate_task_running = False  # Set to False so we restart it
            logger.info(f"[stream] Debate task status found in Redis for session {session_id} (server restarted), will restart debate")
        
        if not debate_task_running:
            # Re-fetch celery_task_id from database INSIDE lock to prevent race conditions
            # The session object was fetched before the lock, so another request might have
            # already dispatched a task and updated celery_task_id since then
            fresh_celery_task_id = session.celery_task_id  # Default to original value
            try:
                async with AsyncSessionLocal() as check_db:
                    check_result = await check_db.execute(
                        select(RoundtableSession.celery_task_id)
                        .where(RoundtableSession.id == session.id)
                    )
                    fresh_celery_task_id = check_result.scalar()
                    if fresh_celery_task_id and fresh_celery_task_id != session.celery_task_id:
                        logger.info(f"[stream] Detected celery_task_id change: {session.celery_task_id} -> {fresh_celery_task_id} (another request dispatched task)")
            except Exception as check_error:
                logger.warning(f"[stream] Failed to re-fetch celery_task_id: {check_error}, using original value")
            
            # Check if Celery task already exists in database (INSIDE lock)
            if fresh_celery_task_id:
                # Check cached task state first to avoid querying Celery result backend
                task_state = None
                cached_state_info = _celery_task_state_cache.get(fresh_celery_task_id)
                current_time = time.time()
                
                if cached_state_info:
                    cached_state, cache_timestamp = cached_state_info
                    # Use cached state if it's fresh (within TTL)
                    if current_time - cache_timestamp < CELERY_STATE_CACHE_TTL:
                        task_state = cached_state
                        logger.debug(f"[stream] Using cached Celery task state for {fresh_celery_task_id}: {task_state}")
                
                # Only query Celery result backend if cache is stale or missing
                if task_state is None:
                    try:
                        result = AsyncResult(fresh_celery_task_id, app=celery_app)
                        task_state = result.state
                        # Cache the state
                        _celery_task_state_cache[fresh_celery_task_id] = (task_state, current_time)
                        logger.debug(f"[stream] Queried Celery task state for {fresh_celery_task_id}: {task_state} (cached)")
                    except Exception as celery_error:
                        # If query fails, try to use cached state even if stale
                        if cached_state_info:
                            task_state = cached_state_info[0]
                            logger.warning(
                                f"[stream] Failed to query Celery task state, using stale cache: {task_state}. "
                                f"Error: {celery_error}"
                            )
                        else:
                            raise celery_error
                
                # Check if task is still active (with error handling for Redis connection issues)
                try:
                    
                    # If task is PENDING, check if it's been stuck (no worker processing it)
                    # PENDING tasks that stay pending likely mean no worker is running
                    if task_state == 'PENDING':
                        # Check if we have existing events but task is still PENDING
                        # This means task was created but worker never picked it up
                        if existing_events_count > 0:
                            # Task was created but never started - likely no worker running
                            logger.warning(
                                f"[stream] ⚠️  Celery task {fresh_celery_task_id} is PENDING but session has {existing_events_count} existing events. "
                                f"This suggests worker is not running (task stuck in queue). Will restart task."
                            )
                            # Clear task ID to allow restart
                            task_state = 'STUCK'  # Force restart below
                        else:
                            # New task, check if session was created recently
                            # If session is old (>5 minutes) and still PENDING with no events, worker isn't running
                            # Use module-level imports (datetime, timezone, timedelta imported at top of file)
                            session_age = datetime.now(timezone.utc) - session.created_at
                            if session_age > timedelta(minutes=5):
                                logger.warning(
                                    f"[stream] ⚠️  Celery task {fresh_celery_task_id} is PENDING for {session_age.total_seconds():.0f}s. "
                                    f"Worker likely not running. Will restart task."
                                )
                                task_state = 'STUCK'  # Force restart
                            else:
                                # New task, give it a chance (might just be starting)
                                logger.info(f"[stream] Celery task {fresh_celery_task_id} is PENDING (waiting for worker, session age: {session_age.total_seconds():.0f}s)")
                                debate_task_running = True
                    elif task_state in ['STARTED', 'RETRY']:
                        logger.info(f"[stream] Celery task {fresh_celery_task_id} already running for session {session_id}")
                        debate_task_running = True
                    else:
                        # Task finished/failed/stuck, clear it and create new one
                        if task_state == 'STUCK':
                            logger.warning(f"[stream] Celery task {fresh_celery_task_id} is stuck (PENDING with no worker), creating new task")
                        else:
                            logger.info(f"[stream] Celery task {fresh_celery_task_id} is {task_state}, creating new task")
                        # Create new DB session for update (original db was closed)
                        async with AsyncSessionLocal() as update_db:
                            try:
                                update_result = await update_db.execute(
                                    select(RoundtableSession).where(RoundtableSession.id == session.id)
                                )
                                update_session = update_result.scalars().first()
                                if update_session:
                                    # Clear cached state for the old task
                                    if update_session.celery_task_id:
                                        _celery_task_state_cache.pop(update_session.celery_task_id, None)
                                    update_session.celery_task_id = None
                                    await update_db.commit()
                            except Exception as update_error:
                                await update_db.rollback()
                                logger.warning(f"[stream] Failed to clear celery_task_id: {update_error}")
                except Exception as celery_error:
                    # Redis connection error - log but continue (will create new task)
                    logger.warning(
                        f"[stream] Failed to check Celery task status for {fresh_celery_task_id} "
                        f"(Redis connection issue): {celery_error}. Will create new task."
                    )
                    # Clear cached state for this task since we can't verify it
                    if fresh_celery_task_id:
                        _celery_task_state_cache.pop(fresh_celery_task_id, None)
                    # Clear the task ID since we can't verify it's running
                    # Create new DB session for update (original db was closed)
                    async with AsyncSessionLocal() as update_db:
                        try:
                            update_result = await update_db.execute(
                                select(RoundtableSession).where(RoundtableSession.id == session.id)
                            )
                            update_session = update_result.scalars().first()
                            if update_session:
                                update_session.celery_task_id = None
                                await update_db.commit()
                        except Exception as update_error:
                            await update_db.rollback()
                            logger.warning(f"[stream] Failed to clear celery_task_id: {update_error}")
        
        if not debate_task_running:
            # Check if this is a resume scenario (existing events but no active task)
            is_resume = existing_events_count > 0
            if is_resume:
                logger.info(f"[stream] 🔄 Resuming debate for session {session_id} (found {existing_events_count} existing events)")
            else:
                logger.info(f"[stream] 🚀 Starting new debate for session {session_id}")
            
            logger.info(f"[stream] Debate task details: session_db_id={session.id}, session_id={session_id}, topic={session_topic[:50] if session_topic else 'None'}..., user_id={user_id}")
            
            # Dispatch new Celery task with error handling
            try:
                celery_task = run_debate_task.delay(
                    str(session.id),
                    session_id,
                    session_topic or "",
                    str(user_id)
                )
                # Create new DB session for update (original db was closed)
                async with AsyncSessionLocal() as update_db:
                    try:
                        update_result = await update_db.execute(
                            select(RoundtableSession).where(RoundtableSession.id == session.id)
                        )
                        update_session = update_result.scalars().first()
                        if update_session:
                            update_session.celery_task_id = celery_task.id
                            await update_db.commit()
                            # Cache the new task state
                            _celery_task_state_cache[celery_task.id] = ("PENDING", time.time())
                    except Exception as update_error:
                        await update_db.rollback()
                        logger.warning(f"[stream] Failed to update celery_task_id: {update_error}")
                
                # Also update Redis for backward compatibility
                try:
                    set_task_running(session_id, task_id=celery_task.id)
                    set_user_active_session(user_id, session_id)
                    # Update in-memory fallback stores with timestamps for TTL cleanup
                    # Note: Celery tasks are tracked in Redis, but we track them here for in-memory cleanup
                    # Since Celery tasks run in separate workers, we can't track asyncio.Task objects
                    # The cleanup will rely on Redis TTL, but we still track user sessions in memory
                    _user_active_sessions[user_id] = (session_id, time.time())
                except Exception as redis_error:
                    # Non-critical: tracking in Redis failed, but task is running
                    logger.warning(f"[stream] Failed to update Redis tracking: {redis_error}")
                    # Still update in-memory fallback even if Redis fails
                    _user_active_sessions[user_id] = (session_id, time.time())
                
                logger.info(f"[stream] ✅ Dispatched Celery task {celery_task.id} for session {session_id} (will restore state from {existing_events_count} existing events)")
            except Exception as dispatch_error:
                # Failed to start the debate task
                logger.error(f"[stream] ❌ Failed to dispatch Celery task: {dispatch_error}", exc_info=True)
                
                # Check if this is a Redis connection error or SSL configuration error
                error_str = str(dispatch_error).lower()
                is_redis_error = (
                    "redis" in error_str or
                    "connection" in error_str or
                    "result backend" in error_str or
                    "retry limit exceeded" in error_str or
                    "ssl_cert_reqs" in error_str or
                    "rediss://" in error_str
                )
                
                # If there are existing events, allow stream to continue (debate might already be running)
                # Only fail if this is a brand new debate with no events
                if existing_events_count > 0:
                    logger.warning(
                        f"[stream] ⚠️  Cannot start new debate task (Redis unavailable), but found {existing_events_count} existing events. "
                        "Stream will continue with existing events. Debate may resume when Redis is available."
                    )
                    task_dispatch_failed = True  # Flag for warning message
                    # Continue to stream existing events - don't raise error
                elif is_redis_error:
                    # Redis error but no existing events - still allow stream to start (will show error message)
                    # This allows users to see the error state rather than getting a 503
                    logger.warning(
                        f"[stream] ⚠️  Redis unavailable and no existing events. "
                        "Stream will start but debate cannot proceed until Redis is available."
                    )
                    task_dispatch_failed = True
                    # Continue to stream - will show error in UI
                else:
                    # No existing events and can't start new debate - this is a critical failure
                    logger.error(
                        f"[stream] ❌ Cannot start debate: no existing events and task dispatch failed. "
                        "This is a new debate that requires Redis to be available."
                    )
                    raise APIError(
                        code="SERVICE_UNAVAILABLE",
                        message="Failed to start debate engine. Please try again later.",
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE
                    )
    
    # Stream events by polling database (debate runs independently in background)
    async def event_generator():
        """Stream events by polling database. Debate runs in background task."""
        # Track this connection for debugging duplicate connections
        import uuid
        connection_id = str(uuid.uuid4())[:8]
        logger.info(f"[stream] Starting event generator for session {session_id}, connection_id={connection_id}")
        client_disconnected = False
        
        # Use async context manager to ensure connection is always properly closed
        async with AsyncSessionLocal() as stream_db:
            try:
                # First, stream all existing events
                result = await stream_db.execute(
                    select(SessionEvent)
                    .where(SessionEvent.session_id == session.id)
                    .order_by(SessionEvent.sequence_id)
                )
                existing_events = result.scalars().all()
                last_seen_sequence_id = last_sequence_id
                
                # Build stream start message
                message_parts = [f"Streaming {len(existing_events)} existing events"]
                if debate_task_running:
                    message_parts.append("debate running in background")
                elif task_dispatch_failed and existing_events_count > 0:
                    message_parts.append("⚠️ debate task unavailable (Redis connection issue) - showing existing events only")
                elif existing_events_count == 0:
                    message_parts.append("starting new debate")
                
                stream_start_msg = {
                    "type": "STREAM_STARTED",
                    "message": ", ".join(message_parts),
                    "session_id": session_id,
                    "existing_events_count": len(existing_events),
                    "debate_task_running": debate_task_running,
                    "task_dispatch_failed": task_dispatch_failed
                }
                logger.info(f"[stream] Sending STREAM_STARTED: {stream_start_msg}")
                yield {
                    "event": "message",
                    "data": json.dumps(stream_start_msg)
                }
                
                # Stream existing events
                for event in existing_events:
                    envelope_dict = {
                        "payload": event.payload,
                        "phase": event.phase,
                        "sequence_id": event.sequence_id,
                        "deadline_at": event.created_at.isoformat(),
                        "grace_deadline_at": event.created_at.isoformat(),
                        "quality_gates": {},
                        "confidence": {"per_claim": {}, "calibration_bias": {}}
                    }
                    try:
                        yield {
                            "event": "message",
                            "data": json.dumps(envelope_dict)
                        }
                    except (GeneratorExit, StopAsyncIteration, ConnectionError, BrokenPipeError):
                        client_disconnected = True
                        logger.info(f"[stream] Client disconnected while streaming existing events")
                        return
                
                # Poll for new events (debate continues in background)
                poll_interval = 1.0  # Check every second
                max_polls_without_events = 300  # Stop polling after 5 minutes of no new events
                polls_without_events = 0
                
                # Cache task_running check to reduce Redis API calls (Upstash charges per request)
                # Check Redis only every 30 polls (every 30 seconds) instead of every second
                # This significantly reduces Redis API calls while still detecting task completion
                cached_task_running = None
                task_running_check_interval = 30  # Check Redis every 30 polls (30 seconds)
                polls_since_task_check = 0
                
                while not client_disconnected:
                    try:
                        # Check if debate task is still running (optimized to reduce Redis calls)
                        polls_since_task_check += 1
                        if polls_since_task_check >= task_running_check_interval or cached_task_running is None:
                            # Check in-memory first (no Redis call)
                            task_running = False
                            if session_id in _active_debate_tasks:
                                task, _ = _active_debate_tasks[session_id]
                                task_running = not task.done()
                            # Only check Redis if not found in memory (and only every 10 seconds)
                            if not task_running:
                                task_running = is_task_running(session_id)  # Check Redis as fallback
                            cached_task_running = task_running
                            polls_since_task_check = 0
                        else:
                            # Use cached value (no Redis call)
                            task_running = cached_task_running
                            # Still check in-memory for faster updates (no Redis call)
                            if session_id in _active_debate_tasks:
                                task, _ = _active_debate_tasks[session_id]
                                if task.done():
                                    task_running = False
                                    cached_task_running = False
                        
                        # Skip Redis cache read - query database directly
                        # This eliminates 1 Redis call per second (saves ~3600 calls/hour per active stream)
                        # Database queries are fast enough and we're already querying every second
                        
                        # Poll for new events from database
                        result = await stream_db.execute(
                            select(SessionEvent)
                            .where(
                                SessionEvent.session_id == session.id,
                                SessionEvent.sequence_id > last_seen_sequence_id
                            )
                            .order_by(SessionEvent.sequence_id)
                        )
                        new_events = result.scalars().all()
                        if polls_without_events % 10 == 0:  # Log every 10 polls to avoid spam
                            logger.info(f"[stream] Poll #{polls_without_events} (conn={connection_id}): task_running={task_running}, last_sequence_id={last_seen_sequence_id}, found_events={len(new_events)}")
                        
                        # Check if session is complete (MODERATOR_RULING event means session is closed)
                        # Stop polling if we find a MODERATOR_RULING event
                        session_complete = False
                        if new_events:
                            for event in new_events:
                                if isinstance(event.payload, dict) and event.payload.get('type') == 'MODERATOR_RULING':
                                    session_complete = True
                                    logger.info(f"[stream] Session complete (MODERATOR_RULING received), stopping poll (conn={connection_id})")
                                    break
                        
                        # Only cache to Redis when we find new events (write-through, not read-through)
                        # This reduces Redis calls from every second to only when events are generated
                        if new_events:
                            events_data = [
                                {
                                    "payload": event.payload,
                                    "phase": event.phase,
                                    "sequence_id": event.sequence_id,
                                    "deadline_at": event.created_at.isoformat(),
                                    "grace_deadline_at": event.created_at.isoformat(),
                                }
                                for event in new_events
                            ]
                            # Cache asynchronously (fire and forget) to not block the stream
                            # This is a write operation, so it's less critical if it fails
                            try:
                                cache_events(session_id, last_seen_sequence_id, events_data, ttl=60)
                            except Exception as cache_err:
                                logger.debug(f"[stream] Failed to cache events (non-critical): {cache_err}")
                        
                        if new_events:
                            polls_without_events = 0
                            logger.info(f"[stream] Found {len(new_events)} new events, streaming to client")
                            for event in new_events:
                                last_seen_sequence_id = event.sequence_id
                                envelope_dict = {
                                    "payload": event.payload,
                                    "phase": event.phase,
                                    "sequence_id": event.sequence_id,
                                    "deadline_at": event.created_at.isoformat(),
                                    "grace_deadline_at": event.created_at.isoformat(),
                                    "quality_gates": {},
                                    "confidence": {"per_claim": {}, "calibration_bias": {}}
                                }
                                try:
                                    logger.debug(f"[stream] Yielding event: sequence_id={event.sequence_id}, phase={event.phase}, type={event.payload.get('type') if isinstance(event.payload, dict) else 'unknown'}")
                                    yield {
                                        "event": "message",
                                        "data": json.dumps(envelope_dict)
                                    }
                                except (GeneratorExit, StopAsyncIteration, ConnectionError, BrokenPipeError):
                                    client_disconnected = True
                                    logger.info(f"[stream] Client disconnected while streaming new events")
                                    return
                            
                            # Stop polling if session is complete (MODERATOR_RULING received)
                            if session_complete:
                                logger.info(f"[stream] Session complete (MODERATOR_RULING streamed), stopping poll (conn={connection_id})")
                                break
                        else:
                            polls_without_events += 1
                            # If debate task is done and no new events for a while, stop polling
                            if not task_running and polls_without_events > 10:
                                logger.info(f"[stream] Debate completed, no new events, stopping poll (conn={connection_id})")
                                break
                            # Only enforce max polls timeout if debate task is NOT running
                            # If debate is still running, continue polling (debates can have long phases)
                            if polls_without_events > max_polls_without_events:
                                if not task_running:
                                    logger.info(f"[stream] Max polls reached, debate not running, stopping")
                                    break
                                else:
                                    # Debate still running - reset counter to allow more polling
                                    # This prevents premature timeout during long debate phases
                                    logger.info(f"[stream] Max polls reached but debate still running (polls: {polls_without_events}), resetting counter to continue")
                                    polls_without_events = max_polls_without_events - 50  # Reset to allow 50 more polls
                        
                        await asyncio.sleep(poll_interval)
                    except (GeneratorExit, StopAsyncIteration, ConnectionError, BrokenPipeError):
                        client_disconnected = True
                        logger.info(f"[stream] Client disconnected during polling")
                        break
                    except Exception as poll_error:
                        logger.error(f"[stream] Error polling for events: {poll_error}")
                        await asyncio.sleep(poll_interval)
                
                # Send completion event
                if not client_disconnected:
                    try:
                        yield {
                            "event": "message",
                            "data": json.dumps({
                                "type": "STREAM_COMPLETE",
                                "message": "Event stream completed",
                                "session_id": session_id
                            })
                        }
                    except (GeneratorExit, StopAsyncIteration, ConnectionError, BrokenPipeError):
                        pass
            except Exception as e:
                logger.error(f"[stream] Error in event generator: {e}", exc_info=True)
                # Send error event to client before closing
                try:
                    yield {
                        "event": "message",
                        "data": json.dumps({
                            "type": "STREAM_ERROR",
                            "error": str(e),
                            "session_id": session_id
                        })
                    }
                except Exception as send_error:
                    logger.error(f"[stream] Failed to send error event: {send_error}")
            finally:
                # Context manager will automatically close the connection
                # This ensures the connection is always returned to the pool, even on cancellation
                logger.debug(f"[stream] Exiting event generator, database connection will be closed by context manager (conn={connection_id})")

    return EventSourceResponse(event_generator())


@router.get("/{session_id}/task-status")
async def get_task_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get Celery task status for a debate session."""
    # Fetch session by session_id
    result = await db.execute(
        select(RoundtableSession)
        .where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    # Verify ownership
    session = await verify_session_ownership(session, current_user.id, session_id)
    
    if not session.celery_task_id:
        return {
            "status": "not_started",
            "task_id": None,
            "ready": False
        }
    
    try:
        result = AsyncResult(session.celery_task_id, app=celery_app)
        return {
            "status": result.state,
            "task_id": session.celery_task_id,
            "ready": result.ready(),
            "successful": result.successful() if result.ready() else None,
        }
    except Exception as celery_error:
        # Redis connection error - return unknown status
        logger.warning(
            f"[task-status] Failed to get Celery task status for {session.celery_task_id} "
            f"(Redis connection issue): {celery_error}"
        )
        return {
            "status": "unknown",
            "task_id": session.celery_task_id,
            "ready": False,
            "error": "Redis connection unavailable",
        }


# Share Token Endpoints

@router.post("/{session_id}/share-token", status_code=status.HTTP_201_CREATED)
async def create_share_token(
    session_id: str,
    expires_days: int = Query(30, ge=1, le=365, description="Number of days until token expires"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Create or retrieve a share token for a session.
    Returns an existing valid token if one exists, otherwise creates a new one.
    Allows sharing private sessions via a secure token.
    """
    if current_user.is_guest:
        raise UnauthorizedError(message="Authentication required")
    
    # Find session by session_id (string identifier)
    result = await db.execute(
        select(RoundtableSession).where(RoundtableSession.session_id == session_id)
    )
    session = result.scalars().first()
    
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Verify ownership
    if str(session.user_id) != str(current_user.id):
        raise ForbiddenError(message="You do not have permission to share this session")
    
    # Check for existing valid token
    now = datetime.now(timezone.utc)
    existing_token_result = await db.execute(
        select(ShareToken)
        .where(
            ShareToken.session_id == session.id,
            ShareToken.user_id == current_user.id,
            ShareToken.revoked_at.is_(None),
            ShareToken.expires_at > now,
        )
        .order_by(ShareToken.created_at.desc())
        .limit(1)
    )
    existing_token = existing_token_result.scalars().first()
    
    if existing_token and existing_token.is_valid():
        # Return existing valid token
        logger.info(f"Reusing existing share token for session {session_id} by user {current_user.id}")
        return {
            "token": existing_token.token,
            "expires_at": existing_token.expires_at.isoformat(),
            "share_url": f"/app/sessions/{session_id}/shared/{existing_token.token}",
        }
    
    # No valid token exists, create a new one
    token = secrets.token_urlsafe(32)
    
    # Calculate expiration
    expires_at = now + timedelta(days=expires_days)
    
    # Create share token
    share_token = ShareToken(
        token=token,
        session_id=session.id,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    
    db.add(share_token)
    await db.commit()
    await db.refresh(share_token)
    
    logger.info(f"Created new share token for session {session_id} by user {current_user.id}")
    
    return {
        "token": token,
        "expires_at": expires_at.isoformat(),
        "share_url": f"/app/sessions/{session_id}/shared/{token}",
    }


@router.get("/{session_id}/shared/{token}")
async def get_shared_session(
    session_id: str,
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get session data using a share token (public endpoint, no auth required).
    """
    # Find share token with eagerly loaded session
    result = await db.execute(
        select(ShareToken)
        .options(selectinload(ShareToken.session))
        .where(ShareToken.token == token)
        .join(RoundtableSession, ShareToken.session_id == RoundtableSession.id)
        .where(RoundtableSession.session_id == session_id)
    )
    share_token = result.scalars().first()
    
    if not share_token:
        raise NotFoundError(resource="Share token", identifier=token)
    
    # Verify token is valid
    if not share_token.is_valid():
        raise ForbiddenError(message="This share link has expired or been revoked")
    
    # Get session (now eagerly loaded, safe to access)
    session = share_token.session
    if not session:
        raise NotFoundError(resource="Session", identifier=session_id)
    
    # Return session data (read-only)
    return {
        "session_id": session.session_id,
        "topic": session.topic,
        "status": session.status,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "shared": True,  # Indicate this is a shared view
    }


@router.delete("/{session_id}/share-token/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_token(
    session_id: str,
    token: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Revoke a share token (only the owner can revoke).
    """
    if current_user.is_guest:
        raise UnauthorizedError(message="Authentication required")
    
    # Find share token
    result = await db.execute(
        select(ShareToken)
        .where(ShareToken.token == token)
        .join(RoundtableSession, ShareToken.session_id == RoundtableSession.id)
        .where(RoundtableSession.session_id == session_id)
    )
    share_token = result.scalars().first()
    
    if not share_token:
        raise NotFoundError(resource="Share token", identifier=token)
    
    # Verify ownership
    if str(share_token.user_id) != str(current_user.id):
        raise ForbiddenError(message="You do not have permission to revoke this token")
    
    # Revoke token
    share_token.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    
    logger.info(f"Revoked share token {token} for session {session_id} by user {current_user.id}")


@router.get("/external/{session_identifier}/assigned-models")
async def get_assigned_models(
    session_identifier: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, dict[str, str | None]]:
    """
    Get assigned models for all knights in a session.
    Returns a map of knight_id -> { model_id, provider, model_name }.
    """
    _require_member_user(current_user)
    
    # Fetch session with knights
    result = await db.execute(
        select(RoundtableSession)
        .options(selectinload(RoundtableSession.knights))
        .where(
            RoundtableSession.session_id == session_identifier,
            RoundtableSession.user_id == current_user.id,
        )
    )
    record = result.scalars().unique().first()
    if record is None:
        raise NotFoundError("session", session_identifier)
    
    # Import here to avoid circular dependencies
    from app.models.model_catalog import LLMModel
    
    # Build map of knight_id -> assigned model info
    assigned_models: dict[str, dict[str, str | None]] = {}
    
    for session_knight in record.knights:
        if session_knight.assigned_model_id:
            # Fetch the assigned model details
            model_record = await db.get(LLMModel, session_knight.assigned_model_id)
            if model_record:
                assigned_models[session_knight.knight_id] = {
                    "model_id": model_record.id,
                    "provider": model_record.provider,
                    "model_name": model_record.display_name or model_record.api_identifier,
                }
    
    return assigned_models
