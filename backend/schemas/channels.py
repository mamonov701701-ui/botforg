"""Схемы для подключений каналов к боту. credentials не отдаются в API (write-only)."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class BotChannelConnectionOut(BaseModel):
    """Ответ API: без credentials_json."""
    id: int
    bot_id: int
    channel: str
    is_enabled: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BotChannelConnectionCreate(BaseModel):
    """Создание/обновление подключения: credentials только на вход (write-only)."""
    channel: str = Field(..., description="max, whatsapp, telegram, ...")
    is_enabled: bool = True
    credentials: Optional[dict[str, Any]] = Field(
        None,
        description="Токены/ключи канала (не возвращаются в API)",
    )
