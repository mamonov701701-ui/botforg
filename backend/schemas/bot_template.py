from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime

class BotTemplateBase(BaseModel):
    bot_id: int
    user_template_id: Optional[int] = None
    
    @validator('bot_id')
    def validate_bot_id(cls, v):
        if v <= 0:
            raise ValueError('Bot ID must be positive')
        return v
    
    @validator('user_template_id')
    def validate_user_template_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError('User template ID must be positive')
        return v

class BotTemplateCreate(BotTemplateBase):
    pass

class BotTemplateUpdate(BaseModel):
    is_active: Optional[bool] = None

class BotTemplateOut(BaseModel):
    id: int
    bot_id: int
    user_template_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class BotTemplateListOut(BaseModel):
    total: int
    items: list[BotTemplateOut]

