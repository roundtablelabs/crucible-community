from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class SignInRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = None  # Optional for OAuth users who don't have passwords


class SimpleLoginRequest(BaseModel):
    """Simple login request for community edition admin login."""
    username: str  # Can be username or email
    password: str


class ChangePasswordRequest(BaseModel):
    """Request to change password in Community Edition."""
    current_password: str = Field(..., alias="currentPassword")
    new_password: str = Field(..., alias="newPassword")
    
    model_config = ConfigDict(populate_by_name=True)  # Allow both alias and field name


class ChangePasswordResponse(BaseModel):
    """Response after password change request."""
    hashed_password: str = Field(..., alias="hashedPassword")
    instructions: str
    
    model_config = ConfigDict(populate_by_name=True)  # Allow both alias and field name



