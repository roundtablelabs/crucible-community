
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

# Validate database URL before creating engine
if not settings.database_url:
    raise ValueError(
        "Database URL is not configured. Please set ROUNDTABLE_DATABASE_URL environment variable.\n"
        "For Supabase, use format: postgresql+asyncpg://postgres:[PASSWORD]@[HOST]:5432/postgres"
    )

# Connection pooling optimized for Supabase free tier
# - pool_pre_ping verifies connections before use (critical for free tier)
# - pool_recycle prevents stale connections (Supabase free tier has timeouts)
# - statement_cache_size=0 disables prepared statements (required for pgbouncer/Transaction Mode)
#
# NOTE: Pool size is configurable via ROUNDTABLE_DB_POOL_SIZE and ROUNDTABLE_DB_MAX_OVERFLOW.
# Defaults are 10 + 5 overflow = 15 max (increased after fixing connection leaks).
# Monitor connection pool exhaustion errors and adjust if needed. For higher traffic,
# consider using Supabase Transaction Mode (port 6543) which handles more concurrent connections efficiently.
engine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,              # Configurable pool size
    max_overflow=settings.db_max_overflow,        # Configurable overflow
    pool_pre_ping=True,        # Verify connections before use (handles connection drops)
    pool_recycle=1800,        # Recycle connections every 30 min (prevents stale connections)
    echo=False,
    future=True,
    connect_args={
        "statement_cache_size": 0,  # Disable prepared statement cache (required for pgbouncer)
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


def get_pool_status() -> dict:
    """
    Get current connection pool status for monitoring.
    
    Returns:
        Dictionary with pool statistics:
        - size: Current pool size
        - checked_in: Connections checked in to pool
        - checked_out: Connections checked out from pool
        - overflow: Current overflow connections
        - invalid: Invalid connections
    """
    pool = engine.pool
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalid() if hasattr(pool, "invalid") else 0,
        "max_size": pool.size() + pool._max_overflow if hasattr(pool, "_max_overflow") else None,
    }


def log_pool_status(logger) -> None:
    """
    Log connection pool status for monitoring.
    Call this periodically to detect connection leaks early.
    """
    try:
        status = get_pool_status()
        logger.info(
            f"[db-pool] Connection pool status: "
            f"size={status['size']}, "
            f"checked_in={status['checked_in']}, "
            f"checked_out={status['checked_out']}, "
            f"overflow={status['overflow']}, "
            f"invalid={status['invalid']}"
        )
        
        # Warn if pool is getting exhausted
        total_connections = status['checked_out'] + status['overflow']
        max_connections = status['max_size'] or (status['size'] + 5)  # Default overflow estimate
        if total_connections >= max_connections * 0.8:  # 80% threshold
            logger.warning(
                f"[db-pool] ⚠️ Connection pool usage is high: {total_connections}/{max_connections} connections in use. "
                f"Consider monitoring for connection leaks."
            )
    except Exception as e:
        logger.warning(f"[db-pool] Failed to get pool status: {e}")
