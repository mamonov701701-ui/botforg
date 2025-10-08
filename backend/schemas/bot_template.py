from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator
from pydantic.config import ConfigDict


class BotTemplateBase(BaseModel):
    bot_id: int
    user_template_id: Optional[int] = None

    @field_validator("bot_id")
    @classmethod
    def validate_bot_id(cls, v):
        if v <= 0:
            raise ValueError("Bot ID must be positive")
        return v

    @field_validator("user_template_id")
    @classmethod
    def validate_user_template_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError("User template ID must be positive")
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

    model_config = ConfigDict(from_attributes=True)


class BotTemplateListOut(BaseModel):
    total: int
    items: list[BotTemplateOut]
