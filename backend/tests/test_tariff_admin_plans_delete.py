"""Admin DELETE /api/admin/tariffs/plans/{id} (Этап 7.1.4)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
)
from backend.models.plan import Plan
from backend.models.tariff import (
    AdminAuditLog,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    UserSubscription,
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


def _make_unused_plan(db, *, code: str = "test_delete_unused") -> Plan:
    existing = db.query(Plan).filter(Plan.code == code).first()
    if existing:
        db.delete(existing)
        db.commit()
    plan = Plan(
        code=code,
        name="Delete Me",
        name_ru="Удалить меня",
        description_ru="temp",
        price_month=Decimal("10.00"),
        currency="RUB",
        is_active=True,
        is_public=False,
        is_recommended=False,
        sort_order=900,
        limits={
            "monthly_messages": 100,
            "active_bots": 1,
            "max_bots": 1,
            "team_members": 0,
            "max_team_members": 0,
            "addon_purchase": False,
        },
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def test_unused_plan_can_delete_and_deletes(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _make_unused_plan(db, code="test_delete_unused")
    plan_id = plan.id

    listed = client.get("/api/admin/tariffs/plans", headers=headers)
    assert listed.status_code == 200
    row = next(p for p in listed.json()["items"] if p["code"] == "test_delete_unused")
    assert row["can_delete"] is True

    res = client.delete(f"/api/admin/tariffs/plans/{plan_id}", headers=headers)
    assert res.status_code == 204, res.text

    assert db.query(Plan).filter(Plan.id == plan_id).first() is None
    assert not any(
        p["code"] == "test_delete_unused"
        for p in client.get("/api/admin/tariffs/plans", headers=headers).json()["items"]
    )
    assert not any(p["code"] == "test_delete_unused" for p in client.get("/tariffs").json())

    logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "tariff_plan_deleted",
            AdminAuditLog.entity_id == plan_id,
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].admin_user_id == uid
    assert logs[0].new_value is None
    assert logs[0].old_value["code"] == "test_delete_unused"
    assert logs[0].old_value["limits"]["monthly_messages"] == 100


def test_subscription_blocks_delete(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _make_unused_plan(db, code="del_sub_block")
    now = datetime.now(timezone.utc)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan.id,
            status="active",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
            auto_renew=True,
        )
    )
    db.commit()

    res = client.delete(f"/api/admin/tariffs/plans/{plan.id}", headers=headers)
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "plan_in_use"
    assert detail["references"]["subscriptions"] >= 1
    assert db.query(Plan).filter(Plan.code == "del_sub_block").first() is not None


def test_gift_checkout_legacy_block_and_counts(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _make_unused_plan(db, code="del_multi_ref")
    now = datetime.now(timezone.utc)

    db.add(
        GiftGrant(
            target_user_id=uid,
            gift_type=GiftType.PLAN,
            plan_id=plan.id,
            amount=None,
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=10),
            granted_by_user_id=uid,
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.add(
        CheckoutIntent(
            user_id=uid,
            product_type=CheckoutProductType.TARIFF.value,
            product_code=plan.code,
            product_name="x",
            amount=Decimal("10.00"),
            currency="RUB",
            status=CheckoutIntentStatus.FULFILLED.value,
            idempotency_key="del-multi-chk",
            payment_provider="yookassa",
            paid_at=now,
            fulfilled_at=now,
        )
    )
    user = db.query(User).filter(User.id == uid).one()
    user.plan_code = plan.code
    db.commit()

    res = client.delete(f"/api/admin/tariffs/plans/{plan.id}", headers=headers)
    assert res.status_code == 409
    refs = res.json()["detail"]["references"]
    assert refs["gifts"] >= 1
    assert refs["checkouts"] >= 1
    assert refs["legacy_users"] >= 1
    assert db.query(Plan).filter(Plan.code == "del_multi_ref").first() is not None


def test_legacy_plan_code_alone_blocks(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _make_unused_plan(db, code="del_legacy_only")
    user = db.query(User).filter(User.id == uid).one()
    user.plan_code = "del_legacy_only"
    db.commit()

    res = client.delete(f"/api/admin/tariffs/plans/{plan.id}", headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["references"]["legacy_users"] >= 1


def test_ordinary_user_forbidden_delete(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    plan = _make_unused_plan(db, code="del_forbid")
    res = client.delete(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    assert db.query(Plan).filter(Plan.code == "del_forbid").first() is not None


def test_race_recheck_blocks_when_reference_appears(client, db):
    """Simulate race: list says can_delete, then subscription appears before DELETE."""
    headers, uid = _auth_owner(client, db)
    plan = _make_unused_plan(db, code="del_race")
    listed = client.get("/api/admin/tariffs/plans", headers=headers)
    row = next(p for p in listed.json()["items"] if p["code"] == "del_race")
    assert row["can_delete"] is True

    now = datetime.now(timezone.utc)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan.id,
            status="active",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
            auto_renew=True,
        )
    )
    db.commit()

    res = client.delete(f"/api/admin/tariffs/plans/{plan.id}", headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "plan_in_use"
    assert db.query(Plan).filter(Plan.code == "del_race").first() is not None
