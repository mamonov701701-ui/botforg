"""
Stub провайдера WhatsApp: 360dialog API.
Без реальных HTTP-запросов к 360dialog.
"""
from typing import Any

from backend.channels.base import MessageResult, NormalizedUpdate
from backend.channels.whatsapp.providers.base import WhatsAppProvider


class Dialog360Provider(WhatsAppProvider):
    provider_name = "dialog360"

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Минимальная нормализация формата 360dialog (contacts, messages)."""
        text = None
        chat_id = None
        messages = payload.get("messages") or []
        if messages:
            msg = messages[0] if isinstance(messages, list) else messages
            if isinstance(msg, dict):
                text = (msg.get("text") or {}).get("body") if isinstance(msg.get("text"), dict) else msg.get("body")
                chat_id = msg.get("from")
        raw = {k: v for k, v in payload.items() if k in ("contacts", "messages", "type")}
        return NormalizedUpdate(
            channel="whatsapp",
            chat_id=str(chat_id) if chat_id else None,
            chat_hash=None,
            user_id=None,
            text=text,
            raw=raw,
        )

    def validate_webhook(
        self,
        request_headers: dict[str, str],
        payload: dict[str, Any],
        raw_body: bytes | None = None,
        credentials: dict[str, Any] | None = None,
    ) -> bool:
        """Placeholder: в реальной интеграции проверять подпись 360dialog."""
        return True

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        raise NotImplementedError(
            "360dialog API send_text not implemented; use stub for architecture only"
        )

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        raise NotImplementedError(
            "360dialog API send_media not implemented; use stub for architecture only"
        )
