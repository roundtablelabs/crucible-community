"""
DEPRECATED: This module is deprecated and will be removed in a future version.
Use json_export.py and generate_executive_brief for PDF generation instead.
"""
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Template
from playwright.async_api import async_playwright
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session_event import SessionEvent
from app.schemas.events import EventType
from app.services.artifacts.templates import DECISION_BRIEF_TEMPLATE

logger = logging.getLogger(__name__)

class DecisionBriefGenerator:
    """
    DEPRECATED: This class is deprecated.
    Use json_export.export_debate_to_json() and generate_executive_brief instead.
    """
    def __init__(self, output_dir: Path = Path("/tmp/artifacts")):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def generate(self, session_id: str, db: AsyncSession) -> str:
        """Generate PDF artifact for a session and return the file path/URL."""
        
        # 1. Fetch Events
        stmt = select(SessionEvent).where(SessionEvent.session_id == session_id).order_by(SessionEvent.sequence_id)
        result = await db.execute(stmt)
        events = result.scalars().all()
        
        # 2. Extract Data
        context = self._build_context(session_id, events)
        
        # 3. Render HTML
        template = Template(DECISION_BRIEF_TEMPLATE)
        html_content = template.render(**context)
        
        # 4. Generate PDF
        filename = f"{session_id}_decision_brief.pdf"
        pdf_path = self.output_dir / filename
        
        try:
            # On Windows, Playwright uses multiprocessing which can fail if client disconnects
            # We catch ConnectionError and BrokenPipeError specifically for this case
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page()
                await page.set_content(html_content)
                await page.pdf(path=str(pdf_path), format="A4", margin={"top": "2cm", "bottom": "2cm", "left": "2cm", "right": "2cm"})
                await browser.close()
        except (ConnectionError, BrokenPipeError, KeyboardInterrupt) as disconnect_error:
            # Client disconnected during PDF generation (common on Windows)
            logger.warning(f"⚠️  Client disconnected during PDF generation: {type(disconnect_error).__name__}")
            # Return a placeholder path - the client won't receive this anyway
            html_path = self.output_dir / f"{session_id}_decision_brief.html"
            try:
                html_path.write_text(html_content, encoding="utf-8")
                return str(html_path)
            except Exception:
                return f"/tmp/artifacts/{session_id}_artifact_disconnected"
        except Exception as playwright_error:
            logger.warning(f"⚠️  PDF Generation failed (Playwright error): {playwright_error}")
            # Fallback to saving HTML
            try:
                html_path = self.output_dir / f"{session_id}_decision_brief.html"
                html_path.write_text(html_content, encoding="utf-8")
                logger.info(f"✅ Fallback: Saved HTML artifact at {html_path}")
                return str(html_path)
            except Exception as html_error:
                logger.error(f"❌ HTML fallback also failed: {html_error}")
                # Last resort: return a placeholder path
                # The debate can continue even if artifact generation fails
                placeholder_path = self.output_dir / f"{session_id}_artifact_failed.txt"
                try:
                    placeholder_path.write_text(
                        f"Artifact generation failed for session {session_id}.\n"
                        f"Playwright error: {playwright_error}\n"
                        f"HTML fallback error: {html_error}",
                        encoding="utf-8"
                    )
                    return str(placeholder_path)
                except Exception:
                    # If even this fails, return a minimal path string
                    return f"/tmp/artifacts/{session_id}_artifact_failed"

        return str(pdf_path)

    def _build_context(self, session_id: str, events: list[SessionEvent]) -> dict[str, Any]:
        context = {
            "date": datetime.now().strftime("%B %d, %Y"),
            "session_id_short": session_id[:8].upper(),
            "question": "Debate Session", # Default
            "summary": "No summary available.",
            "confidence": 0,
            "red_team": None,
            "positions": [],
            "challenges": [],
            "sources": []
        }
        
        # Helper to get payload safely
        def get_payload(e):
            return e.payload if isinstance(e.payload, dict) else {}

        for event in events:
            payload = get_payload(event)
            
            if event.event_type == EventType.RESEARCH_RESULT:
                # Add sources
                sources = payload.get("sources", [])
                context["sources"].extend(sources)
                
            elif event.event_type == EventType.POSITION_CARD:
                context["positions"].append({
                    "knight_role": payload.get("knight_id", "Knight"), # Ideally fetch role name
                    "headline": payload.get("headline", ""),
                    "body": payload.get("body", ""),
                    "citations": payload.get("citations", [])
                })
                
            elif event.event_type == EventType.CHALLENGE:
                context["challenges"].append({
                    "challenger_role": payload.get("knight_id", "Challenger"),
                    "target_role": payload.get("target_knight_id", "Target"),
                    "contestation": payload.get("contestation", "")
                })
                
            elif event.event_type == EventType.RED_TEAM_CRITIQUE:
                context["red_team"] = {
                    "critique": payload.get("critique", ""),
                    "flaws_identified": payload.get("flaws_identified", []),
                    "severity": payload.get("severity", "medium")
                }
                
            elif event.event_type == EventType.TRANSLATOR_OUTPUT:
                # Use translated content as the main summary if available
                context["summary"] = payload.get("translated_content", "")
                
            elif event.event_type == EventType.CONVERGENCE:
                if context["summary"] == "No summary available.": # Fallback if no translator
                    context["summary"] = payload.get("summary", "")
                context["confidence"] = int(payload.get("confidence", 0) * 100)
                
        return context
