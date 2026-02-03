"""
Адаптер канала MAX (platform-api.max.ru): нормализация входящих и отправка сообщений через API.
Токен передаётся только заголовком Authorization. chat_id в БД не хранится, используется chat_hash.
"""
import logging
from typing import Any

import requests

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate
from backend.settings import settings
from backend.utils.chat_hash import make_chat_hash

logger = logging.getLogger(__name__)

# Дефолтные типы событий для подписки (документация MAX)
DEFAULT_UPDATE_TYPES = ["message_created", "bot_started"]


def _extract_message_data(payload: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Извлекает text, chat_id, user_id из payload MAX. Не логирует PII."""
    text = None
    chat_id = None
    user_id = None
    update_type = payload.get("type") or payload.get("update_type") or ""
    msg = payload.get("message") or payload.get("data") or {}
    if isinstance(msg, dict):
        text = msg.get("text") or msg.get("body")
        chat_id = msg.get("chat_id") or msg.get("chatId") or msg.get("sender_id")
        if chat_id is not None:
            chat_id = str(chat_id)
        user_id = msg.get("user_id") or msg.get("userId") or msg.get("from", {}).get("id") if isinstance(msg.get("from"), dict) else None
        if user_id is not None:
            user_id = str(user_id)
    return (text, chat_id, user_id)


class MaxAdapter(ChannelAdapter):
    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        update_type = payload.get("type") or payload.get("update_type") or "unknown"
        text, chat_id, user_id = _extract_message_data(payload)
        chat_hash = None
        if chat_id and (settings.CHAT_HASH_SALT or "").strip():
            chat_hash = make_chat_hash("max", chat_id)
        raw = {"update_type": update_type}
        return NormalizedUpdate(
            channel="max",
            chat_id=chat_id,
            chat_hash=chat_hash,
            user_id=user_id,
            text=text,
            raw=raw,
        )

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        token = credentials.get("token") if isinstance(credentials, dict) else None
        if not token:
            return MessageResult(success=False, error="MAX token not set")
        base = (settings.MAX_API_BASE or "").rstrip("/")
        if not base:
            return MessageResult(success=False, error="MAX_API_BASE not configured")
        url = f"{base}/messages"
        headers = {"Authorization": token, "Content-Type": "application/json"}
        body: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if buttons:
            body["buttons"] = buttons
        try:
            r = requests.post(url, json=body, headers=headers, timeout=15)
        except requests.RequestException as e:
            logger.warning("MAX send_text request failed: %s", str(e))
            return MessageResult(success=False, error=str(e))
        if r.status_code >= 400:
            try:
                err = r.json()
                err_msg = err.get("error") or err.get("message") or r.text[:200]
            except Exception:
                err_msg = r.text[:200]
            return MessageResult(success=False, error=err_msg)
        try:
            data = r.json()
            msg_id = data.get("message_id") or data.get("id")
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
        token = credentials.get("token") if isinstance(credentials, dict) else None
        if not token:
            return MessageResult(success=False, error="MAX token not set")
        base = (settings.MAX_API_BASE or "").rstrip("/")
        if not base:
            return MessageResult(success=False, error="MAX_API_BASE not configured")
        url = f"{base}/messages"
        headers = {"Authorization": token, "Content-Type": "application/json"}
        body = {"chat_id": chat_id, "media_url": media_url}
        if caption:
            body["caption"] = caption
        try:
            r = requests.post(url, json=body, headers=headers, timeout=15)
        except requests.RequestException as e:
            logger.warning("MAX send_media request failed: %s", str(e))
            return MessageResult(success=False, error=str(e))
        if r.status_code >= 400:
            try:
                err = r.json()
                err_msg = err.get("error") or err.get("message") or r.text[:200]
            except Exception:
                err_msg = r.text[:200]
            return MessageResult(success=False, error=err_msg)
        try:
            data = r.json()
            msg_id = data.get("message_id") or data.get("id")
        except Exception:
            msg_id = None
        return MessageResult(success=True, message_id=str(msg_id) if msg_id else None)
