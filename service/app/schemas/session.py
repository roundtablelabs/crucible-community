
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator


class SessionStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    ERROR = "error"


class SessionBase(BaseModel):
    session_id: str | None = Field(None, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    topic: str | None = Field(None, max_length=10000)
    knight_ids: list[str] = Field(default_factory=list)
    artifact_uri: str | None = None
    audit_log_uri: str | None = None
    status: SessionStatus | None = None
    intake_summary: str | None = Field(None, max_length=5000)
    intake_conversation: list[dict[str, str]] | None = None
    moderator_brief: dict | None = None


class SessionCreate(SessionBase):
    @field_validator('knight_ids')
    @classmethod
    def validate_knight_count(cls, v):
        if len(v) < 3 or len(v) > 12:
            raise ValueError('knight_ids must have between 3 and 12 items')
        return v


class SessionUpdate(BaseModel):
    status: SessionStatus | None = None
    artifact_uri: str | None = None
    audit_log_uri: str | None = None
    completed_at: datetime | None = None


class SessionRead(BaseModel):
    id: UUID
    user_id: UUID
    session_id: str
    knight_ids: list[str]
    topic: str | None = None
    artifact_uri: str | None = None
    audit_log_uri: str | None = None
    status: SessionStatus
    topic_summary: str | None = None  # Extracted from sequence 0 event moderator_brief.topicSummary
    strategic_question: str | None = None  # Extracted from sequence 0 event moderator_brief.strategicQuestion
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    quality_score: float | None = None
    quality_tier: str | None = None
    quality_breakdown: dict | None = None  # Individual metric scores (fetched from Redis if needed)

    model_config = ConfigDict(from_attributes=True)
