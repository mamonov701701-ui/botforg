"""
Тесты message limit enforcement для нового webhook runtime (Этап 5.3).
"""
from __future__ import annotations

import inspect
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from backend.auth.password import hash_password
from backend.channels.base import NormalizedUpdate
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.plan import Plan
from backend.models.tariff import UsageCounter
from backend.models.user import User
from backend.services.tariff_limits import get_user_tariff_limits
from backend.services.tariff_message_enforcement import (
    REASON_MESSAGE_LIMIT_EXCEEDED,
    REASON_MISSING_STABLE_MESSAGE_ID,
    check_and_consume_message_unit,
    is_webhook_message_billable,
    refund_message_unit,
    should_block_user_input_without_stable_id,
)
from backend.tests.conftest import TestingSessionLocal
from backend.main import app
from fastapi.testclient import TestClient


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


def _create_user(db, *, plan_code: str = "start", suffix: str | None = None) -> User:
    uid = suffix or uuid.uuid4().hex[:8]
    user = User(
        email=f"msg_enf_{uid}@example.com",
        name="MsgEnf",
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
        title="Enf Bot",
        username=f"enf_bot_{uid}"[:32],
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


def _usage_counter(db, user_id: int, messages_used: int) -> UsageCounter:
    start, end = _month_period()
    counter = UsageCounter(
        user_id=user_id,
        period_start=start,
        period_end=end,
        messages_used=messages_used,
        active_bots_used=0,
        team_members_used=0,
    )
    db.add(counter)
    db.commit()
    db.refresh(counter)
    return counter


# --- billable helper ---


def test_billable_requires_stable_id_and_user_input() -> None:
    with_text = NormalizedUpdate(channel="telegram", chat_id="1", text="hi")
    assert is_webhook_message_billable(with_text, "42") is True
    assert is_webhook_message_billable(with_text, None) is False
    assert should_block_user_input_without_stable_id(with_text, None) is True
    assert should_block_user_input_without_stable_id(with_text, "42") is False

    noop = NormalizedUpdate(channel="telegram", chat_id="1", text="", raw={"event": "delivery"})
    assert is_webhook_message_billable(noop, "99") is False
    assert should_block_user_input_without_stable_id(noop, None) is False


# --- check_and_consume_message_unit ---


def test_first_billable_message_increments_counter(db) -> None:
    user = _create_user(db, plan_code="start")
    at = _utc(2026, 6, 15)
    result = check_and_consume_message_unit(db, user.id, at=at)
    assert result.allowed is True
    assert result.blocked is False
    assert result.consumed is True
    assert result.messages_used == 1
    assert result.messages_limit == 500
    assert result.messages_remaining == 499

    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 1


def test_at_limit_message_blocked(db) -> None:
    user = _create_user(db, plan_code="start")
    _usage_counter(db, user.id, messages_used=500)
    at = _utc(2026, 6, 15)
    result = check_and_consume_message_unit(db, user.id, at=at)
    assert result.allowed is False
    assert result.blocked is True
    assert result.consumed is False
    assert result.reason == REASON_MESSAGE_LIMIT_EXCEEDED
    assert result.messages_used == 500
    assert result.messages_remaining == 0


def test_atomic_update_does_not_exceed_limit(db) -> None:
    user = _create_user(db, plan_code="start")
    counter = _usage_counter(db, user.id, messages_used=499)
    at = _utc(2026, 6, 15)
    ok = check_and_consume_message_unit(db, user.id, at=at)
    blocked = check_and_consume_message_unit(db, user.id, at=at)
    db.refresh(counter)
    assert ok.allowed is True
    assert ok.messages_used == 500
    assert blocked.blocked is True
    assert counter.messages_used == 500


def test_remaining_calculated_correctly(db) -> None:
    user = _create_user(db, plan_code="start")
    _usage_counter(db, user.id, messages_used=10)
    at = _utc(2026, 6, 15)
    result = check_and_consume_message_unit(db, user.id, at=at)
    assert result.messages_used == 11
    assert result.messages_remaining == 489


def test_corporate_unlimited_does_not_block(db) -> None:
    corporate = db.query(Plan).filter(Plan.code == "corporate").first()
    assert corporate is not None
    corporate.limits = {
        **(corporate.limits or {}),
        "monthly_messages": None,
        "active_bots": None,
        "team_members": None,
    }
    db.commit()
    user = _create_user(db, plan_code="corporate")
    at = _utc(2026, 6, 15)
    result = check_and_consume_message_unit(db, user.id, at=at)
    assert result.allowed is True
    assert result.blocked is False
    assert result.consumed is False
    assert result.messages_limit is None
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 0


# --- webhook integration ---


def test_duplicate_webhook_does_not_increment_counter(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=0)

    payload = {
        "update_id": 777001,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "billable",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"
    at = _utc(2026, 6, 15)

    with patch("backend.routers.channel_webhooks.process_channel_update"):
        client.post(url, json=payload)
        client.post(url, json=payload)

    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 1


def test_user_input_without_stable_id_blocked(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=0)

    payload = {
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "no update_id",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"
    at = _utc(2026, 6, 15)

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(url, json=payload)

    assert res.status_code == 200
    assert res.json() == {
        "ok": True,
        "blocked_by_idempotency": True,
        "reason": REASON_MISSING_STABLE_MESSAGE_ID,
    }
    assert mock_runtime.call_count == 0
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 0


def test_no_user_input_does_not_consume(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=0)

    payload = {
        "update_id": 777002,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
        },
    }
    url = f"/webhooks/telegram/{bot.id}"
    at = _utc(2026, 6, 15)

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(url, json=payload)

    assert res.status_code == 200
    assert mock_runtime.call_count == 1
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 0


def test_blocked_response_and_skips_runtime(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=500)

    payload = {
        "update_id": 777003,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "blocked",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
        res = client.post(url, json=payload)

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["blocked_by_limit"] is True
    assert body["reason"] == REASON_MESSAGE_LIMIT_EXCEEDED
    assert mock_runtime.call_count == 0


def test_legacy_webhook_router_untouched() -> None:
    import backend.routers.webhook as legacy_webhook

    source = inspect.getsource(legacy_webhook)
    assert "tariff_message_enforcement" not in source
    assert "check_and_consume_message_unit" not in source


# --- refund / compensation ---


def test_refund_message_unit_does_not_go_below_zero(db) -> None:
    user = _create_user(db)
    start, end = _month_period()
    counter = _usage_counter(db, user.id, messages_used=0)
    refund_message_unit(db, user.id, start, end)
    db.refresh(counter)
    assert counter.messages_used == 0


def test_refund_message_unit_decrements_when_positive(db) -> None:
    user = _create_user(db)
    start, end = _month_period()
    counter = _usage_counter(db, user.id, messages_used=5)
    refund_message_unit(db, user.id, start, end)
    db.refresh(counter)
    assert counter.messages_used == 4


def test_runtime_failure_after_consume_refunds_counter(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=10)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 888001,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "fail runtime",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch(
        "backend.routers.channel_webhooks.process_channel_update",
        side_effect=RuntimeError("runtime boom"),
    ):
        with TestClient(app, raise_server_exceptions=False) as no_raise_client:
            res = no_raise_client.post(url, json=payload)

    assert res.status_code == 500
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 10


def test_successful_runtime_keeps_consumed_counter(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=10)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 888002,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "ok runtime",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.process_channel_update"):
        res = client.post(url, json=payload)

    assert res.status_code == 200
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 11


def test_unlimited_runtime_failure_does_not_refund(client, db) -> None:
    corporate = db.query(Plan).filter(Plan.code == "corporate").first()
    assert corporate is not None
    corporate.limits = {
        **(corporate.limits or {}),
        "monthly_messages": None,
        "active_bots": None,
        "team_members": None,
    }
    db.commit()
    user = _create_user(db, plan_code="corporate")
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 888003,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "corp fail",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch(
        "backend.routers.channel_webhooks.refund_consumed_message_unit",
    ) as mock_refund:
        with patch(
            "backend.routers.channel_webhooks.process_channel_update",
            side_effect=RuntimeError("runtime boom"),
        ):
            with TestClient(app, raise_server_exceptions=False) as no_raise_client:
                no_raise_client.post(url, json=payload)

    mock_refund.assert_not_called()
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 0


def test_blocked_webhook_does_not_trigger_refund_on_runtime_skip(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=500)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 888004,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "blocked",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.refund_consumed_message_unit") as mock_refund:
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            res = client.post(url, json=payload)

    assert res.json()["blocked_by_limit"] is True
    mock_runtime.assert_not_called()
    mock_refund.assert_not_called()
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 500


def test_duplicate_webhook_does_not_trigger_refund(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=3)
    at = _utc(2026, 6, 15)

    payload = {
        "update_id": 888005,
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "dup",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.refund_consumed_message_unit") as mock_refund:
        with patch("backend.routers.channel_webhooks.process_channel_update"):
            client.post(url, json=payload)
            client.post(url, json=payload)

    mock_refund.assert_not_called()
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 4


def test_no_stable_id_user_input_blocked_no_refund(client, db) -> None:
    user = _create_user(db)
    bot = _active_bot(db, user.id)
    _telegram_connection(db, bot.id)
    _usage_counter(db, user.id, messages_used=2)
    at = _utc(2026, 6, 15)

    payload = {
        "message": {
            "message_id": 1,
            "from": {"id": 100},
            "chat": {"id": 200},
            "text": "no id",
        },
    }
    url = f"/webhooks/telegram/{bot.id}"

    with patch("backend.routers.channel_webhooks.refund_consumed_message_unit") as mock_refund:
        with patch("backend.routers.channel_webhooks.process_channel_update") as mock_runtime:
            res = client.post(url, json=payload)

    assert res.json()["blocked_by_idempotency"] is True
    mock_runtime.assert_not_called()
    mock_refund.assert_not_called()
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.messages_used == 2
