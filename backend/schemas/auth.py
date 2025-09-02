from pydantic import BaseModel, EmailStr, constr, validator
from typing import Optional
from datetime import datetime
import re

class UserRegister(BaseModel):
    email: EmailStr
    name: Optional[constr(min_length=1, max_length=100)] = None
    password: constr(min_length=8, max_length=64)
    role: Optional[str] = "user"
    
    @validator('password')
    def validate_password_strength(cls, v):
        if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)', v):
            raise ValueError('Password must contain at least one lowercase letter, one uppercase letter, and one digit')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        if v and not re.match(r'^[a-zA-Zа-яА-Я\s\-\.]+$', v):
            raise ValueError('Name contains invalid characters')
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

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str 
