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

from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

# Community Edition: Removed marketplace, payments, admin routers, rate_limit, turnstile
from . import artifacts, audit, auth, health, intake, knights, license, sessions, models, user, user_settings, user_models, metrics, security, quality, debug_settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(license.router)
api_router.include_router(sessions.router)

api_router.include_router(knights.router)
api_router.include_router(models.router)
api_router.include_router(artifacts.router)
api_router.include_router(audit.router)
api_router.include_router(user.router)
api_router.include_router(user_settings.router)
api_router.include_router(user_models.router)
api_router.include_router(metrics.router)
api_router.include_router(security.router)
api_router.include_router(quality.router)
api_router.include_router(intake.router)
api_router.include_router(debug_settings.router)
