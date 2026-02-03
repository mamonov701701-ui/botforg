"""
Базовый интерфейс провайдера WhatsApp (Meta Cloud API, Twilio, 360dialog и др.).
Смена провайдера не меняет API BotForg и сценарии.
"""
from abc import ABC, abstractmethod
from typing import Any

from backend.channels.base import MessageResult, NormalizedUpdate


class WhatsAppProvider(ABC):
    """Абстрактный провайдер WhatsApp: нормализация входящих, отправка, валидация webhook."""

    provider_name: str = ""

    @abstractmethod
    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Преобразует сырой payload провайдера в NormalizedUpdate."""
        ...

    @abstractmethod
    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        """Отправляет текстовое сообщение (и опционально кнопки)."""
        ...

    @abstractmethod
    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        """Отправляет медиа по URL."""
        ...

    def validate_webhook(
        self,
        request_headers: dict[str, str],
        payload: dict[str, Any],
        raw_body: bytes | None = None,
        credentials: dict[str, Any] | None = None,
    ) -> bool:
        """
        Проверяет подпись/секрет входящего webhook. Возвращает True, если запрос валиден.
        raw_body — сырое тело POST (для Meta X-Hub-Signature-256).
        credentials — для доступа к app_secret и т.д.
        """
        return True
