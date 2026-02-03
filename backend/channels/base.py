"""
Единый интерфейс адаптеров каналов: нормализация входящих обновлений и отправка сообщений.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel, Field


class NormalizedUpdate(BaseModel):
    """Нормализованное входящее обновление от любого канала."""
    channel: str = Field(..., description="Идентификатор канала: max, whatsapp, telegram, ...")
    chat_id: Optional[str] = Field(None, description="Идентификатор чата в канале (для отправки ответа)")
    chat_hash: Optional[str] = Field(None, description="HMAC-хеш чата, если не храним chat_id")
    user_id: Optional[str] = Field(None, description="Идентификатор пользователя в канале (опционально)")
    text: Optional[str] = Field(None, description="Текст сообщения")
    buttons: Optional[list[dict[str, Any]]] = Field(None, description="Кнопки/callback data")
    media_url: Optional[str] = Field(None, description="URL вложения/медиа")
    raw: Optional[dict[str, Any]] = Field(None, description="Минимальный сырой payload при необходимости")


class MessageResult(BaseModel):
    """Результат отправки сообщения в канал."""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


class ChannelAdapter(ABC):
    """Абстрактный адаптер канала: нормализация входящих и отправка исходящих."""

    @abstractmethod
    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Преобразует сырой payload канала в NormalizedUpdate."""
        ...

    @abstractmethod
    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: Optional[list[dict[str, Any]]] = None,
    ) -> MessageResult:
        """Отправляет текстовое сообщение (и опционально кнопки)."""
        ...

    @abstractmethod
    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: Optional[str] = None,
    ) -> MessageResult:
        """Отправляет медиа по URL."""
        ...
