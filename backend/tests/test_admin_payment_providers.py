"""
Тесты admin payment provider settings (Этап 6.9).
"""
import json

import pytest

from backend.models.tariff import AdminAuditLog
from backend.models.user import User
from backend.payments.registry import clear_provider_cache
from backend.services.checkout_intents import create_checkout_intent
from backend.services.payment_fulfillment import create_payment_attempt
from backend.settings import settings
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)

SECRET_VALUE = "super_secret_key_value_xyz"
SHOP_ID = "shop_1234567890ABCD"


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_provider_cache()
    yield
    clear_provider_cache()


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


def _auth_admin(client, db, role: str = "owner") -> tuple[str, int]:
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    _promote(db, uid, role)
    return auth, uid


def _auth_user(client) -> tuple[str, int]:
    # first user may be owner — create decoy
    register_and_get_token(client)
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    return auth, uid


def _headers(auth: str) -> dict:
    return {"Authorization": auth}


def test_regular_user_forbidden(client, db):
    auth, _ = _auth_user(client)
    res = client.get("/api/admin/payment-providers", headers=_headers(auth))
    assert res.status_code == 403


def test_admin_list_and_detail(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", SHOP_ID)
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", SECRET_VALUE)
    auth, _ = _auth_admin(client, db, "admin")

    res = client.get("/api/admin/payment-providers", headers=_headers(auth))
    assert res.status_code == 200
    items = res.json()
    assert any(i["code"] == "yookassa" for i in items)
    blob = json.dumps(items)
    assert SECRET_VALUE not in blob
    assert "sk_" not in blob or SECRET_VALUE not in blob

    res = client.get("/api/admin/payment-providers/yookassa", headers=_headers(auth))
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == "yookassa"
    assert data["configured"] is True
    assert "YOOKASSA_SHOP_ID" in data["masked_identifiers"]
    assert data["masked_identifiers"]["YOOKASSA_SHOP_ID"].endswith("ABCD")
    assert SECRET_VALUE not in json.dumps(data)
    assert data["missing_required_settings"] == []


def test_missing_env_secrets_reported(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", None)
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", None)
    auth, _ = _auth_admin(client, db)
    res = client.get("/api/admin/payment-providers/yookassa", headers=_headers(auth))
    assert res.status_code == 200
    data = res.json()
    assert data["configured"] is False
    assert "YOOKASSA_SECRET_KEY" in data["missing_required_settings"]
    assert data["readiness_status"] == "missing_secrets"


def test_update_provider_and_audit(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    auth, admin_id = _auth_admin(client, db)
    res = client.patch(
        "/api/admin/payment-providers/cloudpayments",
        json={"display_name": "CloudPayments RU", "priority": 15, "enabled": False},
        headers=_headers(auth),
    )
    assert res.status_code == 200, res.text
    assert res.json()["display_name"] == "CloudPayments RU"
    assert res.json()["priority"] == 15
    assert SECRET_VALUE not in res.text

    logs = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.action == "payment_provider_update")
        .all()
    )
    assert len(logs) >= 1
    assert logs[-1].admin_user_id == admin_id
    audit_blob = json.dumps(logs[-1].old_value) + json.dumps(logs[-1].new_value)
    assert SECRET_VALUE not in audit_blob
    # Имена env-ключей в missing_required_settings допустимы; значений секретов быть не должно.
    assert "super_secret" not in audit_blob.lower()


def test_set_default_uniqueness(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    clear_provider_cache()
    auth, _ = _auth_admin(client, db)

    # enable fake then set default
    res = client.patch(
        "/api/admin/payment-providers/fake",
        json={"enabled": True, "mode": "test"},
        headers=_headers(auth),
    )
    assert res.status_code == 200, res.text

    res = client.post(
        "/api/admin/payment-providers/fake/set-default",
        headers=_headers(auth),
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_default_for_new_payments"] is True

    listing = client.get("/api/admin/payment-providers", headers=_headers(auth)).json()
    defaults = [i for i in listing if i["is_default_for_new_payments"]]
    assert len(defaults) == 1
    assert defaults[0]["code"] == "fake"


def test_cannot_default_disabled_or_unready(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", None)
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", None)
    auth, _ = _auth_admin(client, db)

    res = client.post(
        "/api/admin/payment-providers/stripe/set-default",
        headers=_headers(auth),
    )
    assert res.status_code == 409

    res = client.post(
        "/api/admin/payment-providers/yookassa/set-default",
        headers=_headers(auth),
    )
    assert res.status_code == 409


def test_fake_forbidden_in_production(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    clear_provider_cache()
    auth, _ = _auth_admin(client, db)

    res = client.patch(
        "/api/admin/payment-providers/fake",
        json={"enabled": True},
        headers=_headers(auth),
    )
    assert res.status_code == 409
    assert "fake" in res.text.lower() or res.json()["detail"]["code"] == "fake_provider_forbidden"

    res = client.post(
        "/api/admin/payment-providers/fake/set-default",
        headers=_headers(auth),
    )
    assert res.status_code == 409


def test_health_check_no_real_payment(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", SHOP_ID)
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", SECRET_VALUE)
    auth, _ = _auth_admin(client, db)
    res = client.post(
        "/api/admin/payment-providers/yookassa/health-check",
        headers=_headers(auth),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == "yookassa"
    assert data["status"] in ("ok", "degraded", "fail")
    assert SECRET_VALUE not in json.dumps(data)
    # degraded expected: secrets ok, adapter missing
    assert data["status"] == "degraded"


def test_patch_ignores_secret_fields(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    auth, _ = _auth_admin(client, db)
    res = client.patch(
        "/api/admin/payment-providers/yookassa",
        json={
            "display_name": "ЮKassa Safe",
            "secret_key": SECRET_VALUE,
            "YOOKASSA_SECRET_KEY": SECRET_VALUE,
            "api_key": SECRET_VALUE,
        },
        headers=_headers(auth),
    )
    assert res.status_code == 200
    assert SECRET_VALUE not in res.text
    assert res.json()["display_name"] == "ЮKassa Safe"


def test_old_attempts_keep_provider_after_default_change(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    clear_provider_cache()
    auth, uid = _auth_admin(client, db)

    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="tariff",
        code="business",
        idempotency_key="adm-keep-1",
    )
    attempt = create_payment_attempt(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        idempotency_key="adm-att-1",
        provider="yookassa",
    )
    assert attempt.provider == "yookassa"

    client.patch(
        "/api/admin/payment-providers/fake",
        json={"enabled": True},
        headers=_headers(auth),
    )
    client.post(
        "/api/admin/payment-providers/fake/set-default",
        headers=_headers(auth),
    )
    db.refresh(attempt)
    assert attempt.provider == "yookassa"


def test_detail_not_found(client, db):
    auth, _ = _auth_admin(client, db)
    res = client.get(
        "/api/admin/payment-providers/nope",
        headers=_headers(auth),
    )
    assert res.status_code == 404
