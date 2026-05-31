"""
Интеграционные тесты channel_webhooks → channel_runtime: input → action → message.
Каналы: max, whatsapp. Внешние API отправки сообщений мокаются (send_text).

Требования: alembic upgrade head, таблицы bot_channel_connections, scenarios, ctor_*.
"""
from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError
from sqlalchemy.orm import Session

from backend.channels.base import MessageResult
from backend.channels.max_adapter import MaxAdapter
from backend.channels.whatsapp_adapter import WhatsAppAdapter
from backend.main import app
from backend.database import SessionLocal
from backend.models.constructor_core import (
    CtorBotTag,
    CtorBotUser,
    CtorBotUserTag,
    CtorBotUserVariable,
    CtorBotVariableDefinition,
)
from backend.models.scenario import SCENARIO_STATUS_PUBLISHED, Scenario
from tests.utils_whatsapp_sign import META_SIGNATURE_HEADER, compute_meta_signature

client = TestClient(app)

MAX_WEBHOOK_SECRET_HEADER = "X-Max-Bot-Api-Secret"


def _has_bot_channel_connections() -> bool:
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM bot_channel_connections LIMIT 1"))
        return True
    except SQLOperationalError:
        return False
    finally:
        db.close()


def _published_content(action_kind: str) -> dict[str, Any]:
    """Граф: старт = input → action (field | tag | status) → message."""
    n_in, n_act, n_msg = "n_input", "n_action", "n_msg"
    if action_kind == "field":
        action_settings: dict[str, Any] = {
            "mode": "field",
            "fieldAction": "set",
            "fieldKey": "e2e_action_field",
            "fieldValue": "stored_ok",
        }
    elif action_kind == "tag":
        action_settings = {
            "mode": "tag",
            "tagAction": "add",
            "tag": "e2e_rt_tag",
        }
    else:
        action_settings = {
            "mode": "status",
            "statusAction": "set",
            "status": "e2e_vip",
        }
    nodes = [
        {
            "id": n_in,
            "type": "input",
            "data": {
                "is_start": True,
                "settings": {
                    "variable_key": "user_name",
                    "variable_label": "Name",
                    "question_text": "?",
                    "validation": {"type": "string"},
                },
            },
        },
        {"id": n_act, "type": "action", "data": {"settings": action_settings}},
        {
            "id": n_msg,
            "type": "message",
            "data": {"settings": {"text": "ok"}},
        },
    ]
    edges = [
        {"id": "e1", "source": n_in, "target": n_act, "sourceHandle": "success"},
        {"id": "e2", "source": n_act, "target": n_msg},
    ]
    return {"nodes": nodes, "edges": edges}


def _published_content_editor_v2(action_kind: str) -> dict[str, Any]:
    """EditorV2: type=default + data.blockId; цепочка start → input → action → message."""
    n_start, n_in, n_act, n_msg = "n_start", "n_input", "n_action", "n_msg"
    if action_kind == "field":
        action_settings: dict[str, Any] = {
            "mode": "field",
            "fieldAction": "set",
            "fieldKey": "e2e_action_field",
            "fieldValue": "stored_ok",
        }
    elif action_kind == "tag":
        action_settings = {
            "mode": "tag",
            "tagAction": "add",
            "tag": "e2e_rt_tag",
        }
    else:
        action_settings = {
            "mode": "status",
            "statusAction": "set",
            "status": "e2e_vip",
        }
    nodes = [
        {
            "id": n_start,
            "type": "default",
            "data": {"blockId": "start", "settings": {}},
        },
        {
            "id": n_in,
            "type": "default",
            "data": {
                "blockId": "input",
                "settings": {
                    "variable_key": "user_name",
                    "variable_label": "Name",
                    "question_text": "?",
                    "validation": {"type": "string"},
                },
            },
        },
        {
            "id": n_act,
            "type": "default",
            "data": {"blockId": "action", "settings": action_settings},
        },
        {
            "id": n_msg,
            "type": "default",
            "data": {"blockId": "message", "settings": {"text": "ok"}},
        },
    ]
    edges = [
        {"id": "e0", "source": n_start, "target": n_in},
        {"id": "e1", "source": n_in, "target": n_act, "sourceHandle": "success"},
        {"id": "e2", "source": n_act, "target": n_msg},
    ]
    return {"nodes": nodes, "edges": edges}


def _published_content_condition_last_input() -> dict[str, Any]:
    """EditorV2: start → input → condition(last_input == "yes") → message_yes / message_no."""
    n_start, n_in, n_cond, n_yes, n_no = "n_start", "n_input", "n_cond", "n_yes", "n_no"
    nodes = [
        {"id": n_start, "type": "default", "data": {"blockId": "start", "settings": {}}},
        {
            "id": n_in,
            "type": "default",
            "data": {
                "blockId": "input",
                "settings": {
                    "variable_key": "user_choice",
                    "variable_label": "Choice",
                    "question_text": "?",
                    "validation": {"type": "string"},
                },
            },
        },
        {
            "id": n_cond,
            "type": "default",
            "data": {
                "blockId": "condition",
                "settings": {
                    "conditionSourceType": "last_input",
                    "operator": "equals",
                    "value": "yes",
                },
            },
        },
        {"id": n_yes, "type": "default", "data": {"blockId": "message", "settings": {"text": "YES"}}},
        {"id": n_no, "type": "default", "data": {"blockId": "message", "settings": {"text": "NO"}}},
    ]
    edges = [
        {"id": "e0", "source": n_start, "target": n_in},
        {"id": "e1", "source": n_in, "target": n_cond, "sourceHandle": "success"},
        {
            "id": "e2",
            "source": n_cond,
            "target": n_yes,
            "sourceHandle": "condition_yes",
            "data": {"conditionBranch": "true"},
        },
        {
            "id": "e3",
            "source": n_cond,
            "target": n_no,
            "sourceHandle": "condition_no",
            "data": {"conditionBranch": "false"},
        },
    ]
    return {"nodes": nodes, "edges": edges}


def _published_content_tag_condition() -> dict[str, Any]:
    """EditorV2: start → action(add tag) → condition(user_tag) → message_yes / message_no."""
    n_start, n_act, n_cond, n_yes, n_no = "n_start", "n_action", "n_cond", "n_yes", "n_no"
    nodes = [
        {"id": n_start, "type": "default", "data": {"blockId": "start", "settings": {}}},
        {
            "id": n_act,
            "type": "default",
            "data": {
                "blockId": "action",
                "settings": {"mode": "tag", "tagAction": "add", "tag": "cond_rt_tag"},
            },
        },
        {
            "id": n_cond,
            "type": "default",
            "data": {
                "blockId": "condition",
                "settings": {
                    "conditionSourceType": "user_tag",
                    "operator": "equals",
                    "variable": "cond_rt_tag",
                },
            },
        },
        {"id": n_yes, "type": "default", "data": {"blockId": "message", "settings": {"text": "YES"}}},
        {"id": n_no, "type": "default", "data": {"blockId": "message", "settings": {"text": "NO"}}},
    ]
    edges = [
        {"id": "e0", "source": n_start, "target": n_act},
        {"id": "e1", "source": n_act, "target": n_cond},
        {
            "id": "e2",
            "source": n_cond,
            "target": n_yes,
            "sourceHandle": "condition_yes",
            "data": {"conditionBranch": "true"},
        },
        {
            "id": "e3",
            "source": n_cond,
            "target": n_no,
            "sourceHandle": "condition_no",
            "data": {"conditionBranch": "false"},
        },
    ]
    return {"nodes": nodes, "edges": edges}


def _create_bot_with_channel(
    *,
    channel: str,
    creds: dict[str, Any],
) -> int | None:
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        owner_id = row[0]
        suffix = uuid.uuid4().hex[:10]
        username = f"e2e_rt_{suffix}"
        db.execute(
            text(
                "INSERT INTO bots (owner_id, title, username, token, is_active) "
                "VALUES (:oid, :title, :username, 'tok', 1)"
            ),
            {"oid": owner_id, "title": f"E2E {suffix}", "username": username},
        )
        db.commit()
        r = db.execute(
            text("SELECT id FROM bots WHERE username = :u ORDER BY id DESC LIMIT 1"),
            {"u": username},
        )
        row = r.fetchone()
        if not row:
            return None
        bot_id = row[0]
        db.execute(
            text(
                "INSERT INTO bot_channel_connections (bot_id, channel, is_enabled, credentials_json) "
                "VALUES (:bot_id, :ch, 1, :creds)"
            ),
            {"bot_id": bot_id, "ch": channel, "creds": json.dumps(creds)},
        )
        db.commit()
        return int(bot_id)
    finally:
        db.close()


def _attach_scenario(bot_id: int, owner_id: int, content: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        sc = Scenario(
            user_id=owner_id,
            bot_id=bot_id,
            name="e2e channel runtime",
            is_main=True,
            status=SCENARIO_STATUS_PUBLISHED,
            content=content,
            published_content=content,
        )
        db.add(sc)
        db.commit()
    finally:
        db.close()


def _owner_id() -> int | None:
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        return int(row[0]) if row else None
    finally:
        db.close()


def _assert_crm(
    db: Session,
    *,
    external_user_id: str,
    channel: str,
    action_kind: str,
) -> None:
    user = (
        db.query(CtorBotUser)
        .filter(
            CtorBotUser.external_user_id == external_user_id,
            CtorBotUser.channel == channel,
            CtorBotUser.environment == "prod",
        )
        .order_by(CtorBotUser.id.desc())
        .first()
    )
    assert user is not None, "ctor_bot_user not created"

    uv_name = (
        db.query(CtorBotUserVariable)
        .join(
            CtorBotVariableDefinition,
            CtorBotUserVariable.variable_definition_id == CtorBotVariableDefinition.id,
        )
        .filter(
            CtorBotUserVariable.bot_user_id == user.id,
            CtorBotVariableDefinition.key == "user_name",
        )
        .first()
    )
    assert uv_name is not None
    assert (uv_name.value_text or "").strip() == "Alice"

    if action_kind == "field":
        uv_f = (
            db.query(CtorBotUserVariable)
            .join(
                CtorBotVariableDefinition,
                CtorBotUserVariable.variable_definition_id == CtorBotVariableDefinition.id,
            )
            .filter(
                CtorBotUserVariable.bot_user_id == user.id,
                CtorBotVariableDefinition.key == "e2e_action_field",
            )
            .first()
        )
        assert uv_f is not None
        assert (uv_f.value_text or "") == "stored_ok"
    elif action_kind == "tag":
        tag = (
            db.query(CtorBotTag)
            .filter(CtorBotTag.bot_id == user.bot_id, CtorBotTag.key == "e2e_rt_tag")
            .first()
        )
        assert tag is not None
        link = (
            db.query(CtorBotUserTag)
            .filter(
                CtorBotUserTag.bot_user_id == user.id,
                CtorBotUserTag.tag_id == tag.id,
            )
            .first()
        )
        assert link is not None
    else:
        assert (user.status or "") == "e2e_vip"


def _post_max(bot_id: int, secret: str, chat_id: str, text: str | None) -> Any:
    return client.post(
        f"/webhooks/max/{bot_id}",
        json={
            "type": "message_created",
            "message": {
                "text": text or "",
                "chat_id": chat_id,
                "user_id": chat_id,
            },
        },
        headers={MAX_WEBHOOK_SECRET_HEADER: secret},
    )


def _post_whatsapp_signed(bot_id: int, app_secret: str, from_num: str, text: str | None) -> Any:
    body = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "1",
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": from_num,
                                    "id": f"mid.{uuid.uuid4().hex[:8]}",
                                    "timestamp": "123",
                                    "type": "text",
                                    "text": {"body": text or ""},
                                }
                            ]
                        },
                        "field": "messages",
                    }
                ]
            }
        ],
    }
    body_bytes = json.dumps(body).encode("utf-8")
    signature = compute_meta_signature(body_bytes, app_secret)
    return client.post(
        f"/webhooks/whatsapp/{bot_id}",
        content=body_bytes,
        headers={"Content-Type": "application/json", META_SIGNATURE_HEADER: signature},
    )


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections missing (alembic upgrade head)",
)
@pytest.mark.parametrize("action_kind", ["field", "tag", "status"])
def test_max_channel_runtime_input_action_message(action_kind: str) -> None:
    oid = _owner_id()
    if not oid:
        pytest.skip("no users row")
    secret = f"sec-{uuid.uuid4().hex[:8]}"
    bot_id = _create_bot_with_channel(
        channel="max",
        creds={"token": "fake", "webhook_secret": secret},
    )
    if not bot_id:
        pytest.skip("bot not created")
    chat_id = f"max_e2e_{uuid.uuid4().hex[:12]}"
    _attach_scenario(bot_id, oid, _published_content(action_kind))

    with patch.object(
        MaxAdapter,
        "send_text",
        return_value=MessageResult(success=True),
    ):
        r1 = _post_max(bot_id, secret, chat_id, "ignored_first")
        assert r1.status_code == 200, r1.text
        r2 = _post_max(bot_id, secret, chat_id, "Alice")
        assert r2.status_code == 200, r2.text

    db = SessionLocal()
    try:
        _assert_crm(db, external_user_id=chat_id, channel="max", action_kind=action_kind)
    finally:
        db.close()


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections missing (alembic upgrade head)",
)
@pytest.mark.parametrize("action_kind", ["field", "tag", "status"])
def test_whatsapp_channel_runtime_input_action_message(action_kind: str) -> None:
    oid = _owner_id()
    if not oid:
        pytest.skip("no users row")
    app_secret = "wa_e2e_secret"
    bot_id = _create_bot_with_channel(
        channel="whatsapp",
        creds={
            "provider": "meta_cloud",
            "token": "fake",
            "phone_number_id": "123",
            "verify_token": "verify",
            "app_secret": app_secret,
        },
    )
    if not bot_id:
        pytest.skip("bot not created")
    from_num = f"7900{uuid.uuid4().int % 10**7:07d}"
    _attach_scenario(bot_id, oid, _published_content(action_kind))

    with patch.object(
        WhatsAppAdapter,
        "send_text",
        return_value=MessageResult(success=True),
    ):
        r1 = _post_whatsapp_signed(bot_id, app_secret, from_num, "first")
        assert r1.status_code == 200, r1.text
        r2 = _post_whatsapp_signed(bot_id, app_secret, from_num, "Alice")
        assert r2.status_code == 200, r2.text

    db = SessionLocal()
    try:
        _assert_crm(db, external_user_id=from_num, channel="whatsapp", action_kind=action_kind)
    finally:
        db.close()


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections missing (alembic upgrade head)",
)
@pytest.mark.parametrize("action_kind", ["field", "tag", "status"])
def test_max_channel_runtime_editor_v2_start_input_action_message(action_kind: str) -> None:
    """published_content с EditorV2-узлами (type=default, data.blockId)."""
    oid = _owner_id()
    if not oid:
        pytest.skip("no users row")
    secret = f"sec-{uuid.uuid4().hex[:8]}"
    bot_id = _create_bot_with_channel(
        channel="max",
        creds={"token": "fake", "webhook_secret": secret},
    )
    if not bot_id:
        pytest.skip("bot not created")
    chat_id = f"max_v2_{uuid.uuid4().hex[:12]}"
    _attach_scenario(bot_id, oid, _published_content_editor_v2(action_kind))

    with patch.object(
        MaxAdapter,
        "send_text",
        return_value=MessageResult(success=True),
    ):
        r1 = _post_max(bot_id, secret, chat_id, "hello")
        assert r1.status_code == 200, r1.text
        r2 = _post_max(bot_id, secret, chat_id, "continue")
        assert r2.status_code == 200, r2.text
        r3 = _post_max(bot_id, secret, chat_id, "Alice")
        assert r3.status_code == 200, r3.text

    db = SessionLocal()
    try:
        _assert_crm(db, external_user_id=chat_id, channel="max", action_kind=action_kind)
    finally:
        db.close()


def _sent_texts(mock_send: Any) -> list[str]:
    return [str(c.kwargs.get("text", "")) for c in mock_send.call_args_list]


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections missing (alembic upgrade head)",
)
@pytest.mark.parametrize(
    "answer,expected,unexpected",
    [("yes", "YES", "NO"), ("no", "NO", "YES")],
)
def test_max_condition_last_input_routes_branch(
    answer: str, expected: str, unexpected: str
) -> None:
    """start → input → condition(last_input) → message_yes/message_no."""
    oid = _owner_id()
    if not oid:
        pytest.skip("no users row")
    secret = f"sec-{uuid.uuid4().hex[:8]}"
    bot_id = _create_bot_with_channel(
        channel="max",
        creds={"token": "fake", "webhook_secret": secret},
    )
    if not bot_id:
        pytest.skip("bot not created")
    chat_id = f"max_cond_{uuid.uuid4().hex[:12]}"
    _attach_scenario(bot_id, oid, _published_content_condition_last_input())

    with patch.object(
        MaxAdapter,
        "send_text",
        return_value=MessageResult(success=True),
    ) as mock_send:
        assert _post_max(bot_id, secret, chat_id, "hi").status_code == 200
        assert _post_max(bot_id, secret, chat_id, "go").status_code == 200
        assert _post_max(bot_id, secret, chat_id, answer).status_code == 200

    texts = _sent_texts(mock_send)
    assert expected in texts, texts
    assert unexpected not in texts, texts


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections missing (alembic upgrade head)",
)
def test_max_condition_user_tag_routes_yes_after_action() -> None:
    """start → action(add tag) → condition(user_tag) → message_yes/message_no."""
    oid = _owner_id()
    if not oid:
        pytest.skip("no users row")
    secret = f"sec-{uuid.uuid4().hex[:8]}"
    bot_id = _create_bot_with_channel(
        channel="max",
        creds={"token": "fake", "webhook_secret": secret},
    )
    if not bot_id:
        pytest.skip("bot not created")
    chat_id = f"max_tagcond_{uuid.uuid4().hex[:12]}"
    _attach_scenario(bot_id, oid, _published_content_tag_condition())

    with patch.object(
        MaxAdapter,
        "send_text",
        return_value=MessageResult(success=True),
    ) as mock_send:
        assert _post_max(bot_id, secret, chat_id, "hi").status_code == 200
        assert _post_max(bot_id, secret, chat_id, "go").status_code == 200

    texts = _sent_texts(mock_send)
    assert "YES" in texts, texts
    assert "NO" not in texts, texts
