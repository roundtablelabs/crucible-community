from pydantic import BaseModel, ConfigDict, field_validator


class ModelRead(BaseModel):
    id: str
    display_name: str
    provider: str
    api_identifier: str
    description: str | None = None
    user_id: str | None = None  # NULL = seeded; set when user adds (only that user can remove)
    enabled: bool = True
    model_metadata: dict | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("user_id", mode="before")
    @classmethod
    def coerce_user_id(cls, v: object) -> str | None:
        if v is None:
            return None
        return str(v)
