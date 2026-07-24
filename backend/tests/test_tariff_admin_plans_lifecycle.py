"""Admin create / visibility / archive Plan (Этап 7.1.3)."""
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


def _create_payload(**overrides):
    body = {
        "code": "life_test_a",
        "name": "Life Test",
        "name_ru": "Жизненный тест",
        "description_ru": "desc",
        "price_month": "150.00",
        "currency": "RUB",
        "is_public": True,
        "is_recommended": False,
        "sort_order": 55,
        "limits": {
            "monthly_messages": 800,
            "active_bots": 2,
            "team_members": 1,
            "analytics_history_days": 14,
            "addon_purchase": True,
            "export_reports": False,
            "priority_support": False,
            "marketplace_access": True,
            "template_publish": True,
            "scenario_publish": True,
        },
    }
    body.update(overrides)
    return body


def test_create_plan_and_audit(client, db):
    headers, uid = _auth_owner(client, db)
    res = client.post("/api/admin/tariffs/plans", headers=headers, json=_create_payload())
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["code"] == "life_test_a"
    assert body["is_active"] is True
    assert body["limits"]["monthly_messages"] == 800
    assert body["limits"]["active_bots"] == 2

    db.expire_all()
    plan = db.query(Plan).filter(Plan.code == "life_test_a").one()
    assert plan.limits["max_bots"] == 2
    assert plan.limits["max_team_members"] == 1
    assert plan.is_active is True

    logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "tariff_plan_created",
            AdminAuditLog.entity_id == plan.id,
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].admin_user_id == uid
    assert logs[0].old_value is None
    assert logs[0].new_value["code"] == "life_test_a"

    catalog = client.get("/tariffs")
    assert any(p["code"] == "life_test_a" for p in catalog.json())


def test_duplicate_and_invalid_code(client, db):
    headers, _ = _auth_owner(client, db)
    assert (
        client.post(
            "/api/admin/tariffs/plans", headers=headers, json=_create_payload(code="dup_x")
        ).status_code
        == 201
    )
    dup = client.post(
        "/api/admin/tariffs/plans", headers=headers, json=_create_payload(code="dup_x")
    )
    assert dup.status_code == 409

    bad = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json=_create_payload(code="Bad Code!"),
    )
    assert bad.status_code == 422

    cyr = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json=_create_payload(code="тариф"),
    )
    assert cyr.status_code == 422


def test_hide_publish_archive_reactivate_catalog_and_checkout(client, db):
    headers, uid = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json=_create_payload(code="life_vis", price_month="200.00"),
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]

    # existing checkout snapshot
    now = datetime.now(timezone.utc)
    intent = CheckoutIntent(
        user_id=uid,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="life_vis",
        product_name="Жизненный тест",
        amount=Decimal("200.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key="life-vis-chk",
        payment_provider="yookassa",
        paid_at=now,
        fulfilled_at=now,
    )
    db.add(intent)
    db.commit()
    intent_id = intent.id

    # hide
    hide = client.post(
        f"/api/admin/tariffs/plans/{plan_id}/visibility",
        headers=headers,
        json={"is_public": False},
    )
    assert hide.status_code == 200
    assert hide.json()["is_public"] is False
    assert not any(p["code"] == "life_vis" for p in client.get("/tariffs").json())

    # publish back
    pub = client.post(
        f"/api/admin/tariffs/plans/{plan_id}/visibility",
        headers=headers,
        json={"is_public": True},
    )
    assert pub.status_code == 200
    assert any(p["code"] == "life_vis" for p in client.get("/tariffs").json())

    # archive
    arch = client.post(f"/api/admin/tariffs/plans/{plan_id}/archive", headers=headers)
    assert arch.status_code == 200
    assert arch.json()["is_active"] is False
    assert arch.json()["is_public"] is True  # unchanged
    assert not any(p["code"] == "life_vis" for p in client.get("/tariffs").json())

    # new checkout rejected
    chk = client.post(
        "/me/checkout-intents",
        headers=headers,
        json={
            "product_type": "tariff",
            "code": "life_vis",
            "idempotency_key": "life-vis-new-chk",
        },
    )
    assert chk.status_code == 404

    # existing intent amount unchanged
    db.expire_all()
    intent2 = db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).one()
    assert Decimal(intent2.amount) == Decimal("200.00")

    # reactivate while public → back in catalog
    react = client.post(f"/api/admin/tariffs/plans/{plan_id}/reactivate", headers=headers)
    assert react.status_code == 200
    assert react.json()["is_active"] is True
    assert any(p["code"] == "life_vis" for p in client.get("/tariffs").json())

    # hide then archive then reactivate → still hidden
    client.post(
        f"/api/admin/tariffs/plans/{plan_id}/visibility",
        headers=headers,
        json={"is_public": False},
    )
    client.post(f"/api/admin/tariffs/plans/{plan_id}/archive", headers=headers)
    client.post(f"/api/admin/tariffs/plans/{plan_id}/reactivate", headers=headers)
    assert not any(p["code"] == "life_vis" for p in client.get("/tariffs").json())

    audits = {
        row.action
        for row in db.query(AdminAuditLog)
        .filter(AdminAuditLog.entity_id == plan_id, AdminAuditLog.entity_type == "plan")
        .all()
    }
    assert "tariff_plan_created" in audits
    assert "tariff_plan_hidden" in audits
    assert "tariff_plan_published" in audits
    assert "tariff_plan_archived" in audits
    assert "tariff_plan_reactivated" in audits


def test_archive_keeps_subscriber_limits(client, db):
    headers, uid = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json=_create_payload(
            code="life_sub",
            limits={
                "monthly_messages": 1234,
                "active_bots": 3,
                "team_members": 2,
                "analytics_history_days": 10,
                "addon_purchase": False,
            },
        ),
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]
    now = datetime.now(timezone.utc)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan_id,
            status="active",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
            auto_renew=True,
        )
    )
    db.commit()

    before = get_user_tariff_limits(db, uid)
    assert before.messages_limit == 1234
    assert before.active_bots_limit == 3

    arch = client.post(f"/api/admin/tariffs/plans/{plan_id}/archive", headers=headers)
    assert arch.status_code == 200

    db.expire_all()
    after = get_user_tariff_limits(db, uid)
    assert after.messages_limit == 1234
    assert after.active_bots_limit == 3
    assert after.plan_code == "life_sub"


def test_lifecycle_noop_no_extra_audit(client, db):
    headers, _ = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json=_create_payload(code="life_noop"),
    )
    plan_id = created.json()["id"]
    before = db.query(AdminAuditLog).filter(AdminAuditLog.entity_id == plan_id).count()

    # already public
    r1 = client.post(
        f"/api/admin/tariffs/plans/{plan_id}/visibility",
        headers=headers,
        json={"is_public": True},
    )
    assert r1.status_code == 200
    # already active — reactivate no-op
    r2 = client.post(f"/api/admin/tariffs/plans/{plan_id}/reactivate", headers=headers)
    assert r2.status_code == 200

    after = db.query(AdminAuditLog).filter(AdminAuditLog.entity_id == plan_id).count()
    assert after == before  # only create


def test_regular_user_forbidden_lifecycle(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    headers = {"Authorization": auth}
    assert (
        client.post("/api/admin/tariffs/plans", headers=headers, json=_create_payload()).status_code
        == 403
    )
    assert client.post("/api/admin/tariffs/plans/1/archive", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/admin/tariffs/plans/1/visibility",
            headers=headers,
            json={"is_public": False},
        ).status_code
        == 403
    )
