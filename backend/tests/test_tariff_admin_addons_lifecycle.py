"""Admin AddonPackage archive/restore/safe-delete/audit/RBAC (Этап 7.2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
)
from backend.models.tariff import (
    AdminAuditLog,
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.tariff_limits import get_user_tariff_limits
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


def _create(client, headers, **overrides):
    body = {
        "code": "adm_life",
        "name_ru": "Жизненный пакет",
        "description_ru": "desc",
        "type": "messages",
        "amount": 500,
        "price": "99.00",
        "currency": "RUB",
        "duration_type": "current_period",
        "validity_days": 30,
        "is_public": True,
        "sort_order": 70,
    }
    body.update(overrides)
    res = client.post("/api/admin/tariffs/addons", headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_archive_restore_does_not_change_public_or_entitlement(client, db):
    headers, uid = _auth_owner(client, db)
    row = _create(client, headers, code="adm_arch_ent", amount=400)
    addon_id = row["id"]
    now = datetime.now(timezone.utc)
    db.add(
        UserAddon(
            user_id=uid,
            addon_package_id=addon_id,
            amount=400,
            period_start=now - timedelta(days=1),
            period_end=now + timedelta(days=29),
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()

    before = get_user_tariff_limits(db, uid)
    before_msgs = before.messages_limit

    hide = client.post(
        f"/api/admin/tariffs/addons/{addon_id}/visibility",
        headers=headers,
        json={"is_public": False},
    )
    assert hide.status_code == 200
    assert hide.json()["is_public"] is False

    arch = client.post(f"/api/admin/tariffs/addons/{addon_id}/archive", headers=headers)
    assert arch.status_code == 200
    assert arch.json()["is_active"] is False
    assert arch.json()["is_public"] is False

    db.expire_all()
    after_arch = get_user_tariff_limits(db, uid)
    assert after_arch.messages_limit == before_msgs

    rest = client.post(
        f"/api/admin/tariffs/addons/{addon_id}/reactivate",
        headers=headers,
    )
    assert rest.status_code == 200
    assert rest.json()["is_active"] is True
    assert rest.json()["is_public"] is False

    db.expire_all()
    after_rest = get_user_tariff_limits(db, uid)
    assert after_rest.messages_limit == before_msgs


def test_unused_addon_can_delete(client, db):
    headers, uid = _auth_owner(client, db)
    row = _create(client, headers, code="adm_del_ok", is_public=False)
    addon_id = row["id"]
    assert row["can_delete"] is True

    res = client.delete(f"/api/admin/tariffs/addons/{addon_id}", headers=headers)
    assert res.status_code == 204, res.text
    assert db.query(AddonPackage).filter(AddonPackage.id == addon_id).first() is None

    logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "addon_package_deleted",
            AdminAuditLog.entity_id == addon_id,
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].admin_user_id == uid
    assert logs[0].old_value["code"] == "adm_del_ok"
    assert logs[0].new_value is None


def test_user_addon_and_checkout_block_delete(client, db):
    headers, uid = _auth_owner(client, db)
    owned = _create(client, headers, code="adm_del_ua")
    now = datetime.now(timezone.utc)
    db.add(
        UserAddon(
            user_id=uid,
            addon_package_id=owned["id"],
            amount=500,
            period_start=now - timedelta(days=1),
            period_end=now + timedelta(days=29),
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()

    listed = client.get("/api/admin/tariffs/addons", headers=headers)
    row = next(p for p in listed.json()["items"] if p["code"] == "adm_del_ua")
    assert row["can_delete"] is False
    assert row["has_references"] is True
    assert row["user_addon_count"] >= 1

    blocked = client.delete(
        f"/api/admin/tariffs/addons/{owned['id']}", headers=headers
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "addon_in_use"
    assert blocked.json()["detail"]["references"]["user_addons"] >= 1
    assert db.query(AddonPackage).filter(AddonPackage.id == owned["id"]).first() is not None

    chk = _create(client, headers, code="adm_del_chk")
    db.add(
        CheckoutIntent(
            user_id=uid,
            product_type=CheckoutProductType.ADDON.value,
            product_code="adm_del_chk",
            product_name="chk",
            amount=Decimal("99.00"),
            currency="RUB",
            status=CheckoutIntentStatus.PENDING.value,
            idempotency_key="adm-del-chk-1",
        )
    )
    db.commit()
    blocked_chk = client.delete(
        f"/api/admin/tariffs/addons/{chk['id']}", headers=headers
    )
    assert blocked_chk.status_code == 409
    assert blocked_chk.json()["detail"]["references"]["checkouts"] >= 1


def test_gift_blocks_delete(client, db):
    headers, uid = _auth_owner(client, db)
    row = _create(client, headers, code="adm_del_gift")
    now = datetime.now(timezone.utc)
    db.add(
        GiftGrant(
            target_user_id=uid,
            gift_type=GiftType.ADDON,
            addon_package_id=row["id"],
            amount=500,
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=10),
            granted_by_user_id=uid,
            status=GiftGrantStatus.ACTIVE,
            reason="test",
        )
    )
    db.commit()
    res = client.delete(f"/api/admin/tariffs/addons/{row['id']}", headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["references"]["gifts"] >= 1


def test_audit_journal_create_update_archive(client, db):
    headers, uid = _auth_owner(client, db)
    row = _create(client, headers, code="adm_audit_pkg")
    addon_id = row["id"]
    client.patch(
        f"/api/admin/tariffs/addons/{addon_id}",
        headers=headers,
        json={"amount": 800},
    )
    client.post(f"/api/admin/tariffs/addons/{addon_id}/archive", headers=headers)

    res = client.get("/api/admin/tariffs/addons/audit", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    actions = {i["action"] for i in items if i.get("addon_code") == "adm_audit_pkg"}
    assert "addon_package_created" in actions
    assert "addon_package_updated" in actions
    assert "addon_package_archived" in actions
    updated = next(
        i
        for i in items
        if i["action"] == "addon_package_updated" and i.get("addon_code") == "adm_audit_pkg"
    )
    fields = {c["field"] for c in updated["changes"]}
    assert "amount" in fields
    assert updated["admin_user_id"] == uid

    filtered = client.get(
        "/api/admin/tariffs/addons/audit",
        headers=headers,
        params={"action": "addon_package_created"},
    )
    assert filtered.status_code == 200
    assert all(i["action"] == "addon_package_created" for i in filtered.json()["items"])


def test_regular_user_forbidden_lifecycle(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    headers = {"Authorization": auth}
    assert client.get("/api/admin/tariffs/addons", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/admin/tariffs/addons",
            headers=headers,
            json={
                "code": "nope",
                "name_ru": "x",
                "type": "messages",
                "amount": 1,
                "price": "1",
            },
        ).status_code
        == 403
    )
    assert client.post("/api/admin/tariffs/addons/1/archive", headers=headers).status_code == 403
    assert client.delete("/api/admin/tariffs/addons/1", headers=headers).status_code == 403
    assert client.get("/api/admin/tariffs/addons/audit", headers=headers).status_code == 403
