from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models.knight import KnightOrigin, KnightSource


class KnightAuthor(BaseModel):
    name: str


class SocialMediaUrls(BaseModel):
    linkedin: str | None = None
    twitter: str | None = None
    facebook: str | None = None
    instagram: str | None = None


class KnightBase(BaseModel):
    name: str | None = None
    role: str
    goal: str = ""
    backstory: str = ""
    prompt: str | None = None
    model: str
    websearch_enabled: bool = False
    author: KnightAuthor
    verified: bool = True
    version: str | None = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    sourced_from: KnightSource = KnightSource.MANUAL
    linkedin_profile_url: str | None = None
    social_media_urls: SocialMediaUrls | None = None
    seniority_level: str | None = None
    primary_domain: str | None = None
    domain_tags: list[str] | None = None
    revenue_share_bps: int = 0


class KnightCreate(KnightBase):
    id: str | None = None


class KnightUpdate(KnightBase):
    pass


class KnightRead(BaseModel):
    id: str
    name: str
    role: str
    prompt: str | None = None
    goal: str
    backstory: str
    model: str
    websearch_enabled: bool
    author: KnightAuthor
    verified: bool
    origin: KnightOrigin
    sourced_from: KnightSource
    version: str | None = None
    created_at: datetime
    owner_id: str | None = None
    temperature: float
    linkedin_profile_url: str | None = None
    social_media_urls: SocialMediaUrls | None = None
    seniority_level: str | None = None
    primary_domain: str | None = None
    domain_tags: list[str] = Field(default_factory=list)
    revenue_share_bps: int = 0
    last_profile_refresh: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class KnightInstallRequest(BaseModel):
    listing_id: str
    version: str | None = None
    alias: str | None = None
