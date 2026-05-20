"""Только development: симуляция входящего сообщения канала без реального webhook."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.user import User
from backend.services.channel_runtime import process_channel_update
from backend.settings import settings

router = APIRouter(prefix="/dev", tags=["dev"])

_ALLOWED_CHANNELS = frozenset({"telegram", "max"})


class DevSimulateBody(BaseModel):
    text: str = Field(..., min_length=1)
    channel: str = Field(..., description="telegram | max")
    chat_id: str = Field(..., min_length=1)


class MockCaptureAdapter(ChannelAdapter):
    """Не шлёт в мессенджер; сохраняет исходящие сообщения для ответа API."""

    def __init__(
        self,
        captured_messages: list[dict[str, Any]],
        passthrough: NormalizedUpdate,
    ) -> None:
        self._captured = captured_messages
        self._passthrough = passthrough

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        return self._passthrough

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: Optional[list[dict[str, Any]]] = None,
    ) -> MessageResult:
        self._captured.append({"text": text, "buttons": buttons or []})
        return MessageResult(success=True)

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: Optional[str] = None,
    ) -> MessageResult:
        self._captured.append(
            {"text": caption or "", "media_url": media_url, "buttons": []}
        )
        return MessageResult(success=True)


@router.post("/bots/{bot_id}/simulate-message")
async def simulate_channel_message(
    bot_id: int,
    body: DevSimulateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=404, detail="Not Found")

    ch = body.channel.strip().lower()
    if ch not in _ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="channel must be telegram or max")

    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.is_active == True).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found or inactive")
    if int(bot.owner_id) != int(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    conn_row = (
        db.query(BotChannelConnection)
        .filter(
            BotChannelConnection.bot_id == bot_id,
            BotChannelConnection.channel == ch,
            BotChannelConnection.is_enabled == True,  # noqa: E712
        )
        .first()
    )

    credentials_json = "{}"
    if conn_row and conn_row.credentials_json:
        credentials_json = conn_row.credentials_json

    stub_conn = SimpleNamespace(credentials_json=credentials_json)

    normalized = NormalizedUpdate(
        channel=ch,
        chat_id=body.chat_id.strip(),
        user_id=body.chat_id.strip(),
        text=body.text.strip(),
        raw={"dev_simulate": True},
    )

    captured: list[dict[str, Any]] = []
    adapter = MockCaptureAdapter(captured, normalized)

    process_channel_update(
        db,
        bot=bot,
        conn=stub_conn,
        adapter=adapter,
        normalized=normalized,
    )

    return {"messages": captured}
