import asyncio
import sys
import traceback
from uuid import UUID
from celery import Task
from app.workers.celery_app import celery_app
from app.services.debate.background import run_debate_background
import logging

# Force logging to output to stderr (Celery captures this)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class AsyncTask(Task):
    """Base task that runs async functions in Celery."""
    def run_async(self, coro):
        """Run async coroutine in new event loop."""
        logger.info("[AsyncTask] Creating new event loop for coroutine")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Clean up database connections from previous event loop BEFORE starting the task
            # This prevents "attached to different loop" errors when connections from
            # a previous event loop are reused in the new event loop.
            logger.info("[AsyncTask] Cleaning up database connections from previous event loop")
            try:
                async def cleanup_old_connections():
                    """Dispose of connections from previous event loop."""
                    from app.db.session import engine
                    # Dispose of all connections in the pool to ensure we don't reuse
                    # connections that were created in a different event loop.
                    # Connections will be recreated on next use with the current event loop.
                    await engine.dispose(close=True)
                    logger.info("[AsyncTask] Disposed of old engine connections")
                
                # Run cleanup in the new event loop
                loop.run_until_complete(cleanup_old_connections())
            except Exception as cleanup_error:
                logger.warning(f"[AsyncTask] Warning during initial cleanup: {cleanup_error}")
            
            logger.info("[AsyncTask] Running coroutine in event loop")
            result = loop.run_until_complete(coro)
            
            # Wait for all pending tasks to complete before closing the loop
            # This ensures database connections and other async resources are properly cleaned up
            # Filter out the current task to avoid waiting on ourselves
            logger.info("[AsyncTask] Waiting for pending tasks to complete")
            try:
                pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
                if pending:
                    # Wait for all tasks with a timeout
                    try:
                        loop.run_until_complete(asyncio.wait_for(
                            asyncio.gather(*pending, return_exceptions=True),
                            timeout=5.0
                        ))
                        logger.info("[AsyncTask] All pending tasks completed")
                    except asyncio.TimeoutError:
                        logger.warning("[AsyncTask] Warning: Some tasks did not complete within timeout, cancelling")
                        # Cancel remaining tasks
                        for task in pending:
                            if not task.done():
                                task.cancel()
                        # Wait a bit more for cancellations
                        try:
                            loop.run_until_complete(asyncio.wait_for(
                                asyncio.gather(*pending, return_exceptions=True),
                                timeout=1.0
                            ))
                        except Exception:
                            pass
            except Exception as cleanup_error:
                logger.warning(f"[AsyncTask] Warning during task cleanup: {cleanup_error}")
            
            # Clean up database connections tied to this event loop
            # This prevents "attached to different loop" errors when the loop closes
            # The issue is that asyncpg connections are event-loop-specific, and when a new
            # event loop is created in Celery workers, connections from the pool that were
            # created in a different event loop cause errors when the loop closes.
            logger.info("[AsyncTask] Cleaning up database connections")
            try:
                async def cleanup_db_connections():
                    """Clean up database connections tied to the current event loop."""
                    from app.db.session import engine
                    # Since asyncpg connections are tied to specific event loops, we need to
                    # ensure all connections are properly closed before the loop closes.
                    # In a multiprocessing environment (Celery ForkPoolWorker), each worker
                    # process has its own engine instance, so we can safely dispose of
                    # connections in this process's pool.
                    try:
                        # Dispose of all connections in the engine's pool
                        # This closes all asyncpg connections gracefully and removes them
                        # from the pool before the event loop closes.
                        # Connections will be recreated on next use with the correct event loop.
                        # This is safe because:
                        # 1. All sessions should already be closed (using async with context managers)
                        # 2. Each Celery worker process has its own engine/pool instance
                        # 3. Connections will be recreated on next use with the correct event loop
                        await engine.dispose(close=True)
                        logger.info("[AsyncTask] Disposed of engine connections")
                    except Exception as dispose_error:
                        logger.warning(f"[AsyncTask] Warning during engine dispose: {dispose_error}")
                
                # Run the cleanup function
                loop.run_until_complete(cleanup_db_connections())
                
                # Add a small delay to allow asyncpg to complete connection cleanup
                # This ensures all async operations are fully completed before closing the loop
                import time
                time.sleep(0.1)  # 100ms delay for cleanup
                logger.info("[AsyncTask] Database connection cleanup completed")
            except Exception as db_cleanup_error:
                logger.warning(f"[AsyncTask] Warning during database cleanup: {db_cleanup_error}")
            
            return result
        except Exception as e:
            logger.error(f"[AsyncTask] ❌ Error in coroutine: {type(e).__name__}: {e}")
            traceback.print_exc()
            raise
        finally:
            # Final cleanup: cancel any remaining tasks and close the loop
            try:
                pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
                if pending:
                    logger.info(f"[AsyncTask] Cancelling {len(pending)} remaining tasks")
                    for task in pending:
                        task.cancel()
                    # Wait briefly for cancellations
                    try:
                        loop.run_until_complete(asyncio.wait_for(
                            asyncio.gather(*pending, return_exceptions=True),
                            timeout=0.5
                        ))
                    except Exception:
                        pass
            except Exception as final_cleanup_error:
                logger.warning(f"[AsyncTask] Warning during final cleanup: {final_cleanup_error}")
            
            logger.info("[AsyncTask] Closing event loop")
            try:
                loop.close()
            except Exception as close_error:
                logger.warning(f"[AsyncTask] Warning during loop close: {close_error}")


@celery_app.task(name="run_debate", bind=True, base=AsyncTask, max_retries=2, 
                 autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=600)
def run_debate_task(self, session_db_id: str, session_id: str, topic: str, user_id: str):
    """
    Execute debate via Celery - persists across server restarts.
    
    Args:
        session_db_id: Database UUID of session (as string)
        session_id: External session identifier
        topic: Debate topic/question
        user_id: User UUID (as string)
    """
    logger.info(f"[celery-task] ===== STARTING DEBATE TASK =====")
    logger.info(f"[celery-task] Task ID: {self.request.id}")
    logger.info(f"[celery-task] Session ID: {session_id}")
    logger.info(f"[celery-task] Session DB ID: {session_db_id}")
    logger.info(f"[celery-task] Topic: {topic[:100] if topic else 'None'}...")
    logger.info(f"[celery-task] User ID: {user_id}")
    
    try:
        # Convert string UUIDs back to UUID objects
        session_db_uuid = UUID(session_db_id)
        user_uuid = UUID(user_id)
        logger.info("[celery-task] UUIDs converted successfully")
        
        # Run the async debate function
        logger.info("[celery-task] Calling run_debate_background()...")
        result = self.run_async(
            run_debate_background(session_db_uuid, session_id, topic, user_uuid)
        )
        logger.info("[celery-task] ===== DEBATE TASK COMPLETED =====")
        return result
    except Exception as e:
        logger.error(f"[celery-task] ❌ TASK FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise


@celery_app.task(name="generate_decision_brief")
def generate_decision_brief(session_id: str) -> str:
    """Placeholder Celery task until Playwright integration."""
    return f"s3://artifacts/{session_id}.pdf"