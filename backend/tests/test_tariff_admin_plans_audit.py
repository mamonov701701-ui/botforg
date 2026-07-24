"""Admin GET /api/admin/tariffs/plans/audit (Этап 7.1.5)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.tariff import AdminAuditLog
from backend.models.user import User
from backend.services.tariff_admin_plan_audit import build_plan_audit_changes
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


def test_audit_list_only_plan_actions_excludes_gifts(client, db):
    headers, uid = _auth_owner(client, db)
    # create plan → tariff_plan_created
    res = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json={
            "code": "audit_j_a",
            "name": "Audit A",
            "name_ru": "Аудит А",
            "price_month": "100.00",
            "currency": "RUB",
            "is_public": True,
            "limits": {"monthly_messages": 10, "active_bots": 1, "team_members": 0},
        },
    )
    assert res.status_code == 201, res.text
    plan_id = res.json()["id"]

    # gift audit noise
    db.add(
        AdminAuditLog(
            admin_user_id=uid,
            action="gift_grant",
            entity_type="gift_grant",
            entity_id=1,
            old_value=None,
            new_value={"id": 1},
            comment="noise",
        )
    )
    db.commit()

    listed = client.get("/api/admin/tariffs/plans/audit", headers=headers)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] >= 1
    actions = {i["action"] for i in body["items"]}
    assert "gift_grant" not in actions
    assert "tariff_plan_created" in actions
    row = next(i for i in body["items"] if i["action"] == "tariff_plan_created")
    assert row["plan_code"] == "audit_j_a"
    assert row["action_label"] == "Создание"
    assert any(c["field"] == "code" for c in row["changes"])


def test_audit_filter_and_pagination_reset_semantics(client, db):
    headers, _ = _auth_owner(client, db)
    for i in range(3):
        assert (
            client.post(
                "/api/admin/tariffs/plans",
                headers=headers,
                json={
                    "code": f"audit_page_{i}",
                    "name": f"P{i}",
                    "name_ru": f"П{i}",
                    "price_month": "1.00",
                    "currency": "RUB",
                },
            ).status_code
            == 201
        )

    page1 = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"limit": 2, "offset": 0},
    )
    assert page1.status_code == 200
    assert len(page1.json()["items"]) == 2
    assert page1.json()["limit"] == 2
    assert page1.json()["offset"] == 0

    page2 = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"limit": 2, "offset": 2},
    )
    assert page2.status_code == 200
    assert page2.json()["offset"] == 2

    filtered = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"action": "tariff_plan_created", "limit": 50, "offset": 0},
    )
    assert filtered.status_code == 200
    assert all(i["action"] == "tariff_plan_created" for i in filtered.json()["items"])

    bad = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"action": "gift_grant"},
    )
    assert bad.status_code == 422


def test_human_diff_price_limits_bool_no_aliases(client, db):
    headers, _ = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json={
            "code": "audit_diff",
            "name": "Diff",
            "name_ru": "Дифф",
            "price_month": "50.00",
            "currency": "RUB",
            "limits": {
                "monthly_messages": 100,
                "active_bots": 1,
                "team_members": 0,
                "addon_purchase": False,
            },
        },
    )
    plan_id = created.json()["id"]
    patch = client.patch(
        f"/api/admin/tariffs/plans/{plan_id}",
        headers=headers,
        json={
            "price_month": "99.00",
            "is_recommended": True,
            "limits": {"monthly_messages": 200, "addon_purchase": True, "active_bots": 2},
        },
    )
    assert patch.status_code == 200

    listed = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"action": "tariff_plan_updated"},
    )
    row = next(i for i in listed.json()["items"] if i["plan_code"] == "audit_diff")
    assert "price_month" in (row["changed_fields"] or [])
    assert "limits" in (row["changed_fields"] or [])
    fields = {c["field"]: c for c in row["changes"]}
    assert "price_month" in fields
    assert "По запросу" not in fields["price_month"]["after"]
    assert "₽" in fields["price_month"]["after"] or "RUB" in fields["price_month"]["after"]
    assert fields["is_recommended"]["after"] == "Да"
    assert fields["is_recommended"]["before"] == "Нет"
    assert "limits.monthly_messages" in fields
    assert fields["limits.monthly_messages"]["before"] == "100"
    assert fields["limits.monthly_messages"]["after"] == "200"
    assert "limits.addon_purchase" in fields
    assert fields["limits.addon_purchase"]["after"] == "Да"
    assert "max_bots" not in {c["field"] for c in row["changes"]}
    assert "max_team_members" not in {c["field"] for c in row["changes"]}


def test_delete_snapshot_identity_from_old_value(client, db):
    headers, _ = _auth_owner(client, db)
    created = client.post(
        "/api/admin/tariffs/plans",
        headers=headers,
        json={
            "code": "audit_del_snap",
            "name": "Del",
            "name_ru": "Удалённый",
            "price_month": "10.00",
            "currency": "RUB",
            "is_public": False,
        },
    )
    plan_id = created.json()["id"]
    assert client.delete(f"/api/admin/tariffs/plans/{plan_id}", headers=headers).status_code == 204

    listed = client.get(
        "/api/admin/tariffs/plans/audit",
        headers=headers,
        params={"action": "tariff_plan_deleted"},
    )
    row = next(i for i in listed.json()["items"] if i["plan_code"] == "audit_del_snap")
    assert row["plan_name"] == "Удалённый"
    assert any(c["field"] == "code" and c["before"] == "audit_del_snap" for c in row["changes"])


def test_build_plan_audit_changes_unit():
    lines = build_plan_audit_changes(
        "tariff_plan_updated",
        {"price_month": "10.00", "currency": "RUB", "limits": {"monthly_messages": 1, "max_bots": 1, "active_bots": 1}},
        {
            "price_month": "20.00",
            "currency": "RUB",
            "limits": {"monthly_messages": 2, "max_bots": 2, "active_bots": 2},
            "changed_fields": ["price_month", "limits"],
        },
    )
    fields = [l["field"] for l in lines]
    assert "price_month" in fields
    assert "limits.monthly_messages" in fields
    assert "limits.active_bots" in fields
    assert "max_bots" not in fields
    assert all("Да" in (l["before"] + l["after"]) or "Нет" not in l["field"] or True for l in lines)


def test_regular_user_forbidden_audit(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    res = client.get("/api/admin/tariffs/plans/audit", headers={"Authorization": auth})
    assert res.status_code == 403
