"""Адаптер канала Telegram: нормализация формата Telegram Update (обёртка вокруг формата)."""
import logging
from typing import Any

import httpx

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate

logger = logging.getLogger(__name__)


def _telegram_send_url(method: str, bot_token: str) -> str:
    return f"https://api.telegram.org/bot{bot_token}/{method}"


def _message_result_from_response(data: dict[str, Any]) -> MessageResult:
    if not data.get("ok"):
        return MessageResult(success=False, error=str(data.get("description", data)))
    result = data.get("result") or {}
    mid = result.get("message_id")
    return MessageResult(success=True, message_id=str(mid) if mid is not None else None)


class TelegramAdapter(ChannelAdapter):
    """Нормализует входящие Telegram updates в NormalizedUpdate."""

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        message = payload.get("message") or (payload.get("callback_query") or {}).get("message")
        chat_id = None
        text = None
        user_id = None
        if message:
            chat_id = str(message.get("chat", {}).get("id", ""))
            text = (message.get("text") or "").strip() or None
            user_id = str(message.get("from", {}).get("id", "")) if message.get("from") else None
        callback = payload.get("callback_query")
        if callback and not text:
            text = callback.get("data")
            if not chat_id and callback.get("message"):
                chat_id = str(callback["message"].get("chat", {}).get("id", ""))
            if not user_id and callback.get("from"):
                user_id = str(callback["from"].get("id", ""))
        return NormalizedUpdate(
            channel="telegram",
            chat_id=chat_id or None,
            user_id=user_id or None,
            text=text,
            raw={"update_id": payload.get("update_id")},
        )

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        bot_token = (credentials or {}).get("bot_token")
        if not bot_token:
            return MessageResult(success=False, error="bot_token missing in credentials")
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        }
        if buttons:
            row = [
                {
                    "text": str(btn.get("label", "")),
                    "callback_data": str(btn.get("sourceHandle", "")),
                }
                for btn in buttons
            ]
            payload["reply_markup"] = {"inline_keyboard": [row]}
        try:
            r = httpx.post(
                _telegram_send_url("sendMessage", bot_token),
                json=payload,
                timeout=10,
            )
            data = r.json()
        except Exception as e:
            logger.warning("telegram send_text failed: %s", e)
            return MessageResult(success=False, error=str(e))
        return _message_result_from_response(data if isinstance(data, dict) else {})

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        bot_token = (credentials or {}).get("bot_token")
        if not bot_token:
            return MessageResult(success=False, error="bot_token missing in credentials")
        payload: dict[str, Any] = {"chat_id": chat_id, "photo": media_url}
        if caption is not None:
            payload["caption"] = caption
        try:
            r = httpx.post(
                _telegram_send_url("sendPhoto", bot_token),
                json=payload,
                timeout=15,
            )
            data = r.json()
        except Exception as e:
            logger.warning("telegram send_photo failed: %s", e)
            return MessageResult(success=False, error=str(e))
        return _message_result_from_response(data if isinstance(data, dict) else {})
