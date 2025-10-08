from datetime import datetime
from typing import Optional

from pydantic import BaseModel, validator

from backend.models.user import ROLES


class UserCreate(BaseModel):
    email: str
    name: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    created_at: datetime
    role: str

    class Config:
        orm_mode = True


class UserRoleUpdate(BaseModel):
    role: str

    @validator("role")
    def validate_role(cls, v):
        if v not in ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v


class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"
