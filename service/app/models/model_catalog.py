from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID

from app.db.base import Base


class LLMModel(Base):
    __tablename__ = "llm_models"

    id = Column(String(128), primary_key=True)
    display_name = Column(String(255), nullable=False)
    provider = Column(String(64), nullable=False)
    api_identifier = Column(String(255), nullable=False)
    native_api_identifier = Column(String(255), nullable=True)
    description = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    # user_id: NULL = seeded/default; non-NULL = added by that user (user can remove only their rows)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    model_metadata = Column(JSON, nullable=True)
