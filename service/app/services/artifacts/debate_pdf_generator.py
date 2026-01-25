"""
PDF generation service for full debate documents.
Generates PDFs from session JSON using direct extraction (no LLM).
Extracted from trial/json_to_document.py - completely self-contained.
"""
import asyncio
import logging
import platform
from datetime import datetime
from typing import Any, Dict, List

try:
    import markdown
    MARKDOWN_AVAILABLE = True
except ImportError:
    MARKDOWN_AVAILABLE = False

logger = logging.getLogger(__name__)


# ============================================================================
# Data Extraction Functions
# ============================================================================

def extract_session_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Extract session metadata fields."""
    return {
        "topic": metadata.get("topic", ""),
        "created_at": metadata.get("created_at", "")
    }


def extract_session_initialization(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Extract session_initialization event."""
    for event in events:
        if event.get("event_type") == "session_initialization":
            payload = event.get("payload", {})
            brief = payload.get("moderator_brief", {})
            return {
                "intake_summary": payload.get("intake_summary", ""),
                "moderator_brief": {
                    "topicSummary": brief.get("topicSummary", ""),
                    "strategicQuestion": brief.get("strategicQuestion", ""),
                    "missionStatement": brief.get("missionStatement", ""),
                    "keyAssumptions": brief.get("keyAssumptions", [])
                }
            }
    return {}


def extract_research_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract research_result events."""
    research_events = []
    for event in events:
        if event.get("event_type") == "research_result":
            payload = event.get("payload", {})
            research_events.append({
                "knight_id": payload.get("knight_id", ""),
                "summary": payload.get("summary", ""),
                "sources": payload.get("sources", [])
            })
    return research_events


def extract_opening_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract position_card events (opening phase)."""
    opening_events = []
    for event in events:
        if event.get("event_type") == "position_card":
            payload = event.get("payload", {})
            opening_events.append({
                "knight_id": payload.get("knight_id", ""),
                "headline": payload.get("headline", ""),
                "body": payload.get("body", ""),
                "citations": payload.get("citations", []),
                "confidence": payload.get("confidence")
            })
    return opening_events


def extract_cross_examination_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract challenge events (cross_examination phase)."""
    cross_exam_events = []
    for event in events:
        if event.get("event_type") == "challenge":
            payload = event.get("payload", {})
            cross_exam_events.append({
                "knight_id": payload.get("knight_id", ""),
                "target_knight_id": payload.get("target_knight_id", ""),
                "contestation": payload.get("contestation", ""),
                "citation_reference": payload.get("citation_reference", "")
            })
    return cross_exam_events


def extract_red_team_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract red_team_critique events."""
    red_team_events = []
    for event in events:
        if event.get("event_type") == "red_team_critique":
            payload = event.get("payload", {})
            red_team_events.append({
                "critique": payload.get("critique", ""),
                "flaws_identified": payload.get("flaws_identified", [])
            })
    return red_team_events


def extract_rebuttal_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract rebuttal events."""
    rebuttal_events = []
    for event in events:
        if event.get("event_type") == "rebuttal":
            payload = event.get("payload", {})
            rebuttal_events.append({
                "knight_id": payload.get("knight_id", ""),
                "body": payload.get("body", ""),
                "citations": payload.get("citations", [])
            })
    return rebuttal_events


def extract_convergence_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract convergence events."""
    convergence_events = []
    for event in events:
        if event.get("event_type") == "convergence":
            payload = event.get("payload", {})
            convergence_events.append({
                "summary": payload.get("summary", "")
            })
    return convergence_events


def extract_translator_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract translator_output events."""
    translator_events = []
    for event in events:
        if event.get("event_type") == "translator_output":
            payload = event.get("payload", {})
            translator_events.append({
                "translated_content": payload.get("translated_content", "")
            })
    return translator_events


def extract_closed_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract moderator_ruling events (closed phase)."""
    closed_events = []
    for event in events:
        if event.get("event_type") == "moderator_ruling":
            payload = event.get("payload", {})
            closed_events.append({
                "knight_id": payload.get("knight_id", ""),
                "ruling": payload.get("ruling", ""),
                "notes": payload.get("notes", "")
            })
    return closed_events


def extract_json_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract key information from JSON according to specified structure."""
    events = data.get("events", [])
    
    return {
        "session_metadata": extract_session_metadata(data.get("session_metadata", {})),
        "session_initialization": extract_session_initialization(events),
        "research": extract_research_events(events),
        "opening": extract_opening_events(events),
        "cross_examination": extract_cross_examination_events(events),
        "red_team": extract_red_team_events(events),
        "rebuttals": extract_rebuttal_events(events),
        "convergence": extract_convergence_events(events),
        "translator": extract_translator_events(events),
        "closed": extract_closed_events(events)
    }


# ============================================================================
# Formatting Functions
# ============================================================================

def format_output_markdown(data: Dict[str, Any]) -> str:
    """Format extracted data as Markdown output."""
    lines = []
    
    def add_line(text: str = ""):
        """Add a line to the output."""
        lines.append(text)
    
    def add_spacing():
        """Add spacing only if the last line is not empty."""
        if lines and lines[-1] != "":
            add_line("")
    
    # Header
    add_line("# Debate Session Report")
    add_spacing()
    
    # Session Metadata
    add_line("## Session Information")
    add_spacing()
    topic = data.get('session_metadata', {}).get('topic', '')
    created_at = data.get('session_metadata', {}).get('created_at', '')
    add_line(f"**Topic:** {topic}")
    add_line(f"**Created At:** {created_at}")
    add_spacing()
    
    # Session Initialization
    init = data.get("session_initialization", {})
    if init:
        add_line("## Session Overview")
        add_spacing()
        if init.get("intake_summary"):
            add_line(f"**Intake Summary:**\n\n{init['intake_summary']}")
            add_spacing()
        
        brief = init.get("moderator_brief", {})
        if brief:
            if brief.get("topicSummary"):
                add_line(f"**Topic Summary:** {brief['topicSummary']}")
                add_spacing()
            if brief.get("strategicQuestion"):
                add_line(f"**Strategic Question:** {brief['strategicQuestion']}")
                add_spacing()
            if brief.get("missionStatement"):
                add_line(f"**Mission Statement:** {brief['missionStatement']}")
                add_spacing()
            if brief.get("keyAssumptions"):
                add_line("**Key Assumptions:**")
                add_spacing()
                for assumption in brief["keyAssumptions"]:
                    add_line(f"- {assumption}")
                add_spacing()
    
    # Research
    research = data.get("research", [])
    if research:
        add_line("## Research Findings")
        add_spacing()
        for i, event in enumerate(research, 1):
            add_line(f"### Research Findings {i}")
            add_spacing()
            if event.get("knight_id"):
                add_line(f"**Knight:** `{event['knight_id']}`")
                add_spacing()
            if event.get("summary"):
                add_line(f"{event['summary']}")
                add_spacing()
            if event.get("sources"):
                add_line("**Sources:**")
                add_spacing()
                for j, source in enumerate(event["sources"], 1):
                    if isinstance(source, dict):
                        title = source.get("title", "")
                        url = source.get("url", "")
                        if url:
                            add_line(f"{j}. [{title}]({url})")
                        else:
                            add_line(f"{j}. {title}")
                    else:
                        add_line(f"{j}. {source}")
                add_spacing()
            if i < len(research):
                add_line("---")
                add_spacing()
    
    # Opening
    opening = data.get("opening", [])
    if opening:
        add_line("## Opening Statements")
        add_spacing()
        for i, event in enumerate(opening, 1):
            add_line(f"### Opening Statement {i}")
            add_spacing()
            if event.get("knight_id"):
                add_line(f"**Knight:** `{event['knight_id']}`")
                add_spacing()
            if event.get("headline"):
                add_line(f"**Headline:** {event['headline']}")
                add_spacing()
            if event.get("body"):
                add_line(f"{event['body']}")
                add_spacing()
            if event.get("citations"):
                add_line("**Citations:**")
                add_spacing()
                for citation in event["citations"]:
                    add_line(f"- {citation}")
                add_spacing()
            if event.get("confidence") is not None:
                add_line(f"**Confidence:** {event['confidence']}")
                add_spacing()
            if i < len(opening):
                add_line("---")
                add_spacing()
    
    # Cross Examination
    cross_exam = data.get("cross_examination", [])
    if cross_exam:
        add_line("## Cross-Examination")
        add_spacing()
        for i, event in enumerate(cross_exam, 1):
            add_line(f"### Cross-Examination {i}")
            add_spacing()
            if event.get("knight_id"):
                add_line(f"**Knight:** `{event['knight_id']}`")
                add_spacing()
            if event.get("target_knight_id"):
                add_line(f"**Target Knight:** `{event['target_knight_id']}`")
                add_spacing()
            if event.get("contestation"):
                add_line(f"**Contestation:**\n\n{event['contestation']}")
                add_spacing()
            if event.get("citation_reference"):
                add_line(f"**Citation Reference:** {event['citation_reference']}")
                add_spacing()
            if i < len(cross_exam):
                add_line("---")
                add_spacing()
    
    # Red Team
    red_team = data.get("red_team", [])
    if red_team:
        add_line("## Red Team Analysis")
        add_spacing()
        for i, event in enumerate(red_team, 1):
            add_line(f"### Red Team Analysis {i}")
            add_spacing()
            if event.get("critique"):
                add_line(f"**Critique:**\n\n{event['critique']}")
                add_spacing()
            if event.get("flaws_identified"):
                add_line("**Flaws Identified:**")
                add_spacing()
                for flaw in event["flaws_identified"]:
                    add_line(f"- {flaw}")
                add_spacing()
            if i < len(red_team):
                add_line("---")
                add_spacing()
    
    # Rebuttals
    rebuttals = data.get("rebuttals", [])
    if rebuttals:
        add_line("## Rebuttal Statements")
        add_spacing()
        for i, event in enumerate(rebuttals, 1):
            add_line(f"### Rebuttal Statement {i}")
            add_spacing()
            if event.get("knight_id"):
                add_line(f"**Knight:** `{event['knight_id']}`")
                add_spacing()
            if event.get("body"):
                add_line(f"{event['body']}")
                add_spacing()
            if event.get("citations"):
                add_line("**Citations:**")
                add_spacing()
                for citation in event["citations"]:
                    add_line(f"- {citation}")
                add_spacing()
            if i < len(rebuttals):
                add_line("---")
                add_spacing()
    
    # Convergence
    convergence = data.get("convergence", [])
    if convergence:
        add_line("## Convergence Analysis")
        add_spacing()
        for i, event in enumerate(convergence, 1):
            add_line(f"### Convergence Analysis {i}")
            add_spacing()
            if event.get("summary"):
                add_line(f"{event['summary']}")
                add_spacing()
            if i < len(convergence):
                add_line("---")
                add_spacing()
    
    # Translator
    translator = data.get("translator", [])
    if translator:
        add_line("## Translation Summary")
        add_spacing()
        for i, event in enumerate(translator, 1):
            add_line(f"### Translation Summary {i}")
            add_spacing()
            if event.get("translated_content"):
                add_line(f"{event['translated_content']}")
                add_spacing()
            if i < len(translator):
                add_line("---")
                add_spacing()
    
    # Closed
    closed = data.get("closed", [])
    if closed:
        add_line("## Final Rulings")
        add_spacing()
        for i, event in enumerate(closed, 1):
            add_line(f"### Final Ruling {i}")
            add_spacing()
            if event.get("knight_id"):
                add_line(f"**Knight:** `{event['knight_id']}`")
                add_spacing()
            if event.get("ruling"):
                add_line(f"**Ruling:**\n\n{event['ruling']}")
                add_spacing()
            if event.get("notes"):
                add_line(f"**Notes:**\n\n{event['notes']}")
                add_spacing()
            if i < len(closed):
                add_line("---")
                add_spacing()
    
    # Remove trailing empty lines
    while lines and lines[-1] == "":
        lines.pop()
    
    return "\n".join(lines)


# ============================================================================
# Markdown to HTML Conversion
# ============================================================================

def markdown_to_html(markdown_content: str) -> str:
    """Convert markdown to HTML with Crucible styling."""
    if not MARKDOWN_AVAILABLE:
        raise ImportError(
            "markdown library is required. Install it with: pip install markdown"
        )
    
    # Convert markdown to HTML
    md = markdown.Markdown(extensions=['extra', 'nl2br', 'fenced_code', 'tables'])
    html_body = md.convert(markdown_content)
    
    # Format date
    date = datetime.now().strftime("%Y.%m.%d")
    
    # Build complete HTML with Crucible styling
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Document</title>
  <style>
    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}
    
    body {{
      font-family: 'Arial', 'Helvetica', 'Inter', sans-serif;
      font-size: 11px;
      line-height: 1.6;
      color: #000000;
      background: #ffffff;
      padding: 0;
      margin: 0;
    }}
    
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      margin-bottom: 30px;
      border-bottom: 1px solid #e2e8f0;
      page-break-inside: avoid;
    }}
    
    .logo {{
      font-weight: 800;
      letter-spacing: 2px;
      font-size: 24px;
    }}
    
    .logo .cru {{
      color: #000000;
    }}
    
    .logo .cible {{
      color: #fec76f;
    }}
    
    .header-right {{
      font-size: 9px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
    }}
    
    h1 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 24px;
      color: #324154;
      margin-top: 30px;
      margin-bottom: 15px;
      page-break-after: avoid;
      page-break-before: auto;
    }}
    
    h2 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 18px;
      color: #324154;
      margin-top: 20px;
      margin-bottom: 8px;
      page-break-after: avoid;
      page-break-before: auto;
    }}
    
    h3 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 14px;
      color: #324154;
      margin-top: 15px;
      margin-bottom: 6px;
      page-break-after: avoid;
      page-break-before: auto;
    }}
    
    p {{
      margin-bottom: 10px;
      orphans: 2;
      widows: 2;
    }}
    
    ul, ol {{
      margin-left: 20px;
      margin-bottom: 10px;
      margin-top: 4px;
      orphans: 2;
      widows: 2;
    }}
    
    li {{
      margin-bottom: 4px;
      orphans: 2;
      widows: 2;
    }}
    
    strong {{
      font-weight: bold;
      color: #324154;
    }}
    
    code {{
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 10px;
    }}
    
    pre {{
      background-color: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }}
    
    pre code {{
      background: none;
      padding: 0;
    }}
    
    a {{
      color: #324154;
      text-decoration: underline;
    }}
    
    hr {{
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 12px 0;
      page-break-inside: avoid;
    }}
    
    blockquote {{
      border-left: 3px solid #c5bea1;
      padding-left: 15px;
      margin-left: 0;
      margin-bottom: 12px;
      color: #555;
      page-break-inside: avoid;
    }}
    
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }}
    
    th, td {{
      border: 1px solid #e2e8f0;
      padding: 8px;
      text-align: left;
    }}
    
    th {{
      background-color: #c5bea1;
      font-weight: bold;
      color: #324154;
    }}
    
    .section {{
      margin-bottom: 15px;
      orphans: 2;
      widows: 2;
    }}
    
    /* Better page break handling */
    @media print {{
      body {{
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }}
      
      /* Allow content to break more naturally */
      h2 + ul, h2 + ol, h3 + ul, h3 + ol {{
        margin-top: 4px;
      }}
      
      /* Prevent orphaned headings */
      h2, h3 {{
        page-break-after: avoid;
      }}
      
      /* Allow lists to break across pages but keep at least 2 items together */
      ul, ol {{
        page-break-inside: auto;
      }}
      
      li {{
        page-break-inside: auto;
      }}
      
      /* Keep at least 2 lines together */
      p {{
        orphans: 2;
        widows: 2;
      }}
    }}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <span class="cru">CRU</span><span class="cible">CIBLE</span>
    </div>
    <div class="header-right">
      SESSION DOCUMENT | {date}
    </div>
  </div>
  
  <div class="content">
{html_body}
  </div>
</body>
</html>"""
    
    return html


# ============================================================================
# PDF Generation
# ============================================================================

async def generate_pdf_from_debate_json(session_json: Dict[str, Any]) -> bytes:
    """
    Generate PDF from debate session JSON.
    
    Pipeline:
    1. Extract structured data from JSON (direct extraction, no LLM)
    2. Format as Markdown
    3. Convert Markdown to HTML with Crucible styling
    4. Generate PDF using Playwright (with Windows workaround)
    
    Args:
        session_json: Session data as dictionary
        
    Returns:
        PDF as bytes
    """
    logger.info("[debate_pdf_generator] Starting PDF generation from debate JSON")
    
    try:
        # Step 1: Extract structured data
        logger.info("[debate_pdf_generator] Step 1: Extracting structured data...")
        extracted_data = extract_json_data(session_json)
        logger.info("[debate_pdf_generator] Data extraction complete")
        
        # Step 2: Format as Markdown
        logger.info("[debate_pdf_generator] Step 2: Formatting as Markdown...")
        markdown_content = format_output_markdown(extracted_data)
        logger.info(f"[debate_pdf_generator] Markdown generated, length: {len(markdown_content)} chars")
        
        # Step 3: Convert Markdown to HTML
        logger.info("[debate_pdf_generator] Step 3: Converting Markdown to HTML...")
        html_content = markdown_to_html(markdown_content)
        logger.info(f"[debate_pdf_generator] HTML generated, length: {len(html_content)} chars")
        
        # Step 4: Generate PDF using Playwright
        logger.info("[debate_pdf_generator] Step 4: Generating PDF with Playwright...")
        pdf_bytes = await html_to_pdf_bytes(html_content)
        logger.info(f"[debate_pdf_generator] PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"[debate_pdf_generator] Error generating PDF: {e}", exc_info=True)
        raise Exception(f"PDF generation failed: {e}") from e


async def html_to_pdf_bytes(html_content: str) -> bytes:
    """
    Convert HTML to PDF bytes using Playwright.
    
    Platform-specific handling:
    - Linux (Railway production): Uses async Playwright (optimal)
    - Windows (local dev): Uses sync Playwright in a thread to avoid subprocess issues
    
    Note: Railway runs on Linux, so Windows code path only executes during local development.
    """
    if platform.system() == "Windows":
        # Windows fix: Use sync Playwright in a thread to avoid subprocess issues
        def run_playwright_sync(html: str) -> bytes:
            """Run Playwright synchronously in a thread to avoid Windows subprocess issues."""
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-accelerated-2d-canvas",
                        "--no-first-run",
                        "--no-zygote",
                        "--disable-gpu",
                    ],
                )
                try:
                    page = browser.new_page()
                    page.set_content(html, wait_until="networkidle")

                    # Format date for footer
                    date = datetime.now().strftime("%Y.%m.%d")

                    # Generate PDF with footer
                    pdf_bytes = page.pdf(
                        format="A4",
                        margin={
                            "top": "0.5in",
                            "right": "0.5in",
                            "bottom": "0.8in",
                            "left": "0.5in",
                        },
                        print_background=True,
                        display_header_footer=True,
                        header_template="<div></div>",
                        footer_template=f"""
                            <div style="font-size: 10px; color: #888; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 20mm; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                                <span style="flex: 1; text-align: left;">{date}</span>
                                <span style="flex: 1; text-align: right;">Page <span class="pageNumber"></span></span>
                            </div>
                        """,
                    )
                    return pdf_bytes
                finally:
                    browser.close()

        # Run Playwright in a thread to avoid Windows subprocess issues
        logger.info("[debate_pdf_generator] Running Playwright in thread (Windows workaround)")
        try:
            pdf_bytes = await asyncio.to_thread(run_playwright_sync, html_content)
            return pdf_bytes
        except Exception as e:
            logger.error(f"[debate_pdf_generator] Error generating PDF on Windows: {e}", exc_info=True)
            raise Exception(f"PDF generation failed: {e}") from e
    else:
        # Non-Windows: Use async Playwright
        from playwright.async_api import async_playwright

        async def run_playwright_async(html: str) -> bytes:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-accelerated-2d-canvas",
                        "--no-first-run",
                        "--no-zygote",
                        "--disable-gpu",
                    ],
                )
                try:
                    page = await browser.new_page()
                    await page.set_content(html, wait_until="networkidle")

                    # Format date for footer
                    date = datetime.now().strftime("%Y.%m.%d")

                    # Generate PDF with footer
                    pdf_bytes = await page.pdf(
                        format="A4",
                        margin={
                            "top": "0.5in",
                            "right": "0.5in",
                            "bottom": "0.8in",
                            "left": "0.5in",
                        },
                        print_background=True,
                        display_header_footer=True,
                        header_template="<div></div>",
                        footer_template=f"""
                            <div style="font-size: 10px; color: #888; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 20mm; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                                <span style="flex: 1; text-align: left;">{date}</span>
                                <span style="flex: 1; text-align: right;">Page <span class="pageNumber"></span></span>
                            </div>
                        """,
                    )
                    return pdf_bytes
                finally:
                    await browser.close()

        try:
            pdf_bytes = await run_playwright_async(html_content)
            return pdf_bytes
        except Exception as e:
            logger.error(f"[debate_pdf_generator] Error generating PDF: {e}", exc_info=True)
            raise Exception(f"PDF generation failed: {e}") from e

