"""
Local PDF generator using Playwright.
Generates Executive Brief PDFs directly in the backend without calling the frontend.
Uses TWO-STAGE LLM pipeline (same as frontend):
  Stage 1: Generate structured JSON from debate content (openai/gpt-5.1)
  Stage 2: Render structured JSON to HTML (anthropic/claude-haiku-4.5)
"""
import asyncio
import json
import logging
import os
import platform
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

from playwright.async_api import async_playwright
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm.router import LLMRouter, LLMRequest

logger = logging.getLogger(__name__)

T = TypeVar('T')


# =============================================================================
# VALIDATION (matches frontend/lib/pdf/validation.ts)
# =============================================================================

@dataclass
class JsonValidationResult:
    valid: bool
    errors: List[str]
    data: Optional[Dict[str, Any]] = None


@dataclass
class HtmlValidationResult:
    valid: bool
    errors: List[str]


@dataclass
class RetryConfig:
    max_retries: int = 2
    retry_delay_ms: int = 1000


def validate_structured_brief(data: Any) -> JsonValidationResult:
    """
    Validate structured brief JSON against schema.
    Matches frontend validateStructuredBrief function.
    """
    errors: List[str] = []
    
    if not isinstance(data, dict):
        return JsonValidationResult(valid=False, errors=["Data must be a dictionary"])
    
    # Required fields
    required_fields = [
        "recommendation",
        "executive_summary", 
        "rationale",
        "critical_risks",
        "immediate_actions",
    ]
    
    for field in required_fields:
        if field not in data:
            errors.append(f"{field}: Required field missing")
    
    # Validate rationale
    rationale = data.get("rationale", [])
    if not isinstance(rationale, list):
        errors.append("rationale: Must be an array")
    elif len(rationale) < 2:
        errors.append("rationale: Must have at least 2 rationale points")
    elif len(rationale) > 5:
        errors.append("rationale: Should have at most 5 rationale points")
    
    # Validate critical_risks
    critical_risks = data.get("critical_risks", [])
    if not isinstance(critical_risks, list):
        errors.append("critical_risks: Must be an array")
    elif len(critical_risks) < 3:
        errors.append("critical_risks: Must have at least 3 risks")
    elif len(critical_risks) > 10:
        errors.append("critical_risks: Should have at most 10 risks")
    else:
        # Validate each risk has required fields
        for i, risk in enumerate(critical_risks):
            if isinstance(risk, dict):
                if "description" not in risk:
                    errors.append(f"critical_risks[{i}]: Missing description")
                if "impact" not in risk:
                    errors.append(f"critical_risks[{i}]: Missing impact")
                elif not isinstance(risk.get("impact"), (int, float)) or not (1 <= risk.get("impact", 0) <= 5):
                    errors.append(f"critical_risks[{i}].impact: Must be number 1-5")
                if "probability" not in risk:
                    errors.append(f"critical_risks[{i}]: Missing probability")
                elif not isinstance(risk.get("probability"), (int, float)) or not (1 <= risk.get("probability", 0) <= 5):
                    errors.append(f"critical_risks[{i}].probability: Must be number 1-5")
                if "mitigation" not in risk:
                    errors.append(f"critical_risks[{i}]: Missing mitigation")
            else:
                errors.append(f"critical_risks[{i}]: Must be an object")
    
    # Validate immediate_actions
    immediate_actions = data.get("immediate_actions", [])
    if not isinstance(immediate_actions, list):
        errors.append("immediate_actions: Must be an array")
    elif len(immediate_actions) < 3:
        errors.append("immediate_actions: Must have at least 3 actions")
    elif len(immediate_actions) > 10:
        errors.append("immediate_actions: Should have at most 10 actions")
    
    # Validate executive_summary
    executive_summary = data.get("executive_summary", "")
    if not isinstance(executive_summary, str):
        errors.append("executive_summary: Must be a string")
    elif len(executive_summary.strip()) < 50:
        errors.append("executive_summary: Must be at least 50 characters")
    
    # Validate recommendation
    recommendation = data.get("recommendation", "")
    if not isinstance(recommendation, str):
        errors.append("recommendation: Must be a string")
    elif len(recommendation.strip()) < 20:
        errors.append("recommendation: Must be at least 20 characters")
    
    # Validate risk_matrix if present
    risk_matrix = data.get("risk_matrix")
    if risk_matrix and isinstance(risk_matrix, dict):
        all_matrix_risks = (
            risk_matrix.get("high_impact_high_prob", []) +
            risk_matrix.get("high_impact_low_prob", []) +
            risk_matrix.get("low_impact_high_prob", []) +
            risk_matrix.get("low_impact_low_prob", [])
        )
        if len(all_matrix_risks) != len(critical_risks):
            errors.append(
                f"risk_matrix: Must contain exactly {len(critical_risks)} risks "
                f"(one for each critical_risk), found {len(all_matrix_risks)}"
            )
    
    return JsonValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        data=data if len(errors) == 0 else None
    )


def validate_html_structure(html: str) -> HtmlValidationResult:
    """
    Validate HTML structure for PDF generation.
    Matches frontend validateHtmlStructure function.
    """
    errors: List[str] = []
    html_lower = html.lower()
    
    # Check for DOCTYPE
    if "<!doctype html>" not in html_lower and "<!doctype" not in html_lower:
        errors.append("Missing DOCTYPE declaration")
    
    # Check for required HTML structure
    if "<html" not in html_lower:
        errors.append("Missing <html> tag")
    if "<head" not in html_lower:
        errors.append("Missing <head> tag")
    if "<body" not in html_lower:
        errors.append("Missing <body> tag")
    
    # Check for page-break CSS (critical for PDF)
    if "page-break-inside" not in html:
        errors.append("Missing page-break CSS (required for PDF generation)")
    
    # Check for required sections (case-insensitive)
    required_sections = ["executive", "summary", "recommendation"]
    has_required_content = any(section in html_lower for section in required_sections)
    if not has_required_content:
        errors.append("Missing required content sections (executive summary, recommendation)")
    
    # Check for proper CSS styling
    if "<style" not in html_lower and "style=" not in html_lower:
        errors.append("Missing CSS styling (inline or <style> tag)")
    
    # Check for valid HTML structure (basic check)
    open_body_tags = len(re.findall(r'<body[^>]*>', html, re.IGNORECASE))
    close_body_tags = len(re.findall(r'</body>', html, re.IGNORECASE))
    if open_body_tags != close_body_tags:
        errors.append("Mismatched <body> tags")
    
    open_html_tags = len(re.findall(r'<html[^>]*>', html, re.IGNORECASE))
    close_html_tags = len(re.findall(r'</html>', html, re.IGNORECASE))
    if open_html_tags != close_html_tags:
        errors.append("Mismatched <html> tags")
    
    return HtmlValidationResult(valid=len(errors) == 0, errors=errors)


async def retry_with_backoff(
    fn: Callable[[], Any],
    config: Optional[RetryConfig] = None,
    on_retry: Optional[Callable[[int, Exception], None]] = None
) -> Any:
    """
    Retry a function with exponential backoff.
    Matches frontend retryWithBackoff function.
    """
    if config is None:
        config = RetryConfig()
    
    last_error: Optional[Exception] = None
    
    for attempt in range(config.max_retries + 1):
        try:
            return await fn()
        except Exception as e:
            last_error = e
            
            if attempt < config.max_retries:
                if on_retry:
                    on_retry(attempt + 1, e)
                
                # Exponential backoff: 1s, 2s, 4s
                delay = (config.retry_delay_ms / 1000) * (2 ** attempt)
                await asyncio.sleep(delay)
    
    raise last_error or Exception("Retry failed")


def extract_debate_content(session_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract debate content from session JSON for LLM processing.
    Matches frontend's extractDebateContent function exactly.
    """
    question = (
        session_json.get("session_metadata", {}).get("topic") or 
        session_json.get("question") or 
        session_json.get("title") or 
        "Debate Session"
    )
    events = session_json.get("events", [])
    
    # Extract confidence from convergence event
    confidence = 0
    convergence_event = None
    convergence_summary = ""
    for event in events:
        if event.get("event_type") in ("convergence", "Convergence"):
            convergence_event = event
            payload = event.get("payload", {})
            if isinstance(payload, dict):
                if "confidence" in payload:
                    conf_value = payload["confidence"]
                    if isinstance(conf_value, (int, float)):
                        confidence = int(conf_value * 100) if conf_value <= 1 else int(conf_value)
                if "summary" in payload:
                    convergence_summary = str(payload["summary"])
            break
    
    # Extract final ruling from moderator ruling event
    final_ruling = ""
    for event in events:
        if event.get("event_type") in ("moderator_ruling", "Moderator Ruling"):
            payload = event.get("payload", {})
            if isinstance(payload, dict):
                final_ruling = str(payload.get("ruling", payload.get("notes", "")))
            break
    
    # Extract positions (position_card events) - limit to 3
    positions = []
    position_events = [e for e in events if e.get("event_type") in ("position_card", "Position Card")]
    for event in position_events[:3]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            knight = payload.get("knight_name") or payload.get("knight_role") or "Unknown"
            headline = payload.get("headline", "")
            body = payload.get("body", "")
            body_preview = body[:300] + "..." if len(body) > 300 else body
            positions.append(f"{knight}: {headline}\n{body_preview}")
    
    # Extract challenges - limit to 3
    challenges = []
    challenge_events = [e for e in events if e.get("event_type") in ("challenge", "Challenge")]
    for event in challenge_events[:3]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            contestation = str(payload.get("contestation", ""))
            preview = contestation[:200] + "..." if len(contestation) > 200 else contestation
            if preview:
                challenges.append(preview)
    
    # Extract red team critique
    red_team = ""
    for event in events:
        if event.get("event_type") in ("red_team_critique", "Red Team Critique"):
            payload = event.get("payload", {})
            if isinstance(payload, dict) and "critique" in payload:
                red_team = str(payload["critique"])
            break
    
    # Extract research findings - limit to 5
    research_findings = []
    research_events = [e for e in events if e.get("event_type") in ("research_result", "Research Result")]
    for event in research_events[:5]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            query = payload.get("query", "")
            summary = payload.get("summary", "")
            sources = payload.get("sources", [])
            sources_text = ""
            if sources:
                source_titles = [s.get("title") or s.get("url", "") for s in sources if isinstance(s, dict)]
                sources_text = f"\nSources: {', '.join(filter(None, source_titles))}"
            if summary:
                research_findings.append(f"Query: {query}\nFinding: {summary}{sources_text}")
    
    # Extract rebuttals - limit to 3
    rebuttals = []
    rebuttal_events = [e for e in events if e.get("event_type") in ("rebuttal", "Rebuttal")]
    for event in rebuttal_events[:3]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            knight = payload.get("knight_name") or payload.get("knight_id") or "Unknown"
            content = payload.get("content") or payload.get("body", "")
            target = payload.get("target_knight_id", "")
            if content:
                target_text = f" (responding to {target})" if target else ""
                content_preview = content[:300] + "..." if len(content) > 300 else content
                rebuttals.append(f"{knight}{target_text}: {content_preview}")
    
    # Extract fact checks - limit to 3
    fact_checks = []
    fact_check_events = [e for e in events if e.get("event_type") in ("fact_check", "Fact Check")]
    for event in fact_check_events[:3]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            claim = payload.get("claim", "")
            verdict = payload.get("verdict") or payload.get("status", "")
            sources = payload.get("sources", [])
            sources_text = ""
            if sources:
                source_titles = [s.get("title") or s.get("url", "") for s in sources if isinstance(s, dict)]
                sources_text = f"\nSources: {', '.join(filter(None, source_titles))}"
            if claim and verdict:
                fact_checks.append(f"Claim: {claim}\nVerdict: {verdict}{sources_text}")
    
    # Extract citations - limit to 5
    citations = []
    citation_events = [e for e in events if e.get("event_type") in ("citation_added", "Citation Added")]
    for event in citation_events[:5]:
        payload = event.get("payload", {})
        if isinstance(payload, dict):
            title = payload.get("title", "")
            url = payload.get("url", "")
            snippet = payload.get("snippet", "")
            if title or url:
                snippet_text = f"\n{snippet[:150]}..." if snippet else ""
                citations.append(f"{title or url}{snippet_text}")
    
    # Extract translator output
    translator_output = ""
    for event in events:
        if event.get("event_type") in ("translator_output", "Translator Output"):
            payload = event.get("payload", {})
            if isinstance(payload, dict):
                translator_output = str(payload.get("translated_content") or payload.get("content", ""))
            break
    
    # Build comprehensive debate content (matches frontend exactly)
    debate_content = f"""FINAL JUDGMENT:
{final_ruling}

CONVERGENCE SUMMARY:
{convergence_summary}

KEY POSITIONS:
{chr(10).join(positions) if positions else 'No positions recorded.'}

KEY CHALLENGES:
{chr(10).join(challenges) if challenges else 'No challenges recorded.'}

RED TEAM CRITIQUE:
{red_team}

RESEARCH FINDINGS:
{chr(10).join(research_findings) if research_findings else 'No research findings.'}

REBUTTALS:
{chr(10).join(rebuttals) if rebuttals else 'No rebuttals recorded.'}

FACT CHECKS:
{chr(10).join(fact_checks) if fact_checks else 'No fact checks.'}

CITATIONS:
{chr(10).join(citations) if citations else 'No citations.'}

TRANSLATOR OUTPUT:
{translator_output}""".strip()
    
    return {
        "question": question,
        "debate_content": debate_content,
        "confidence": confidence,
        "research_findings": research_findings if research_findings else None,
        "rebuttals": rebuttals if rebuttals else None,
        "fact_checks": fact_checks if fact_checks else None,
        "citations": citations if citations else None,
        "translator_output": translator_output if translator_output else None,
    }


async def generate_structured_brief(debate_content: Dict[str, Any], user_id: str | None = None, db: AsyncSession | None = None) -> Dict[str, Any]:
    """
    Stage 1: Generate structured executive brief JSON from debate content using LLM.
    Matches frontend's generateStructuredBrief function exactly.
    Model: openai/gpt-5.1 (or PDF_STAGE1_MODEL env var)
    Temperature: 0.3
    
    Args:
        debate_content: Extracted debate content
        user_id: User ID for API key resolution (required for Community Edition)
    """
    logger.info("[local_pdf_generator] Stage 1: Generating structured brief using LLM...")
    
    router = LLMRouter()
    
    # Get model from env (same as frontend) - defaults to "openai/gpt-5.1"
    model = os.getenv("PDF_STAGE1_MODEL") or os.getenv("OPENAI_MODEL") or "openai/gpt-5.1"
    temperature = float(os.getenv("PDF_STAGE1_TEMPERATURE", "0.3"))
    
    # Build prompt exactly matching frontend (from generateStructuredBrief.ts)
    prompt = f"""You are a Senior McKinsey Engagement Manager specializing in board-level decision briefs. Your task is to synthesize a complex debate into a structured executive brief.

## FRAMEWORK: The Pyramid Principle (Bottom-Line Up Front)
- Start with the answer (recommendation)
- Support with key drivers (3-4 strongest arguments)
- Provide evidence and rationale

## TONE & STYLE
- Authoritative, sparse, data-driven
- Avoid "fluff" words and hedging language
- Clear and decisive
- Suitable for C-suite presentation

## DEBATE QUESTION
{debate_content['question']}

## CONFIDENCE LEVEL
{debate_content['confidence']}%

## DEBATE CONTENT
{debate_content['debate_content']}

## YOUR TASK
Extract and synthesize the following structured information:

1. **bottom_line** (1-2 sentences): The absolute bottom-line decision - what should we do?

2. **opportunity** (1-2 sentences): The strategic opportunity or business case - what makes this worth pursuing?

3. **recommendation** (2-3 sentences): Clear, actionable recommendation - the primary path forward, justified by the confidence level.

4. **requirement** (1-2 sentences): What must be done or what conditions must be met for success.

5. **executive_summary** (2-3 paragraphs): High-level synthesis using SCQA framework:
   - **Situation**: Current state
   - **Complication**: Key challenge or problem
   - **Question**: The decision to be made
   - **Answer**: Your recommendation

6. **rationale** (3-5 bullet points): WHY this recommendation makes sense - distinct reasoning points, not just restating what it is.

7. **critical_risks** (3-10 risks): Each risk must include:
   - **description**: Specific risk description
   - **impact**: 1-5 scale (1=low, 5=high)
   - **probability**: 1-5 scale (1=low, 5=high)
   - **mitigation**: How to address this risk

8. **immediate_actions** (3-10 actions): Prioritized concrete next steps - what to do Monday morning. Each should be specific and actionable.

9. **critical_conditions** (0-5 items): Prerequisites or dependencies that must be met for success.

10. **confidence_level** (number 0-100): Overall confidence in the recommendation, should match or be close to the provided confidence level.

11. **quotable_insights** (2-5 items): Key insights or quotes that capture the essence of the debate.

12. **swot** (optional): SWOT analysis with 2-3 items per quadrant:
    - **strengths**: Internal advantages
    - **weaknesses**: Internal disadvantages
    - **opportunities**: External opportunities
    - **threats**: External threats

13. **risk_matrix** (optional): Categorize the critical_risks into a 2x2 matrix by impact and probability:
    - **high_impact_high_prob**: Critical risks requiring immediate attention
    - **high_impact_low_prob**: Contingency planning needed
    - **low_impact_high_prob**: Monitor closely
    - **low_impact_low_prob**: Accept and track
    
    Each risk in critical_risks must appear exactly once in the risk_matrix. Use short titles (3-5 words) that correspond to the risk descriptions.

14. **timeline** (optional): Implementation roadmap with phases:
    - **phase**: Phase name
    - **duration**: Time frame (e.g., "Weeks 1-4")
    - **activities**: List of activities
    - **deliverables**: Expected deliverables
    - **dependencies**: Prerequisites

## OUTPUT FORMAT
You MUST respond with valid JSON only. Do not include markdown code blocks or any other text. The JSON must match this exact structure:

{{
  "bottom_line": "...",
  "opportunity": "...",
  "recommendation": "...",
  "requirement": "...",
  "executive_summary": "...",
  "rationale": ["...", "..."],
  "critical_risks": [
    {{
      "description": "...",
      "impact": 3,
      "probability": 4,
      "mitigation": "..."
    }}
  ],
  "immediate_actions": ["...", "..."],
  "critical_conditions": ["..."],
  "confidence_level": {debate_content['confidence']},
  "quotable_insights": ["...", "..."],
  "swot": {{
    "strengths": ["..."],
    "weaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["..."]
  }},
  "risk_matrix": {{
    "high_impact_high_prob": ["..."],
    "high_impact_low_prob": ["..."],
    "low_impact_high_prob": ["..."],
    "low_impact_low_prob": ["..."]
  }},
  "timeline": [
    {{
      "phase": "...",
      "duration": "...",
      "activities": ["..."],
      "deliverables": ["..."],
      "dependencies": ["..."]
    }}
  ]
}}

## CRITICAL INSTRUCTIONS
- Ensure risk_matrix contains exactly the same number of risks as critical_risks
- Each risk in risk_matrix must correspond to a risk in critical_risks
- Be specific and actionable - avoid vague language
- Use the confidence level provided to calibrate your recommendation strength
- If confidence is low (<60%), emphasize risks and conditions more heavily"""
    
    async def _generate():
        request = LLMRequest(
            prompt=prompt,
            provider="openrouter",
            model=model,
            temperature=temperature,
            json_mode=True,
        )
        
        # Pass user_id and db to router.generate() for API key resolution, not to LLMRequest
        response = await router.generate(request, user_id=user_id, db=db)
        
        # Parse JSON response
        json_str = response.strip()
        # Remove markdown code blocks if present
        if json_str.startswith("```json"):
            json_str = json_str[7:].strip()
        elif json_str.startswith("```"):
            json_str = json_str[3:].strip()
        if json_str.endswith("```"):
            json_str = json_str[:-3].strip()
        
        # Parse JSON
        try:
            parsed_json = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse JSON: {e}")
        
        # Validate against schema
        validation = validate_structured_brief(parsed_json)
        if not validation.valid:
            # Log validation errors but don't fail - LLM output may still be usable
            logger.warning(f"[local_pdf_generator] Stage 1 validation warnings: {validation.errors}")
        
        return parsed_json
    
    try:
        # Use retry with backoff (matches frontend)
        structured_brief = await retry_with_backoff(
            _generate,
            RetryConfig(max_retries=2, retry_delay_ms=1000),
            lambda attempt, error: logger.warning(
                f"[local_pdf_generator] Stage 1 attempt {attempt} failed, retrying... Error: {error}"
            )
        )
        logger.info("[local_pdf_generator] Stage 1 complete: Structured brief generated successfully")
        return structured_brief
        
    except Exception as e:
        logger.error(f"[local_pdf_generator] Stage 1 error after retries: {e}", exc_info=True)
        # Fallback to basic structure
        return {
            "bottom_line": "Review the expert positions and take action based on the analysis.",
            "opportunity": "",
            "recommendation": "Review the expert positions and take action based on the analysis.",
            "requirement": "",
            "executive_summary": debate_content.get("debate_content", "Analysis complete.")[:500],
            "rationale": ["Analysis based on debate content", "Expert positions synthesized", "Further review recommended"],
            "critical_risks": [
                {"description": "Implementation complexity", "impact": 3, "probability": 3, "mitigation": "Phased approach"},
                {"description": "Resource constraints", "impact": 3, "probability": 3, "mitigation": "Resource planning"},
                {"description": "Timeline risks", "impact": 3, "probability": 3, "mitigation": "Buffer time"},
            ],
            "immediate_actions": ["Review analysis", "Validate assumptions", "Plan next steps"],
            "critical_conditions": [],
            "confidence_level": debate_content.get("confidence", 75),
            "quotable_insights": [],
            "swot": {"strengths": [], "weaknesses": [], "opportunities": [], "threats": []},
            "risk_matrix": {"high_impact_high_prob": [], "high_impact_low_prob": [], "low_impact_high_prob": [], "low_impact_low_prob": []},
            "timeline": [],
        }


async def render_brief_html(structured_brief: Dict[str, Any], debate_content: Dict[str, Any], user_id: str | None = None, db: AsyncSession | None = None) -> str:
    """
    Stage 2: Render structured brief JSON to HTML using LLM.
    Matches frontend's renderBriefHtml function exactly.
    Model: anthropic/claude-sonnet-4.5 (or PDF_STAGE2_MODEL env var)
    Temperature: 0.3
    
    Args:
        structured_brief: Structured brief JSON from Stage 1
        debate_content: Original debate content
        user_id: User ID for API key resolution (required for Community Edition)
    """
    logger.info("[local_pdf_generator] Stage 2: Rendering HTML from structured brief using LLM...")
    
    router = LLMRouter()
    
    # Get model from env (same as frontend) - defaults to "anthropic/claude-sonnet-4.5"
    model = os.getenv("PDF_STAGE2_MODEL") or "anthropic/claude-sonnet-4.5"
    temperature = float(os.getenv("PDF_STAGE2_TEMPERATURE", "0.3"))
    
    # Format date as YYYY.M.D (same as frontend)
    date = datetime.now().strftime("%Y.%-m.%-d") if os.name != 'nt' else datetime.now().strftime("%Y.%#m.%#d")
    
    # Build prompt exactly matching frontend (from renderBriefHtml.ts)
    prompt = f"""You are a Senior Frontend Developer specializing in creating professional HTML documents for PDF conversion. Your task is to convert structured executive brief data into a beautiful, print-ready HTML document.

## DESIGN SYSTEM

### Typography (COMPACT DESIGN)
- **Headers**: Use serif fonts ('Georgia', 'Times New Roman') for H1, H2, H3
- **Body**: Use sans-serif fonts ('Arial', 'Helvetica', 'Inter') for body text
- **Font sizes** (SMALLER for compact layout): 
  - H1: 24px (reduced from 32px)
  - H2: 18px (reduced from 24px)
  - H3: 14px (reduced from 18px)
  - Body: 11px (reduced from 14px)
  - Small text: 9px for labels and metadata

### Color Palette
- **Background**: White (#ffffff)
- **Primary Text**: Black (#000000)
- **Accent Text**: #324154 (for H1, H2, important metrics)
- **Accent Background**: #c5bea1 (for subtle section backgrounds or callout boxes)
- **Borders**: #e2e8f0 (light gray)

### Layout (COMPACT - Target 2-3 pages)
- **Page Size**: A4 (210mm x 297mm)
- **Margins**: 15mm on all sides (reduced from 20mm)
- **Line Height**: 1.5 for body text (reduced from 1.7), 1.2 for headers (reduced from 1.3)
- **Spacing**: Reduce margins and padding throughout - use 12-16px instead of 24-32px
- **Multi-column**: Use 2-column layout for sections where appropriate (e.g., rationale + risks side by side)
- **Footer**: Footer will be added automatically during PDF generation (do not include in HTML)
- **Goal**: Fit all content in 2-3 pages maximum

## CRITICAL PDF REQUIREMENTS

1. **Page Breaks**: You MUST use `page-break-inside: avoid;` on ALL major sections, cards, and boxes to prevent content from being split across pages.

2. **Complete HTML Structure**: Include <!DOCTYPE html>, <html>, <head>, and <body> tags.

3. **Inline CSS**: All styles must be inline or in a <style> tag in the <head>. No external stylesheets.

4. **Print-Friendly**: Use CSS that works well for print/PDF conversion.

5. **Footer**: Do NOT include a footer in the HTML. The footer will be added automatically during PDF conversion.

## STRUCTURED DATA TO RENDER

```json
{json.dumps(structured_brief, indent=2)}
```

## ADDITIONAL CONTEXT
- **Question**: {debate_content['question']}
- **Confidence**: {debate_content['confidence']}%
- **Date**: {date}

## HTML STRUCTURE REQUIREMENTS

1. **Header Section** (at top of first page):
   - Left side: Logo text "CRUCIBLE" where "CRU" is black and "CIBLE" is #fec76f
   - Font-weight: 800, Letter-spacing: 2px
   - Right side: "EXECUTIVE BRIEF | {date}" in small caps, color #888

2. **Executive Summary Section** (COMPACT):
   - Smaller heading (H2 size: 18px)
   - Render the executive_summary as 2-3 concise paragraphs (max 4-5 sentences total)
   - Use page-break-inside: avoid
   - Keep it to 1/3 page or less

3. **Recommendation Box** (COMPACT):
   - Highlighted callout box with border-left: 3px solid #D9A441 (reduced from 4px)
   - Background: #F5F6F7
   - Display the recommendation prominently but concisely (2-3 sentences max)
   - Use smaller padding (16px instead of 24px)
   - Keep it to 1/4 page or less

4. **Key Sections** (COMPACT LAYOUT - use multi-column where possible):
   - The Opportunity (1-2 sentences, compact)
   - The Requirement (1-2 sentences, compact)
   - Key Rationale: Use 2-column layout with compact bulleted list (3-4 bullets max, 1 line each)
   - Critical Risks: Use compact list format with impact/probability as inline badges (e.g., "Risk: [H/L Impact] [H/L Prob]")
   - Immediate Actions: Use compact numbered list (3-5 items, 1 line each)
   - Critical Conditions: Use compact bulleted list (2-3 items, 1 line each)
   - Consider placing Opportunity, Requirement, and Conditions in a 2-column grid to save space

5. **SWOT Analysis** (REQUIRED - if present in data):
   - Render as compact 2x2 grid (smaller font, tighter spacing)
   - Each quadrant with distinct background color
   - Use smaller font (10px) and compact padding (8-12px)
   - Limit to 2-3 items per quadrant (most important only)
   - Use page-break-inside: avoid on the entire grid
   - Make it fit in half a page or less

6. **Risk Matrix** (REQUIRED - if present in data):
   - Render as compact 2x2 grid (smaller font, tighter spacing)
   - Label axes: Impact (High/Low) and Probability (High/Low)
   - Use smaller font (10px) and compact padding (8-12px)
   - Use short risk titles (3-5 words max per risk)
   - Use page-break-inside: avoid on the entire grid
   - Make it fit in half a page or less

7. **Timeline** (REQUIRED - if present in data):
   - Render as compact horizontal or vertical timeline
   - Use smaller font (10-11px) and tighter spacing
   - Each phase with minimal visual separation (thin border, compact padding)
   - Limit activities to 2-3 most important per phase
   - Use page-break-inside: avoid on each phase
   - Consider horizontal layout to save vertical space

8. **Footer Note**: Do NOT include a footer in the HTML. The footer (with date and page numbers) will be added automatically during PDF generation.

## EXAMPLE HTML STRUCTURE

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Brief</title>
  <style>
    @page {{
      size: A4;
      margin: 20mm 20mm 30mm 20mm;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #000000;
      background: #ffffff;
    }}
    .section {{
      page-break-inside: avoid;
      margin-bottom: 16px;
    }}
    h1 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 24px;
      margin-bottom: 12px;
    }}
    h2 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 18px;
      margin-bottom: 10px;
    }}
    h3 {{
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 14px;
      margin-bottom: 8px;
    }}
    .two-column {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }}
    .recommendation-box {{
      background: #F5F6F7;
      border-left: 3px solid #D9A441;
      padding: 16px;
      margin: 16px 0;
      page-break-inside: avoid;
      font-size: 11px;
    }}
    .compact-list {{
      margin: 8px 0;
      padding-left: 16px;
    }}
    .compact-list li {{
      margin-bottom: 4px;
      line-height: 1.4;
    }}
  </style>
</head>
<body>
  <!-- Your rendered content here -->
</body>
</html>
```

## FINAL INSTRUCTIONS (CRITICAL - COMPACT DESIGN)

1. Generate ONLY the raw HTML code
2. Do NOT include markdown code blocks (like ```html)
3. Start immediately with `<!DOCTYPE html>`
4. **TARGET: 2-3 pages maximum** - Be extremely concise with all content
5. Use multi-column layouts (2-column grid) for sections like:
   - Opportunity + Requirement side by side
   - Rationale + Risks side by side
   - Actions + Conditions side by side
6. Keep all text brief - use bullet points, avoid long paragraphs
7. **MUST INCLUDE**: Risk Matrix, SWOT Analysis, and Timeline (if present in data) - make them compact but visible
8. Use smaller fonts (11px body, 18px H2, 24px H1)
9. Reduce all spacing (16px margins instead of 32px)
10. Ensure ALL sections have `page-break-inside: avoid;` in their CSS
11. Make it visually appealing and professional despite compact size
12. Use semantic HTML5 elements where appropriate
13. Ensure the document is self-contained (all CSS inline or in <style> tag)"""

    async def _generate():
        request = LLMRequest(
            prompt=prompt,
            provider="openrouter",
            model=model,
            temperature=temperature,
            json_mode=False,  # HTML output, not JSON
        )
        
        # Pass user_id and db to router.generate() for API key resolution
        response = await router.generate(request, user_id=user_id, db=db)
        
        # Clean up the HTML - remove markdown code blocks if present
        html = response.strip()
        if html.startswith("```html"):
            html = html[7:].strip()
        elif html.startswith("```"):
            html = html[3:].strip()
        if html.endswith("```"):
            html = html[:-3].strip()
        
        # Check for complete HTML structure (both opening and closing tags)
        html_lower = html.lower()
        has_opening_html = "<html" in html_lower
        has_closing_html = "</html>" in html_lower
        has_opening_body = "<body" in html_lower
        has_closing_body = "</body>" in html_lower
        
        # If HTML structure is incomplete or malformed, rebuild it properly
        if not has_opening_html or not has_closing_html or not has_opening_body or not has_closing_body:
            # Extract body content if partial HTML exists
            body_content = html
            if has_opening_body:
                # Try to extract content between <body> tags
                import re
                body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
                if body_match:
                    body_content = body_match.group(1).strip()
                else:
                    # Has opening body tag but no closing, extract everything after <body>
                    body_match = re.search(r'<body[^>]*>(.*)', html, re.DOTALL | re.IGNORECASE)
                    if body_match:
                        body_content = body_match.group(1).strip()
            
            # Rebuild complete HTML structure
            html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Brief</title>
</head>
<body>
{body_content}
</body>
</html>"""
        elif not html_lower.startswith("<!doctype"):
            # Has complete structure but missing DOCTYPE
            html = f"<!DOCTYPE html>\n{html}"
        
        # Validate HTML structure
        validation = validate_html_structure(html)
        if not validation.valid:
            raise Exception(f"HTML validation failed: {'; '.join(validation.errors)}")
        
        return html
    
    try:
        # Use retry with backoff (matches frontend)
        html = await retry_with_backoff(
            _generate,
            RetryConfig(max_retries=2, retry_delay_ms=1000),
            lambda attempt, error: logger.warning(
                f"[local_pdf_generator] Stage 2 attempt {attempt} failed, retrying... Error: {error}"
            )
        )
        logger.info(f"[local_pdf_generator] Stage 2 complete: HTML generated, length: {len(html)} chars")
        return html
        
    except Exception as e:
        logger.error(f"[local_pdf_generator] Stage 2 error after retries: {e}", exc_info=True)
        # Fallback to basic HTML
        return generate_fallback_html(structured_brief, debate_content)


def generate_fallback_html(structured_brief: Dict[str, Any], debate_content: Dict[str, Any]) -> str:
    """
    Generate fallback HTML if LLM fails.
    Uses the same design system as the frontend.
    """
    date = datetime.now().strftime("%Y.%m.%d")
    
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Executive Brief</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #000000;
      background: #ffffff;
      padding: 40px;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
    }}
    .logo {{ font-weight: 800; font-size: 18px; letter-spacing: 2px; }}
    .logo .cru {{ color: #000000; }}
    .logo .cible {{ color: #fec76f; }}
    .meta {{ color: #888; font-size: 10px; text-transform: uppercase; }}
    h1 {{ font-family: 'Georgia', serif; color: #324154; font-size: 24px; margin-bottom: 16px; }}
    h2 {{ font-family: 'Georgia', serif; color: #324154; font-size: 18px; margin-bottom: 12px; margin-top: 24px; }}
    .section {{ page-break-inside: avoid; margin-bottom: 20px; }}
    .recommendation-box {{
      background: #F5F6F7;
      border-left: 3px solid #D9A441;
      padding: 16px;
      margin: 16px 0;
    }}
    ul, ol {{ margin: 8px 0; padding-left: 20px; }}
    li {{ margin-bottom: 4px; }}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><span class="cru">CRU</span><span class="cible">CIBLE</span></div>
    <div class="meta">EXECUTIVE BRIEF | {date}</div>
  </div>
  
  <h1>{debate_content['question']}</h1>
  
  <div class="section">
    <h2>Executive Summary</h2>
    <p>{structured_brief.get('executive_summary', 'Analysis complete.')}</p>
  </div>
  
  <div class="recommendation-box section">
    <h2 style="margin-top:0;">Recommendation</h2>
    <p>{structured_brief.get('recommendation', 'Review the analysis.')}</p>
    <p style="margin-top:8px;"><strong>Confidence: {structured_brief.get('confidence_level', debate_content['confidence'])}%</strong></p>
  </div>
  
  <div class="section">
    <h2>Key Rationale</h2>
    <ul>
      {''.join([f'<li>{r}</li>' for r in structured_brief.get('rationale', ['No rationale provided.'])])}
    </ul>
  </div>
  
  <div class="section">
    <h2>Immediate Actions</h2>
    <ol>
      {''.join([f'<li>{a}</li>' for a in structured_brief.get('immediate_actions', ['Review analysis.'])])}
    </ol>
  </div>
</body>
</html>"""


async def generate_pdf_from_session_json(
    session_id: str,
    session_json: Dict[str, Any],
    use_llm: bool = True,
    user_id: str | None = None,
    db: AsyncSession | None = None,
) -> bytes:
    """
    Generate a PDF from session JSON data using TWO-STAGE LLM pipeline + Playwright.
    
    Pipeline:
    1. Extract debate content from session JSON
    2. Stage 1: LLM generates structured brief JSON (openai/gpt-5.1)
    3. Stage 2: LLM generates HTML from structured brief (anthropic/claude-haiku-4.5)
    4. Playwright converts HTML to PDF
    
    Args:
        session_id: Session ID
        session_json: Session data as dictionary
        use_llm: If True, use two-stage LLM pipeline (default: True)
        user_id: User ID for API key resolution (required for Community Edition when use_llm=True)
        db: Database session for API key lookup (required for Community Edition when use_llm=True)
        
    Returns:
        PDF as bytes
    """
    logger.info(f"[local_pdf_generator] Generating PDF for session {session_id} (use_llm={use_llm}, user_id={user_id[:8] if user_id else None}...)")
    
    # Step 1: Extract debate content
    logger.info("[local_pdf_generator] Step 1: Extracting debate content...")
    debate_content = extract_debate_content(session_json)
    logger.info(f"[local_pdf_generator] Extracted: question='{debate_content['question'][:50]}...', confidence={debate_content['confidence']}%")
    
    if use_llm:
        # Step 2: Stage 1 - Generate structured brief
        structured_brief = await generate_structured_brief(debate_content, user_id=user_id, db=db)
        
        # Step 3: Stage 2 - Render HTML from structured brief
        html_content = await render_brief_html(structured_brief, debate_content, user_id=user_id, db=db)
    else:
        # Fallback: Generate basic HTML without LLM
        structured_brief = {
            "recommendation": "Review the expert positions and take action based on the analysis.",
            "executive_summary": debate_content.get("debate_content", "Analysis complete.")[:1000],
            "confidence_level": debate_content.get("confidence", 75),
            "rationale": [],
            "immediate_actions": [],
        }
        html_content = generate_fallback_html(structured_brief, debate_content)
    
    # Step 4: Convert HTML to PDF using Playwright
    logger.info("[local_pdf_generator] Step 4: Converting HTML to PDF using Playwright...")
    
    # Windows fix: Use sync Playwright in a thread to avoid subprocess issues
    # The default SelectorEventLoop on Windows doesn't support subprocess creation
    # which Playwright needs. Running sync Playwright in a thread avoids this.
    if platform.system() == "Windows":
        def run_playwright_sync(html_content: str, session_id: str) -> bytes:
            """Run Playwright synchronously in a thread to avoid Windows subprocess issues."""
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                    ],
                )
                try:
                    page = browser.new_page()
                    page.set_content(html_content, wait_until="networkidle")
                    
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
        logger.info("[local_pdf_generator] Running Playwright in thread (Windows workaround)")
        try:
            pdf_bytes = await asyncio.to_thread(run_playwright_sync, html_content, session_id)
            logger.info(f"[local_pdf_generator] PDF generated successfully, size: {len(pdf_bytes)} bytes")
            return pdf_bytes
        except Exception as e:
            logger.error(f"[local_pdf_generator] Error generating PDF on Windows: {e}", exc_info=True)
            raise Exception(f"PDF generation failed: {e}")
    
    # Non-Windows: Use async Playwright (works with default event loop)
    browser = None
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                ],
            )
            page = await browser.new_page()
            await page.set_content(html_content, wait_until="networkidle")
            
            # Format date for footer (same as frontend)
            date = datetime.now().strftime("%Y.%m.%d")
            
            # Generate PDF with footer (matches frontend htmlToPdf.ts)
            pdf_bytes = await page.pdf(
                format="A4",
                margin={
                    "top": "0.5in",
                    "right": "0.5in",
                    "bottom": "0.8in",  # Extra for footer
                    "left": "0.5in",
                },
                print_background=True,
                display_header_footer=True,
                header_template="<div></div>",  # Empty header
                footer_template=f"""
                    <div style="font-size: 10px; color: #888; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 20mm; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                        <span style="flex: 1; text-align: left;">{date}</span>
                        <span style="flex: 1; text-align: right;">Page <span class="pageNumber"></span></span>
                    </div>
                """,
            )
            
            await browser.close()
            
            logger.info(f"[local_pdf_generator] PDF generated successfully, size: {len(pdf_bytes)} bytes")
            return pdf_bytes
            
    except Exception as e:
        logger.error(f"[local_pdf_generator] Error generating PDF: {e}", exc_info=True)
        if browser:
            try:
                await browser.close()
            except:
                pass
        raise Exception(f"PDF generation failed: {e}")
