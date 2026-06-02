"""
Тесты idempotency/dedup для message runtime (Этап 5.2.1).
"""
from __future__ import annotations

import json
import uuid
from unittest.mock import patch

import pytest

from backend.auth.password import hash_password
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.processed_update import ProcessedUpdate
from backend.models.user import User
from backend.services.message_idempotency import (
    build_processed_update_key,
    is_update_already_processed,
    try_register_processed_update,
)
from backend.tests.conftest import TestingSessionLocal


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _create_user(db) -> User:
    uid = uuid.uuid4().hex[:8]
    user = User(
        email=f"idem_{uid}@example.com",
        name="Idem",
        plan_code="start",
        role="user",
        hashed_password=hash_password("TestPassword123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _active_bot(db, owner_id: int) -> Bot:
    uid = uuid.uuid4().hex[:8]
    bot = Bot(
        owner_id=owner_id,
        title="Idem Bot",
        username=f"idem_bot_{uid}"[:32],
        token=f"123456789:AA{uid}",
        is_active=True,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


def _telegram_connection(db, bot_id: int) -> None:
    db.add(
        BotChannelConnection(
            bot_id=bot_id,
            channel="telegram",
            is_enabled=True,
            credentials_json=json.dumps({"bot_token": "test"}),
        )
    )
    db.commit()


# --- build_processed_update_key ---


def test_build_key_telegram_update_id() -> None:
    payload = {"update_id": 9001, "message": {"text": "hi", "chat": {"id": 1}}}
    assert build_processed_update_key("telegram", 1, payload) == "9001"


def test_build_key_whatsapp_meta_message_id() -> None:
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid.ABC123",
                                    "from": "79001234567",
                                    "text": {"body": "hello"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    assert build_processed_update_key("whatsapp", 2, payload) == "wamid.ABC123"


def test_build_key_max_message_id() -> None:
    payload = {
        "message_id": "msg_123",
        "chat": {"chat_id": "chat_456"},
        "body": {"text": "Привет"},
    }
    assert build_processed_update_key("max", 3, payload) == "msg_123"


def test_build_key_unknown_payload_returns_none() -> None:
    assert build_processed_update_key("telegram", 1, {"message": {"text": "no update_id"}}) is None
    assert build_processed_update_key("whatsapp", 1, {"entry": []}) is None
    assert build_processed_update_key("unknown_channel", 1, {"id": "x"}) is None


# --- try_register_processed_update (atomic) ---


def test_try_register_first_time_returns_true(db) -> None:
    assert try_register_processed_update(db, "telegram", 10, "42") is True
    assert is_update_already_processed(db, "telegram", 10, "42") is True


def test_try_register_repeat_returns_false(db) -> None:
    assert try_register_processed_update(db, "telegram", 10, "42") is True
    assert try_register_processed_update(db, "telegram", 10, "42") is False


def test_try_register_same_id_different_bot_id_no_conflict(db) -> None:
    assert try_register_processed_update(db, "telegram", 10, "99") is True
    assert try_register_processed_update(db, "telegram", 11, "99") is True


def test_try_register_same_id_different_channel_no_conflict(db) -> None:
    assert try_register_processed_update(db, "telegram", 10, "77") is True
    assert try_register_processed_update(db, "max", 10, "77") is True


def test_try_register_integrity_error_leaves_single_row(db) -> None:
    assert try_register_processed_update(db, "max", 5, "dup1") is True
    assert try_register_processed_update(db, "max", 5, "dup1") is False
    rows = (
        db.query(ProcessedUpdate)
        .filter(
            ProcessedUpdate.bot_id == 5,
            ProcessedUpdate.channel == "max",
            ProcessedUpdate.message_id == "dup1",
        )
        .all()
    )
    assert len(rows) == 1


def test_double_register_does_not_imply_second_runtime(db) -> None:
    """Два последовательных try_register — только первый «владеет» обработкой."""
    assert try_register_processed_update(db, "telegram", 1, "seq1") is True
    assert try_register_processed_update(db, "telegram", 1, "seq1") is False


# --- webhook integration ---


def test_duplicate_webhook_skips_process_channel_update(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)

    payload = {
        "update_id": 555001,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "test",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch(
        "backend.routers.channel_webhooks.process_channel_update",
    ) as mock_runtime:
        r1 = client.post(url, json=payload)
        r2 = client.post(url, json=payload)

    assert r1.status_code == 200
    assert r1.json() == {"ok": True}
    assert r2.status_code == 200
    assert r2.json() == {"ok": True, "duplicate": True}
    assert mock_runtime.call_count == 1


def test_webhook_without_idempotency_key_runs_runtime_no_processed_row(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)

    payload = {
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "no update_id",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch(
        "backend.routers.channel_webhooks.process_channel_update",
    ) as mock_runtime:
        res = client.post(url, json=payload)

    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert mock_runtime.call_count == 1
    rows = db.query(ProcessedUpdate).filter(ProcessedUpdate.bot_id == bot.id).all()
    assert rows == []
