# Crucible Community Edition
# Copyright (C) 2025 Roundtable Labs Pty Ltd
#
# Licensed under AGPL-3.0. See LICENSE file for details.
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""User settings/preferences model."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserSettings(Base):
    """User preferences and settings."""
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    artifact_retention: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    excluded_model_providers: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
        default=lambda: [],
    )
    # Provider API keys stored as encrypted JSON: {"openrouter": "encrypted_key", "eden_ai": "encrypted_key", ...}
    provider_api_keys: Mapped[dict[str, str] | None] = mapped_column(
        JSON,
        nullable=True,
        default=lambda: {},
    )
    # Default provider to use for API calls
    default_provider: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="openrouter",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationship to user
    user = relationship("User", back_populates="settings")

