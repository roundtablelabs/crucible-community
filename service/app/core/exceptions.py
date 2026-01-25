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

"""Standardized exception classes for consistent error responses."""
from fastapi import HTTPException, status


class APIError(HTTPException):
    """Base exception for API errors with standardized response format."""
    
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(
            status_code=status_code,
            detail={
                "code": code,
                "message": message,
                "details": details or {}
            }
        )


class NotFoundError(APIError):
    """Resource not found error."""
    
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            code="NOT_FOUND",
            message=f"{resource} not found",
            status_code=status.HTTP_404_NOT_FOUND,
            details={"resource": resource, "identifier": identifier}
        )


class UnauthorizedError(APIError):
    """Authentication/authorization error."""
    
    def __init__(self, message: str = "Authentication required", details: dict | None = None):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details or {}
        )


class ForbiddenError(APIError):
    """Access forbidden error."""
    
    def __init__(self, message: str = "Access denied", details: dict | None = None):
        super().__init__(
            code="FORBIDDEN",
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            details=details or {}
        )


class ValidationError(APIError):
    """Input validation error."""
    
    def __init__(self, message: str, field: str | None = None, details: dict | None = None):
        error_details = details or {}
        if field:
            error_details["field"] = field
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details=error_details
        )


class ConflictError(APIError):
    """Resource conflict error (e.g., duplicate)."""
    
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            details=details or {}
        )


class InternalServerError(APIError):
    """Internal server error (for unexpected errors)."""
    
    def __init__(self, message: str = "An internal error occurred", details: dict | None = None):
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details or {}
        )


class RateLimitExceededError(APIError):
    """Rate limit exceeded error."""
    
    def __init__(self, message: str = "Rate limit exceeded", reset_at: float | None = None, details: dict | None = None):
        error_details = details or {}
        if reset_at:
            error_details["reset_at"] = reset_at
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=error_details
        )









