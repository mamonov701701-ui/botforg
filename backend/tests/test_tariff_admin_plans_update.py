"""Admin PATCH /api/admin/tariffs/plans/{id} (Этап 7.1.2)."""
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
from backend.models.tariff import AdminAuditLog, UserSubscription
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


def _ensure_plan(db, *, code: str, **kwargs) -> Plan:
    plan = db.query(Plan).filter(Plan.code == code).first()
    defaults = {
        "name": code.title(),
        "name_ru": code,
        "description_ru": f"desc-{code}",
        "price_month": Decimal("100.00"),
        "currency": "RUB",
        "is_active": True,
        "is_public": True,
        "is_recommended": False,
        "sort_order": 50,
        "limits": {
            "monthly_messages": 500,
            "active_bots": 1,
            "max_bots": 1,
            "team_members": 0,
            "max_team_members": 0,
            "analytics_history_days": 7,
            "addon_purchase": False,
            "export_reports": False,
            "priority_support": False,
            "marketplace_access": True,
            "template_publish": True,
            "scenario_publish": True,
            "legacy_extra_flag": True,
        },
    }
    defaults.update(kwargs)
    if plan is None:
        plan = Plan(code=code, **defaults)
        db.add(plan)
    else:
        for k, v in defaults.items():
            setattr(plan, k, v)
    db.commit()
    db.refresh(plan)
    return plan


def test_admin_patch_name_description(client, db):
    headers, _ = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_name")
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"name": "New Name", "description_ru": "Новое описание", "name_ru": "Новое"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "New Name"
    assert body["name_ru"] == "Новое"
    assert body["description_ru"] == "Новое описание"
    assert body["code"] == "edit_name"


def test_admin_patch_price_keeps_checkout_amount_catalog_updates(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(
        db,
        code="edit_price",
        price_month=Decimal("100.00"),
        is_public=True,
        is_active=True,
    )
    now = datetime.now(timezone.utc)
    intent = CheckoutIntent(
        user_id=uid,
        product_type=CheckoutProductType.TARIFF.value,
        product_code=plan.code,
        product_name=plan.name_ru or plan.name,
        amount=Decimal("100.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key="admin-plan-price-chk",
        payment_provider="yookassa",
        paid_at=now,
        fulfilled_at=now,
    )
    db.add(intent)
    db.commit()
    intent_id = intent.id

    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"price_month": "250.00"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["price_month"] in ("250.00", "250.0", 250.0, "250")

    db.expire_all()
    intent2 = db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).one()
    assert Decimal(intent2.amount) == Decimal("100.00")

    catalog = client.get("/tariffs")
    assert catalog.status_code == 200
    row = next(p for p in catalog.json() if p["code"] == "edit_price")
    assert Decimal(str(row["price_month"])) == Decimal("250.00")


def test_admin_patch_limits_live_for_subscriber(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_limits", limits={
        "monthly_messages": 500,
        "active_bots": 1,
        "max_bots": 1,
        "team_members": 0,
        "max_team_members": 0,
        "analytics_history_days": 7,
        "addon_purchase": False,
        "export_reports": False,
        "priority_support": False,
        "marketplace_access": True,
        "template_publish": True,
        "scenario_publish": True,
        "legacy_extra_flag": True,
    })
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
    user = db.query(User).filter(User.id == uid).one()
    user.plan_code = plan.code
    db.commit()

    before = get_user_tariff_limits(db, uid)
    assert before.messages_limit == 500

    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"limits": {"monthly_messages": 777}},
    )
    assert res.status_code == 200, res.text
    assert res.json()["limits"]["monthly_messages"] == 777

    db.expire_all()
    plan2 = db.query(Plan).filter(Plan.id == plan.id).one()
    assert plan2.limits["monthly_messages"] == 777
    assert plan2.limits.get("legacy_extra_flag") is True  # preserved
    assert plan2.limits.get("max_bots") == 1

    after = get_user_tariff_limits(db, uid)
    assert after.messages_limit == 777


def test_partial_limits_syncs_aliases(client, db):
    headers, _ = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_alias")
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"limits": {"active_bots": 9, "team_members": 4}},
    )
    assert res.status_code == 200
    db.expire_all()
    plan2 = db.query(Plan).filter(Plan.id == plan.id).one()
    assert plan2.limits["active_bots"] == 9
    assert plan2.limits["max_bots"] == 9
    assert plan2.limits["team_members"] == 4
    assert plan2.limits["max_team_members"] == 4
    assert plan2.limits.get("legacy_extra_flag") is True


def test_negative_limits_rejected(client, db):
    headers, _ = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_neg")
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"limits": {"monthly_messages": -1}},
    )
    assert res.status_code == 422


def test_regular_user_cannot_patch(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    plan = _ensure_plan(db, code="edit_forbid")
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers={"Authorization": auth},
        json={"name": "Hack"},
    )
    assert res.status_code == 403


def test_code_immutable_extra_forbid(client, db):
    headers, _ = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_code")
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"code": "hacked", "name": "Still Ok"},
    )
    assert res.status_code == 422
    db.expire_all()
    assert db.query(Plan).filter(Plan.id == plan.id).one().code == "edit_code"


def test_audit_created_with_before_after(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_audit", price_month=Decimal("10.00"))
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"price_month": "20.00", "is_recommended": True},
    )
    assert res.status_code == 200
    logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "tariff_plan_updated",
            AdminAuditLog.entity_type == "plan",
            AdminAuditLog.entity_id == plan.id,
        )
        .all()
    )
    assert len(logs) >= 1
    log = logs[-1]
    assert log.admin_user_id == uid
    assert log.old_value["price_month"] in ("10.00", "10.0", "10")
    assert log.new_value["price_month"] in ("20.00", "20.0", "20")
    assert "price_month" in log.new_value["changed_fields"]
    assert "is_recommended" in log.new_value["changed_fields"]


def test_noop_patch_no_audit(client, db):
    headers, _ = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_noop", name="Same")
    before_count = db.query(AdminAuditLog).filter(
        AdminAuditLog.action == "tariff_plan_updated",
        AdminAuditLog.entity_id == plan.id,
    ).count()
    res = client.patch(
        f"/api/admin/tariffs/plans/{plan.id}",
        headers=headers,
        json={"name": "Same"},
    )
    assert res.status_code == 200
    after_count = db.query(AdminAuditLog).filter(
        AdminAuditLog.action == "tariff_plan_updated",
        AdminAuditLog.entity_id == plan.id,
    ).count()
    assert after_count == before_count


def test_list_includes_subscription_count(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(db, code="edit_subcnt")
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
    res = client.get("/api/admin/tariffs/plans", headers=headers)
    assert res.status_code == 200
    row = next(p for p in res.json()["items"] if p["code"] == "edit_subcnt")
    assert row["subscription_count"] == 1
    assert row["has_references"] is True
    assert row["can_delete"] is False
