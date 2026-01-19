import re
from datetime import datetime
from typing import Optional

from pydantic import AnyUrl, BaseModel, field_validator
from pydantic.config import ConfigDict


class BotConnectRequest(BaseModel):
    token: Optional[str] = None
    webhook_url: Optional[AnyUrl] = None
    bot_id: Optional[int] = None
    template_id: Optional[int] = None
    username: Optional[str] = None


class BotBase(BaseModel):
    title: str
    username: str
    webhook_url: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Title must be between 1 and 100 characters")
        if re.search(r"<[^>]*>", v):
            raise ValueError("HTML tags are not allowed in title")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if len(v) < 1 or len(v) > 32:
            raise ValueError("Username must be between 1 and 32 characters")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError(
                "Username can only contain letters, numbers and underscores"
            )
        return v

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_url(cls, v):
        if v:
            if len(v) > 500:
                raise ValueError("Webhook URL must be less than 500 characters")
            if not v.startswith(("http://", "https://")):
                raise ValueError("Webhook URL must start with http:// or https://")
        return v


class BotCreate(BotBase):
    token: str

    @field_validator("token")
    @classmethod
    def validate_token(cls, v):
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Token must be between 1 and 100 characters")
        if not re.match(r"^\d+:[A-Za-z0-9_-]+$", v):
            raise ValueError("Invalid Telegram bot token format")
        return v


class BotCreateSimple(BaseModel):
    """Схема для создания бота без токена (для маркетплейса)"""
    title: str
    description: Optional[str] = ""
    
    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Title must be between 1 and 100 characters")
        return v


class BotUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if v:
            if len(v) < 1 or len(v) > 100:
                raise ValueError("Title must be between 1 and 100 characters")
            if re.search(r"<[^>]*>", v):
                raise ValueError("HTML tags are not allowed in title")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if v and len(v) > 500:
            raise ValueError("Description must be less than 500 characters")
        return v

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_url(cls, v):
        if v:
            if len(v) > 500:
                raise ValueError("Webhook URL must be less than 500 characters")
            if not v.startswith(("http://", "https://")):
                raise ValueError("Webhook URL must start with http:// or https://")
        return v


class BotOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    username: str
    webhook_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    owner_id: int
    # Информация о владельце (для группировки по проектам)
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_public_id: Optional[int] = None
    # Роль пользователя в проекте владельца (если не владелец)
    team_role: Optional[str] = None
    # Дополнительные поля для отображения
    name: Optional[str] = None  # Алиас для title (для совместимости с фронтендом)
    channel: Optional[str] = "telegram"  # Канал бота
    status: Optional[str] = None  # Статус бота (active/paused/error)
    usersCount: Optional[int] = 0  # Количество пользователей бота
    messagesCount: Optional[int] = 0  # Количество сообщений

    model_config = ConfigDict(from_attributes=True)
    
    def __init__(self, **data):
        # Устанавливаем name = title для совместимости
        if 'name' not in data and 'title' in data:
            data['name'] = data['title']
        # Устанавливаем status на основе is_active
        if 'status' not in data:
            data['status'] = 'active' if data.get('is_active', False) else 'paused'
        super().__init__(**data)


class BotListOut(BaseModel):
    total: int
    items: list[BotOut]
