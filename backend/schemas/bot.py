from pydantic import BaseModel, constr, validator
from typing import Optional
from datetime import datetime
import re

class BotBase(BaseModel):
    title: constr(min_length=1, max_length=100)
    username: constr(min_length=1, max_length=32)
    webhook_url: Optional[constr(max_length=500)] = None
    
    @validator('title')
    def validate_title(cls, v):
        if re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in title')
        return v
    
    @validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers and underscores')
        return v
    
    @validator('webhook_url')
    def validate_webhook_url(cls, v):
        if v and not v.startswith(('http://', 'https://')):
            raise ValueError('Webhook URL must start with http:// or https://')
        return v

class BotCreate(BotBase):
    token: constr(min_length=1, max_length=100)
    
    @validator('token')
    def validate_token(cls, v):
        if not re.match(r'^\d+:[A-Za-z0-9_-]+$', v):
            raise ValueError('Invalid Telegram bot token format')
        return v

class BotUpdate(BaseModel):
    title: Optional[constr(min_length=1, max_length=100)] = None
    webhook_url: Optional[constr(max_length=500)] = None
    is_active: Optional[bool] = None
    
    @validator('title')
    def validate_title(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in title')
        return v
    
    @validator('webhook_url')
    def validate_webhook_url(cls, v):
        if v and not v.startswith(('http://', 'https://')):
            raise ValueError('Webhook URL must start with http:// or https://')
        return v

class BotOut(BaseModel):
    id: int
    title: str
    username: str
    webhook_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class BotListOut(BaseModel):
    total: int
    items: list[BotOut] 