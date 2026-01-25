from __future__ import annotations

from enum import Enum
from typing import Literal, Union

from pydantic import BaseModel, Field

from app.services.debate.phases import DebatePhase


SCHEMA_VERSION = "1.0.0"


class EventType(str, Enum):  # type: ignore[misc]
    SESSION_INITIALIZATION = "session_initialization"
    RESEARCH_RESULT = "research_result"
    POSITION_CARD = "position_card"
    CHALLENGE = "challenge"
    CITATION_ADDED = "citation_added"
    FACT_CHECK = "fact_check"
    REBUTTAL = "rebuttal"
    RED_TEAM_CRITIQUE = "red_team_critique"
    MODERATOR_RULING = "moderator_ruling"
    CONVERGENCE = "convergence"
    TRANSLATOR_OUTPUT = "translator_output"
    ARTIFACT_READY = "artifact_ready"
    ROUTER_DECISION = "router_decision"
    PDF_GENERATION_STATUS = "pdf_generation_status"
    PHASE_STARTED = "phase_started"
    PHASE_PROGRESS = "phase_progress"
    PHASE_COMPLETE = "phase_complete"


class EventBase(BaseModel):
    schema_version: Literal[SCHEMA_VERSION] = Field(default=SCHEMA_VERSION)
    type: EventType
    phase: DebatePhase
    session_id: str
    knight_id: str | None = None
    sequence_id: int
    rationale: str | None = None


class PositionCardEvent(EventBase):
    type: Literal[EventType.POSITION_CARD] = EventType.POSITION_CARD
    headline: str
    body: str
    citations: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class ChallengeEvent(EventBase):
    type: Literal[EventType.CHALLENGE] = EventType.CHALLENGE
    target_knight_id: str
    contestation: str
    citation_reference: str | None = None


class CitationAddedEvent(EventBase):
    type: Literal[EventType.CITATION_ADDED] = EventType.CITATION_ADDED
    citation_url: str
    snippet: str | None = None


class FactCheckEvent(EventBase):
    type: Literal[EventType.FACT_CHECK] = EventType.FACT_CHECK
    verdict: Literal["supported", "contested", "insufficient"]
    explanation: str


class RebuttalEvent(EventBase):
    type: Literal[EventType.REBUTTAL] = EventType.REBUTTAL
    target_claim_id: str
    body: str
    citations: list[str] = Field(default_factory=list)


class ModeratorRulingEvent(EventBase):
    type: Literal[EventType.MODERATOR_RULING] = EventType.MODERATOR_RULING
    ruling: str
    notes: str | None = None


class ConvergenceEvent(EventBase):
    type: Literal[EventType.CONVERGENCE] = EventType.CONVERGENCE
    summary: str
    dissenting_points: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class ArtifactReadyEvent(EventBase):
    type: Literal[EventType.ARTIFACT_READY] = EventType.ARTIFACT_READY
    artifact_url: str
    checksum: str
    rendering_mode: Literal["pdf", "html", "markdown", "json"]


class RouterDecisionEvent(EventBase):
    type: Literal[EventType.ROUTER_DECISION] = EventType.ROUTER_DECISION
    provider: str
    model: str
    settings_overrides: dict[str, str | int | float]


class ResearchEvent(EventBase):
    type: Literal[EventType.RESEARCH_RESULT] = EventType.RESEARCH_RESULT
    query: str
    sources: list[dict[str, str]] = Field(default_factory=list)
    summary: str


class RedTeamEvent(EventBase):
    type: Literal[EventType.RED_TEAM_CRITIQUE] = EventType.RED_TEAM_CRITIQUE
    critique: str
    flaws_identified: list[str] = Field(default_factory=list)
    severity: Literal["low", "medium", "high"]


class TranslatorEvent(EventBase):
    type: Literal[EventType.TRANSLATOR_OUTPUT] = EventType.TRANSLATOR_OUTPUT
    translated_content: str
    target_audience: str
    readability_score: float | None = None


class SessionInitializationEvent(EventBase):
    type: Literal[EventType.SESSION_INITIALIZATION] = EventType.SESSION_INITIALIZATION
    intake_summary: str | None = None
    intake_conversation: list[dict[str, str]] | None = None
    moderator_brief: dict | None = None


class PdfGenerationStatusEvent(EventBase):
    type: Literal[EventType.PDF_GENERATION_STATUS] = EventType.PDF_GENERATION_STATUS
    status: Literal["success", "failed", "pending"]
    pdf_uri: str | None = None
    error_message: str | None = None


class PhaseStartedEvent(EventBase):
    type: Literal[EventType.PHASE_STARTED] = EventType.PHASE_STARTED
    phase_name: str
    phase_description: str | None = None
    estimated_duration_seconds: int | None = None


class PhaseProgressEvent(EventBase):
    type: Literal[EventType.PHASE_PROGRESS] = EventType.PHASE_PROGRESS
    phase_name: str
    progress_percentage: float = Field(ge=0.0, le=100.0)
    message: str | None = None


class PhaseCompleteEvent(EventBase):
    type: Literal[EventType.PHASE_COMPLETE] = EventType.PHASE_COMPLETE
    phase_name: str
    duration_seconds: float | None = None
    events_generated: int = 0


DebateEventPayload = Union[
    SessionInitializationEvent,
    ResearchEvent,
    PositionCardEvent,
    ChallengeEvent,
    CitationAddedEvent,
    FactCheckEvent,
    RebuttalEvent,
    RedTeamEvent,
    ModeratorRulingEvent,
    ConvergenceEvent,
    TranslatorEvent,
    ArtifactReadyEvent,
    RouterDecisionEvent,
    PdfGenerationStatusEvent,
    PhaseStartedEvent,
    PhaseProgressEvent,
    PhaseCompleteEvent,
]
