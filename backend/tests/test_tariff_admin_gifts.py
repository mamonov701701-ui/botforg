"""
Тесты admin API подарочных начислений (Этап 6.4).
"""
from datetime import datetime, timezone

import pytest

from backend.models.plan import Plan
from backend.models.tariff import AdminAuditLog, GiftGrant, GiftGrantStatus
from backend.models.user import User
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)
from backend.tests.tariff_time import freeze_tariff_now  # noqa: F401

pytestmark = pytest.mark.usefixtures("freeze_tariff_now")


def _utc(y, m, d, h=0):
    return datetime(y, m, d, h, 0, 0, tzinfo=timezone.utc)


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


def _auth_owner(client, db) -> tuple[str, int]:
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    _promote(db, uid, "owner")
    return auth, uid


def _auth_user(client) -> tuple[str, int]:
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    return auth, uid


def _gift_payload(**overrides):
    body = {
        "target_user_id": 0,
        "gift_type": "messages",
        "amount": 200,
        "starts_at": _utc(2026, 6, 1).isoformat(),
        "ends_at": _utc(2026, 7, 1).isoformat(),
        "reason": "promo",
        "admin_comment": "stage 6.4",
    }
    body.update(overrides)
    return body


def test_regular_user_forbidden_on_gift_endpoints(client, db):
    # Первый зарегистрированный пользователь получает role=owner — создаём decoy.
    _auth_user(client)
    auth, uid = _auth_user(client)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    headers = {"Authorization": auth}

    res = client.get("/api/admin/tariffs/users/lookup", params={"user_id": uid}, headers=headers)
    assert res.status_code == 403

    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=uid),
        headers=headers,
    )
    assert res.status_code == 403

    res = client.get(f"/api/admin/tariffs/users/{uid}/gifts", headers=headers)
    assert res.status_code == 403

    res = client.post("/api/admin/tariffs/gifts/1/revoke", headers=headers)
    assert res.status_code == 403


def test_admin_role_can_grant_and_revoke(client, db):
    admin_auth = register_and_get_token(client)
    admin_id = get_user_id(client, admin_auth)
    _promote(db, admin_id, "admin")

    target_auth, target_id = _auth_user(client)
    client.post(
        "/me/plan",
        json={"plan_code": "start"},
        headers={"Authorization": target_auth},
    )

    headers = {"Authorization": admin_auth}
    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=target_id, amount=300),
        headers=headers,
    )
    assert res.status_code == 201, res.text
    gift = res.json()
    assert gift["gift_type"] == "messages"
    assert gift["amount"] == 300
    assert gift["status"] == "active"
    gift_id = gift["id"]

    summary = client.get(
        "/me/tariff/summary",
        headers={"Authorization": target_auth},
    )
    assert summary.status_code == 200
    assert summary.json()["messages"]["limit"] == 500 + 300

    res = client.post(f"/api/admin/tariffs/gifts/{gift_id}/revoke", headers=headers)
    assert res.status_code == 200
    assert res.json()["gift"]["status"] == "cancelled"
    assert res.json()["already_cancelled"] is False

    summary2 = client.get(
        "/me/tariff/summary",
        headers={"Authorization": target_auth},
    )
    assert summary2.json()["messages"]["limit"] == 500


def test_owner_lookup_by_id_and_email(client, db):
    owner_auth, _ = _auth_owner(client, db)
    target_auth, target_id = _auth_user(client)
    target = db.query(User).filter(User.id == target_id).one()
    email = target.email

    res = client.get(
        "/api/admin/tariffs/users/lookup",
        params={"user_id": target_id},
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 200
    assert res.json()["id"] == target_id
    assert res.json()["email"] == email

    res = client.get(
        "/api/admin/tariffs/users/lookup",
        params={"email": email.upper()},
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 200
    assert res.json()["id"] == target_id


def test_lookup_user_not_found(client, db):
    owner_auth, _ = _auth_owner(client, db)
    res = client.get(
        "/api/admin/tariffs/users/lookup",
        params={"user_id": 999999},
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 404

    res = client.get(
        "/api/admin/tariffs/users/lookup",
        params={"email": "missing@example.com"},
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 404


def test_grant_target_user_not_found(client, db):
    owner_auth, _ = _auth_owner(client, db)
    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=999999),
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 404


def test_invalid_period_and_missing_fields(client, db):
    owner_auth, _ = _auth_owner(client, db)
    _, target_id = _auth_user(client)

    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(
            target_user_id=target_id,
            starts_at=_utc(2026, 7, 1).isoformat(),
            ends_at=_utc(2026, 6, 1).isoformat(),
        ),
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 422

    res = client.post(
        "/api/admin/tariffs/gifts",
        json={
            "target_user_id": target_id,
            "gift_type": "messages",
            "starts_at": _utc(2026, 6, 1).isoformat(),
            "ends_at": _utc(2026, 7, 1).isoformat(),
        },
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 422

    res = client.post(
        "/api/admin/tariffs/gifts",
        json={
            "target_user_id": target_id,
            "gift_type": "plan",
            "starts_at": _utc(2026, 6, 1).isoformat(),
            "ends_at": _utc(2026, 7, 1).isoformat(),
        },
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 422


def test_audit_log_created_on_grant_and_revoke(client, db):
    owner_auth, owner_id = _auth_owner(client, db)
    _, target_id = _auth_user(client)

    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=target_id, gift_type="active_bot", amount=1),
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 201
    gift_id = res.json()["id"]

    logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.entity_type == "gift_grant",
            AdminAuditLog.entity_id == gift_id,
            AdminAuditLog.action == "gift_grant",
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].admin_user_id == owner_id
    assert logs[0].new_value is not None
    assert logs[0].new_value["gift_type"] == "active_bot"
    assert logs[0].comment

    res = client.post(
        f"/api/admin/tariffs/gifts/{gift_id}/revoke",
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 200

    revoke_logs = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.entity_id == gift_id,
            AdminAuditLog.action == "gift_revoke",
        )
        .all()
    )
    assert len(revoke_logs) == 1
    assert revoke_logs[0].old_value["status"] == "active"
    assert revoke_logs[0].new_value["status"] == "cancelled"


def test_repeat_revoke_is_safe(client, db):
    owner_auth, _ = _auth_owner(client, db)
    _, target_id = _auth_user(client)
    headers = {"Authorization": owner_auth}

    res = client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=target_id, gift_type="team_member", amount=2),
        headers=headers,
    )
    gift_id = res.json()["id"]

    r1 = client.post(f"/api/admin/tariffs/gifts/{gift_id}/revoke", headers=headers)
    assert r1.status_code == 200
    assert r1.json()["already_cancelled"] is False

    r2 = client.post(f"/api/admin/tariffs/gifts/{gift_id}/revoke", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["already_cancelled"] is True
    assert r2.json()["gift"]["status"] == "cancelled"

    revoke_count = (
        db.query(AdminAuditLog)
        .filter(
            AdminAuditLog.entity_id == gift_id,
            AdminAuditLog.action == "gift_revoke",
        )
        .count()
    )
    assert revoke_count == 1


def test_plan_gift_affects_tariff_summary(client, db):
    owner_auth, _ = _auth_owner(client, db)
    target_auth, target_id = _auth_user(client)
    client.post(
        "/me/plan",
        json={"plan_code": "start"},
        headers={"Authorization": target_auth},
    )
    biz = db.query(Plan).filter(Plan.code == "business").one()

    res = client.post(
        "/api/admin/tariffs/gifts",
        json={
            "target_user_id": target_id,
            "gift_type": "plan",
            "plan_code": "business",
            "starts_at": _utc(2026, 6, 1).isoformat(),
            "ends_at": _utc(2026, 7, 1).isoformat(),
            "reason": "upgrade gift",
        },
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 201, res.text
    assert res.json()["plan_id"] == biz.id

    summary = client.get(
        "/me/tariff/summary",
        headers={"Authorization": target_auth},
    )
    assert summary.status_code == 200
    data = summary.json()
    assert data["current_plan"]["code"] == "business"
    assert data["current_plan"]["source"] == "gift_plan"
    assert any(g.get("gift_type") == "plan" for g in data["active_gifts"])


def test_list_user_gifts(client, db):
    owner_auth, _ = _auth_owner(client, db)
    _, target_id = _auth_user(client)
    headers = {"Authorization": owner_auth}

    client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=target_id, amount=50),
        headers=headers,
    )
    client.post(
        "/api/admin/tariffs/gifts",
        json=_gift_payload(target_user_id=target_id, gift_type="active_bot", amount=1),
        headers=headers,
    )

    res = client.get(f"/api/admin/tariffs/users/{target_id}/gifts", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert {i["gift_type"] for i in items} == {"messages", "active_bot"}


def test_list_gifts_user_not_found(client, db):
    owner_auth, _ = _auth_owner(client, db)
    res = client.get(
        "/api/admin/tariffs/users/999999/gifts",
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 404


def test_revoke_gift_not_found(client, db):
    owner_auth, _ = _auth_owner(client, db)
    res = client.post(
        "/api/admin/tariffs/gifts/999999/revoke",
        headers={"Authorization": owner_auth},
    )
    assert res.status_code == 404
