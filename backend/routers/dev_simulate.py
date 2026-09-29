"""Только development: симуляция входящего сообщения канала без реального webhook."""

from __future__ import annotations

import hashlib
import os
from types import SimpleNamespace
from typing import Any, Optional
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.user import User
from backend.services.channel_runtime import process_channel_update
from backend.services.custom_block_execution.contracts import (
    DENIED_CAPABILITIES,
    DEFAULT_RESOURCE_PROFILE,
    ExecutionContext,
    ExecutionEnvelope,
    ExecutionSpec,
    RunnerRequest,
)
from backend.services.custom_block_execution.provider import RunnerFailure, get_runner_provider
from backend.settings import settings

router = APIRouter(prefix="/dev", tags=["dev"])

_ALLOWED_CHANNELS = frozenset({"telegram", "max"})


def _custom_runtime_status() -> dict[str, Any]:
    parsed = urlparse(settings.CUSTOM_BLOCK_RUNNER_URL or "")
    token = settings.CUSTOM_BLOCK_RUNNER_SHARED_TOKEN or ""
    return {
        "process_id": os.getpid(),
        "feature_enabled": bool(settings.CUSTOM_BLOCK_EXECUTION_ENABLED),
        "runner_url_configured": bool(settings.CUSTOM_BLOCK_RUNNER_URL),
        "runner_host": parsed.hostname,
        "runner_port": parsed.port,
        "token_configured": bool(token),
        "token_fingerprint": hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
        if token
        else None,
    }


def _require_local_development(request: Request) -> None:
    client_host = request.client.host if request.client else ""
    local_hosts = {"127.0.0.1", "::1"}
    testing_client = bool(settings.TESTING) and client_host == "testclient"
    if settings.ENVIRONMENT != "development" or (
        client_host not in local_hosts and not testing_client
    ):
        raise HTTPException(status_code=404, detail="Not Found")


@router.get("/custom-block-runtime/status")
def custom_block_runtime_status(request: Request) -> dict[str, Any]:
    """Development-only, secret-free view of the settings used by this worker."""
    _require_local_development(request)
    return _custom_runtime_status()


@router.post("/custom-block-runtime/probe")
def custom_block_runtime_probe(request: Request) -> dict[str, Any]:
    """Execute fixed JavaScript through the configured authenticated HTTP Runner."""
    _require_local_development(request)
    spec = ExecutionSpec(
        language="javascript",
        runtime_profile="quickjs-wasm-v1",
        source=(
            "function run(envelope) { return { outputs: {}, "
            'route: "success", logs: [] }; }'
        ),
        outputs=[{"name": "success", "display_name": "Успех", "type": "json"}],
        capabilities=dict(DENIED_CAPABILITIES),
        resource_profile=dict(DEFAULT_RESOURCE_PROFILE),
    )
    request = RunnerRequest(
        execution_id=str(uuid4()),
        artifact_hash=spec.artifact_hash(),
        spec=spec,
        envelope=ExecutionEnvelope(
            input={},
            settings={},
            context=ExecutionContext(executionMode="simulator", blockVersionId=1),
        ),
    )
    try:
        response = get_runner_provider().execute(request)
    except RunnerFailure as exc:
        categories = {
            "runner_feature_disabled": "feature_disabled",
            "runner_url_missing": "runner_url_missing",
            "runner_connection_refused": "connection_refused",
            "runner_authentication_failed": "auth_mismatch",
            "timeout": "timeout",
            "invalid_output": "invalid_runner_response",
        }
        code = categories.get(exc.category, "backend_runner_handshake_failed")
        raise HTTPException(
            status_code=503,
            detail={"code": code, "runtime": _custom_runtime_status()},
        ) from exc
    if response.result.route != "success":
        raise HTTPException(
            status_code=503,
            detail={"code": "invalid_runner_response", "runtime": _custom_runtime_status()},
        )
    return {
        "status": "ok",
        "route": response.result.route,
        "runner_profile": response.runner_profile,
        "duration_ms": response.duration_ms,
        "runtime": _custom_runtime_status(),
    }


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
