"""
Stub провайдера WhatsApp: Twilio API for WhatsApp.
Без реальных HTTP-запросов к Twilio.
"""
from typing import Any

from backend.channels.base import MessageResult, NormalizedUpdate
from backend.channels.whatsapp.providers.base import WhatsAppProvider


class TwilioProvider(WhatsAppProvider):
    provider_name = "twilio"

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Минимальная нормализация формата Twilio (Body, From, etc.)."""
        text = payload.get("Body") or payload.get("body")
        chat_id = payload.get("From") or payload.get("from")
        raw = {k: v for k, v in payload.items() if k in ("Body", "From", "To", "MessageSid")}
        return NormalizedUpdate(
            channel="whatsapp",
            chat_id=str(chat_id) if chat_id else None,
            chat_hash=None,
            user_id=None,
            text=str(text) if text is not None else None,
            raw=raw,
        )

    def validate_webhook(
        self,
        request_headers: dict[str, str],
        payload: dict[str, Any],
        raw_body: bytes | None = None,
        credentials: dict[str, Any] | None = None,
    ) -> bool:
        """Placeholder: в реальной интеграции проверять X-Twilio-Signature."""
        return True

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        raise NotImplementedError(
            "Twilio API send_text not implemented; use stub for architecture only"
        )

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        raise NotImplementedError(
            "Twilio API send_media not implemented; use stub for architecture only"
        )
