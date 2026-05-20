"""Тесты MaxAdapter: нормализация входящих и send_text (HTTP через requests)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import requests

from backend.channels.base import MessageResult
from backend.channels.max_adapter import MaxAdapter


def test_normalize_incoming_message_payload() -> None:
    adapter = MaxAdapter()
    payload = {
        "message_id": "msg_123",
        "timestamp": 1700000000,
        "chat": {"chat_id": "chat_456", "type": "dialog"},
        "from": {"user_id": "user_789", "name": "Test User"},
        "body": {"text": "Привет бот"},
    }
    out = adapter.normalize_incoming(payload)
    assert out.channel == "max"
    assert out.chat_id == "chat_456"
    assert out.text == "Привет бот"
    assert out.user_id == "user_789"


def test_normalize_incoming_callback_query() -> None:
    adapter = MaxAdapter()
    payload = {
        "message_id": "msg_124",
        "chat": {"chat_id": "chat_456"},
        "from": {"user_id": "user_789"},
        "callback_query": {"payload": "btn_yes"},
    }
    out = adapter.normalize_incoming(payload)
    assert out.text == "btn_yes"
    assert out.chat_id == "chat_456"
    assert out.user_id == "user_789"


def test_send_text_requests_success() -> None:
    adapter = MaxAdapter()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "result": {"message_id": "resp_msg_1"}}

    with patch("backend.channels.max_adapter.requests.post", return_value=mock_resp) as mock_post:
        result = adapter.send_text(
            chat_id="chat_456",
            text="Привет!",
            credentials={"access_token": "test_token_123"},
        )

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    url = str(args[0]) if args else ""
    headers = kwargs.get("headers") or {}
    auth_header = headers.get("Authorization") or ""

    assert "test_token_123" in url or "test_token_123" in auth_header

    assert isinstance(result, MessageResult)
    assert result.success is True
    assert result.error is None


def test_send_text_requests_failure() -> None:
    adapter = MaxAdapter()

    with patch(
        "backend.channels.max_adapter.requests.post",
        side_effect=requests.RequestException("connection failed"),
    ):
        result = adapter.send_text(
            chat_id="chat_456",
            text="Привет!",
            credentials={"access_token": "test_token_123"},
        )

    assert isinstance(result, MessageResult)
    assert result.success is False
    assert result.error and len(result.error.strip()) > 0
