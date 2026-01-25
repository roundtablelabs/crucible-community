from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import JSON, Boolean, Column, DateTime, Enum as SAEnum, Integer, Numeric, String, Text

from app.db.base import Base

OFFICIAL_AUTHOR_NAME = "roundtablelabs"


class KnightOrigin(str, Enum):
    OFFICIAL = "official"
    WORKSPACE = "workspace"


class KnightSource(str, Enum):
    OFFICIAL_SEED = "official_seed"
    LINKEDIN_CV = "linkedin_cv"
    MANUAL = "manual"


class Knight(Base):
    __tablename__ = "knights"

    id = Column(String(128), primary_key=True)
    name = Column(String(255), nullable=False)
    role = Column(String(255), nullable=False)
    goal = Column(Text, nullable=False, default="")
    websearch_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    author_name = Column(String(255), nullable=False)
    verified = Column(Boolean, nullable=False, default=True)
    version = Column(String(64), nullable=True)
    owner_id = Column(String(64), nullable=True, index=True)
    backstory = Column(Text, nullable=False, default="")
    prompt = Column(Text, nullable=True)
    model = Column(Text, nullable=False)
    temperature = Column(Numeric(2, 1), nullable=True, default=Decimal("0.7"))
    sourced_from = Column(SAEnum(KnightSource), nullable=False, default=KnightSource.OFFICIAL_SEED)
    linkedin_profile_url = Column(String(512), nullable=True)
    social_media_urls = Column(JSON, nullable=True)
    seniority_level = Column(String(64), nullable=True)
    primary_domain = Column(String(128), nullable=True)
    domain_tags = Column(JSON, nullable=True)
    revenue_share_bps = Column(Integer, nullable=False, default=0)
    last_profile_refresh = Column(DateTime(timezone=True), nullable=True)

    @property
    def author(self) -> dict[str, str | None]:
        return {
            "name": self.author_name,
        }

    @property
    def origin(self) -> KnightOrigin:
        author_token = (self.author_name or "").strip().lower()
        if author_token == OFFICIAL_AUTHOR_NAME:
            return KnightOrigin.OFFICIAL
        if self.owner_id is None:
            return KnightOrigin.OFFICIAL
        return KnightOrigin.WORKSPACE
