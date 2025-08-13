from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime
import re

class MessageBase(BaseModel):
    bot_id: int
    user_id: Optional[int] = None
    direction: str  # 'incoming', 'outgoing'
    content: str
    status: Optional[str] = 'sent'
    language: Optional[str] = None
    is_paid: Optional[bool] = False
    
    @validator('bot_id')
    def validate_bot_id(cls, v):
        if v <= 0:
            raise ValueError('Bot ID must be positive')
        return v
    
    @validator('user_id')
    def validate_user_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError('User ID must be positive')
        return v
    
    @validator('direction')
    def validate_direction(cls, v):
        if v not in ['incoming', 'outgoing']:
            raise ValueError('Direction must be either "incoming" or "outgoing"')
        return v
    
    @validator('content')
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError('Content cannot be empty')
        if len(v) > 10000:  # Максимальная длина сообщения
            raise ValueError('Content too long (max 10000 characters)')
        return v.strip()
    
    @validator('status')
    def validate_status(cls, v):
        if v and v not in ['sent', 'received', 'error', 'pending', 'delivered']:
            raise ValueError('Invalid status value')
        return v
    
    @validator('language')
    def validate_language(cls, v):
        if v and not re.match(r'^[a-z]{2,3}$', v):
            raise ValueError('Language must be 2-3 letter code (e.g., ru, en)')
        return v

class MessageCreate(MessageBase):
    pass

class MessageUpdate(BaseModel):
    bot_id: Optional[int] = None
    user_id: Optional[int] = None
    direction: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None
    language: Optional[str] = None
    is_paid: Optional[bool] = None
    
    @validator('bot_id')
    def validate_bot_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError('Bot ID must be positive')
        return v
    
    @validator('user_id')
    def validate_user_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError('User ID must be positive')
        return v
    
    @validator('direction')
    def validate_direction(cls, v):
        if v and v not in ['incoming', 'outgoing']:
            raise ValueError('Direction must be either "incoming" or "outgoing"')
        return v
    
    @validator('content')
    def validate_content(cls, v):
        if v is not None:
            if not v.strip():
                raise ValueError('Content cannot be empty')
            if len(v) > 10000:
                raise ValueError('Content too long (max 10000 characters)')
            return v.strip()
        return v
    
    @validator('status')
    def validate_status(cls, v):
        if v and v not in ['sent', 'received', 'error', 'pending', 'delivered']:
            raise ValueError('Invalid status value')
        return v
    
    @validator('language')
    def validate_language(cls, v):
        if v and not re.match(r'^[a-z]{2,3}$', v):
            raise ValueError('Language must be 2-3 letter code (e.g., ru, en)')
        return v

class MessageOut(BaseModel):
    id: int
    bot_id: int
    user_id: Optional[int] = None
    direction: str
    content: str
    status: str
    error: Optional[str] = None
    language: Optional[str] = None
    is_paid: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class MessageListOut(BaseModel):
    total: int
    items: list[MessageOut]

