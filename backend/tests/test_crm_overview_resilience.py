from __future__ import annotations

from datetime import datetime, timezone
import uuid

from backend.models.bot import Bot
from backend.models.constructor_core import CtorBotUser, CtorCrmOverviewAggregate
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)
from backend.utils.ctor_bot_resolve import ensure_ctor_bot_id


def _headers(auth: str) -> dict[str, str]:
    return {"Authorization": auth}


def _create_bot_for_user(user_id: int) -> int:
    db = TestingSessionLocal()
    try:
        bot = Bot(
            owner_id=user_id,
            title="CRM overview resilience bot",
            username=f"crm_overview_{uuid.uuid4().hex[:8]}",
            token=f"token_{uuid.uuid4().hex}",
            is_active=True,
            content={},
        )
        db.add(bot)
        db.commit()
        db.refresh(bot)
        return int(bot.id)
    finally:
        db.close()


def _seed_contacts(bot_id: int) -> int:
    db = TestingSessionLocal()
    try:
        ctor_id = ensure_ctor_bot_id(db, bot_id)
        assert ctor_id is not None
        now = datetime.now(timezone.utc)
        db.add_all(
            [
                CtorBotUser(
                    bot_id=ctor_id,
                    environment="prod",
                    channel="telegram",
                    external_user_id="p1",
                    first_name="Prod One",
                    status="active",
                    last_message_at=now,
                ),
                CtorBotUser(
                    bot_id=ctor_id,
                    environment="prod",
                    channel="telegram",
                    external_user_id="p2",
                    first_name="Prod Two",
                    status="active",
                    last_message_at=now,
                ),
                CtorBotUser(
                    bot_id=ctor_id,
                    environment="dev",
                    channel="preview",
                    external_user_id="d1",
                    first_name="Dev One",
                    status="active",
                    last_message_at=None,
                ),
            ]
        )
        db.commit()
        return ctor_id
    finally:
        db.close()


def test_crm_overview_happy_path_prod_dev_all(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    bot_id = _create_bot_for_user(user_id)
    _seed_contacts(bot_id)

    prod = client.get(f"/bots/{bot_id}/crm/overview?environment=prod", headers=_headers(auth))
    dev = client.get(f"/bots/{bot_id}/crm/overview?environment=dev", headers=_headers(auth))
    all_env = client.get(f"/bots/{bot_id}/crm/overview?environment=all", headers=_headers(auth))

    assert prod.status_code == 200, prod.text
    assert dev.status_code == 200, dev.text
    assert all_env.status_code == 200, all_env.text

    assert prod.json()["total_contacts"] == 2
    assert dev.json()["total_contacts"] == 1
    assert all_env.json()["total_contacts"] == 3


def test_crm_overview_missing_snapshot_builds_on_demand(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    bot_id = _create_bot_for_user(user_id)
    ctor_id = _seed_contacts(bot_id)

    db = TestingSessionLocal()
    try:
        db.query(CtorCrmOverviewAggregate).filter(
            CtorCrmOverviewAggregate.bot_id == ctor_id
        ).delete()
        db.commit()
    finally:
        db.close()

    res = client.get(f"/bots/{bot_id}/crm/overview?environment=prod", headers=_headers(auth))
    assert res.status_code == 200, res.text
    assert res.json()["total_contacts"] == 2


def test_crm_overview_environment_semantics_not_mixed(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    bot_id = _create_bot_for_user(user_id)
    _seed_contacts(bot_id)

    prod = client.get(f"/bots/{bot_id}/crm/overview?environment=prod", headers=_headers(auth))
    dev = client.get(f"/bots/{bot_id}/crm/overview?environment=dev", headers=_headers(auth))
    all_env = client.get(f"/bots/{bot_id}/crm/overview?environment=all", headers=_headers(auth))

    assert prod.status_code == 200, prod.text
    assert dev.status_code == 200, dev.text
    assert all_env.status_code == 200, all_env.text
    assert prod.json()["total_contacts"] + dev.json()["total_contacts"] == all_env.json()["total_contacts"]


def test_crm_statuses_summary_missing_snapshot_builds_on_demand(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    bot_id = _create_bot_for_user(user_id)
    ctor_id = _seed_contacts(bot_id)

    db = TestingSessionLocal()
    try:
        db.query(CtorCrmOverviewAggregate).filter(
            CtorCrmOverviewAggregate.bot_id == ctor_id
        ).delete()
        db.commit()
    finally:
        db.close()

    res = client.get(
        f"/bots/{bot_id}/crm/statuses/summary?environment=all",
        headers=_headers(auth),
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert isinstance(payload, dict)
    assert "contact_statuses" in payload
    assert "session_statuses" in payload


def test_preview_sync_noop_does_not_break_overview(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    bot_id = _create_bot_for_user(user_id)
    _seed_contacts(bot_id)

    sync_res = client.post(
        f"/bots/{bot_id}/crm/preview-sync",
        headers=_headers(auth),
        json={
            "external_user_id": "preview-noop-1",
            "channel": "preview",
            "variables": {},
            "tags": [],
            "status_patch": False,
        },
    )
    assert sync_res.status_code == 204, sync_res.text

    overview = client.get(f"/bots/{bot_id}/crm/overview?environment=all", headers=_headers(auth))
    assert overview.status_code == 200, overview.text
    assert overview.json()["total_contacts"] >= 3
