from __future__ import annotations

import uuid
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.events import DebateEventPayload
from app.models.session_event import SessionEvent
from app.core.redis_helpers import append_event_to_cache

if TYPE_CHECKING:
    from app.services.debate.engine import StreamEnvelope

logger = logging.getLogger(__name__)


class LedgerWriter(Protocol):
    async def write(self, envelope: "StreamEnvelope", db: AsyncSession) -> None:
        """Persist a debate event and associated metrics."""


@dataclass
class InMemoryLedger:
    """Placeholder ledger until persistence is wired up."""

    events: list[DebateEventPayload] = field(default_factory=list)

    async def write(self, envelope: "StreamEnvelope", db: AsyncSession) -> None:
        self.events.append(envelope.payload)


class DatabaseLedger:
    """Persist events to the database."""

    def __init__(self, session_pk: uuid.UUID | None = None) -> None:
        self.session_pk = session_pk

    async def write(self, envelope: "StreamEnvelope", db: AsyncSession) -> None:
        """
        Persist event to database with retry logic and proper error handling.
        
        IMPORTANT: Only write to Redis AFTER successful database commit to ensure consistency.
        """
        import asyncio
        from sqlalchemy.exc import OperationalError, DatabaseError
        
        # Determine correct session ID for foreign key
        # If we have the internal PK, use it. Otherwise try to convert payload string (risky if they differ)
        session_id_val = self.session_pk
        if session_id_val is None:
            # Fallback: Try to interpret payload session_id as UUID
            # This works if payload.session_id IS the UUID, but fails if it's a separate string ID
            try:
                import uuid
                session_id_val = uuid.UUID(str(envelope.payload.session_id))
            except ValueError:
                # We can't resolve the FK without a lookup, and we want to avoid implicit lookups here.
                logger.error(f"[DatabaseLedger] Cannot resolve session_id for event {envelope.sequence_id}, skipping database write")
                raise ValueError(f"Cannot resolve session_id for event {envelope.sequence_id}")

        event_model = SessionEvent(
            session_id=session_id_val, 
            phase=envelope.phase.value,
            event_type=envelope.payload.type.value,
            sequence_id=envelope.sequence_id,
            payload=envelope.payload.model_dump(mode="json"),
            knight_id=None, # Knight ID string vs UUID mismatch - keeping None for now
            # Extract token usage metrics from envelope if available
            prompt_tokens=envelope.prompt_tokens,
            completion_tokens=envelope.completion_tokens,
            cost_cents=envelope.cost_cents,
            latency_ms=envelope.latency_ms,
        )
        
        # Retry logic for database commit (handles transient connection issues)
        max_retries = 3
        retry_delay = 0.5  # seconds
        
        for attempt in range(max_retries):
            try:
                db.add(event_model)
                await db.commit()
                logger.debug(f"[DatabaseLedger] Successfully wrote event {envelope.sequence_id} to database (attempt {attempt + 1})")
                break  # Success, exit retry loop
            except (OperationalError, DatabaseError) as db_error:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"[DatabaseLedger] Database commit failed for event {envelope.sequence_id} (attempt {attempt + 1}/{max_retries}): {db_error}. "
                        f"Retrying in {retry_delay}s..."
                    )
                    await db.rollback()  # Rollback failed transaction
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    # Final attempt failed - log error and re-raise
                    logger.error(
                        f"[DatabaseLedger] ❌ CRITICAL: Failed to write event {envelope.sequence_id} to database after {max_retries} attempts: {db_error}",
                        exc_info=True
                    )
                    await db.rollback()
                    raise  # Re-raise to be caught by engine
            except Exception as e:
                # Non-database errors (validation, etc.) - don't retry
                logger.error(
                    f"[DatabaseLedger] ❌ Failed to write event {envelope.sequence_id} to database: {e}",
                    exc_info=True
                )
                await db.rollback()
                raise
        
        # Write-through cache: Only write to Redis AFTER successful database commit
        # This ensures Redis and database stay in sync
        try:
            # Get session_id string from payload (external session_id, not UUID)
            session_id_str = str(envelope.payload.session_id) if hasattr(envelope.payload, 'session_id') else None
            if session_id_str:
                event_data = {
                    "payload": envelope.payload.model_dump(mode="json"),
                    "phase": envelope.phase.value,
                    "sequence_id": envelope.sequence_id,
                    "deadline_at": envelope.deadline_at.isoformat() if hasattr(envelope.deadline_at, 'isoformat') else None,
                    "grace_deadline_at": envelope.grace_deadline_at.isoformat() if hasattr(envelope.grace_deadline_at, 'isoformat') else None,
                }
                append_event_to_cache(session_id_str, event_data, ttl=3600)
                logger.debug(f"[DatabaseLedger] Cached event {envelope.sequence_id} in Redis for session {session_id_str}")
        except Exception as cache_error:
            # Don't fail the write if caching fails - graceful degradation
            # But log it so we know Redis is having issues
            logger.warning(f"[DatabaseLedger] Failed to cache event {envelope.sequence_id} in Redis: {cache_error}")

