from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator, Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# Try to import json-repair library for better JSON parsing of LLM responses
try:
    import json_repair
except ImportError:
    json_repair = None  # Graceful fallback if library not installed

logger = logging.getLogger(__name__)

from app.models.session import RoundtableSession, SessionKnight
from app.models.knight import Knight
from app.models.model_catalog import LLMModel
from app.models.user_settings import UserSettings
from app.schemas.events import (
    ResearchEvent,
    RedTeamEvent,
    TranslatorEvent,
    DebateEventPayload,
    EventType,
    ModeratorRulingEvent,
    PositionCardEvent,
    RebuttalEvent,
    RouterDecisionEvent,
    ChallengeEvent,
    ConvergenceEvent,
    ArtifactReadyEvent,
    PdfGenerationStatusEvent,
    PhaseStartedEvent,
    PhaseProgressEvent,
    PhaseCompleteEvent,
)
from app.services.debate.phases import (
    DEFAULT_PHASE_CONFIG,
    DEFAULT_PHASE_SEQUENCE,
    DebatePhase,
    PhaseTiming,
)
from app.services.debate.ledger import LedgerWriter
from app.services.llm.router import LLMRouter, LLMRequest, PROVIDER_MAP
from app.services.llm.api_key_resolver import APIKeyResolver
from app.services.llm.exceptions import NoAPIKeyError
from app.services.debate.prompts import PromptTemplate
from app.services.artifacts.audit import get_audit_topic


@dataclass
class ConfidenceSnapshot:
    """Lightweight holder for p(claim) per synthetic claim identifier."""

    per_claim: dict[str, float] = field(default_factory=dict)
    calibration_bias: dict[str, float] = field(default_factory=dict)


@dataclass
class StreamEnvelope:
    """Event payload bundled with state machine metadata."""

    payload: DebateEventPayload
    phase: DebatePhase
    sequence_id: int
    deadline_at: datetime
    grace_deadline_at: datetime
    quality_gates: dict[str, bool]
    confidence: ConfidenceSnapshot
    # Optional token usage metrics (populated if available from LLM provider)
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    cost_cents: Optional[int] = None
    latency_ms: Optional[int] = None


@dataclass
class DebateEngineConfig:
    phase_sequence: tuple[DebatePhase, ...] = DEFAULT_PHASE_SEQUENCE
    phase_config: dict[DebatePhase, PhaseTiming] = field(
        default_factory=lambda: dict(DEFAULT_PHASE_CONFIG)
    )
    min_citation_count: int = 1
    contradiction_threshold: float = 0.35
    max_challenges: int = 3


class QualityGateEvaluator:
    """Evaluate quality, safety, and compliance gates on debate events."""

    def __init__(self, min_citation_count: int, contradiction_threshold: float) -> None:
        self._min_citation_count = min_citation_count
        self._contradiction_threshold = contradiction_threshold

    def evaluate(self, payload: DebateEventPayload, session_id: Optional[str] = None, question: Optional[str] = None) -> dict[str, bool]:
        gates: dict[str, bool] = {}
        gates["citation_density"] = self._passes_citation_gate(payload)
        gates["contradiction_check"] = self._passes_contradiction_gate(payload)
        gates["safety_check"] = self._passes_safety_gate(payload)
        
        # Quality evaluation for monitoring (doesn't block, just stores)
        # DISABLED: Evaluation functions disabled in production
        # try:
        #     from app.core.evals import evaluate_debate_event
        #     from app.core.quality_storage import store_quality_score
        #     from app.core.datadog_metrics import send_quality_scores
        #     import time
        #     
        #     # Get debate question for relevance evaluation
        #     eval_question = question or getattr(self, '_current_question', None)
        #     eval_results = evaluate_debate_event(payload, question=eval_question)
        #     
        #     # Store quality score for monitoring
        #     # Extract debate_id and event_id from payload if available
        #     debate_id = session_id or getattr(payload, 'session_id', None) or getattr(self, '_current_session_id', None)
        #     event_id = getattr(payload, 'event_id', None) or getattr(payload, 'id', None) or f"event_{int(time.time() * 1000)}"
        #     
        #     if debate_id:
        #         # Extract metrics for storage
        #         metrics_dict = {}
        #         if "metrics" in eval_results:
        #             for metric_name, metric_data in eval_results["metrics"].items():
        #                 if isinstance(metric_data, dict) and "score" in metric_data:
        #                     metrics_dict[metric_name] = metric_data["score"]
        #         
        #         # Get model and provider from engine if available
        #         model = getattr(payload, 'model', None) or getattr(self, '_current_model', None)
        #         provider = getattr(payload, 'provider', None) or getattr(self, '_current_provider', None)
        #         
        #         # Store in Redis
        #         store_quality_score(
        #             debate_id=str(debate_id),
        #             event_id=str(event_id),
        #             overall_score=eval_results["overall_score"],
        #             metrics=metrics_dict,
        #             model=model,
        #             provider=provider
        #         )
        #         
        #         # Send to Datadog
        #         send_quality_scores(
        #             overall_score=eval_results["overall_score"],
        #             metrics=metrics_dict,
        #             debate_id=str(debate_id),
        #             model=model,
        #             provider=provider
        #         )
        # except Exception as e:
        #     # Don't fail the gate if quality evaluation fails
        #     logger.debug(f"Quality evaluation failed (non-blocking): {e}")
        
        return gates

    def _passes_citation_gate(self, payload: DebateEventPayload) -> bool:
        citations = getattr(payload, "citations", None)
        if citations is None:
            return True
        return len([c for c in citations if c]) >= self._min_citation_count

    def _passes_contradiction_gate(self, payload: DebateEventPayload) -> bool:
        """
        Check for semantic contradictions in debate events.
        
        Current implementation: Always returns True (gate passes).
        
        Future enhancement: This gate is intended to detect semantic contradictions
        between different positions or claims using a semantic similarity model.
        When implemented, it will compare embeddings of claims/positions to identify
        contradictory statements.
        
        Note: This is a non-blocking quality gate - failures are logged but don't
        prevent event generation.
        """
        return True

    def _passes_safety_gate(self, payload: DebateEventPayload) -> bool:
        """Check for safety issues: PII, toxic content, prompt injection."""
        from app.core.security import PIIDetector, ContentModerator
        
        # Extract text content from payload
        text_content = ""
        if hasattr(payload, "headline"):
            text_content += str(getattr(payload, "headline", "")) + " "
        if hasattr(payload, "body"):
            text_content += str(getattr(payload, "body", "")) + " "
        if hasattr(payload, "detail"):
            text_content += str(getattr(payload, "detail", "")) + " "
        
        if not text_content.strip():
            return True
        
        # Check for PII
        has_pii, pii_types = PIIDetector.detect(text_content)
        if has_pii:
            logger.warning(f"PII detected in debate payload: {pii_types}")
            # Don't fail the gate, but log it - PII will be redacted before sending to LLM
        
        # Check for toxic content (async check if available, sync as fallback)
        # Note: This is called from sync context, so we use sync check
        # For async contexts, use ContentModerator.check_async()
        moderation_check = ContentModerator.check(text_content)
        
        # Tiered moderation: block only high-severity, warn for medium-severity
        if moderation_check.severity == "block":
            logger.warning(f"Content moderation blocked: {moderation_check.reason}")
            return False
        elif moderation_check.severity == "warn":
            # Allow controversial content but log for review
            logger.info(f"Content moderation warning (allowed): {moderation_check.reason}")
            # Don't fail the gate - allow the content through
            return True
        
        return True


class DebateEngine:
    """State machine orchestrating professional, phase-aware debates."""

    def __init__(self, config: DebateEngineConfig | None = None, ledger_writer: LedgerWriter | None = None) -> None:
        self.config = config or DebateEngineConfig()
        self._quality_gates = QualityGateEvaluator(
            self.config.min_citation_count, self.config.contradiction_threshold
        )
        self._sequence_id = 0
        self._confidence = ConfidenceSnapshot()
        self._challenge_counts: dict[str, int] = {}
        self._ledger_writer = ledger_writer
        self.llm_router = LLMRouter()
        self._last_convergence_summary: str = ""
        # Track debate state across phases
        self._opening_statements: dict[str, PositionCardEvent] = {}
        self._claims: dict[str, list[str]] = {}  # knight_id -> list of claims
        self._challenges: list[ChallengeEvent] = []
        self._completed_research: set[str] = set()  # Track knights who finished research
        self._last_dissenting_points: list[str] = []  # Store for judge phase
        self._last_recommendation: str = ""  # Store for judge phase
        self._last_critical_risks: list[str] = []  # Store for judge phase
        self._last_red_team_critique: RedTeamEvent | None = None  # Store Red Team critique for rebuttals
        # Context tracking for quality evaluation
        self._current_session_id: Optional[str] = None
        self._current_question: Optional[str] = None
        self._current_model: Optional[str] = None
        self._current_provider: Optional[str] = None
        self._api_key_resolver = APIKeyResolver()

    def restore_state(self, events: list[DebateEventPayload | dict], knights_count: int = 0) -> None:
        """Hydrate internal state from a list of past events.
        
        Args:
            events: List of past events from database
            knights_count: Expected number of knights (for validation)
        """
        self._completed_phases = set()
        self._completed_research = set()  # Reset research tracking
        
        # Track events per phase to validate completeness
        phase_event_counts: dict[DebatePhase, int] = {}
        
        for event in events:
            # Handle both Pydantic models and dicts (from database)
            if isinstance(event, dict):
                event_type_str = event.get("type", "")
                phase_str = event.get("phase", "")
                sequence_id = event.get("sequence_id", 0)
                
                # Track phase
                try:
                    phase = DebatePhase(phase_str) if phase_str else DebatePhase.IDLE
                    if phase != DebatePhase.IDLE:
                        phase_event_counts[phase] = phase_event_counts.get(phase, 0) + 1
                except (ValueError, TypeError):
                    pass
                
                # Update sequence ID
                if sequence_id > self._sequence_id:
                    self._sequence_id = sequence_id
                
                # Track Completed Research
                if event_type_str == EventType.RESEARCH_RESULT.value:
                    knight_id = event.get("knight_id")
                    if knight_id:
                        # Normalize knight_id (strip whitespace)
                        normalized_id = str(knight_id).strip()
                        self._completed_research.add(normalized_id)

                # Rebuild Openings
                if event_type_str == EventType.POSITION_CARD.value:
                    knight_id = event.get("knight_id")
                    if knight_id:
                        try:
                            self._opening_statements[knight_id] = PositionCardEvent(**event)
                        except Exception as e:
                            logger.warning(f"Failed to restore PositionCardEvent: {e}")

                # Rebuild Challenges
                elif event_type_str == EventType.CHALLENGE.value:
                    try:
                        self._challenges.append(ChallengeEvent(**event))
                    except Exception as e:
                        logger.warning(f"Failed to restore ChallengeEvent: {e}")
                
                # Rebuild Convergence Context
                elif event_type_str == EventType.CONVERGENCE.value:
                    self._last_convergence_summary = event.get("summary", "")
                    self._last_dissenting_points = event.get("dissenting_points", [])
                
                # Rebuild Red Team Critique
                elif event_type_str == EventType.RED_TEAM_CRITIQUE.value:
                    try:
                        self._last_red_team_critique = RedTeamEvent(**event)
                    except Exception as e:
                        logger.warning(f"Failed to restore RedTeamEvent: {e}")
                
                # Handle Session Initialization (optional - store for reference)
                elif event_type_str == EventType.SESSION_INITIALIZATION.value:
                    # Store initialization data if needed for engine logic
                    # Currently just acknowledge it exists - can be extended if needed
                    pass
            else:
                # Handle Pydantic models (if passed directly)
                # Track completed phases
                if hasattr(event, 'phase') and event.phase != DebatePhase.IDLE:
                    self._completed_phases.add(event.phase)
                
                # Update sequence ID
                if hasattr(event, 'sequence_id') and event.sequence_id > self._sequence_id:
                    self._sequence_id = event.sequence_id
                
                # Track Completed Research
                if hasattr(event, 'type') and event.type == EventType.RESEARCH_RESULT:
                    if hasattr(event, 'knight_id') and event.knight_id:
                        normalized_id = str(event.knight_id).strip()
                        self._completed_research.add(normalized_id)

                # Rebuild Openings
                if hasattr(event, 'type') and event.type == EventType.POSITION_CARD:
                    if hasattr(event, 'knight_id') and event.knight_id:
                        if isinstance(event, PositionCardEvent):
                            self._opening_statements[event.knight_id] = event

                # Rebuild Challenges
                elif hasattr(event, 'type') and event.type == EventType.CHALLENGE:
                    if isinstance(event, ChallengeEvent):
                        self._challenges.append(event)
                
                # Rebuild Convergence Context
                elif hasattr(event, 'type') and event.type == EventType.CONVERGENCE:
                    if isinstance(event, ConvergenceEvent):
                        self._last_convergence_summary = event.summary
                        self._last_dissenting_points = event.dissenting_points
                    # Track phase
                    if hasattr(event, 'phase') and event.phase != DebatePhase.IDLE:
                        phase_event_counts[event.phase] = phase_event_counts.get(event.phase, 0) + 1
                
                # Rebuild Red Team Critique
                elif hasattr(event, 'type') and event.type == EventType.RED_TEAM_CRITIQUE:
                    if isinstance(event, RedTeamEvent):
                        self._last_red_team_critique = event
                
                # Handle Session Initialization (optional - store for reference)
                elif hasattr(event, 'type') and event.type == EventType.SESSION_INITIALIZATION:
                    # Store initialization data if needed for engine logic
                    # Currently just acknowledge it exists - can be extended if needed
                    pass
        
        # Validate phase completion based on actual knight completion (more reliable than event counts)
        # RESEARCH: Check if all knights have completed research
        if knights_count > 0:
            research_completed_count = len(self._completed_research)
            if research_completed_count >= knights_count:
                self._completed_phases.add(DebatePhase.RESEARCH)
                logger.debug(f"Phase RESEARCH marked complete ({research_completed_count}/{knights_count} knights)")
            elif research_completed_count > 0:
                logger.debug(f"Phase RESEARCH partially complete ({research_completed_count}/{knights_count} knights) - will re-run")
                logger.debug(f"Completed research for: {self._completed_research}")
            
            # OPENING: Check if all knights have opening statements
            opening_completed_count = len(self._opening_statements)
            if opening_completed_count >= knights_count:
                self._completed_phases.add(DebatePhase.OPENING)
                logger.debug(f"Phase OPENING marked complete ({opening_completed_count}/{knights_count} knights)")
            elif opening_completed_count > 0:
                logger.debug(f"Phase OPENING partially complete ({opening_completed_count}/{knights_count} knights) - will re-run")
                logger.debug(f"Completed opening for: {list(self._opening_statements.keys())}")
        
        # CLAIMS: Silent phase (no events), detect completion by checking if claims dict is populated
        # If we have opening statements but no claims, CLAIMS didn't complete
        if len(self._opening_statements) > 0 and len(self._claims) == len(self._opening_statements):
            self._completed_phases.add(DebatePhase.CLAIMS)
            logger.debug(f"Phase CLAIMS marked complete (claims extracted for {len(self._claims)} knights)")
        elif len(self._opening_statements) > 0 and len(self._claims) > 0:
            logger.debug(f"Phase CLAIMS partially complete ({len(self._claims)}/{len(self._opening_statements)} knights) - will re-run")
        
        # CROSS_EXAMINATION: Should have events (at least 1 if 2+ knights)
        if DebatePhase.CROSS_EXAMINATION in phase_event_counts and phase_event_counts[DebatePhase.CROSS_EXAMINATION] > 0:
            self._completed_phases.add(DebatePhase.CROSS_EXAMINATION)
        
        # REBUTTALS: Should have 1 event per challenge
        if DebatePhase.REBUTTALS in phase_event_counts:
            rebuttal_count = phase_event_counts[DebatePhase.REBUTTALS]
            challenge_count = len(self._challenges)
            if challenge_count > 0 and rebuttal_count >= challenge_count:
                self._completed_phases.add(DebatePhase.REBUTTALS)
        
        # Single-event phases: Mark complete if any event exists
        for phase in [DebatePhase.RED_TEAM, DebatePhase.CONVERGENCE, DebatePhase.TRANSLATOR, 
                      DebatePhase.ARTIFACT_READY, DebatePhase.CLOSED]:
            if phase in phase_event_counts and phase_event_counts[phase] > 0:
                self._completed_phases.add(phase)

    async def stream_session(
        self, session: RoundtableSession, db: AsyncSession
    ) -> AsyncGenerator[StreamEnvelope, None]:
        """Yield structured debate events for a session."""
        logger.debug("[stream_session] ENTER - Starting debate stream")
        session_identifier = str(getattr(session, "session_id", "demo-session"))
        logger.debug(f"[stream_session] Session ID: {session_identifier}")
        
        # Ensure completed phases set exists if restore_state wasn't called
        if not hasattr(self, "_completed_phases"):
            logger.debug("[stream_session] Initializing phase tracking (no restore_state called)")
            self._completed_phases = set()
            self._completed_research = set()
            # Reset debate state only if not restoring
            self._opening_statements = {}
            self._claims = {}
            self._challenges = []
        else:
            logger.debug(f"[stream_session] Using restored state - completed phases: {[p.value for p in self._completed_phases]}")
        
        # Pre-fetch knights and validate
        logger.debug("[stream_session] Fetching knights...")
        knights_map = await self._fetch_knights(session, db)
        logger.debug(f"[stream_session] Fetched {len(knights_map)} knights: {list(knights_map.keys())}")
        if not knights_map:
            logger.error("[stream_session] ERROR: No knights found!")
            raise ValueError(
                f"No knights found for session {session_identifier}. "
                "At least one knight is required to start a debate."
            )
        
        # Validate API keys for all knights' models (optional warning, doesn't block)
        user_id = str(session.user_id) if hasattr(session, 'user_id') and session.user_id else None
        if user_id:
            try:
                await self._validate_api_keys_for_session(session, knights_map, db, user_id)
            except Exception as e:
                # Log warning but don't block - let the actual LLM calls fail with clear errors
                logger.warning(
                    f"[stream_session] API key validation warning: {e}. "
                    "Debate will proceed, but may fail during LLM calls if keys are missing."
                )
        
        # Validate topic exists
        question = self._get_question(session)
        logger.debug(f"[stream_session] Topic/Question: {question[:100] if question else 'None'}...")
        if not question or question == "What should we decide?":
            logger.error("[stream_session] ERROR: No valid topic!")
            raise ValueError(
                f"Debate topic/question is required for session {session_identifier}. "
                "Please provide a topic via query parameter or session context."
            )
        
        # Safety: Track consecutive failures to prevent infinite loops
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        # DEBUG: Log all phases that will be iterated
        all_phases = list(self._iter_phases())
        logger.debug(f"[DEBATE ENGINE] Phase sequence: {[p.value for p in all_phases]}")
        logger.debug(f"[DEBATE ENGINE] Completed phases: {[p.value for p in self._completed_phases] if hasattr(self, '_completed_phases') else 'None'}")
        
        for phase in self._iter_phases():
            logger.debug(f"[DEBATE ENGINE] === PHASE: {phase.value} ===")
            
            # Safety check: Stop if too many consecutive failures
            if consecutive_failures >= max_consecutive_failures:
                logger.error(f"[SAFETY] Stopping debate after {consecutive_failures} consecutive failures")
                break
            
            # Check if phase is already completed (resuming functionality)
            if phase in self._completed_phases:
                logger.debug(f"[PHASE SKIP] Skipping completed phase: {phase.value}")
                logger.info(f"[PHASE SKIP] Skipping completed phase: {phase.value} (prevents duplicate LLM calls)")
                continue
            
            # Double-check: IDLE should never reach here, but guard against it
            if phase == DebatePhase.IDLE:
                logger.warning("[SAFETY] IDLE phase detected - skipping")
                logger.warning(f"[SAFETY] IDLE phase detected in loop - skipping")
                continue
                
            # Yield control between phases (debate continues even if clients disconnect)
            await asyncio.sleep(0)
            phase_timing = self._phase_timing(phase)
            deadline, grace_deadline = self._build_deadlines(phase_timing)

            try:
                logger.debug(f"[DEBATE ENGINE] Starting phase: {phase.value}")
                logger.info(f"[DEBATE ENGINE] Starting phase: {phase.value}")
                
                # Emit phase started event
                phase_start_time = datetime.now(timezone.utc)
                phase_started_payload = PhaseStartedEvent(
                    type=EventType.PHASE_STARTED,
                    phase=phase,
                    session_id=session_identifier,
                    sequence_id=self._sequence_id + 1,
                    phase_name=phase.value,
                    phase_description=self._get_phase_description(phase),
                    estimated_duration_seconds=phase_timing.max_duration_seconds,
                )
                self._sequence_id += 1
                phase_started_payload = phase_started_payload.model_copy(update={"sequence_id": self._sequence_id})
                phase_started_envelope = StreamEnvelope(
                    payload=phase_started_payload,
                    phase=phase,
                    sequence_id=self._sequence_id,
                    deadline_at=deadline,
                    grace_deadline_at=grace_deadline,
                    quality_gates={},
                    confidence=self._confidence,
                )
                if self._ledger_writer:
                    try:
                        await self._ledger_writer.write(phase_started_envelope, db)
                    except Exception:
                        pass  # Don't fail on status event write
                yield phase_started_envelope
                
                phase_has_events = False
                event_count = 0
                async for payload in self._generate_phase_events(phase, session, knights_map, db):
                    phase_has_events = True
                    event_count += 1
                    consecutive_failures = 0  # Reset on successful event
                    
                    # Increment sequence_id and assign to payload for each event
                    self._sequence_id += 1
                    payload = payload.model_copy(update={"sequence_id": self._sequence_id})
                    # Pass session context for quality evaluation
                    quality_gates = self._quality_gates.evaluate(
                        payload, 
                        session_id=session_identifier,
                        question=question
                    )
                    self._update_confidence(payload)
                    envelope = StreamEnvelope(
                        payload=payload,
                        phase=phase,
                        sequence_id=self._sequence_id,
                        deadline_at=deadline,
                        grace_deadline_at=grace_deadline,
                        quality_gates=quality_gates,
                        confidence=self._confidence,
                    )
                    if self._ledger_writer:
                        try:
                            await self._ledger_writer.write(envelope, db)
                        except Exception as ledger_error:
                            # Log error with proper logging (not print) and continue streaming
                            # Don't crash the debate, but log the error so we can debug database issues
                            # Use module-level logger (defined at top of file)
                            logger.error(
                                f"[DebateEngine] ⚠️  Ledger write failed for event {envelope.sequence_id} "
                                f"(phase: {envelope.phase.value}): {type(ledger_error).__name__}: {ledger_error}",
                                exc_info=True
                            )
                            # Continue streaming - debate will continue but event won't be in database
                            # This allows the debate to complete even if database has issues
                    yield envelope
                
                # Emit phase complete event
                phase_end_time = datetime.now(timezone.utc)
                phase_duration = (phase_end_time - phase_start_time).total_seconds()
                phase_complete_payload = PhaseCompleteEvent(
                    type=EventType.PHASE_COMPLETE,
                    phase=phase,
                    session_id=session_identifier,
                    sequence_id=self._sequence_id + 1,
                    phase_name=phase.value,
                    duration_seconds=phase_duration,
                    events_generated=event_count,
                )
                self._sequence_id += 1
                phase_complete_payload = phase_complete_payload.model_copy(update={"sequence_id": self._sequence_id})
                phase_complete_envelope = StreamEnvelope(
                    payload=phase_complete_payload,
                    phase=phase,
                    sequence_id=self._sequence_id,
                    deadline_at=deadline,
                    grace_deadline_at=grace_deadline,
                    quality_gates={},
                    confidence=self._confidence,
                )
                if self._ledger_writer:
                    try:
                        await self._ledger_writer.write(phase_complete_envelope, db)
                    except Exception:
                        pass  # Don't fail on status event write
                yield phase_complete_envelope
                
                # If phase produced no events and it's not a silent phase, increment failure counter
                if not phase_has_events and phase not in [DebatePhase.CLAIMS]:  # CLAIMS is silent (no events yielded)
                    consecutive_failures += 1
                    logger.warning(f"Phase {phase.value} produced no events (failure count: {consecutive_failures}/{max_consecutive_failures})")
                else:
                    consecutive_failures = 0  # Reset on successful phase
            except Exception as phase_error:
                consecutive_failures += 1
                logger.error(f"Error in phase {phase.value}: {phase_error} (failure count: {consecutive_failures}/{max_consecutive_failures})", exc_info=True)
                # Continue to next phase instead of crashing
                if consecutive_failures >= max_consecutive_failures:
                    logger.error("[SAFETY] Stopping debate due to repeated phase failures")
                    break

            await asyncio.sleep(0)  # relinquish control between phases

    async def _assign_balanced_models(
        self, 
        session: RoundtableSession, 
        knights_map: dict[str, Knight], 
        db: AsyncSession
    ) -> None:
        """Assign models to knights with balanced provider distribution.
        
        This method:
        1. Checks user's available API keys
        2. Filters models based on API key availability (OpenRouter enables all models)
        3. Gets user's excluded providers from user_settings
        4. Filters out excluded providers
        5. Groups models by provider
        6. Assigns models with balanced distribution (max 60% from one provider)
        7. Prioritizes native providers over aggregators when both available
        8. Stores assigned models in SessionKnight records
        """
        import random
        
        logger.debug("[_assign_balanced_models] Starting balanced model assignment")
        
        # Step 1: Get user's available API keys
        user_id = str(session.user_id) if session.user_id else None
        available_providers = await self._api_key_resolver.get_user_available_providers(user_id, db)
        
        if not available_providers:
            logger.warning("[_assign_balanced_models] User has no API keys, skipping assignment")
            return  # Fall back to knight's default models
        
        has_openrouter = "openrouter" in available_providers
        has_eden_ai = "eden_ai" in available_providers
        
        logger.debug(f"[_assign_balanced_models] User has API keys for: {list(available_providers.keys())}")
        logger.debug(f"[_assign_balanced_models] OpenRouter available: {has_openrouter}, Eden AI available: {has_eden_ai}")
        
        # Step 2: Get user's excluded providers from user_settings (user preference)
        excluded_providers: list[str] = []
        try:
            user_settings_stmt = select(UserSettings).where(UserSettings.user_id == session.user_id)
            user_settings_result = await db.execute(user_settings_stmt)
            user_settings = user_settings_result.scalar_one_or_none()
            
            if user_settings and user_settings.excluded_model_providers:
                excluded_providers = user_settings.excluded_model_providers
                logger.debug(f"[_assign_balanced_models] User excluded providers: {excluded_providers}")
        except Exception as e:
            logger.warning(f"[_assign_balanced_models] Failed to fetch user settings: {e}")
        
        excluded_providers_lower = [p.lower() for p in excluded_providers]
        
        # Check if models are already assigned (idempotency)
        # BUT: Re-validate against current exclusion settings and API key availability
        if all(sk.assigned_model_id for sk in session.knights):
            # Re-validate assigned models against current exclusion settings and API keys
            needs_reassignment = False
            try:
                for sk in session.knights:
                    if sk.assigned_model_id:
                        model_record = await db.get(LLMModel, sk.assigned_model_id)
                        if model_record:
                            # Check if provider is excluded
                            if model_record.provider.lower() in excluded_providers_lower:
                                logger.info(
                                    f"[_assign_balanced_models] Assigned model {sk.assigned_model_id} "
                                    f"({model_record.provider}) is now excluded, will reassign"
                                )
                                sk.assigned_model_id = None
                                needs_reassignment = True
                            # Check if API key is available for this model
                            elif not has_openrouter:
                                # If no OpenRouter, check if native provider key is available
                                model_provider = PROVIDER_MAP.get(model_record.provider.lower())
                                if model_provider not in available_providers:
                                    logger.info(
                                        f"[_assign_balanced_models] Assigned model {sk.assigned_model_id} "
                                        f"({model_record.provider}) no longer has API key, will reassign"
                                    )
                                    sk.assigned_model_id = None
                                    needs_reassignment = True
                
                if needs_reassignment:
                    await db.commit()
                    logger.info("[_assign_balanced_models] Cleared invalid models, will reassign")
                    # Continue with assignment logic below
                else:
                    logger.debug("[_assign_balanced_models] Models already assigned and valid, skipping")
                    return
            except Exception as e:
                logger.warning(f"[_assign_balanced_models] Failed to validate existing assignments: {e}")
                # Continue with assignment logic to be safe
        
        # Step 3: Fetch all available models from database
        stmt = select(LLMModel)
        result = await db.execute(stmt)
        all_models = result.scalars().all()
        
        if not all_models:
            logger.warning("[_assign_balanced_models] No models found in database, skipping assignment")
            return
        
        logger.debug(f"[_assign_balanced_models] Found {len(all_models)} total models")
        
        # Step 4: Filter models based on API key availability
        if has_openrouter:
            # OpenRouter supports all major providers - all models are accessible
            available_models = all_models
            logger.info("[_assign_balanced_models] OpenRouter available - all models accessible")
        else:
            # Filter to only models where user has native API key
            available_models = [
                m for m in all_models 
                if PROVIDER_MAP.get(m.provider.lower()) in available_providers
            ]
            logger.debug(f"[_assign_balanced_models] Filtered to {len(available_models)} models with available API keys")
        
        if not available_models:
            logger.warning("[_assign_balanced_models] No models available after API key filtering, skipping assignment")
            return
        
        # Step 5: Filter out excluded providers (case-insensitive)
        available_models = [
            m for m in available_models 
            if m.provider.lower() not in excluded_providers_lower
        ]
        
        if not available_models:
            logger.warning(
                f"[_assign_balanced_models] All models excluded by user settings ({excluded_providers}), "
                "falling back to all API-key-accessible models"
            )
            # Re-fetch without exclusion filter
            if has_openrouter:
                available_models = all_models
            else:
                available_models = [
                    m for m in all_models 
                    if PROVIDER_MAP.get(m.provider.lower()) in available_providers
                ]
        
        logger.debug(f"[_assign_balanced_models] {len(available_models)} models available after filtering")
        
        # Step 6: Group models by provider and calculate provider priority
        models_by_provider: dict[str, list[LLMModel]] = {}
        provider_priority: dict[str, int] = {}  # Lower number = higher priority
        
        for model in available_models:
            provider = model.provider.lower()
            if provider not in models_by_provider:
                models_by_provider[provider] = []
            models_by_provider[provider].append(model)
            
            # Calculate priority: native providers get priority 0, aggregators get priority 1
            router_provider = PROVIDER_MAP.get(provider)
            if router_provider in available_providers and router_provider not in ["openrouter", "eden_ai"]:
                provider_priority[provider] = 0  # Native provider - highest priority
            elif has_openrouter or has_eden_ai:
                provider_priority[provider] = 1  # Aggregator fallback - lower priority
            else:
                provider_priority[provider] = 99  # Not accessible (shouldn't happen after filtering)
        
        logger.debug(f"[_assign_balanced_models] Models grouped by provider: {list(models_by_provider.keys())}")
        logger.debug(f"[_assign_balanced_models] Provider priorities: {provider_priority}")
        
        # Step 7: Assign models with balanced distribution (max 60% from one provider)
        num_knights = len(session.knights)
        max_from_one_provider = int(num_knights * 0.6)  # 60% max
        
        # Track assignments per provider
        provider_counts: dict[str, int] = {p: 0 for p in models_by_provider.keys()}
        assignments: list[tuple[SessionKnight, LLMModel | None]] = []
        
        # Shuffle knights to avoid bias in assignment order
        knights_list = list(session.knights)
        random.shuffle(knights_list)
        
        for session_knight in knights_list:
            assigned_model = None
            
            # Strategy: Prioritize native providers, then balance distribution
            # 1. Get providers that haven't exceeded the 60% limit
            eligible_providers = [
                p for p in models_by_provider.keys() 
                if provider_counts[p] < max_from_one_provider
            ]
            
            if not eligible_providers:
                # All providers hit limit, use first available (shouldn't happen with 60% limit)
                if available_models:
                    assigned_model = available_models[0]
                    provider = assigned_model.provider.lower()
                    provider_counts[provider] = provider_counts.get(provider, 0) + 1
            else:
                # Sort providers by priority (native first), then by assignment count
                eligible_providers.sort(key=lambda p: (provider_priority.get(p, 99), provider_counts[p]))
                
                # Separate native providers from aggregators
                native_providers = [p for p in eligible_providers if provider_priority.get(p, 99) == 0]
                aggregator_providers = [p for p in eligible_providers if provider_priority.get(p, 99) == 1]
                
                # Prioritize unused native providers first
                unused_native = [p for p in native_providers if provider_counts[p] == 0]
                if unused_native:
                    # Shuffle for randomness among unused native providers
                    random.shuffle(unused_native)
                    target_provider = unused_native[0]
                # Then prioritize used native providers
                elif native_providers:
                    # Sort by assignment count (ascending) to balance
                    native_providers.sort(key=lambda p: provider_counts[p])
                    target_provider = native_providers[0]
                # Then unused aggregators
                elif aggregator_providers:
                    unused_aggregators = [p for p in aggregator_providers if provider_counts[p] == 0]
                    if unused_aggregators:
                        random.shuffle(unused_aggregators)
                        target_provider = unused_aggregators[0]
                    else:
                        aggregator_providers.sort(key=lambda p: provider_counts[p])
                        target_provider = aggregator_providers[0]
                else:
                    # Fallback to first eligible provider
                    target_provider = eligible_providers[0]
                
                # Get models from target provider and shuffle for randomness
                provider_models = models_by_provider[target_provider].copy()
                random.shuffle(provider_models)
                
                if provider_models:
                    assigned_model = provider_models[0]
                    provider_counts[target_provider] += 1
            
            assignments.append((session_knight, assigned_model))
        
        # Step 8: Store assigned models in SessionKnight records
        distribution_log: dict[str, int] = {}
        for session_knight, assigned_model in assignments:
            if assigned_model:
                session_knight.assigned_model_id = assigned_model.id
                provider = assigned_model.provider.lower()
                distribution_log[provider] = distribution_log.get(provider, 0) + 1
                logger.debug(
                    f"[_assign_balanced_models] Assigned model {assigned_model.id} "
                    f"({assigned_model.provider}) to knight {session_knight.knight_id}"
                )
            else:
                logger.warning(
                    f"[_assign_balanced_models] No model available for knight {session_knight.knight_id}, "
                    "will fallback to knight's default model"
                )
        
        # Commit the assignments
        try:
            await db.commit()
            # Refresh session to ensure relationship data is up to date
            await db.refresh(session, attribute_names=["knights"])
            logger.info(
                f"[_assign_balanced_models] Model assignment complete. Distribution: {distribution_log}"
            )
            # Log assigned models for verification
            for sk in session.knights:
                if sk.assigned_model_id:
                    logger.debug(
                        f"[_assign_balanced_models] Verified assignment: knight {sk.knight_id} -> model {sk.assigned_model_id}"
                    )
        except Exception as e:
            logger.error(f"[_assign_balanced_models] Failed to commit model assignments: {e}")
            await db.rollback()
            raise

    async def _fetch_knights(self, session: RoundtableSession, db: AsyncSession) -> dict[str, Knight]:
        """Fetch full Knight objects for the session."""
        # session.knights is a list of SessionKnight objects
        # We need to get the Knight objects corresponding to session_knight.knight_id
        knight_ids = [sk.knight_id for sk in session.knights]
        if not knight_ids:
            return {}
            
        stmt = select(Knight).where(Knight.id.in_(knight_ids))
        result = await db.execute(stmt)
        knights = result.scalars().all()
        knights_map = {k.id: k for k in knights}
        
        # Validate all requested knights exist
        missing_knights = set(knight_ids) - set(knights_map.keys())
        if missing_knights:
            logger.warning(f"Warning: {len(missing_knights)} knight(s) not found in database: {missing_knights}")
        
        # Assign balanced models to knights based on available API keys
        try:
            await self._assign_balanced_models(session, knights_map, db)
        except Exception as e:
            logger.error(f"[_fetch_knights] Failed to assign balanced models: {e}")
            # Continue with fallback to knight's default model
        
        return knights_map

    async def _validate_api_keys_for_session(
        self,
        session: RoundtableSession,
        knights_map: dict[str, Knight],
        db: AsyncSession,
        user_id: str
    ) -> None:
        """Validate that user has API keys for all knights' models.
        
        This is a warning-only validation - it logs warnings but doesn't block the session.
        Actual API key errors will be raised during LLM calls with clear messages.
        
        Args:
            session: The debate session
            knights_map: Dictionary of knight_id -> Knight objects
            db: Database session
            user_id: User ID for API key lookup
        """
        from app.services.llm.router import PROVIDER_MAP
        
        logger.debug("[_validate_api_keys_for_session] Starting API key validation")
        
        # Get all unique models used by knights
        models_to_check: dict[str, str] = {}  # model_id -> knight_name
        for knight_id, knight in knights_map.items():
            model_id = knight.model
            if model_id:
                models_to_check[model_id] = knight.name
        
        if not models_to_check:
            logger.debug("[_validate_api_keys_for_session] No models to validate")
            return
        
        # Get user's available providers
        available_providers = await self._api_key_resolver.get_user_available_providers(user_id, db)
        
        if not available_providers:
            logger.warning(
                f"[_validate_api_keys_for_session] User {user_id} has no API keys configured. "
                "Debate may fail during LLM calls. Please configure API keys in Settings > API Keys."
            )
            return
        
        logger.debug(f"[_validate_api_keys_for_session] User has keys for: {list(available_providers.keys())}")
        
        # Check each model
        missing_keys: list[str] = []
        for model_id, knight_name in models_to_check.items():
            try:
                # Look up model to get provider
                model_record = await db.get(LLMModel, model_id)
                if not model_record:
                    # Try lookup by api_identifier
                    result = await db.execute(
                        select(LLMModel).where(LLMModel.api_identifier == model_id)
                    )
                    model_record = result.scalar_one_or_none()
                
                if model_record:
                    provider = PROVIDER_MAP.get(model_record.provider.lower(), None)
                    if provider:
                        # Check if user has key for this provider or an aggregator
                        try:
                            provider_chain = await self._api_key_resolver.resolve_provider_chain(
                                model_id=model_id,
                                native_provider=provider,
                                user_id=user_id,
                                db=db
                            )
                            logger.debug(
                                f"[_validate_api_keys_for_session] ✓ Model {model_id} "
                                f"(knight: {knight_name}) has available provider chain"
                            )
                        except NoAPIKeyError as e:
                            missing_keys.append(f"{knight_name} ({model_id}): {str(e)}")
                            logger.warning(
                                f"[_validate_api_keys_for_session] ✗ Model {model_id} "
                                f"(knight: {knight_name}) missing API key: {e}"
                            )
                    else:
                        logger.warning(
                            f"[_validate_api_keys_for_session] Unknown provider for model {model_id}"
                        )
                else:
                    logger.debug(
                        f"[_validate_api_keys_for_session] Model {model_id} not found in database, "
                        "skipping validation"
                    )
            except Exception as e:
                logger.warning(
                    f"[_validate_api_keys_for_session] Error validating model {model_id}: {e}"
                )
        
        if missing_keys:
            logger.warning(
                f"[_validate_api_keys_for_session] ⚠️  API key validation found {len(missing_keys)} "
                f"missing keys:\n" + "\n".join(f"  - {msg}" for msg in missing_keys)
            )
        else:
            logger.info(
                "[_validate_api_keys_for_session] ✓ All models have available API keys"
            )

    def _iter_phases(self) -> Iterable[DebatePhase]:
        for phase in self.config.phase_sequence:
            if phase == DebatePhase.IDLE:
                continue
            yield phase

    def _get_phase_description(self, phase: DebatePhase) -> str:
        """Get user-friendly description for a phase."""
        descriptions = {
            DebatePhase.RESEARCH: "Researching the topic and gathering information",
            DebatePhase.OPENING: "Generating Round 1 positions",
            DebatePhase.CROSS_EXAMINATION: "Cross-examining positions",
            DebatePhase.CHALLENGES: "Analyzing challenges",
            DebatePhase.REBUTTALS: "Processing rebuttals",
            DebatePhase.RED_TEAM: "Red team analysis",
            DebatePhase.CONVERGENCE: "Converging recommendations",
            DebatePhase.TRANSLATOR: "Translating to executive summary",
            DebatePhase.ARTIFACT_READY: "Preparing final artifact",
        }
        return descriptions.get(phase, f"Processing {phase.value} phase")

    def _phase_timing(self, phase: DebatePhase) -> PhaseTiming:
        timing = self.config.phase_config.get(phase)
        if not timing:
            timing = PhaseTiming(max_duration_seconds=120, grace_period_seconds=15)
            self.config.phase_config[phase] = timing
        return timing

    def _build_deadlines(self, timing: PhaseTiming) -> tuple[datetime, datetime]:
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(seconds=timing.max_duration_seconds)
        grace_deadline = deadline + timedelta(seconds=timing.grace_period_seconds)
        return deadline, grace_deadline

    async def _get_model_for_knight(self, knight_id: str, session: RoundtableSession, knight: Knight, db: AsyncSession) -> str:
        """Get the model to use for a knight.
        
        Checks assigned_model_id from SessionKnight first, then falls back to knight.model.
        Queries the database to ensure we get the latest assigned_model_id value.
        Also validates that the assigned model's provider is not excluded.
        
        Args:
            knight_id: The knight identifier
            session: The session containing SessionKnight records
            knight: The Knight object (for fallback)
            db: Database session to query fresh SessionKnight data
        
        Returns:
            Model identifier (id from llm_models table or api_identifier)
        """
        # Query SessionKnight fresh from database to avoid stale relationship data
        try:
            stmt = select(SessionKnight).where(
                SessionKnight.session_id == session.id,  # session.id is UUID, session.session_id is string
                SessionKnight.knight_id == knight_id
            )
            result = await db.execute(stmt)
            session_knight = result.scalar_one_or_none()
            
            if session_knight and session_knight.assigned_model_id:
                # Validate that the assigned model's provider is not excluded
                try:
                    # Get user's excluded providers
                    excluded_providers: list[str] = []
                    user_settings_stmt = select(UserSettings).where(UserSettings.user_id == session.user_id)
                    user_settings_result = await db.execute(user_settings_stmt)
                    user_settings = user_settings_result.scalar_one_or_none()
                    
                    if user_settings and user_settings.excluded_model_providers:
                        excluded_providers = user_settings.excluded_model_providers
                    
                    # Get the assigned model to check its provider
                    model_record = await db.get(LLMModel, session_knight.assigned_model_id)
                    if model_record:
                        # Check if provider is excluded (case-insensitive)
                        excluded_providers_lower = [p.lower() for p in excluded_providers]
                        if model_record.provider.lower() in excluded_providers_lower:
                            logger.warning(
                                f"[_get_model_for_knight] Assigned model {session_knight.assigned_model_id} "
                                f"({model_record.provider}) is excluded, falling back to knight's default model"
                            )
                            # Clear the assigned model so it won't be used
                            session_knight.assigned_model_id = None
                            await db.commit()
                            # Fall through to use knight.model
                        else:
                            # Model is valid, use it
                            model_id = session_knight.assigned_model_id
                            logger.debug(f"[_get_model_for_knight] Using assigned model {model_id} ({model_record.provider}) for knight {knight_id}")
                            return model_id
                    else:
                        logger.warning(f"[_get_model_for_knight] Assigned model {session_knight.assigned_model_id} not found in database")
                        # Fall through to use knight.model
                except Exception as e:
                    logger.warning(f"[_get_model_for_knight] Failed to validate assigned model: {e}")
                    # Fall through to use knight.model
        except Exception as e:
            logger.warning(f"[_get_model_for_knight] Failed to query SessionKnight for knight {knight_id}: {e}")
            # Fall through to fallback
        
        # Fallback to knight's default model
        logger.debug(f"[_get_model_for_knight] No assigned model for knight {knight_id}, using knight's default model: {knight.model}")
        return knight.model

    def _get_question(self, session: RoundtableSession) -> str:
        """Extract the debate question from session topic field or audit_log_uri."""
        # First priority: topic stored directly in database
        if session.topic:
            return session.topic
        # Second priority: topic from audit_log_uri (for backward compatibility)
        if session.audit_log_uri:
            topic = get_audit_topic(session.audit_log_uri)
            if topic:
                return topic
        # Final fallback
        return "What should we decide?"
    
    async def _generate_phase_events(
        self, phase: DebatePhase, session: RoundtableSession, knights_map: dict[str, Knight], db: AsyncSession
    ) -> AsyncGenerator[DebateEventPayload, None]:
        """Generate events for the phase using LLM."""
        logger.debug(f"[_generate_phase_events] ENTER - phase: {phase.value}, knights: {len(knights_map)}")
        logger.info(f"[_generate_phase_events] Starting phase: {phase.value}, knights: {len(knights_map)}")
        # Explicitly handle IDLE phase - should never make LLM calls
        if phase == DebatePhase.IDLE:
            logger.warning("IDLE phase encountered - skipping (should not happen as _iter_phases skips IDLE)")
            return
        
        session_id = str(session.session_id)
        raw_question = self._get_question(session)
        logger.debug(f"[_generate_phase_events] Session: {session_id}, Question length: {len(raw_question) if raw_question else 0}")
        
        # Store context for quality evaluation
        self._current_session_id = session_id
        self._current_question = raw_question
        
        # Sanitize user input (question) before using in prompts - CRITICAL SECURITY STEP
        from app.core.security import sanitize_user_input
        logger.debug("[_generate_phase_events] Sanitizing question...")
        question, security_check = sanitize_user_input(raw_question, check_injection=True, redact_pii=True)
        logger.debug(f"[_generate_phase_events] Security check: is_safe={security_check.is_safe}, severity={security_check.severity}")
        
        # Handle security check results - be more lenient for legitimate debates
        if not security_check.is_safe:
            # If severity is "block", we must reject (violence, explicit content, etc.)
            if security_check.severity == "block":
                logger.error(f"Security check failed (BLOCKED) for debate question: {security_check.reason}")
                raise RuntimeError(f"Input validation failed: {security_check.reason}")
            # If severity is "warn", allow but log (controversial but legitimate topics)
            elif security_check.severity == "warn":
                logger.warning(f"Security check warning (ALLOWED) for debate question: {security_check.reason}")
                # Continue with sanitized question
            else:
                # Unknown severity - log but allow
                logger.warning(f"Security check returned unknown severity '{security_check.severity}', allowing: {security_check.reason}")
        
        # Ensure question is not empty after sanitization
        if not question or not question.strip():
            logger.error(f"Question became empty after sanitization. Original: {raw_question[:100]}...")
            raise RuntimeError("Question cannot be empty after sanitization. Please provide a valid debate topic.")
        
        if question != raw_question:
            logger.info(f"Question sanitized: original length {len(raw_question)}, sanitized length {len(question)}") 

        if phase == DebatePhase.RESEARCH:
            logger.debug(f"[PHASE] RESEARCH phase starting - checking {len(knights_map)} knights")
            knights_to_process = [k for k in knights_map.keys() if k not in self._completed_research]
            knights_skipped = [k for k in knights_map.keys() if k in self._completed_research]
            if knights_skipped:
                logger.debug(f"[PHASE] RESEARCH: Skipping {len(knights_skipped)} already completed knights: {knights_skipped}")
            if knights_to_process:
                logger.debug(f"[PHASE] RESEARCH: Processing {len(knights_to_process)} knights: {knights_to_process}")
            
            for knight_id, knight in knights_map.items():
                # Skip if research already completed for this knight
                if knight_id in self._completed_research:
                    logger.debug(f"Research already completed for knight {knight_id} - skipping")
                    continue
                    
                logger.info(f"[LLM CALL] Calling LLM for RESEARCH - knight: {knight_id} ({knight.role}), model: {knight.model}")
                # 1. Generate Research with Web Search
                knight_prompt = (knight.prompt or "").strip()
                prompt_prefix = f"You are {knight.role}"
                if knight_prompt:
                    prompt_prefix += f". {knight_prompt}"
                prompt = f"""
                {prompt_prefix} with the goal: {knight.goal}.
                The strategic question is: {question}
                
                Perform a web search to find relevant facts, figures, and recent developments.
                Return a JSON object with:
                - "queries": [list of search queries used]
                - "summary": "A synthesis of the findings"
                - "sources": [{{"title": "...", "url": "...", "snippet": "..."}}] (Extract these from the web search citations if possible, otherwise list the URLs found)
                """
                
                logger.info(f"[LLM CALL] About to call _call_llm for RESEARCH phase")
                model_to_use = await self._get_model_for_knight(knight_id, session, knight, db)
                response_json = await self._call_llm(prompt, model_to_use, tier="cheap", web_search=True, db=db, user_id=str(session.user_id) if session.user_id else None)
                logger.info(f"[LLM CALL] Received response from LLM for RESEARCH phase")
                
                # OpenRouter web search results come in the 'annotations' field of the message, 
                # but since we are using the simple 'generate' interface which returns content string,
                # we rely on the model to incorporate citations into the text or we need to parse the full response object.
                # However, our current abstraction returns the content string.
                # The OpenRouter documentation says: "Incorporate the following web search results into your response. IMPORTANT: Cite them using markdown links..."
                # So the model *should* have the info in the content.
                
                # We'll trust the model to populate the "sources" field in the JSON based on the context it received.
                
                queries = response_json.get("queries", ["Web Search"])
                sources = response_json.get("sources", [])
                summary = response_json.get("summary", "Research completed.")

                yield ResearchEvent(
                    type=EventType.RESEARCH_RESULT,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id=knight_id,
                    query=queries[0] if queries else "General Research",
                    sources=sources,
                    summary=summary
                )
                # Mark research as completed for this knight to prevent duplicate calls
                self._completed_research.add(knight_id)

        elif phase == DebatePhase.OPENING:
            logger.debug(f"[PHASE] OPENING phase starting - checking {len(knights_map)} knights")
            knights_to_process = [k for k in knights_map.keys() if k not in self._opening_statements]
            knights_skipped = [k for k in knights_map.keys() if k in self._opening_statements]
            if knights_skipped:
                logger.debug(f"[PHASE] OPENING: Skipping {len(knights_skipped)} already completed knights: {knights_skipped}")
            if knights_to_process:
                logger.debug(f"[PHASE] OPENING: Processing {len(knights_to_process)} knights: {knights_to_process}")
            
            for knight_id, knight in knights_map.items():
                # Skip if opening statement already completed for this knight
                if knight_id in self._opening_statements:
                    logger.debug(f"Opening statement already completed for knight {knight_id} - skipping")
                    continue
                    
                logger.debug(f"[LLM CALL] Calling LLM for OPENING - knight: {knight_id} ({knight.role})")
                knight_prompt = (knight.prompt or "").strip()
                if knight_prompt:
                    knight_prompt = knight_prompt + "\n"
                
                # Question is already sanitized at the start of _generate_phase_events
                prompt = PromptTemplate.OPENING_STATEMENT.format(
                    role=knight.role,
                    question=question,
                    mandate=knight.goal,
                    knight_prompt=knight_prompt
                )
                model_to_use = await self._get_model_for_knight(knight_id, session, knight, db)
                response_json = await self._call_llm(prompt, model_to_use, tier="standard", db=db, user_id=str(session.user_id) if session.user_id else None)
                
                # Normalize response to handle malformed LLM outputs (e.g., lists instead of strings)
                try:
                    response_json = self._normalize_response(response_json, f"OPENING-{knight_id}")
                except Exception as norm_error:
                    logger.error(f"[OPENING] Error normalizing response for knight {knight_id}: {norm_error}")
                    logger.error(f"[OPENING] Raw response_json: {response_json}")
                    # Continue with original response_json, but log the issue
                
                # Normalize confidence: LLM may return 0-100, but schema expects 0.0-1.0
                confidence_raw = response_json.get("confidence", 0.5)
                if isinstance(confidence_raw, (int, float)):
                    # If confidence is > 1, assume it's a percentage and convert
                    confidence = float(confidence_raw) / 100.0 if confidence_raw > 1.0 else float(confidence_raw)
                    confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
                else:
                    confidence = 0.5
                
                # Create PositionCardEvent with error handling
                try:
                    position_event = PositionCardEvent(
                        type=EventType.POSITION_CARD,
                        phase=phase,
                        session_id=session_id,
                        sequence_id=0,
                        knight_id=knight_id,
                        headline=response_json.get("headline", "Position"),
                        body=response_json.get("body", ""),
                        citations=response_json.get("citations", []),
                        confidence=confidence,
                    )
                    # Store for later phases
                    self._opening_statements[knight_id] = position_event
                    yield position_event
                except Exception as validation_error:
                    # Log detailed error information for debugging
                    logger.error(f"[OPENING] Validation error creating PositionCardEvent for knight {knight_id}: {validation_error}")
                    logger.error(f"[OPENING] Response JSON keys: {list(response_json.keys())}")
                    logger.error(f"[OPENING] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                    logger.error(f"[OPENING] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                    # Re-raise to let the retry mechanism handle it
                    raise

        elif phase == DebatePhase.CLAIMS:
            # Check if claims already exist (from restore_state) - skip if complete
            if len(self._claims) == len(self._opening_statements) and len(self._opening_statements) > 0:
                logger.debug(f"CLAIMS phase already complete ({len(self._claims)} claims extracted) - skipping LLM calls")
                return
            
            # Extract specific claims from opening statements
            for knight_id, opening in self._opening_statements.items():
                # Skip if claims already extracted for this knight
                if knight_id in self._claims:
                    logger.debug(f"Claims already extracted for knight {knight_id} - skipping")
                    continue
                    
                knight = knights_map.get(knight_id)
                if not knight:
                    continue
                
                prompt = f"""
                You are analyzing an opening statement from a debate.
                
                Opening Statement:
                Headline: {opening.headline}
                Body: {opening.body}
                
                Extract 2-3 specific, testable claims from this statement.
                Each claim should be a clear, debatable assertion that can be challenged.
                
                Return a JSON object with:
                {{
                    "claims": ["claim 1", "claim 2", "claim 3"]
                }}
                """
                
                model_to_use = await self._get_model_for_knight(knight_id, session, knight, db)
                response_json = await self._call_llm(prompt, model_to_use, tier="cheap", db=db, user_id=str(session.user_id) if session.user_id else None)
                claims = response_json.get("claims", [])
                if claims:
                    self._claims[knight_id] = claims
                    # Store claims in confidence tracking for reference
                    for claim in claims:
                        self._confidence.per_claim[claim] = opening.confidence or 0.5

        elif phase == DebatePhase.CROSS_EXAMINATION:
            # Improved: Each knight challenges another knight's claims
            knights_list = list(knights_map.items())
            if len(knights_list) < 2:
                # Skip cross-examination if insufficient knights, but log it
                logger.warning(f"Skipping cross-examination phase: requires at least 2 knights, found {len(knights_list)}")
                return
            
            # Create pairs: each knight challenges the next knight (round-robin)
            for i, (challenger_id, challenger) in enumerate(knights_list):
                # Target is the next knight (wraps around)
                target_id, target = knights_list[(i + 1) % len(knights_list)]
                
                # Get target's claims (from CLAIMS phase) or use opening headline
                target_claims = self._claims.get(target_id, [])
                if not target_claims and target_id in self._opening_statements:
                    # Fallback to opening statement headline if no claims extracted
                    target_claims = [self._opening_statements[target_id].headline]
                
                if not target_claims:
                    continue
                
                # Challenge the first/most significant claim
                target_claim = target_claims[0]
                
                # Include context about the target's position
                target_opening = self._opening_statements.get(target_id)
                context = ""
                if target_opening:
                    context = f"\nFull position: {target_opening.body[:200]}..."
                
                challenger_prompt = (challenger.prompt or "").strip()
                if challenger_prompt:
                    challenger_prompt = challenger_prompt + "\n"
                prompt = PromptTemplate.CHALLENGE.format(
                    role=challenger.role,
                    target_role=target.role,
                    target_claim=target_claim + context,
                    mandate=challenger.goal,
                    knight_prompt=challenger_prompt
                )
                model_to_use = await self._get_model_for_knight(challenger_id, session, challenger, db)
                response_json = await self._call_llm(prompt, model_to_use, tier="standard", db=db, user_id=str(session.user_id) if session.user_id else None)
                
                # Normalize response to handle malformed LLM outputs
                try:
                    response_json = self._normalize_response(response_json, f"CHALLENGE-{challenger_id}")
                except Exception as norm_error:
                    logger.error(f"[CHALLENGE] Error normalizing response for knight {challenger_id}: {norm_error}")
                    logger.error(f"[CHALLENGE] Raw response_json: {response_json}")
                
                # Create ChallengeEvent with error handling
                try:
                    challenge_event = ChallengeEvent(
                        type=EventType.CHALLENGE,
                        phase=phase,
                        session_id=session_id,
                        sequence_id=0,
                        knight_id=challenger_id,
                        target_knight_id=target_id,
                        contestation=response_json.get("contestation", ""),
                        citation_reference=response_json.get("citation_reference"),
                    )
                except Exception as validation_error:
                    logger.error(f"[CHALLENGE] Validation error creating ChallengeEvent for knight {challenger_id}: {validation_error}")
                    logger.error(f"[CHALLENGE] Response JSON keys: {list(response_json.keys())}")
                    logger.error(f"[CHALLENGE] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                    logger.error(f"[CHALLENGE] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                    raise
                # Store challenge for REBUTTALS phase
                self._challenges.append(challenge_event)
                yield challenge_event

        elif phase == DebatePhase.REBUTTALS:
            # Each challenged knight gets to respond
            for challenge in self._challenges:
                target_id = challenge.target_knight_id
                challenger_id = challenge.knight_id
                
                target_knight = knights_map.get(target_id)
                challenger_knight = knights_map.get(challenger_id)
                if not target_knight or not challenger_knight:
                    continue
                
                # Get the target's original position
                target_opening = self._opening_statements.get(target_id)
                if not target_opening:
                    continue
                
                target_prompt = (target_knight.prompt or "").strip()
                if target_prompt:
                    target_prompt = target_prompt + "\n"
                
                # Build Red Team section if available
                red_team_section = ""
                if self._last_red_team_critique:
                    flaws_text = "\n".join([f"- {flaw}" for flaw in self._last_red_team_critique.flaws_identified]) if self._last_red_team_critique.flaws_identified else "None identified"
                    red_team_section = f"""
Red Team Critique (Severity: {self._last_red_team_critique.severity.upper()}):
{self._last_red_team_critique.critique}

Flaws Identified:
{flaws_text}

You should address these Red Team concerns in addition to the challenge above.
"""
                
                prompt = PromptTemplate.REBUTTAL.format(
                    role=target_knight.role,
                    challenger_role=challenger_knight.role,
                    challenge_text=challenge.contestation,
                    knight_prompt=target_prompt,
                    red_team_section=red_team_section
                )
                model_to_use = await self._get_model_for_knight(target_id, session, target_knight, db)
                response_json = await self._call_llm(prompt, model_to_use, tier="standard", db=db, user_id=str(session.user_id) if session.user_id else None)
                
                # Normalize response to handle malformed LLM outputs
                try:
                    response_json = self._normalize_response(response_json, f"REBUTTAL-{target_id}")
                except Exception as norm_error:
                    logger.error(f"[REBUTTAL] Error normalizing response for knight {target_id}: {norm_error}")
                    logger.error(f"[REBUTTAL] Raw response_json: {response_json}")
                
                # Extract and update confidence if provided in rebuttal
                if "confidence" in response_json:
                    confidence_raw = response_json.get("confidence")
                    if isinstance(confidence_raw, (int, float)):
                        # Normalize: if > 1, assume percentage
                        new_confidence = float(confidence_raw) / 100.0 if confidence_raw > 1.0 else float(confidence_raw)
                        new_confidence = max(0.0, min(1.0, new_confidence))
                        # Update the original position's confidence
                        if target_opening:
                            target_opening.confidence = new_confidence
                            # Update confidence tracking for this claim
                            self._confidence.per_claim[target_opening.headline] = new_confidence
                
                # Create RebuttalEvent with error handling
                try:
                    yield RebuttalEvent(
                        type=EventType.REBUTTAL,
                        phase=phase,
                        session_id=session_id,
                        sequence_id=0,
                        knight_id=target_id,
                        target_claim_id=target_opening.headline,  # Reference to challenged claim
                        body=response_json.get("body", ""),
                        citations=response_json.get("citations", []),
                    )
                except Exception as validation_error:
                    logger.error(f"[REBUTTAL] Validation error creating RebuttalEvent for knight {target_id}: {validation_error}")
                    logger.error(f"[REBUTTAL] Response JSON keys: {list(response_json.keys())}")
                    logger.error(f"[REBUTTAL] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                    logger.error(f"[REBUTTAL] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                    raise

        elif phase == DebatePhase.RED_TEAM:
            prompt = PromptTemplate.RED_TEAM.format(question=question)
            response_json = await self._call_llm(prompt, "openai/gpt-5.1", tier="expensive", db=db, user_id=str(session.user_id) if session.user_id else None)
            
            # Normalize response to handle malformed LLM outputs
            try:
                response_json = self._normalize_response(response_json, "RED_TEAM")
            except Exception as norm_error:
                logger.error(f"[RED_TEAM] Error normalizing response: {norm_error}")
                logger.error(f"[RED_TEAM] Raw response_json: {response_json}")
            
            # Create RedTeamEvent with error handling
            try:
                red_team_event = RedTeamEvent(
                    type=EventType.RED_TEAM_CRITIQUE,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="red_team_agent",
                    critique=response_json.get("critique", ""),
                    flaws_identified=response_json.get("flaws_identified", []),
                    severity=response_json.get("severity", "medium"),
                )
                self._last_red_team_critique = red_team_event
                yield red_team_event
            except Exception as validation_error:
                logger.error(f"[RED_TEAM] Validation error creating RedTeamEvent: {validation_error}")
                logger.error(f"[RED_TEAM] Response JSON keys: {list(response_json.keys())}")
                logger.error(f"[RED_TEAM] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                logger.error(f"[RED_TEAM] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                raise

        elif phase == DebatePhase.CONVERGENCE:
            # Build context from the debate so far
            positions_summary = []
            for knight_id, opening in self._opening_statements.items():
                knight = knights_map.get(knight_id)
                knight_name = knight.role if knight else knight_id
                positions_summary.append(f"- {knight_name}: {opening.headline}")
            
            challenges_summary = []
            for challenge in self._challenges:
                challenger = knights_map.get(challenge.knight_id)
                target = knights_map.get(challenge.target_knight_id)
                if challenger and target:
                    challenges_summary.append(f"- {challenger.role} challenged {target.role}: {challenge.contestation[:100]}...")
            
            context = f"""
            Debate Question: {question}
            
            Opening Positions:
            {chr(10).join(positions_summary) if positions_summary else "No positions recorded."}
            
            Challenges Raised:
            {chr(10).join(challenges_summary) if challenges_summary else "No challenges recorded."}
            """
            
            prompt = PromptTemplate.CONVERGENCE.format(question=question) + f"\n\nContext from debate:\n{context}"
            response_json = await self._call_llm(prompt, "openai/gpt-5.1", tier="expensive", db=db, user_id=str(session.user_id) if session.user_id else None)
            
            # Normalize response to handle malformed LLM outputs
            try:
                response_json = self._normalize_response(response_json, "CONVERGENCE")
            except Exception as norm_error:
                logger.error(f"[CONVERGENCE] Error normalizing response: {norm_error}")
                logger.error(f"[CONVERGENCE] Raw response_json: {response_json}")
            
            # Extract the recommendation-first structure
            recommendation = response_json.get("recommendation", "")
            rationale = response_json.get("rationale", "")
            base_summary = response_json.get("summary", "")
            critical_risks = response_json.get("critical_risks", [])
            known_unknowns = response_json.get("known_unknowns", [])
            
            # Build summary with recommendation FIRST (the solution)
            enhanced_summary_parts = []
            if recommendation:
                enhanced_summary_parts.append(f"**RECOMMENDATION:** {recommendation}")
            if rationale:
                enhanced_summary_parts.append(f"\n**Rationale:** {rationale}")
            if base_summary:
                enhanced_summary_parts.append(f"\n**Full Analysis:**\n{base_summary}")
            if critical_risks:
                enhanced_summary_parts.append("\n**Critical Risks:**\n" + "\n".join(f"- {risk}" for risk in critical_risks))
            if known_unknowns:
                enhanced_summary_parts.append("\n**Known Unknowns:**\n" + "\n".join(f"- {unknown}" for unknown in known_unknowns))
            
            self._last_convergence_summary = "\n".join(enhanced_summary_parts) if enhanced_summary_parts else base_summary
            self._last_recommendation = recommendation  # Store for judge phase
            self._last_critical_risks = critical_risks  # Store for judge phase
            
            # Normalize confidence: LLM may return 0-100, but schema expects 0.0-1.0
            confidence_raw = response_json.get("confidence", 0.8)
            if isinstance(confidence_raw, (int, float)):
                confidence = float(confidence_raw) / 100.0 if confidence_raw > 1.0 else float(confidence_raw)
                confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
            else:
                confidence = 0.8
            
            dissenting_points = response_json.get("dissenting_points", [])
            self._last_dissenting_points = dissenting_points  # Store for judge phase
            
            # Create ConvergenceEvent with error handling
            try:
                yield ConvergenceEvent(
                    type=EventType.CONVERGENCE,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="moderator",
                    summary=self._last_convergence_summary,
                    dissenting_points=dissenting_points,
                    confidence=confidence,
                )
            except Exception as validation_error:
                logger.error(f"[CONVERGENCE] Validation error creating ConvergenceEvent: {validation_error}")
                logger.error(f"[CONVERGENCE] Response JSON keys: {list(response_json.keys())}")
                logger.error(f"[CONVERGENCE] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                logger.error(f"[CONVERGENCE] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                raise

        elif phase == DebatePhase.TRANSLATOR:
            if self._last_convergence_summary:
                prompt = PromptTemplate.TRANSLATOR.format(summary=self._last_convergence_summary)
                response_json = await self._call_llm(prompt, "anthropic/claude-haiku-4.5", tier="cheap", db=db, user_id=str(session.user_id) if session.user_id else None) # Translator uses cheap model
                
                # Normalize response to handle malformed LLM outputs
                try:
                    response_json = self._normalize_response(response_json, "TRANSLATOR")
                except Exception as norm_error:
                    logger.error(f"[TRANSLATOR] Error normalizing response: {norm_error}")
                    logger.error(f"[TRANSLATOR] Raw response_json: {response_json}")
                
                # Create TranslatorEvent with error handling
                try:
                    yield TranslatorEvent(
                        type=EventType.TRANSLATOR_OUTPUT,
                        phase=phase,
                        session_id=session_id,
                        sequence_id=0,
                        knight_id="translator_agent",
                        translated_content=response_json.get("translated_content", ""),
                        target_audience=response_json.get("target_audience", "Executive"),
                        readability_score=response_json.get("readability_score"),
                    )
                except Exception as validation_error:
                    logger.error(f"[TRANSLATOR] Validation error creating TranslatorEvent: {validation_error}")
                    logger.error(f"[TRANSLATOR] Response JSON keys: {list(response_json.keys())}")
                    logger.error(f"[TRANSLATOR] Response JSON types: {{k: type(v).__name__ for k, v in response_json.items()}}")
                    logger.error(f"[TRANSLATOR] Raw response_json (first 1000 chars): {str(response_json)[:1000]}")
                    raise
            
        elif phase == DebatePhase.ARTIFACT_READY:
             # Export debate output to JSON and upload to S3
             try:
                 from app.services.artifacts.json_export import export_debate_to_json
                 from app.services.artifacts.s3_upload import upload_json_to_s3_async
                 from pathlib import Path
                 
                 # Export all events to JSON
                 json_path = await export_debate_to_json(session_id, session, db)
                 artifact_url = json_path  # Default to local path
                 
                 # Try to upload to S3
                 try:
                    s3_uri = await upload_json_to_s3_async(Path(json_path), session_id)
                    artifact_url = s3_uri
                    logger.info(f"Uploaded artifact to S3: {s3_uri}")
                    
                    # Verify upload succeeded by checking if file exists
                    try:
                        from app.services.artifacts.s3_upload import read_json_from_s3
                        test_read = read_json_from_s3(s3_uri)
                        logger.debug(f"Verified S3 upload: file exists and is readable ({len(test_read)} bytes)")
                    except Exception as verify_error:
                        logger.warning(f"Warning: Could not verify S3 upload: {verify_error}")
                    
                    # Update session audit_log_uri in database (JSON goes to audit_log_uri)
                    try:
                        session.audit_log_uri = s3_uri
                        # IMPORTANT: Ensure artifact_uri is NOT set to JSON (clear it if it was set)
                        if session.artifact_uri and (session.artifact_uri.endswith('.json') or session.artifact_uri == s3_uri):
                            logger.debug(f"Clearing artifact_uri (was set to JSON): {session.artifact_uri}")
                            session.artifact_uri = None
                        await db.commit()
                        # Refresh session to ensure we have the latest data
                        await db.refresh(session)
                        logger.debug(f"Updated session audit_log_uri: {s3_uri}")
                        logger.debug(f"Verified audit_log_uri after commit: {session.audit_log_uri}")
                    except Exception as db_error:
                        logger.error(f"Failed to update session audit_log_uri: {db_error}", exc_info=True)
                    
                    # Clean up local file after successful S3 upload
                    try:
                        Path(json_path).unlink(missing_ok=True)
                        logger.debug(f"Cleaned up local file: {json_path}")
                    except Exception as cleanup_error:
                        logger.warning(f"Failed to cleanup local file: {cleanup_error}")
                    
                    # Generate and upload PDF automatically (after JSON upload succeeds)
                    pdf_generation_success = False
                    pdf_uri_result = None
                    pdf_error_message = None
                    try:
                        from app.services.artifacts.pdf_generation import generate_and_upload_pdf
                        
                        logger.debug(f"Starting automatic PDF generation for session {session_id}...")
                        logger.debug(f"Using audit_log_uri: {session.audit_log_uri}")
                        if not session.audit_log_uri:
                            logger.error("ERROR: audit_log_uri is None, cannot generate PDF")
                            pdf_error_message = "No audit_log_uri found, cannot generate PDF"
                        else:
                            pdf_uri = await generate_and_upload_pdf(session_id, session, db)
                            
                            if pdf_uri:
                                # Store PDF URI in artifact_uri (PDF is the main artifact)
                                session.artifact_uri = pdf_uri
                                await db.commit()
                                await db.refresh(session)
                                logger.info(f"PDF generated and uploaded: {pdf_uri}")
                                logger.debug(f"Updated session artifact_uri with PDF: {pdf_uri}")
                                logger.debug(f"Verified artifact_uri after commit: {session.artifact_uri}")
                                pdf_generation_success = True
                                pdf_uri_result = pdf_uri
                            else:
                                logger.debug("PDF generation returned None (will be available on-demand)")
                                pdf_error_message = "PDF generation returned None (will be available on-demand)"
                    except Exception as pdf_error:
                        # Log but don't fail the debate - PDF generation is optional
                        logger.warning(f"PDF generation failed (debate continues): {pdf_error}", exc_info=True)
                        pdf_error_message = str(pdf_error)
                    
                    # Emit PDF generation status event so frontend knows whether to trigger fallback
                    yield PdfGenerationStatusEvent(
                        type=EventType.PDF_GENERATION_STATUS,
                        phase=phase,
                        session_id=session_id,
                        sequence_id=0,
                        knight_id="artifactizer_v1",
                        status="success" if pdf_generation_success else "failed",
                        pdf_uri=pdf_uri_result,
                        error_message=pdf_error_message,
                    )
                 except Exception as s3_error:
                     # S3 upload failed, but continue with local path
                     logger.warning(f"S3 upload failed: {s3_error}, using local path: {json_path}", exc_info=True)
                     artifact_url = json_path
                 
                 yield ArtifactReadyEvent(
                    type=EventType.ARTIFACT_READY,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="artifactizer_v1",
                    artifact_url=artifact_url,  # S3 URI or local path
                    checksum="sha256:placeholder",
                    rendering_mode="json",
                )
             except Exception as export_error:
                 # Log error but don't crash debate
                 logger.error(f"JSON export failed: {type(export_error).__name__}: {export_error}", exc_info=True)
                 # Yield a placeholder event so debate can complete
                 yield ArtifactReadyEvent(
                    type=EventType.ARTIFACT_READY,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="artifactizer_v1",
                    artifact_url=f"/tmp/artifacts/{session_id}_export_failed",
                    checksum="sha256:placeholder",
                    rendering_mode="json",
                )
        
        elif phase == DebatePhase.CLOSED:
            # Final Judge makes authoritative ruling after convergence
            # Always execute, even if convergence summary is empty (fallback case)
            convergence_summary = self._last_convergence_summary or "No convergence summary available."
            
            # Build comprehensive context for judge
            dissenting_context = "No major dissenting views recorded."
            if self._last_dissenting_points:
                dissenting_context = "\n".join([f"- {d}" for d in self._last_dissenting_points])
            
            critical_risks_context = ""
            if hasattr(self, '_last_critical_risks') and self._last_critical_risks:
                critical_risks_context = "\n".join([f"- {r}" for r in self._last_critical_risks])
            
            recommendation_context = ""
            if hasattr(self, '_last_recommendation') and self._last_recommendation:
                recommendation_context = f"Moderator's Recommendation: {self._last_recommendation}"
            
            # Enhance prompt with additional context
            enhanced_dissenting = f"{recommendation_context}\n\n{dissenting_context}\n\nCritical Risks Identified:\n{critical_risks_context if critical_risks_context else 'None'}"
            
            prompt = PromptTemplate.JUDGE_RULING.format(
                convergence_summary=convergence_summary,
                dissenting_points=enhanced_dissenting
            )
            
            try:
                response_json = await self._call_llm(prompt, "anthropic/claude-opus-4.5", tier="expensive", db=db, user_id=str(session.user_id) if session.user_id else None)
                
                # Build comprehensive notes from all judge outputs
                notes_parts = []
                if response_json.get("justification"):
                    notes_parts.append(f"**Justification:**\n{response_json.get('justification')}")
                if response_json.get("critical_conditions"):
                    conditions = response_json.get("critical_conditions", [])
                    if conditions:
                        notes_parts.append(f"**Critical Conditions:**\n" + "\n".join(f"- {c}" for c in conditions))
                if response_json.get("immediate_action"):
                    notes_parts.append(f"**Immediate Action:** {response_json.get('immediate_action')}")
                if response_json.get("notes"):
                    notes_parts.append(f"**Additional Considerations:**\n{response_json.get('notes')}")
                
                notes = "\n\n".join(notes_parts) if notes_parts else response_json.get("notes") or response_json.get("justification", "")
                
                # sequence_id will be set by the normal flow in stream_session (line 340-341)
                # Using 0 as placeholder - it will be overwritten with the correct incremented value
                yield ModeratorRulingEvent(
                    type=EventType.MODERATOR_RULING,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="final_judge",
                    ruling=response_json.get("ruling", "No final ruling provided. The debate concluded without a definitive decision."),
                    notes=notes,
                )
                
                # Regenerate JSON export to include CLOSED phase event
                # This ensures the final JSON includes all events including the closed phase
                try:
                    from app.services.artifacts.json_export import export_debate_to_json
                    from app.services.artifacts.s3_upload import upload_json_to_s3_async
                    from pathlib import Path
                    
                    # Export all events including CLOSED phase
                    json_path = await export_debate_to_json(session_id, session, db)
                    artifact_url = json_path  # Default to local path
                    
                    # Try to upload to S3 if artifact_uri already exists (was set in ARTIFACT_READY)
                    if session.artifact_uri and session.artifact_uri.startswith("s3://"):
                        try:
                            s3_uri = await upload_json_to_s3_async(Path(json_path), session_id)
                            artifact_url = s3_uri
                            logger.info(f"Regenerated and uploaded artifact to S3: {s3_uri}")
                            
                            # Update session audit_log_uri in database (JSON goes to audit_log_uri)
                            try:
                                session.audit_log_uri = s3_uri
                                await db.commit()
                                logger.debug(f"Updated session audit_log_uri with regenerated JSON: {s3_uri}")
                            except Exception as db_error:
                                logger.error(f"Failed to update session audit_log_uri: {db_error}", exc_info=True)
                            
                            # Clean up local file after successful S3 upload
                            try:
                                Path(json_path).unlink(missing_ok=True)
                                logger.debug(f"Cleaned up local file: {json_path}")
                            except Exception as cleanup_error:
                                logger.warning(f"Failed to cleanup local file: {cleanup_error}")
                        except Exception as s3_error:
                            # S3 upload failed, but continue with local path
                            logger.warning(f"S3 upload failed during CLOSED phase: {s3_error}, using local path: {json_path}", exc_info=True)
                    else:
                        # Update audit_log_uri if it wasn't set before (JSON goes to audit_log_uri)
                        try:
                            session.audit_log_uri = artifact_url
                            await db.commit()
                            logger.debug(f"Set session audit_log_uri: {artifact_url}")
                        except Exception as db_error:
                            logger.error(f"Failed to update session audit_log_uri: {db_error}", exc_info=True)
                except Exception as export_error:
                    # Log error but don't crash - JSON export is important but not critical for debate completion
                    logger.error(f"Failed to regenerate JSON export during CLOSED phase: {export_error}", exc_info=True)
            except Exception as e:
                # Fallback if LLM call fails
                logger.error(f"Judge ruling LLM call failed: {e}", exc_info=True)
                # sequence_id will be set by the normal flow in stream_session (line 340-341)
                # Using 0 as placeholder - it will be overwritten with the correct incremented value
                yield ModeratorRulingEvent(
                    type=EventType.MODERATOR_RULING,
                    phase=phase,
                    session_id=session_id,
                    sequence_id=0,
                    knight_id="final_judge",
                    ruling="The debate has concluded. Review the convergence summary and dissenting points above to make your decision.",
                    notes=f"Judge ruling generation encountered an error: {str(e)}",
                )
                
                # Regenerate JSON export to include CLOSED phase event (even in error case)
                try:
                    from app.services.artifacts.json_export import export_debate_to_json
                    from app.services.artifacts.s3_upload import upload_json_to_s3_async
                    from pathlib import Path
                    
                    # Export all events including CLOSED phase
                    json_path = await export_debate_to_json(session_id, session, db)
                    artifact_url = json_path  # Default to local path
                    
                    # Try to upload to S3 if artifact_uri already exists (was set in ARTIFACT_READY)
                    if session.artifact_uri and session.artifact_uri.startswith("s3://"):
                        try:
                            s3_uri = await upload_json_to_s3_async(Path(json_path), session_id)
                            artifact_url = s3_uri
                            logger.info(f"Regenerated and uploaded artifact to S3 (error case): {s3_uri}")
                            
                            # Update session audit_log_uri in database (JSON goes to audit_log_uri)
                            try:
                                session.audit_log_uri = s3_uri
                                await db.commit()
                                logger.debug(f"Updated session audit_log_uri with regenerated JSON: {s3_uri}")
                            except Exception as db_error:
                                logger.error(f"Failed to update session audit_log_uri: {db_error}", exc_info=True)
                            
                            # Clean up local file after successful S3 upload
                            try:
                                Path(json_path).unlink(missing_ok=True)
                                logger.debug(f"Cleaned up local file: {json_path}")
                            except Exception as cleanup_error:
                                logger.warning(f"Failed to cleanup local file: {cleanup_error}")
                        except Exception as s3_error:
                            # S3 upload failed, but continue with local path
                            logger.warning(f"S3 upload failed during CLOSED phase (error case): {s3_error}, using local path: {json_path}", exc_info=True)
                    else:
                        # Update audit_log_uri if it wasn't set before (JSON goes to audit_log_uri)
                        try:
                            session.audit_log_uri = artifact_url
                            await db.commit()
                            logger.debug(f"Set session audit_log_uri: {artifact_url}")
                        except Exception as db_error:
                            logger.error(f"Failed to update session audit_log_uri: {db_error}", exc_info=True)
                except Exception as export_error:
                    # Log error but don't crash - JSON export is important but not critical for debate completion
                    logger.error(f"Failed to regenerate JSON export during CLOSED phase (error case): {export_error}", exc_info=True)

    def _normalize_response(self, response_json: dict, phase: str) -> dict:
        """Normalize LLM response to ensure correct types.
        
        Converts list fields to strings and ensures proper types for all fields.
        This handles cases where LLMs return lists instead of strings.
        """
        normalized = response_json.copy()
        
        # Normalize body field (common across multiple phases)
        if "body" in normalized:
            if isinstance(normalized["body"], list):
                normalized["body"] = "\n".join(str(item) for item in normalized["body"])
                logger.warning(f"[{phase}] Normalized body from list to string: {len(normalized['body'])} chars")
            elif not isinstance(normalized["body"], str):
                normalized["body"] = str(normalized["body"])
                logger.warning(f"[{phase}] Converted body to string from {type(normalized['body']).__name__}")
        
        # Normalize headline field
        if "headline" in normalized:
            if isinstance(normalized["headline"], list):
                normalized["headline"] = " ".join(str(item) for item in normalized["headline"])
                logger.warning(f"[{phase}] Normalized headline from list to string")
            elif not isinstance(normalized["headline"], str):
                normalized["headline"] = str(normalized["headline"])
                logger.warning(f"[{phase}] Converted headline to string from {type(normalized['headline']).__name__}")
        
        # Normalize translated_content field (translator phase)
        if "translated_content" in normalized:
            if isinstance(normalized["translated_content"], list):
                normalized["translated_content"] = "\n".join(str(item) for item in normalized["translated_content"])
                logger.warning(f"[{phase}] Normalized translated_content from list to string")
            elif not isinstance(normalized["translated_content"], str):
                normalized["translated_content"] = str(normalized["translated_content"])
                logger.warning(f"[{phase}] Converted translated_content to string from {type(normalized['translated_content']).__name__}")
        
        # Normalize recommendation field (convergence phase)
        if "recommendation" in normalized:
            if isinstance(normalized["recommendation"], list):
                normalized["recommendation"] = " ".join(str(item) for item in normalized["recommendation"])
                logger.warning(f"[{phase}] Normalized recommendation from list to string")
            elif not isinstance(normalized["recommendation"], str):
                normalized["recommendation"] = str(normalized["recommendation"])
        
        # Normalize rationale field (convergence phase)
        if "rationale" in normalized:
            if isinstance(normalized["rationale"], list):
                normalized["rationale"] = "\n".join(str(item) for item in normalized["rationale"])
                logger.warning(f"[{phase}] Normalized rationale from list to string")
            elif not isinstance(normalized["rationale"], str):
                normalized["rationale"] = str(normalized["rationale"])
        
        # Normalize summary field (convergence phase)
        if "summary" in normalized:
            if isinstance(normalized["summary"], list):
                normalized["summary"] = "\n".join(str(item) for item in normalized["summary"])
                logger.warning(f"[{phase}] Normalized summary from list to string")
            elif not isinstance(normalized["summary"], str):
                normalized["summary"] = str(normalized["summary"])
        
        # Normalize contestation field (challenge phase)
        if "contestation" in normalized:
            if isinstance(normalized["contestation"], list):
                normalized["contestation"] = " ".join(str(item) for item in normalized["contestation"])
                logger.warning(f"[{phase}] Normalized contestation from list to string")
            elif not isinstance(normalized["contestation"], str):
                normalized["contestation"] = str(normalized["contestation"])
        
        # Normalize critique field (red team phase)
        if "critique" in normalized:
            if isinstance(normalized["critique"], list):
                normalized["critique"] = "\n".join(str(item) for item in normalized["critique"])
                logger.warning(f"[{phase}] Normalized critique from list to string")
            elif not isinstance(normalized["critique"], str):
                normalized["critique"] = str(normalized["critique"])
        
        # Ensure citations is always a list
        if "citations" in normalized and not isinstance(normalized["citations"], list):
            original_type = type(normalized["citations"]).__name__
            if normalized["citations"] is None:
                normalized["citations"] = []
            else:
                normalized["citations"] = [str(normalized["citations"])]
                logger.warning(f"[{phase}] Converted citations to list from {original_type}")
        
        # Ensure flaws_identified is always a list
        if "flaws_identified" in normalized and not isinstance(normalized["flaws_identified"], list):
            original_type = type(normalized["flaws_identified"]).__name__
            if normalized["flaws_identified"] is None:
                normalized["flaws_identified"] = []
            else:
                normalized["flaws_identified"] = [str(normalized["flaws_identified"])]
                logger.warning(f"[{phase}] Converted flaws_identified to list from {original_type}")
        
        # Ensure critical_risks is always a list
        if "critical_risks" in normalized and not isinstance(normalized["critical_risks"], list):
            original_type = type(normalized["critical_risks"]).__name__
            if normalized["critical_risks"] is None:
                normalized["critical_risks"] = []
            else:
                normalized["critical_risks"] = [str(normalized["critical_risks"])]
                logger.warning(f"[{phase}] Converted critical_risks to list from {original_type}")
        
        # Ensure dissenting_points is always a list
        if "dissenting_points" in normalized and not isinstance(normalized["dissenting_points"], list):
            original_type = type(normalized["dissenting_points"]).__name__
            if normalized["dissenting_points"] is None:
                normalized["dissenting_points"] = []
            else:
                normalized["dissenting_points"] = [str(normalized["dissenting_points"])]
                logger.warning(f"[{phase}] Converted dissenting_points to list from {original_type}")
        
        # Ensure known_unknowns is always a list
        if "known_unknowns" in normalized and not isinstance(normalized["known_unknowns"], list):
            original_type = type(normalized["known_unknowns"]).__name__
            if normalized["known_unknowns"] is None:
                normalized["known_unknowns"] = []
            else:
                normalized["known_unknowns"] = [str(normalized["known_unknowns"])]
                logger.warning(f"[{phase}] Converted known_unknowns to list from {original_type}")
        
        return normalized

    async def _call_llm(self, prompt: str, model_hint: str, tier: str = "standard", web_search: bool = False, max_retries: int = 3, db: AsyncSession | None = None, user_id: str | None = None) -> dict:
        """Call LLM with retry logic and exponential backoff.
        
        Args:
            prompt: Input prompt for LLM
            model_hint: Model identifier (id from llm_models table or api_identifier)
            tier: Model tier (cheap, standard, expensive)
            web_search: Enable web search
            max_retries: Maximum retry attempts
            db: Optional database session to lookup model by id and resolve user API keys
            user_id: Optional user ID for API key resolution from UserSettings
        """
        logger.debug(f"[_call_llm] ENTER - model_hint: {model_hint}, tier: {tier}, web_search: {web_search}")
        
        # Store model/provider context for quality evaluation
        self._current_model = model_hint
        self._current_provider = None  # Will be set by router if available
        
        # Lookup model by id if db session is provided (for debate engine)
        # This allows storing model id in knights table and looking up api_identifier
        model_api_identifier = model_hint
        if db:
            try:
                logger.debug(f"[_call_llm] Looking up model in database: {model_hint}")
                # Try to lookup by id first (preferred)
                model_record = await db.get(LLMModel, model_hint)
                if model_record:
                    model_api_identifier = model_record.api_identifier
                    logger.debug(f"[_call_llm] Found model by ID: {model_api_identifier}")
                else:
                    # Fallback: try lookup by api_identifier (backward compatibility)
                    result = await db.execute(select(LLMModel).where(LLMModel.api_identifier == model_hint))
                    model_record = result.scalar_one_or_none()
                    if model_record:
                        model_api_identifier = model_record.api_identifier
                        logger.debug(f"[_call_llm] Found model by api_identifier: {model_api_identifier}")
                    else:
                        logger.debug(f"[_call_llm] Model not found in DB, using as-is: {model_hint}")
                    # If not found, use model_hint as-is (might be api_identifier already)
            except Exception as e:
                # If lookup fails, use model_hint as-is (backward compatibility)
                logger.warning(f"[_call_llm] Model lookup failed for {model_hint}, using as-is: {e}")
        else:
            logger.debug(f"[_call_llm] No DB session, using model_hint as-is: {model_hint}")
        
        # Web search and JSON mode cannot be used together
        # If web_search is enabled, disable json_mode and parse JSON manually
        json_mode = not web_search  # Disable json_mode when web_search is True
        
        logger.debug(f"[_call_llm] Creating LLMRequest - model: {model_api_identifier}, json_mode: {json_mode}")
        request = LLMRequest(prompt=prompt, model=model_api_identifier, json_mode=json_mode, tier=tier, web_search=web_search)
        
        last_error = None
        # Log LLM call attempt for debugging resource usage
        logger.debug(f"[_call_llm] Starting LLM call - Model: {model_hint}, API ID: {model_api_identifier}, Tier: {tier}, WebSearch: {web_search}")
        logger.info(f"[LLM Call] Starting LLM call - Model: {model_hint}, Tier: {tier}, WebSearch: {web_search}, API Identifier: {model_api_identifier}")
        
        for attempt in range(max_retries):
            try:
                logger.debug(f"[_call_llm] Attempt {attempt + 1}/{max_retries} - Calling LLMRouter.generate()")
                logger.info(f"[LLM Call] Attempt {attempt + 1}/{max_retries} - Calling LLMRouter.generate()")
                # Circuit breaker is handled in LLMRouter.generate()
                # Pass user_id and db for API key resolution and model lookup
                response_str = await self.llm_router.generate(request, user_id=user_id, db=db)
                logger.debug(f"[_call_llm] LLMRouter returned response (length: {len(response_str) if response_str else 0})")
                logger.info(f"[LLM Call] LLMRouter.generate() returned response (length: {len(response_str) if response_str else 0})")
                # Capture provider used for quality tracking
                if hasattr(request, '_provider_used') and getattr(request, '_provider_used', None):
                    self._current_provider = request._provider_used
                if not response_str:
                    if attempt < max_retries - 1:
                        wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                        logger.warning(f"[LLM Call] Empty response, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(wait_time)
                        continue
                    logger.error(f"[LLM Call] Empty response after {max_retries} attempts")
                    raise RuntimeError(f"LLM returned empty response after {max_retries} attempts")
                
                # Clean up markdown code blocks if present
                response_str = response_str.strip()
                if response_str.startswith("```json"):
                    response_str = response_str[7:].strip()
                elif response_str.startswith("```"):
                    response_str = response_str[3:].strip()
                if response_str.endswith("```"):
                    response_str = response_str[:-3].strip()
                
                # Sanitize control characters that can break JSON parsing
                # Replace unescaped control characters in string values (but preserve JSON structure)
                def sanitize_control_chars(text: str) -> str:
                    """Remove or escape control characters that break JSON parsing."""
                    import re
                    # Replace common problematic control characters with escaped versions
                    # This handles characters like \x00-\x1F that aren't properly escaped
                    # We'll do a simple replacement for the most common ones
                    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', text)
                    return text
                
                # Try standard JSON parsing first (fast path)
                try:
                    return json.loads(response_str)
                except json.JSONDecodeError as json_err:
                    # JSON parsing failed, try repair strategies before retrying LLM call
                    
                    # Strategy 1: Try json-repair library (best for LLM responses)
                    if json_repair:
                        try:
                            repaired = json_repair.repair_json(response_str)
                            parsed = json.loads(repaired)
                            logger.info(f"[LLM Call] JSON Parse Error fixed with json-repair - no retry needed")
                            return parsed
                        except (json.JSONDecodeError, Exception) as repair_err:
                            logger.debug(f"[LLM Call] json-repair failed: {repair_err}")
                    
                    # Strategy 2: Try regex extraction if JSON is mixed with text
                    import re
                    json_match = re.search(r'(\{.*\})', response_str, re.DOTALL)
                    if json_match:
                        potential_json = json_match.group(1)
                        # Try json-repair on extracted JSON
                        if json_repair:
                            try:
                                repaired = json_repair.repair_json(potential_json)
                                parsed = json.loads(repaired)
                                logger.info(f"[LLM Call] JSON Parse Error fixed with json-repair (extracted) - no retry needed")
                                return parsed
                            except (json.JSONDecodeError, Exception):
                                pass
                        # Try standard parsing on extracted JSON
                        try:
                            return json.loads(potential_json)
                        except json.JSONDecodeError:
                            # Try sanitized version of extracted JSON
                            try:
                                sanitized = sanitize_control_chars(potential_json)
                                return json.loads(sanitized)
                            except json.JSONDecodeError:
                                pass
                    
                    # Strategy 3: Try existing sanitization on full response
                    if "control character" in str(json_err).lower() or "Invalid" in str(json_err):
                        try:
                            sanitized = sanitize_control_chars(response_str)
                            return json.loads(sanitized)
                        except json.JSONDecodeError:
                            pass
                    
                    # Strategy 4: Last ditch regex extraction if we didn't try it yet
                    if not json_match:
                        json_match_last = re.search(r'(\{.*\})', response_str, re.DOTALL)
                        if json_match_last:
                            # Try json-repair on last-ditch extraction
                            if json_repair:
                                try:
                                    repaired = json_repair.repair_json(json_match_last.group(1))
                                    parsed = json.loads(repaired)
                                    logger.info(f"[LLM Call] JSON Parse Error fixed with json-repair (last-ditch) - no retry needed")
                                    return parsed
                                except (json.JSONDecodeError, Exception):
                                    pass
                            # Try standard parsing
                            try:
                                return json.loads(json_match_last.group(1))
                            except json.JSONDecodeError:
                                pass
                    
                    # All repair strategies failed, retry LLM call only as last resort
                    if attempt < max_retries - 1:
                        wait_time = 2 ** attempt
                        logger.warning(f"JSON Parse Error (attempt {attempt + 1}/{max_retries}), retrying LLM call in {wait_time}s: {json_err}")
                        await asyncio.sleep(wait_time)
                        continue
                    
                    logger.error(f"JSON Parse Error after {max_retries} attempts: {json_err}")
                    logger.debug(f"Raw response (first 500 chars): {response_str[:500]}")
                    raise RuntimeError(f"JSON Parse Error after {max_retries} attempts: {json_err}")
                    
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.error(f"[LLM Call] Error (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s: {type(e).__name__}: {e}", exc_info=True)
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"[LLM Call] Error after {max_retries} attempts: {type(e).__name__}: {e}", exc_info=True)
                    raise RuntimeError(f"LLM Error after {max_retries} attempts: {str(e)}")
        
        # Should not reach here, but return empty dict as fallback
        logger.error(f"[LLM Call] Failed after all retries: {last_error}", exc_info=True)
        raise RuntimeError(f"LLM call failed after all retries: {str(last_error)}")

    def _update_confidence(self, payload: DebateEventPayload) -> None:
        claim_key = getattr(payload, "target_claim_id", None) or getattr(payload, "headline", None)
        confidence = getattr(payload, "confidence", None)
        if claim_key and confidence is not None:
            self._confidence.per_claim[str(claim_key)] = confidence
        knight_id = getattr(payload, "knight_id", None)
        if knight_id:
            baseline = self._confidence.calibration_bias.get(knight_id, 0.0)
            self._confidence.calibration_bias[knight_id] = min(1.0, max(-1.0, baseline + 0.01))

        if isinstance(payload, ChallengeEvent):
            count = self._challenge_counts.get(payload.knight_id or "unknown", 0) + 1
            self._challenge_counts[payload.knight_id or "unknown"] = count
            if count > self.config.max_challenges:
                # Log warning but don't crash
                pass

