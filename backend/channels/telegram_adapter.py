"""Адаптер канала Telegram: нормализация формата Telegram Update (обёртка вокруг формата)."""
from typing import Any

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate


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
        raise NotImplementedError("Telegram send_text: use existing webhook/Telegram API integration")

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        raise NotImplementedError("Telegram send_media: use existing webhook/Telegram API integration")
