from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class DebatePhase(str, Enum):  # type: ignore[misc]
    """Phases in the structured debate lifecycle."""

    IDLE = "idle"
    RESEARCH = "research"
    OPENING = "opening"
    CLAIMS = "claims"
    CROSS_EXAMINATION = "cross_examination"
    CHALLENGES = "challenges"
    REBUTTALS = "rebuttals"
    RED_TEAM = "red_team"
    CONVERGENCE = "convergence"
    TRANSLATOR = "translator"
    ARTIFACT_READY = "artifact_ready"
    CLOSED = "closed"


@dataclass(frozen=True)
class PhaseTiming:
    """Timing and quota configuration per debate phase."""

    max_duration_seconds: int
    grace_period_seconds: int
    max_tokens: int | None = None
    challenge_quota: int | None = None


DEFAULT_PHASE_SEQUENCE: tuple[DebatePhase, ...] = (
    DebatePhase.IDLE,
    DebatePhase.RESEARCH,
    DebatePhase.OPENING,
    DebatePhase.CLAIMS,
    DebatePhase.CROSS_EXAMINATION,
    DebatePhase.CHALLENGES,
    DebatePhase.RED_TEAM,
    DebatePhase.REBUTTALS,
    DebatePhase.CONVERGENCE,
    DebatePhase.TRANSLATOR,
    DebatePhase.ARTIFACT_READY,
    DebatePhase.CLOSED,
)


DEFAULT_PHASE_CONFIG: dict[DebatePhase, PhaseTiming] = {
    DebatePhase.RESEARCH: PhaseTiming(max_duration_seconds=300, grace_period_seconds=60, max_tokens=2000),
    DebatePhase.OPENING: PhaseTiming(max_duration_seconds=120, grace_period_seconds=15, max_tokens=900),
    DebatePhase.CLAIMS: PhaseTiming(max_duration_seconds=180, grace_period_seconds=30, max_tokens=1200),
    DebatePhase.CROSS_EXAMINATION: PhaseTiming(max_duration_seconds=150, grace_period_seconds=30, max_tokens=800),
    DebatePhase.CHALLENGES: PhaseTiming(max_duration_seconds=120, grace_period_seconds=15, challenge_quota=3),
    DebatePhase.REBUTTALS: PhaseTiming(max_duration_seconds=180, grace_period_seconds=30, max_tokens=1000),
    DebatePhase.RED_TEAM: PhaseTiming(max_duration_seconds=180, grace_period_seconds=30, max_tokens=1500),
    DebatePhase.CONVERGENCE: PhaseTiming(max_duration_seconds=120, grace_period_seconds=15, max_tokens=600),
    DebatePhase.TRANSLATOR: PhaseTiming(max_duration_seconds=120, grace_period_seconds=15, max_tokens=1000),
    DebatePhase.ARTIFACT_READY: PhaseTiming(max_duration_seconds=90, grace_period_seconds=10),
}
