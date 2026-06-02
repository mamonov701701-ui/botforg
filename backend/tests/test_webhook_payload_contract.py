"""
Контракт webhook payload: stable id + billable user input (Этап 5.3.2).

Покрывает Telegram, WhatsApp (Meta Cloud), MAX для нового runtime /webhooks/{channel}/{bot_id}.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from backend.auth.password import hash_password
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.tariff import UsageCounter
from backend.models.user import User
from backend.services.message_idempotency import build_processed_update_key
from backend.services.tariff_limits import get_user_tariff_limits
from backend.services.tariff_message_enforcement import (
    REASON_MISSING_STABLE_MESSAGE_ID,
    REASON_UNSUPPORTED_MESSAGE_TYPE,
)
from backend.tests.conftest import TestingSessionLocal


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc(*args, **kwargs) -> datetime:
    return datetime(*args, tzinfo=timezone.utc, **kwargs)


def _month_period():
    at = _utc(2026, 6, 15)
    start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(month=at.month + 1)
    return start, end


def _create_user(db, *, plan_code: str = "start") -> User:
    uid = uuid.uuid4().hex[:8]
    user = User(
        email=f"contract_{uid}@example.com",
        name="Contract",
        plan_code=plan_code,
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
        title="Contract Bot",
        username=f"ctr_bot_{uid}"[:32],
        token=f"123456789:AA{uid}",
        is_active=True,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


def _channel_connection(db, bot_id: int, channel: str, credentials: dict) -> None:
    db.add(
        BotChannelConnection(
            bot_id=bot_id,
            channel=channel,
            is_enabled=True,
            credentials_json=json.dumps(credentials),
        )
    )
    db.commit()


def _usage_counter(db, user_id: int, messages_used: int = 0) -> None:
    start, end = _month_period()
    db.add(
        UsageCounter(
            user_id=user_id,
            period_start=start,
            period_end=end,
            messages_used=messages_used,
            active_bots_used=0,
            team_members_used=0,
        )
    )
    db.commit()


# --- build key unit (contract fields) ---


def test_telegram_text_payload_builds_update_id_key() -> None:
    payload = {
        "update_id": 10001,
        "message": {"text": "hi", "chat": {"id": 1}, "from": {"id": 2}},
    }
    assert build_processed_update_key("telegram", 1, payload) == "10001"


def test_whatsapp_text_payload_builds_messages_id_key() -> None:
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "id": "wamid.CONTRACT1",
                        "from": "7900",
                        "text": {"body": "hello"},
                    }]
                }
            }]
        }]
    }
    assert build_processed_update_key("whatsapp", 1, payload) == "wamid.CONTRACT1"


def test_max_message_id_builds_key() -> None:
    payload = {"message_id": "msg_c1", "body": {"text": "hi"}}
    assert build_processed_update_key("max", 1, payload) == "msg_c1"


def test_max_event_id_builds_key() -> None:
    assert build_processed_update_key("max", 1, {"event_id": "ev1", "body": {"text": "x"}}) == "ev1"


def test_max_eventId_builds_key() -> None:
    assert build_processed_update_key("max", 1, {"eventId": "ev2", "body": {"text": "x"}}) == "ev2"


# --- Telegram integration ---


def test_telegram_user_input_without_update_id_blocked(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(db, bot.id, "telegram", {"bot_token": "test"})
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "no update_id",
        },
    }

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(f"/webhooks/telegram/{bot.id}", json=payload)

    assert res.json() == {
        "ok": True,
        "blocked_by_idempotency": True,
        "reason": REASON_MISSING_STABLE_MESSAGE_ID,
    }
    assert mock_runtime.call_count == 0
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_telegram_stable_id_consumes_and_runs_runtime(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(db, bot.id, "telegram", {"bot_token": "test"})
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 20001,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "billable",
        },
    }

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(f"/webhooks/telegram/{bot.id}", json=payload)

    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert mock_runtime.call_count == 1
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 1


def test_telegram_duplicate_does_not_consume_twice(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(db, bot.id, "telegram", {"bot_token": "test"})
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 20002,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "dup",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        r1 = client.post(url, json=payload)
        r2 = client.post(url, json=payload)

    assert r1.json() == {"ok": True}
    assert r2.json() == {"ok": True, "duplicate": True}
    assert mock_runtime.call_count == 1
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 1


def test_telegram_no_user_input_no_stable_id_not_billed(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(db, bot.id, "telegram", {"bot_token": "test"})
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
        },
    }

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(f"/webhooks/telegram/{bot.id}", json=payload)

    assert res.json() == {"ok": True}
    assert mock_runtime.call_count == 1
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def _whatsapp_meta_payload(message: dict) -> dict:
    return {
        "entry": [{
            "changes": [{
                "value": {"messages": [message]},
            }]
        }]
    }


# --- WhatsApp integration ---


def test_whatsapp_status_not_billed(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "whatsapp",
        {"provider": "meta_cloud", "verify_token": "v", "app_secret": "secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "statuses": [{"id": "wamid.STATUS1", "status": "delivered"}],
                    "messaging_product": "whatsapp",
                }
            }]
        }]
    }

    with patch(
        "backend.channels.whatsapp.providers.meta_cloud.MetaCloudProvider.validate_webhook",
        return_value=True,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            res = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)

    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert mock_runtime.call_count == 1
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_whatsapp_user_input_without_message_id_blocked(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "whatsapp",
        {"provider": "meta_cloud", "verify_token": "v", "app_secret": "secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": "79001234567",
                        "text": {"body": "no wamid"},
                    }]
                }
            }]
        }]
    }

    with patch(
        "backend.channels.whatsapp.providers.meta_cloud.MetaCloudProvider.validate_webhook",
        return_value=True,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            res = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)

    assert res.json()["blocked_by_idempotency"] is True
    assert mock_runtime.call_count == 0
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_whatsapp_stable_id_consumes(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "whatsapp",
        {"provider": "meta_cloud", "verify_token": "v", "app_secret": "secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "id": "wamid.CONTRACT2",
                        "type": "text",
                        "from": "79001234567",
                        "text": {"body": "hello"},
                    }]
                }
            }]
        }]
    }

    with patch(
        "backend.channels.whatsapp.providers.meta_cloud.MetaCloudProvider.validate_webhook",
        return_value=True,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update"):
            res = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)

    assert res.json() == {"ok": True}
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 1


@pytest.mark.parametrize(
    "msg_type",
    ["image", "document", "audio", "video", "sticker", "location", "contacts"],
)
def test_whatsapp_non_text_ignored_without_runtime(client, db, msg_type: str) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "whatsapp",
        {"provider": "meta_cloud", "verify_token": "v", "app_secret": "secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    message = {
        "id": f"wamid.NONTEXT_{msg_type}",
        "type": msg_type,
        "from": "79001234567",
    }
    if msg_type == "location":
        message["location"] = {"latitude": 1.0, "longitude": 2.0}
    elif msg_type == "sticker":
        message["sticker"] = {"id": "stk_1"}
    elif msg_type == "contacts":
        message["contacts"] = [{"name": {"formatted_name": "Alice"}}]
    else:
        message[msg_type] = {"id": "asset_1", "mime_type": "application/octet-stream"}

    payload = _whatsapp_meta_payload(message)

    with patch(
        "backend.channels.whatsapp.providers.meta_cloud.MetaCloudProvider.validate_webhook",
        return_value=True,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            res = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)

    assert res.json() == {
        "ok": True,
        "ignored": True,
        "reason": REASON_UNSUPPORTED_MESSAGE_TYPE,
    }
    assert mock_runtime.call_count == 0
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_whatsapp_non_text_duplicate_after_ignore(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "whatsapp",
        {"provider": "meta_cloud", "verify_token": "v", "app_secret": "secret"},
    )
    payload = _whatsapp_meta_payload({
        "id": "wamid.IMG_DUP",
        "type": "image",
        "from": "79001234567",
        "image": {"id": "img_1", "mime_type": "image/jpeg"},
    })

    with patch(
        "backend.channels.whatsapp.providers.meta_cloud.MetaCloudProvider.validate_webhook",
        return_value=True,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            r1 = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)
            r2 = client.post(f"/webhooks/whatsapp/{bot.id}", json=payload)

    assert r1.json()["ignored"] is True
    assert r2.json() == {"ok": True, "duplicate": True}
    assert mock_runtime.call_count == 0


def test_max_unknown_user_input_shape_blocked(client, db) -> None:
    """MAX payload с user input, но без supported stable id paths."""
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "max",
        {"token": "t", "webhook_secret": "max_secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "unknown_envelope": True,
        "chat": {"chat_id": "c1"},
        "from": {"user_id": "u1"},
        "body": {"text": "unknown shape"},
    }

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(
            f"/webhooks/max/{bot.id}",
            json=payload,
            headers={"X-Max-Bot-Api-Secret": "max_secret"},
        )

    assert res.json() == {
        "ok": True,
        "blocked_by_idempotency": True,
        "reason": REASON_MISSING_STABLE_MESSAGE_ID,
    }
    assert mock_runtime.call_count == 0
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_max_no_user_input_no_stable_id_not_billed(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "max",
        {"token": "t", "webhook_secret": "max_secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {"type": "bot_started", "chat": {"chat_id": "c1"}}

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(
            f"/webhooks/max/{bot.id}",
            json=payload,
            headers={"X-Max-Bot-Api-Secret": "max_secret"},
        )

    assert res.json() == {"ok": True}
    assert mock_runtime.call_count == 1
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


# --- MAX integration ---


def test_max_user_input_without_stable_id_blocked(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "max",
        {"token": "t", "webhook_secret": "max_secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "chat": {"chat_id": "c1"},
        "from": {"user_id": "u1"},
        "body": {"text": "no message_id"},
    }

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(
            f"/webhooks/max/{bot.id}",
            json=payload,
            headers={"X-Max-Bot-Api-Secret": "max_secret"},
        )

    assert res.json()["blocked_by_idempotency"] is True
    assert mock_runtime.call_count == 0
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 0


def test_max_message_id_consumes(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _channel_connection(
        db,
        bot.id,
        "max",
        {"token": "t", "webhook_secret": "max_secret"},
    )
    _usage_counter(db, user.id, 0)
    at = _utc(2026, 6, 15)

    payload = {
        "message_id": "msg_max_c1",
        "chat": {"chat_id": "c1"},
        "from": {"user_id": "u1"},
        "body": {"text": "hi max"},
    }

    with patch("backend.routers.channel_webhooks.process_channel_update"):
        res = client.post(
            f"/webhooks/max/{bot.id}",
            json=payload,
            headers={"X-Max-Bot-Api-Secret": "max_secret"},
        )

    assert res.json() == {"ok": True}
    assert get_user_tariff_limits(db, user.id, at=at).messages_used == 1
