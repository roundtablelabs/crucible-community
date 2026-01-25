"""Background debate execution service."""
import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import UUID
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models import RoundtableSession
from app.models.session import SessionKnight
from app.models.session_event import SessionEvent
from app.schemas.session import SessionStatus
from app.services.debate.engine import DebateEngine
from app.core.redis_helpers import get_session_knights

logger = logging.getLogger(__name__)


async def run_debate_background(
    session_db_id: UUID, 
    session_id_str: str, 
    topic: str, 
    user_id: UUID
) -> None:
    """
    Run debate engine in background, independent of client connections.
    
    Args:
        session_db_id: Database primary key for the session
        session_id_str: External session identifier
        topic: Debate topic/question
        user_id: User ID who owns the session
    """
    # Use context manager to ensure connection is properly closed
    async with AsyncSessionLocal() as engine_db:
        logger.info(f"[background-debate] 🚀 Starting debate for session {session_id_str}")
        logger.info(f"[background-debate] Topic: {topic[:100] if topic else 'None'}...")
        logger.info(f"[background-debate] User ID: {user_id}, Session DB ID: {session_db_id}")
        
        # Verify database connection is healthy before starting
        try:
            await engine_db.execute(select(1))
            logger.debug(f"[background-debate] Database connection verified")
        except Exception as conn_error:
            logger.error(f"[background-debate] ❌ Database connection check failed: {conn_error}", exc_info=True)
            raise  # Re-raise to fail fast if DB is down
        
        # Fetch session and verify ownership
        result = await engine_db.execute(
            select(RoundtableSession)
            .options(selectinload(RoundtableSession.knights))
            .where(RoundtableSession.id == session_db_id)
        )
        engine_session = result.scalars().first()
        
        # Verify session exists
        if not engine_session:
            logger.error(f"[background-debate] Session {session_id_str} not found")
            return
        
        # Verify session ownership
        if str(engine_session.user_id) != str(user_id):
            logger.error(f"[background-debate] Access denied: User {user_id} does not own session {session_id_str}")
            return
        
        # Load knights from Redis if not in database (Community Edition: knights stored in Redis during session creation)
        if not engine_session.knights or len(engine_session.knights) == 0:
            logger.info(f"[background-debate] No knights in database, loading from Redis for session {session_id_str}")
            redis_knight_ids = get_session_knights(session_id_str)
            if redis_knight_ids:
                logger.info(f"[background-debate] Found {len(redis_knight_ids)} knights in Redis: {redis_knight_ids}")
                # Create SessionKnight objects and add them to the session
                # Note: We don't persist these to DB - they're just for the engine to use
                engine_session.knights = [
                    SessionKnight(
                        session_id=engine_session.id,
                        user_id=engine_session.user_id,
                        knight_id=knight_id
                    )
                    for knight_id in redis_knight_ids
                ]
                logger.info(f"[background-debate] Populated session.knights with {len(engine_session.knights)} knights from Redis")
            else:
                logger.error(f"[background-debate] ❌ No knights found in Redis for session {session_id_str}")
                raise ValueError(f"No knights found for session {session_id_str}. At least one knight is required to start a debate.")
        else:
            logger.info(f"[background-debate] Found {len(engine_session.knights)} knights in database for session {session_id_str}")
        
        # Use topic from database if available (for paid sessions), otherwise use provided topic
        if engine_session.topic:
            topic = engine_session.topic
            logger.info(f"[background-debate] Using topic from database: {topic[:100]}...")
        elif topic:
            # For non-paid sessions, topic is passed in but not stored in DB
            logger.info(f"[background-debate] Using provided topic (not in database)")
        else:
            # No topic available - this should not happen for active sessions
            logger.error(f"[background-debate] ❌ No topic available for session {session_id_str} (status={engine_session.status})")
            raise ValueError(f"No topic available for debate session {session_id_str}. Topic is required to start a debate.")
        
        # Validate topic is not empty
        if not topic or not topic.strip():
            logger.error(f"[background-debate] ❌ Topic is empty for session {session_id_str}")
            raise ValueError(f"Topic cannot be empty for debate session {session_id_str}")
        
        # Set topic on session object so engine.stream_session() can access it via _get_question()
        # This is needed because topic may be passed as parameter (not stored in DB for unpaid sessions)
        engine_session.topic = topic
        logger.info(f"[background-debate] Set session.topic for engine access")
        
        # Create engine with database ledger to persist events
        from app.services.debate.ledger import DatabaseLedger
        ledger = DatabaseLedger(session_pk=engine_session.id)
        engine = DebateEngine(ledger_writer=ledger)
        
        # Resume: Hydrate state from existing events if any
        # Initialize before try block to ensure it's always defined in except handler
        existing_events_models = []
        try:
            # Fetch all existing events ordered by sequence_id
            events_result = await engine_db.execute(
                select(SessionEvent)
                .where(SessionEvent.session_id == session_db_id)
                .order_by(SessionEvent.sequence_id)
            )
            existing_events_models = events_result.scalars().all()
            
            if existing_events_models:
                logger.info(f"[background-debate] Resuming debate with {len(existing_events_models)} existing events")
                # Convert SessionEvent models to payloads
                # The payload field in SessionEvent is already a dict/JSON
                event_payloads = []
                for evt in existing_events_models:
                    # Ensure payload is dict
                    p = evt.payload if isinstance(evt.payload, dict) else json.loads(evt.payload)
                    event_payloads.append(p)
                
                # Pass knights count for validation
                knights_count = len(engine_session.knights) if engine_session.knights else 0
                engine.restore_state(event_payloads, knights_count=knights_count)
        except Exception as restore_error:
            logger.error(f"[background-debate] Failed to restore state: {restore_error}", exc_info=True)
            
            # CRITICAL: If session has existing events, we MUST restore state or fail
            # Proceeding without restoration will cause duplicate events and waste LLM calls
            if existing_events_models:
                error_msg = (
                    f"CRITICAL: Cannot proceed without state restoration for session {session_id_str}. "
                    f"Session has {len(existing_events_models)} existing events. "
                    f"Restoration failed: {restore_error}"
                )
                logger.error(f"[background-debate] {error_msg}", exc_info=True)
                
                # Update session status to failed
                try:
                    engine_session.status = "failed"
                    await engine_db.commit()
                    logger.info(f"[background-debate] Marked session {session_id_str} as failed due to restoration error")
                except Exception as status_error:
                    logger.error(f"[background-debate] Failed to update session status: {status_error}")
                
                # Re-raise to prevent duplicate event generation
                raise RuntimeError(error_msg) from restore_error
            
            # Only proceed if this is a brand new session with no events
            logger.warning(
                f"[background-debate] Proceeding without restoration (new session, no events). "
                f"Error was: {restore_error}"
            )
        
        # Run debate - this will persist all events to database
        event_count = 0
        last_logged_count = 0
        try:
            logger.info(f"[background-debate] Starting debate stream for session {session_id_str} with topic: {topic[:100]}...")
            logger.info(f"[background-debate] Knights count: {len(engine_session.knights) if engine_session.knights else 0}")
            logger.info(f"[background-debate] DebateEngine initialized, about to call stream_session()")
            async for envelope in engine.stream_session(engine_session, engine_db):
                logger.debug(f"[background-debate] Received envelope: phase={envelope.phase.value}, sequence_id={envelope.sequence_id}")
                event_count += 1
                # Log every 5 events to reduce log noise, but always log phase changes
                if event_count % 5 == 0 or event_count - last_logged_count >= 5:
                    logger.info(f"[background-debate] Generated event #{event_count}, phase: {envelope.phase.value}, sequence_id: {envelope.sequence_id}")
                    last_logged_count = event_count
                # Events are automatically persisted by DatabaseLedger (with retry logic)
            
            logger.info(f"[background-debate] ✅ Debate completed for session {session_id_str}, total events: {event_count}")
        except RuntimeError as runtime_error:
            # RuntimeErrors (security failures, validation errors) - log and re-raise so they're visible
            error_msg = str(runtime_error)
            logger.error(f"[background-debate] ❌ RuntimeError in debate engine for session {session_id_str}: {error_msg}", exc_info=True)
            # Update session status to failed
            try:
                engine_session.status = "failed"
                await engine_db.commit()
                logger.info(f"[background-debate] Marked session {session_id_str} as failed due to RuntimeError")
            except Exception as status_error:
                logger.error(f"[background-debate] Failed to update session status: {status_error}")
            raise  # Re-raise so it's visible in logs
        except ValueError as value_error:
            # ValueErrors (missing topic, invalid input) - log and re-raise
            error_msg = str(value_error)
            logger.error(f"[background-debate] ❌ ValueError in debate engine for session {session_id_str}: {error_msg}", exc_info=True)
            # Update session status to failed
            try:
                engine_session.status = "failed"
                await engine_db.commit()
                logger.info(f"[background-debate] Marked session {session_id_str} as failed due to ValueError")
            except Exception as status_error:
                logger.error(f"[background-debate] Failed to update session status: {status_error}")
            raise  # Re-raise so it's visible in logs
        except Exception as stream_error:
            # Log other exceptions but don't re-raise - allow cleanup to happen
            logger.error(f"[background-debate] ❌ Exception during debate stream for session {session_id_str}: {stream_error}", exc_info=True)
            # Still log completion even if there was an error
            logger.warning(f"[background-debate] Debate stream ended with error for session {session_id_str}, events generated: {event_count}")
            # Update session status to failed
            try:
                engine_session.status = "failed"
                await engine_db.commit()
                logger.info(f"[background-debate] Marked session {session_id_str} as failed due to exception")
            except Exception as status_error:
                logger.error(f"[background-debate] Failed to update session status: {status_error}")
        
        # Check if JSON artifact already exists from ARTIFACT_READY phase
        audit_log_uri = engine_session.audit_log_uri
        
        # Only export/upload if JSON artifact doesn't already exist
        if not audit_log_uri:
            try:
                from app.services.artifacts.json_export import export_debate_to_json
                from app.services.artifacts.s3_upload import upload_json_to_s3_async
                
                # Export JSON (fallback if ARTIFACT_READY phase didn't export)
                json_path = await export_debate_to_json(session_id_str, engine_session, engine_db)
                
                # Upload to S3 (async)
                try:
                    s3_uri = await upload_json_to_s3_async(Path(json_path), session_id_str)
                    audit_log_uri = s3_uri
                    # Update audit_log_uri in database
                    engine_session.audit_log_uri = s3_uri
                    await engine_db.commit()
                    logger.info(f"[background-debate] Uploaded JSON to S3: {s3_uri}")
                    
                    # Clean up local file after successful S3 upload
                    try:
                        Path(json_path).unlink(missing_ok=True)
                        logger.info(f"[background-debate] Cleaned up local file: {json_path}")
                    except Exception as cleanup_error:
                        logger.warning(f"[background-debate] Failed to cleanup local file: {cleanup_error}")
                except Exception as s3_error:
                    # S3 upload failed, but continue with local path
                    logger.warning(f"[background-debate] Failed to upload to S3: {s3_error}, using local path: {json_path}")
                    audit_log_uri = json_path
                    engine_session.audit_log_uri = json_path
                    await engine_db.commit()
            except Exception as export_error:
                logger.warning(f"[background-debate] Failed to export/upload JSON: {export_error}")
        else:
            logger.info(f"[background-debate] JSON artifact already exists: {audit_log_uri}, skipping export/upload")
        
        # Update session status to completed
        try:
            # Refresh session from database to avoid stale data
            await engine_db.refresh(engine_session)
            
            engine_session.status = SessionStatus.COMPLETED.value
            engine_session.completed_at = datetime.now(timezone.utc)
            engine_session.celery_task_id = None  # Clear task ID on completion
            
            # Only update audit_log_uri if we have one and it's not already set (JSON goes to audit_log_uri)
            if audit_log_uri and not engine_session.audit_log_uri:
                engine_session.audit_log_uri = audit_log_uri
                logger.info(f"[background-debate] Set audit_log_uri: {audit_log_uri}")
            elif not audit_log_uri:
                logger.warning(f"[background-debate] No audit_log_uri available for session {session_id_str}")
            elif engine_session.artifact_uri:
                logger.info(f"[background-debate] Artifact_uri already set: {engine_session.artifact_uri}")
            
            await engine_db.commit()
            logger.info(f"[background-debate] Session {session_id_str} marked as completed")
            
            # Batch evaluate quality metrics (non-blocking, runs after debate completes)
            # DISABLED: Evaluation functions disabled in production
            # Note: We need to ensure this completes before the event loop closes
            # to avoid "Task was destroyed but it is pending" errors
            # try:
            #     from app.core.batch_evals import batch_evaluate_session_quality
            #     import asyncio
            #     
            #     # Create a new database session for the evaluation task
            #     # Note: AsyncSessionLocal is already imported at the top of the file
            #     
            #     async def run_evaluation():
            #         async with AsyncSessionLocal() as eval_db:
            #             try:
            #                 result = await batch_evaluate_session_quality(
            #                     session_db_id=session_db_id,
            #                     session_id=session_id_str,
            #                     question=topic,
            #                     db=eval_db
            #                 )
            #                 logger.info(f"[background-debate] Batch evaluation completed: {result.get('evaluation_method', 'unknown')}")
            #             except Exception as e:
            #                 logger.error(f"[background-debate] Batch evaluation error: {e}", exc_info=True)
            #     
            #     # Create task and store reference so we can wait for it
            #     eval_task = asyncio.create_task(run_evaluation())
            #     logger.info(f"[background-debate] Queued batch quality evaluation for session {session_id_str}")
            #     
            #     # Wait for evaluation to complete (with timeout) to avoid event loop closing issues
            #     # This ensures httpx clients are properly closed before the event loop closes
            #     try:
            #         await asyncio.wait_for(eval_task, timeout=300.0)  # 5 minute timeout
            #     except asyncio.TimeoutError:
            #         logger.warning(f"[background-debate] Batch evaluation timed out after 5 minutes")
            #         eval_task.cancel()
            #         try:
            #             await eval_task
            #         except asyncio.CancelledError:
            #             pass
            #     except Exception as e:
            #         logger.error(f"[background-debate] Error waiting for evaluation: {e}", exc_info=True)
            # except Exception as eval_error:
            #     logger.warning(f"[background-debate] Failed to queue batch evaluation: {eval_error}")
        except Exception as e:
            logger.error(f"[background-debate] Failed to update session status: {e}", exc_info=True)
            try:
                await engine_db.rollback()
            except Exception as rollback_error:
                logger.error(f"[background-debate] Failed to rollback transaction: {rollback_error}", exc_info=True)
        
    # Clean up task tracking (outside context manager, after connection is closed)
    try:
        from app.core.redis_helpers import clear_task_running, clear_user_active_session
        
        # Note: We can't access _active_debate_tasks from here (circular import)
        # The sessions router will handle in-memory cleanup when it detects task is done
        clear_task_running(session_id_str)  # Clear from Redis
        clear_user_active_session(user_id)
        logger.info(f"[background-debate] Cleaned up debate task for session {session_id_str}")
    except Exception as cleanup_error:
        logger.error(f"[background-debate] Error during cleanup: {cleanup_error}", exc_info=True)


async def start_debate_background(
    session_id: str,
    topic: str | None = None,
    user_id: UUID | None = None,
) -> None:
    """
    Start a debate in the background (non-blocking).
    
    This function creates an asyncio task to run the debate and tracks it.
    
    Args:
        session_id: External session identifier
        topic: Debate topic (optional, will use database topic for paid sessions)
        user_id: User ID (optional, will fetch from session if not provided)
    """
    from app.core.redis_helpers import set_task_running, set_user_active_session
    
    # Fetch session to get database ID and user_id
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RoundtableSession)
            .options(selectinload(RoundtableSession.knights))
            .where(RoundtableSession.session_id == session_id)
        )
        session = result.scalars().first()
        
        if not session:
            logger.error(f"[start-debate] Session {session_id} not found")
            return
        
        if not user_id:
            user_id = session.user_id
        
        # Use topic from database if available (for paid sessions), otherwise use provided topic
        if session.topic:
            topic = session.topic
            logger.info(f"[start-debate] Using topic from database for session {session_id}")
        elif not topic:
            logger.warning(f"[start-debate] No topic provided and none in database for session {session_id}")
            return
        
        session_db_id = session.id
    
    # Import here to avoid circular imports - use a module-level dict
    # We'll need to access the task tracking from sessions router
    # For now, create the task directly and let sessions router manage tracking
    # This function is meant to be called from webhook, which doesn't need task tracking
    import time
    task = asyncio.create_task(
        run_debate_background(session_db_id, session_id, topic, user_id)
    )
    
    # Store task status in Redis for persistence
    set_task_running(session_id)
    
    # Register this as the user's active session
    set_user_active_session(user_id, session_id)
    
    # Update in-memory fallback stores with timestamps for TTL cleanup
    # Import here inside function to avoid circular import (sessions.py imports this module)
    try:
        from app.api.routers.sessions import _active_debate_tasks, _user_active_sessions
        _active_debate_tasks[session_id] = (task, time.time())
        _user_active_sessions[user_id] = (session_id, time.time())
    except ImportError:
        # If import fails (circular import), log warning but continue
        # Redis tracking is still active, so this is non-critical
        logger.warning(f"[start-debate] Could not update in-memory task tracking (circular import), Redis tracking is still active")
    
    logger.info(f"[start-debate] ✅ Started debate task for session {session_id}")

