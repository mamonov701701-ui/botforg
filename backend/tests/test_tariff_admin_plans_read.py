"""Admin GET /api/admin/tariffs/plans (Этап 7.1.1)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.plan import Plan
from backend.models.tariff import UserSubscription
from backend.models.user import User
from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
)
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token
from datetime import datetime, timedelta, timezone


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
    if plan is None:
        plan = Plan(
            code=code,
            name=kwargs.get("name", code.title()),
            name_ru=kwargs.get("name_ru", code),
            description_ru=kwargs.get("description_ru"),
            price_month=kwargs.get("price_month", Decimal("0.00")),
            currency="RUB",
            is_active=kwargs.get("is_active", True),
            is_public=kwargs.get("is_public", True),
            is_recommended=kwargs.get("is_recommended", False),
            sort_order=kwargs.get("sort_order", 0),
            limits=kwargs.get(
                "limits",
                {
                    "monthly_messages": 500,
                    "active_bots": 1,
                    "team_members": 0,
                    "addon_purchase": False,
                },
            ),
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan
    for k, v in kwargs.items():
        setattr(plan, k, v)
    db.commit()
    db.refresh(plan)
    return plan


def test_admin_lists_all_plans_including_hidden_inactive_legacy(client, db):
    headers, _ = _auth_owner(client, db)
    _ensure_plan(
        db,
        code="hidden_test",
        name="Hidden",
        name_ru="Скрытый",
        is_public=False,
        is_active=True,
        sort_order=99,
        price_month=Decimal("10.00"),
    )
    _ensure_plan(
        db,
        code="archived_test",
        name="Archived",
        name_ru="Архив",
        is_public=True,
        is_active=False,
        sort_order=100,
        price_month=None,
    )
    for code in ("free", "pro", "developer"):
        _ensure_plan(db, code=code, sort_order=200)

    res = client.get("/api/admin/tariffs/plans", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == len(body["items"])
    codes = [p["code"] for p in body["items"]]
    assert "hidden_test" in codes
    assert "archived_test" in codes
    assert "free" in codes
    assert "pro" in codes
    assert "developer" in codes

    by_code = {p["code"]: p for p in body["items"]}
    assert by_code["hidden_test"]["is_public"] is False
    assert by_code["archived_test"]["is_active"] is False
    assert by_code["archived_test"]["price_month"] is None

    # stable sort: sort_order then code
    orders = [(p["sort_order"], p["code"]) for p in body["items"]]
    assert orders == sorted(orders)

    # no sensitive leakage
    blob = res.text.lower()
    assert "password" not in blob
    assert "secret" not in blob
    assert "token" not in blob


def test_admin_plans_limits_canonical(client, db):
    headers, _ = _auth_owner(client, db)
    _ensure_plan(
        db,
        code="biz_limits",
        name="Biz",
        name_ru="Бизнес тест",
        sort_order=50,
        price_month=Decimal("990.00"),
        limits={
            "monthly_messages": 3000,
            "max_bots": 5,
            "max_team_members": 3,
            "analytics_history_days": 30,
            "addon_purchase": True,
            "export_reports": False,
            "priority_support": True,
            "marketplace_access": True,
            "template_publish": True,
            "scenario_publish": True,
        },
    )
    res = client.get("/api/admin/tariffs/plans", headers=headers)
    assert res.status_code == 200
    plan = next(p for p in res.json()["items"] if p["code"] == "biz_limits")
    lim = plan["limits"]
    assert lim["monthly_messages"] == 3000
    assert lim["active_bots"] == 5  # from max_bots alias
    assert lim["team_members"] == 3
    assert lim["addon_purchase"] is True
    assert "max_bots" not in lim
    assert "max_team_members" not in lim


def test_regular_user_forbidden(client, db):
    # Первый зарегистрированный пользователь получает role=owner — decoy.
    register_and_get_token(client)
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    res = client.get("/api/admin/tariffs/plans", headers={"Authorization": auth})
    assert res.status_code == 403


def test_can_delete_false_when_subscription_references(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(
        db,
        code="ref_sub",
        name="Ref Sub",
        sort_order=80,
        price_month=Decimal("100.00"),
    )
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
    row = next(p for p in res.json()["items"] if p["code"] == "ref_sub")
    assert row["has_references"] is True
    assert row["can_delete"] is False


def test_can_delete_false_when_checkout_or_legacy(client, db):
    headers, uid = _auth_owner(client, db)
    plan = _ensure_plan(
        db,
        code="ref_chk",
        name="Ref Chk",
        sort_order=81,
        price_month=Decimal("50.00"),
    )
    now = datetime.now(timezone.utc)
    db.add(
        CheckoutIntent(
            user_id=uid,
            product_type=CheckoutProductType.TARIFF.value,
            product_code=plan.code,
            product_name=plan.name_ru or plan.name,
            amount=Decimal("50.00"),
            currency="RUB",
            status=CheckoutIntentStatus.FULFILLED.value,
            idempotency_key="admin-plan-ref-chk",
            payment_provider="yookassa",
            paid_at=now,
            fulfilled_at=now,
        )
    )
    user = db.query(User).filter(User.id == uid).one()
    user.plan_code = "legacy_only"
    db.commit()

    _ensure_plan(
        db,
        code="legacy_only",
        name="Legacy Only",
        sort_order=82,
        price_month=Decimal("0"),
    )

    res = client.get("/api/admin/tariffs/plans", headers=headers)
    assert res.status_code == 200
    by_code = {p["code"]: p for p in res.json()["items"]}
    assert by_code["ref_chk"]["has_references"] is True
    assert by_code["ref_chk"]["can_delete"] is False
    assert by_code["legacy_only"]["has_references"] is True
    assert by_code["legacy_only"]["can_delete"] is False


def test_can_delete_true_without_references(client, db):
    headers, _ = _auth_owner(client, db)
    _ensure_plan(
        db,
        code="orphan_plan",
        name="Orphan",
        sort_order=300,
        price_month=Decimal("1.00"),
        is_public=False,
    )
    res = client.get("/api/admin/tariffs/plans", headers=headers)
    row = next(p for p in res.json()["items"] if p["code"] == "orphan_plan")
    assert row["has_references"] is False
    assert row["can_delete"] is True
