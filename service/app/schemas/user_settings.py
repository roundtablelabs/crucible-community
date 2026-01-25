"""User settings Pydantic schemas."""
from pydantic import BaseModel, ConfigDict, field_validator


class UserSettingsRead(BaseModel):
    """Response schema for user settings."""
    artifactRetention: bool
    retentionDays: int
    excludedModelProviders: list[str] = []

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserSettingsUpdate(BaseModel):
    """Request schema for updating user settings."""
    artifactRetention: bool | None = None
    retentionDays: int | None = None
    excludedModelProviders: list[str] | None = None

    @field_validator("excludedModelProviders")
    @classmethod
    def validate_excluded_model_providers(cls, v: list[str] | None) -> list[str] | None:
        """Validate that excludedModelProviders is a list of strings."""
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("excludedModelProviders must be a list")
        if not all(isinstance(item, str) for item in v):
            raise ValueError("excludedModelProviders must be a list of strings")
        return v

    model_config = ConfigDict(populate_by_name=True)
















