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

import uuid

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(String(1024), nullable=True)
    role = Column(String(50), nullable=False, default="member")
    is_active = Column(Boolean, default=True)
    professional_profile_verified = Column(Boolean, nullable=False, default=False)
    linkedin_profile_url = Column(String(512), nullable=True)
    linkedin_account_id = Column(String(128), nullable=True, unique=True)
    # Community Edition: Marketplace field kept for database compatibility but not used
    marketplace_terms_accepted_at = Column(DateTime(timezone=True), nullable=True)  # DEPRECATED - Marketplace not available in Community Edition
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    # License acceptance tracking for Community Edition
    license_accepted_at = Column(DateTime(timezone=True), nullable=True)
    license_version = Column(String(50), nullable=True)
    password_change_required = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    studio_attempt_count = Column(Integer, nullable=False, default=0)
    studio_attempt_window_start = Column(DateTime(timezone=True), nullable=True)

    accounts = relationship(
        "UserAccount",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    roundtable_sessions = relationship(
        "RoundtableSession",
        primaryjoin="User.id == RoundtableSession.user_id",
        back_populates="user"
    )
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
