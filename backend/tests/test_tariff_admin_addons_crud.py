"""Admin AddonPackage catalog: list, create, validation, update (Этап 7.2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _promote(db, user_id: int, role: str = "owner") -> None:
    user = db.query(User).filter(User.id == user_id).one()
    user.role = role
    db.commit()


def _auth_owner(client, db):
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    _promote(db, uid, "owner")
    return {"Authorization": auth}, uid


def _payload(**overrides):
    body = {
        "code": "adm_msg_100",
        "name_ru": "1000 сообщений",
        "description_ru": "Тестовый пакет",
        "type": "messages",
        "amount": 1000,
        "price": "199.00",
        "currency": "RUB",
        "duration_type": "current_period",
        "validity_days": 30,
        "is_public": True,
        "sort_order": 80,
    }
    body.update(overrides)
    return body


def test_admin_lists_all_addons_including_hidden_inactive(client, db):
    headers, _ = _auth_owner(client, db)
    hidden = AddonPackage(
        code="adm_hidden_list",
        name_ru="Скрытый",
        type=AddonPackageType.MESSAGES,
        amount=10,
        price=Decimal("1.00"),
        currency="RUB",
        duration_type="current_period",
        validity_days=30,
        is_active=True,
        is_public=False,
        sort_order=900,
    )
    archived = AddonPackage(
        code="adm_arch_list",
        name_ru="Архив",
        type=AddonPackageType.ACTIVE_BOT,
        amount=1,
        price=Decimal("2.00"),
        currency="RUB",
        duration_type="current_period",
        validity_days=30,
        is_active=False,
        is_public=True,
        sort_order=901,
    )
    db.add_all([hidden, archived])
    db.commit()

    res = client.get("/api/admin/tariffs/addons", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    codes = {row["code"] for row in items}
    assert "adm_hidden_list" in codes
    assert "adm_arch_list" in codes
    hidden_row = next(r for r in items if r["code"] == "adm_hidden_list")
    assert hidden_row["is_public"] is False
    assert hidden_row["is_active"] is True
    arch_row = next(r for r in items if r["code"] == "adm_arch_list")
    assert arch_row["is_active"] is False
    assert "can_delete" in hidden_row
    assert "has_references" in hidden_row
    assert "user_addon_count" in hidden_row


def test_regular_user_forbidden_list(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    res = client.get("/api/admin/tariffs/addons", headers={"Authorization": auth})
    assert res.status_code == 403


def test_create_messages_bots_alias_and_ai_credits(client, db):
    headers, _uid = _auth_owner(client, db)

    msg = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_create_msg"),
    )
    assert msg.status_code == 201, msg.text
    assert msg.json()["type"] == "messages"
    assert msg.json()["is_active"] is True
    assert msg.json()["amount"] == 1000
    assert msg.json()["validity_days"] == 30

    bots = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(
            code="adm_create_bots",
            name_ru="+1 бот",
            type="bots",
            amount=1,
            price="490.00",
        ),
    )
    assert bots.status_code == 201, bots.text
    assert bots.json()["type"] == "active_bot"

    team = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(
            code="adm_create_team",
            name_ru="+1 участник",
            type="team_member",
            amount=1,
            price="290.00",
        ),
    )
    assert team.status_code == 201, team.text
    assert team.json()["type"] == "team_member"

    ai = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(
            code="adm_create_ai",
            name_ru="ИИ-кредиты (каталог)",
            type="ai_credits",
            amount=100,
            price="0.00",
            is_public=True,
        ),
    )
    assert ai.status_code == 201, ai.text
    assert ai.json()["type"] == "ai_credits"

    public = client.get("/addons")
    assert public.status_code == 200
    public_codes = {row["code"] for row in public.json()}
    assert "adm_create_msg" in public_codes
    assert "adm_create_bots" in public_codes
    assert "adm_create_ai" not in public_codes

    detail = client.get(f"/api/admin/tariffs/addons/{ai.json()['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["type"] == "ai_credits"


def test_create_validation_and_duplicate_code(client, db):
    headers, _ = _auth_owner(client, db)
    ok = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_dup"),
    )
    assert ok.status_code == 201

    dup = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_dup"),
    )
    assert dup.status_code == 409
    assert dup.json()["detail"]["code"] == "addon_code_exists"

    bad_type = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_bad_type", type="tokens"),
    )
    assert bad_type.status_code == 422

    bad_amount = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_bad_amt", amount=0),
    )
    assert bad_amount.status_code == 422

    bad_price = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_bad_price", price="-1"),
    )
    assert bad_price.status_code == 422

    bad_code = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="Bad Code!"),
    )
    assert bad_code.status_code == 422


def test_update_price_amount_public_hidden_and_immutable_code(client, db):
    headers, _ = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_upd", amount=500, price="100.00"),
    )
    assert created.status_code == 201
    addon_id = created.json()["id"]

    patched = client.patch(
        f"/api/admin/tariffs/addons/{addon_id}",
        headers=headers,
        json={"amount": 750, "price": "150.00", "name_ru": "750 сообщений"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["amount"] == 750
    assert Decimal(str(patched.json()["price"])) == Decimal("150.00")
    assert patched.json()["name_ru"] == "750 сообщений"

    hide = client.post(
        f"/api/admin/tariffs/addons/{addon_id}/visibility",
        headers=headers,
        json={"is_public": False},
    )
    assert hide.status_code == 200
    assert hide.json()["is_public"] is False
    assert hide.json()["is_active"] is True

    public = {row["code"] for row in client.get("/addons").json()}
    assert "adm_upd" not in public

    pub = client.post(
        f"/api/admin/tariffs/addons/{addon_id}/visibility",
        headers=headers,
        json={"is_public": True},
    )
    assert pub.status_code == 200
    assert pub.json()["is_public"] is True

    immutable = client.patch(
        f"/api/admin/tariffs/addons/{addon_id}",
        headers=headers,
        json={"code": "other_code"},
    )
    assert immutable.status_code == 422


def test_type_change_allowed_without_refs_frozen_with_user_addon(client, db):
    headers, uid = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json=_payload(code="adm_type_free", type="messages"),
    )
    addon_id = created.json()["id"]
    switched = client.patch(
        f"/api/admin/tariffs/addons/{addon_id}",
        headers=headers,
        json={"type": "active_bot", "amount": 1},
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["type"] == "active_bot"

    now = datetime.now(timezone.utc)
    db.add(
        UserAddon(
            user_id=uid,
            addon_package_id=addon_id,
            amount=1,
            period_start=now - timedelta(days=1),
            period_end=now + timedelta(days=29),
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()

    frozen = client.patch(
        f"/api/admin/tariffs/addons/{addon_id}",
        headers=headers,
        json={"type": "messages"},
    )
    assert frozen.status_code == 409
    assert frozen.json()["detail"]["code"] == "addon_type_frozen"
    stored = db.query(AddonPackage).filter(AddonPackage.id == addon_id).one()
    stored_type = stored.type.value if hasattr(stored.type, "value") else str(stored.type)
    assert stored_type == "active_bot"


def test_reserved_custom_messages_excluded_and_locked(client, db):
    from backend.services.addon_custom_pack import CUSTOM_MESSAGES_CODE, ensure_custom_messages_package

    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    _promote(db, uid)
    headers = {"Authorization": token}

    pkg = ensure_custom_messages_package(db)
    db.commit()
    db.refresh(pkg)

    listed = client.get("/api/admin/tariffs/addons", headers=headers)
    assert listed.status_code == 200
    codes = {r["code"] for r in listed.json()["items"]}
    assert CUSTOM_MESSAGES_CODE not in codes

    create = client.post(
        "/api/admin/tariffs/addons",
        headers=headers,
        json={
            "code": CUSTOM_MESSAGES_CODE,
            "name_ru": "Hack",
            "type": "messages",
            "amount": 1,
            "price": "1.00",
            "currency": "RUB",
            "validity_days": 30,
        },
    )
    assert create.status_code == 409
    assert create.json()["detail"]["code"] == "reserved_addon_code"

    get = client.get(f"/api/admin/tariffs/addons/{pkg.id}", headers=headers)
    assert get.status_code == 409
    assert get.json()["detail"]["code"] == "system_addon_locked"

    for path, method in (
        (f"/api/admin/tariffs/addons/{pkg.id}", "patch"),
        (f"/api/admin/tariffs/addons/{pkg.id}/visibility", "post"),
        (f"/api/admin/tariffs/addons/{pkg.id}/archive", "post"),
        (f"/api/admin/tariffs/addons/{pkg.id}/reactivate", "post"),
    ):
        if method == "patch":
            res = client.patch(path, headers=headers, json={"name_ru": "x"})
        elif "visibility" in path:
            res = client.post(path, headers=headers, json={"is_public": False})
        else:
            res = client.post(path, headers=headers)
        assert res.status_code == 409, path
        assert res.json()["detail"]["code"] == "system_addon_locked"

    deleted = client.delete(f"/api/admin/tariffs/addons/{pkg.id}", headers=headers)
    assert deleted.status_code == 409
    assert deleted.json()["detail"]["code"] == "system_addon_locked"
