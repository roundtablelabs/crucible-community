import asyncio
from pathlib import Path

from app.core.config import get_settings


async def render_decision_brief(session_id: str, html: str) -> Path:
    """Placeholder PDF renderer using Playwright once integrated."""
    settings = get_settings()
    output_dir = Path("/tmp/artifacts") if settings.environment == "local" else Path("/data/artifacts")
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / f"{session_id}_decision_brief.pdf"
    await asyncio.sleep(0)  # simulate async work
    pdf_path.write_bytes(html.encode("utf-8"))
    return pdf_path
