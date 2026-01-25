"""JSON export utility for debate sessions."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import RoundtableSession
from app.models.session_event import SessionEvent


async def export_debate_to_json(
    session_id: str | UUID, session: RoundtableSession, db: AsyncSession, output_dir: Path | None = None
) -> str:
    """
    Export all debate events to JSON format.
    
    Args:
        session_id: The session ID (string or UUID) - the session_id field, not the database ID
        session: The RoundtableSession object
        db: Database session
        output_dir: Optional output directory (defaults to /tmp/artifacts or /data/artifacts)
    
    Returns:
        Path to the saved JSON file
    """
    # Determine output directory
    if output_dir is None:
        from app.core.config import get_settings
        settings = get_settings()
        output_dir = Path("/tmp/artifacts") if settings.environment == "local" else Path("/data/artifacts")
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Convert session_id to string for filename
    session_id_str = str(session_id) if isinstance(session_id, UUID) else session_id
    
    # Use session.session_id if available, otherwise use the provided session_id
    if hasattr(session, "session_id") and session.session_id:
        session_id_str = str(session.session_id)
    
    # Fetch all events for this session
    stmt = select(SessionEvent).where(SessionEvent.session_id == session.id).order_by(SessionEvent.sequence_id)
    result = await db.execute(stmt)
    events = result.scalars().all()
    
    # Build JSON structure
    json_data: dict[str, Any] = {
        "session_metadata": {
            "session_id": session_id_str,
            "session_db_id": str(session.id),
            "topic": session.topic,
            "status": session.status,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "exported_at": datetime.now().isoformat(),
        },
        "events": [],
    }
    
    # Add participants if available
    if session.knights:
        json_data["session_metadata"]["participants"] = [
            {
                "knight_id": str(knight.knight_id) if knight.knight_id else None,
                "session_knight_id": str(knight.id),
            }
            for knight in session.knights
        ]
    
    # Serialize events
    for event in events:
        event_data: dict[str, Any] = {
            "id": str(event.id),
            "sequence_id": event.sequence_id,
            "phase": event.phase,
            "event_type": event.event_type,
            "schema_version": event.schema_version,
            "payload": event.payload if isinstance(event.payload, dict) else {},
            "created_at": event.created_at.isoformat() if event.created_at else None,
        }
        
        # Add optional fields
        if event.knight_id:
            event_data["knight_id"] = str(event.knight_id)
        if event.prompt_tokens is not None:
            event_data["prompt_tokens"] = event.prompt_tokens
        if event.completion_tokens is not None:
            event_data["completion_tokens"] = event.completion_tokens
        if event.cost_cents is not None:
            event_data["cost_cents"] = event.cost_cents
        if event.latency_ms is not None:
            event_data["latency_ms"] = event.latency_ms
        
        json_data["events"].append(event_data)
    
    # Save to file
    filename = f"{session_id_str}_debate_output.json"
    json_path = output_dir / filename
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)
    
    return str(json_path)

