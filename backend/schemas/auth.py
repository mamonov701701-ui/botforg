import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str

    model_config = ConfigDict(from_attributes=True)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("name too short")
        return v

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("password must be at least 6 chars")
        return v


class UserRegister(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    password: str
    role: Optional[str] = "user"

    model_config = ConfigDict(from_attributes=True)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v):
        if not re.match(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)", v):
            raise ValueError(
                "Password must contain at least one lowercase letter, one uppercase letter, and one digit"
            )
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if v and not re.match(r"^[a-zA-Zа-яА-Я\s\-\.]+$", v):
            raise ValueError("Name contains invalid characters")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserAuthOut(BaseModel):
    id: int
    email: EmailStr
    name: Optional[str] = None
    created_at: datetime
    role: str

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token: str
    token_type: str
