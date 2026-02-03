"""
Провайдер WhatsApp: Meta Cloud API (WhatsApp Business Platform).
Webhook verification GET, проверка подписи X-Hub-Signature-256, нормализация, send_text.
"""
import hmac
import hashlib
import logging
from typing import Any

import requests

from backend.channels.base import MessageResult, NormalizedUpdate
from backend.channels.whatsapp.providers.base import WhatsAppProvider
from backend.settings import settings

logger = logging.getLogger(__name__)

META_SIGNATURE_HEADER = "x-hub-signature-256"


def _extract_messages_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Извлекает список messages из payload Meta (entry/changes/value/messages)."""
    messages = payload.get("messages") or []
    if messages:
        return messages if isinstance(messages, list) else [messages]
    entry = payload.get("entry")
    if not isinstance(entry, list) or not entry:
        return []
    first = entry[0]
    changes = first.get("changes")
    if not isinstance(changes, list) or not changes:
        return []
    value = (changes[0] or {}).get("value") or {}
    messages = value.get("messages") or []
    return messages if isinstance(messages, list) else [messages]


def _get_update_type(payload: dict[str, Any]) -> str:
    """Определяет тип обновления (message, status и т.д.) из payload."""
    entry = payload.get("entry")
    if not isinstance(entry, list) or not entry:
        return "unknown"
    changes = (entry[0] or {}).get("changes") or []
    if not changes:
        return "unknown"
    value = (changes[0] or {}).get("value") or {}
    if value.get("messages"):
        return "message"
    if value.get("statuses"):
        return "status"
    if value.get("contacts"):
        return "contact"
    return "unknown"


class MetaCloudProvider(WhatsAppProvider):
    provider_name = "meta_cloud"

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Нормализация формата Meta Cloud API: entry/changes/value/messages, wa_id, text.body."""
        update_type = _get_update_type(payload)
        text = None
        chat_id = None
        message_id = None
        timestamp = None
        messages = _extract_messages_from_payload(payload)
        if messages:
            msg = messages[0] if isinstance(messages, list) else messages
            if isinstance(msg, dict):
                chat_id = msg.get("from") or msg.get("wa_id")
                if chat_id is not None:
                    chat_id = str(chat_id)
                text_obj = msg.get("text")
                if isinstance(text_obj, dict):
                    text = text_obj.get("body")
                else:
                    text = msg.get("body")
                message_id = msg.get("id")
                timestamp = msg.get("timestamp")
        raw: dict[str, Any] = {"update_type": update_type}
        if message_id is not None:
            raw["message_id"] = message_id
        if timestamp is not None:
            raw["timestamp"] = timestamp
        return NormalizedUpdate(
            channel="whatsapp",
            chat_id=chat_id,
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
        """Проверка X-Hub-Signature-256: HMAC-SHA256(raw_body, app_secret), constant-time compare."""
        if not raw_body or not credentials:
            return False
        app_secret = (credentials.get("app_secret") or "").strip()
        if not app_secret:
            return False
        received = (request_headers.get(META_SIGNATURE_HEADER) or "").strip()
        if not received.lower().startswith("sha256="):
            return False
        received_hex = received[7:].strip()
        try:
            key = app_secret.encode("utf-8")
        except Exception:
            return False
        expected_hex = hmac.new(key, raw_body, digestmod=hashlib.sha256).hexdigest()
        return hmac.compare_digest(received_hex.lower(), expected_hex.lower())

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        """POST /{phone_number_id}/messages через Meta Graph API."""
        token = (credentials.get("token") or "").strip()
        phone_number_id = (credentials.get("phone_number_id") or "").strip()
        if not token or not phone_number_id:
            return MessageResult(success=False, error="Meta Cloud: token or phone_number_id not set")
        base = (getattr(settings, "WHATSAPP_GRAPH_API_BASE", None) or "https://graph.facebook.com/v19.0").rstrip("/")
        url = f"{base}/{phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        body: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": chat_id.replace("+", "").strip(),
            "type": "text",
            "text": {"body": text[:4096]},
        }
        try:
            r = requests.post(url, json=body, headers=headers, timeout=10)
        except requests.RequestException:
            logger.warning("Meta Cloud send_text: external request failed (timeout or connection error)")
            return MessageResult(success=False, error="Gateway error")
        if r.status_code >= 400:
            try:
                err = r.json()
                err_msg = err.get("error", {}).get("message") if isinstance(err.get("error"), dict) else None
            except Exception:
                err_msg = None
            return MessageResult(success=False, error=err_msg or "Gateway error")
        try:
            data = r.json()
            msg_id = (data.get("messages") or [{}])[0].get("id") if isinstance(data.get("messages"), list) else data.get("message_id")
        except Exception:
            msg_id = None
        return MessageResult(success=True, message_id=str(msg_id) if msg_id else None)

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        """Пока не реализовано (только text MVP)."""
        raise NotImplementedError("Meta Cloud API send_media not implemented in MVP")
