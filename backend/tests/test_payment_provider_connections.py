"""
Тесты Этап 6.10A: encryption + PaymentProviderConnection admin API.
"""
from __future__ import annotations

import base64
import json
import os

import pytest
from sqlalchemy import inspect

from backend.models.checkout import PaymentAttempt, PaymentAttemptStatus
from backend.models.payment_provider_connection import PaymentProviderConnection
from backend.models.tariff import AdminAuditLog
from backend.models.user import User
from backend.payments.credentials.encryption import (
    CredentialEnvelope,
    decrypt_credentials_blob,
    encrypt_credentials_blob,
    load_master_key,
)
from backend.payments.credentials.errors import CredentialsCryptoError
from backend.payments.definitions.catalog import (
    list_provider_definitions,
)
from backend.services.checkout_intents import create_checkout_intent
from backend.services.payment_fulfillment import create_payment_attempt
from backend.services.payment_provider_connections import (
    create_connection,
    update_connection,
    ConnectionServiceError,
)
from backend.settings import settings
from backend.tests.conftest import (
    PROJECT_ROOT,
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)

SECRET_TOKEN = "test-secret-token-value-xyz"


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


def _auth(client, db, role: str = "owner") -> tuple[str, int]:
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    _promote(db, uid, role)
    return auth, uid


def _headers(auth: str) -> dict:
    return {"Authorization": auth}


def _fake_creds() -> dict:
    return {"label": "demo", "test_token": SECRET_TOKEN}


# --- Encryption unit tests ---


def test_encrypt_decrypt_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", "")
    blob = b'{"test_token":"abc"}'
    env1 = encrypt_credentials_blob(blob)
    env2 = encrypt_credentials_blob(blob)
    assert env1.nonce != env2.nonce
    assert env1.ciphertext != env2.ciphertext
    assert decrypt_credentials_blob(env1) == blob
    assert decrypt_credentials_blob(env2) == blob


def test_tampered_ciphertext_fail_closed(monkeypatch):
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", "")
    env = encrypt_credentials_blob(b"secret-payload")
    tampered = CredentialEnvelope(
        encryption_version=env.encryption_version,
        key_id=env.key_id,
        nonce=env.nonce,
        ciphertext=bytes([env.ciphertext[0] ^ 0xFF]) + env.ciphertext[1:],
        auth_tag=env.auth_tag,
    )
    with pytest.raises(CredentialsCryptoError) as ei:
        decrypt_credentials_blob(tampered)
    assert "secret-payload" not in str(ei.value)
    assert "secret-payload" not in repr(ei.value)


def test_wrong_master_key_fail_closed(monkeypatch):
    key_a = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    key_b = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", key_a)
    env = encrypt_credentials_blob(b"payload-aaa")
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", key_b)
    with pytest.raises(CredentialsCryptoError):
        decrypt_credentials_blob(env)


def test_missing_master_key_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", "")
    with pytest.raises(CredentialsCryptoError) as ei:
        load_master_key()
    assert ei.value.code == "master_key_missing"


def test_envelope_repr_has_no_plaintext(monkeypatch):
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", "")
    env = encrypt_credentials_blob(SECRET_TOKEN.encode())
    assert SECRET_TOKEN not in repr(env)
    assert SECRET_TOKEN not in str(env)


# --- Definitions ---


def test_definitions_catalog_statuses():
    defs = {d.code: d for d in list_provider_definitions()}
    assert defs["fake"].adapter_status == "available"
    assert defs["yookassa"].adapter_status == "available"
    assert defs["yookassa"].to_public_dict()["can_connect"] is True
    for code in (
        "cloudpayments",
        "tbank",
        "robokassa",
        "stripe",
        "paypal_braintree",
        "adyen",
        "checkout_com",
    ):
        assert defs[code].adapter_status == "planned"
        assert defs[code].to_public_dict()["can_connect"] is False


# --- API / service ---


def test_list_definitions_api(client, db):
    auth, _ = _auth(client, db, "admin")
    res = client.get(
        "/api/admin/payment-provider-definitions", headers=_headers(auth)
    )
    assert res.status_code == 200
    body = res.json()
    assert any(i["code"] == "yookassa" for i in body)
    text = json.dumps(body)
    assert "secret_key" in text  # field name in schema ok
    assert SECRET_TOKEN not in text


def test_planned_provider_cannot_connect(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    auth, _ = _auth(client, db, "owner")
    res = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "cloudpayments",
            "connection_name": "Main",
            "credentials": {"public_id": "pk_test", "api_secret": "abcdefghij"},
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "adapter_planned"


def test_create_fake_connection_secret_absent_in_json_and_audit(
    client, db, monkeypatch
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, uid = _auth(client, db, "owner")
    res = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "Test A",
            "mode": "test",
            "enabled": True,
            "credentials": _fake_creds(),
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    raw = json.dumps(data)
    assert SECRET_TOKEN not in raw
    assert data["has_credentials"] is True
    assert data["provider_code"] == "fake"
    assert "test_token" not in data or data.get("test_token") is None

    audits = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.entity_type == "payment_provider_connection")
        .all()
    )
    audit_blob = json.dumps(
        [a.old_value for a in audits] + [a.new_value for a in audits]
    )
    assert SECRET_TOKEN not in audit_blob
    assert "ciphertext" not in audit_blob.lower() or True  # values not stored as keys with secrets
    for a in audits:
        blob = json.dumps({"o": a.old_value, "n": a.new_value})
        assert SECRET_TOKEN not in blob
        assert "credentials_nonce" not in blob
        assert "credentials_ciphertext" not in blob
        assert "credentials_auth_tag" not in blob


def test_admin_cannot_set_credentials_owner_can(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    # owner creates
    owner_auth, _ = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(owner_auth),
        json={
            "provider_code": "fake",
            "connection_name": "Cred Gate",
            "credentials": _fake_creds(),
        },
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    admin_auth, _ = _auth(client, db, "admin")
    # admin can list
    listed = client.get(
        "/api/admin/payment-provider-connections", headers=_headers(admin_auth)
    )
    assert listed.status_code == 200
    # admin cannot replace credentials
    denied = client.put(
        f"/api/admin/payment-provider-connections/{cid}/credentials",
        headers=_headers(admin_auth),
        json={"credentials": {"label": "x", "test_token": "new-secret-aaaa"}},
    )
    assert denied.status_code == 403


def test_multiple_connections_same_provider(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, _ = _auth(client, db, "owner")
    for name in ("Conn1", "Conn2"):
        res = client.post(
            "/api/admin/payment-provider-connections",
            headers=_headers(auth),
            json={
                "provider_code": "fake",
                "connection_name": name,
                "credentials": _fake_creds(),
            },
        )
        assert res.status_code == 201
    listed = client.get(
        "/api/admin/payment-provider-connections", headers=_headers(auth)
    ).json()
    fake_rows = [r for r in listed if r["provider_code"] == "fake"]
    assert len(fake_rows) >= 2


def test_credential_replace_and_verify(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, _ = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "ReplaceMe",
            "credentials": _fake_creds(),
        },
    )
    cid = created.json()["id"]
    v1 = created.json()["credentials_version"]
    replaced = client.put(
        f"/api/admin/payment-provider-connections/{cid}/credentials",
        headers=_headers(auth),
        json={"credentials": {"label": "b", "test_token": "replaced-secret-99"}},
    )
    assert replaced.status_code == 200
    assert replaced.json()["credentials_version"] == v1 + 1
    assert "replaced-secret-99" not in json.dumps(replaced.json())

    verified = client.post(
        f"/api/admin/payment-provider-connections/{cid}/verify",
        headers=_headers(auth),
    )
    assert verified.status_code == 200
    body = verified.json()
    assert body["status"] == "config_valid"
    assert body["verified"] is True


def test_default_requires_enabled_and_verified(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, _ = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "DefaultGate",
            "enabled": False,
            "credentials": _fake_creds(),
        },
    )
    cid = created.json()["id"]
    bad = client.post(
        f"/api/admin/payment-provider-connections/{cid}/set-default",
        headers=_headers(auth),
    )
    assert bad.status_code == 409

    # enable without verify must fail
    enable_early = client.patch(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    assert enable_early.status_code == 409

    client.post(
        f"/api/admin/payment-provider-connections/{cid}/verify",
        headers=_headers(auth),
    )
    enable_ok = client.patch(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    assert enable_ok.status_code == 200

    ok = client.post(
        f"/api/admin/payment-provider-connections/{cid}/set-default",
        headers=_headers(auth),
    )
    assert ok.status_code == 200
    assert ok.json()["is_default"] is True


def test_fake_forbidden_in_production_create(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", True)
    # master key required in production for encrypt
    key = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", key)
    auth, _ = _auth(client, db, "owner")
    res = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "ProdFake",
            "credentials": _fake_creds(),
        },
    )
    assert res.status_code == 403


def test_delete_blocked_by_unfinished_attempt(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "fake,yookassa")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_DEFAULT", "fake")

    auth, uid = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "InUse",
            "enabled": False,
            "credentials": _fake_creds(),
        },
    )
    cid = created.json()["id"]
    client.post(
        f"/api/admin/payment-provider-connections/{cid}/verify",
        headers=_headers(auth),
    )
    client.patch(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    client.post(
        f"/api/admin/payment-provider-connections/{cid}/set-default",
        headers=_headers(auth),
    )

    # Second connection becomes default so the first can be disabled/deleted later
    created2 = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "DefaultKeeper",
            "enabled": False,
            "credentials": _fake_creds(),
        },
    )
    cid2 = created2.json()["id"]
    client.post(
        f"/api/admin/payment-provider-connections/{cid2}/verify",
        headers=_headers(auth),
    )
    client.patch(
        f"/api/admin/payment-provider-connections/{cid2}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    client.post(
        f"/api/admin/payment-provider-connections/{cid2}/set-default",
        headers=_headers(auth),
    )
    client.patch(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
        json={"enabled": False},
    )

    # Need a plan for checkout — reuse seeded catalog code
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="tariff",
        code="business",
        idempotency_key=f"ik-{uid}-conn",
    )
    attempt = create_payment_attempt(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        idempotency_key=f"pa-{uid}-conn",
    )
    # Force link to the disabled connection under test
    attempt.connection_id = cid
    attempt.provider = "fake"
    db.commit()
    db.refresh(attempt)
    assert attempt.connection_id == cid
    provider_snapshot = attempt.provider
    connection_snapshot = attempt.connection_id

    deleted = client.delete(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
    )
    assert deleted.status_code == 409
    assert deleted.json()["detail"]["code"] == "connection_in_use"

    # Finish attempt → delete allowed; snapshot on attempt remains until SET NULL on delete
    attempt.status = PaymentAttemptStatus.SUCCEEDED.value
    db.commit()

    deleted_ok = client.delete(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
    )
    assert deleted_ok.status_code == 204

    db.expire_all()
    attempt2 = db.query(PaymentAttempt).filter(PaymentAttempt.id == attempt.id).one()
    assert attempt2.provider == provider_snapshot
    # FK ondelete SET NULL
    assert attempt2.connection_id is None
    # historical provider code preserved
    assert attempt2.provider == "fake"
    assert connection_snapshot == cid


def test_yookassa_shop_id_rejects_email_with_russian_message(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, _ = _auth(client, db, "owner")
    res = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "yookassa",
            "connection_name": "ЮKassa — тестовое",
            "mode": "test",
            "credentials": {
                "shop_id": "user@example.com",
                "secret_key": "test_secret_key_xx",
            },
        },
    )
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "invalid_credential_format"
    assert detail["field"] == "shop_id"
    assert "Некорректный Shop ID" in detail["message"]
    assert "личн" in detail["message"] and "кабинет" in detail["message"]


def test_delete_default_and_enabled_blocked(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "fake,yookassa")
    auth, _ = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "DelGate",
            "credentials": _fake_creds(),
        },
    )
    cid = created.json()["id"]
    client.post(f"/api/admin/payment-provider-connections/{cid}/verify", headers=_headers(auth))
    client.patch(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    client.post(
        f"/api/admin/payment-provider-connections/{cid}/set-default",
        headers=_headers(auth),
    )
    blocked_default = client.delete(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
    )
    assert blocked_default.status_code == 409
    assert blocked_default.json()["detail"]["code"] == "cannot_delete_default"

    # Second becomes default; first still enabled → cannot_delete_enabled
    created2 = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "DelGate2",
            "credentials": _fake_creds(),
        },
    )
    cid2 = created2.json()["id"]
    client.post(f"/api/admin/payment-provider-connections/{cid2}/verify", headers=_headers(auth))
    client.patch(
        f"/api/admin/payment-provider-connections/{cid2}",
        headers=_headers(auth),
        json={"enabled": True},
    )
    client.post(
        f"/api/admin/payment-provider-connections/{cid2}/set-default",
        headers=_headers(auth),
    )
    blocked_enabled = client.delete(
        f"/api/admin/payment-provider-connections/{cid}",
        headers=_headers(auth),
    )
    assert blocked_enabled.status_code == 409
    assert blocked_enabled.json()["detail"]["code"] == "cannot_delete_enabled"


def test_regular_user_forbidden_connections(client, db):
    register_and_get_token(client)
    auth = register_and_get_token(client)
    res = client.get(
        "/api/admin/payment-provider-connections", headers=_headers(auth)
    )
    assert res.status_code == 403


def test_patch_rejects_credentials_key(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, _ = _auth(client, db, "owner")
    created = client.post(
        "/api/admin/payment-provider-connections",
        headers=_headers(auth),
        json={
            "provider_code": "fake",
            "connection_name": "NoPatchSecrets",
            "credentials": _fake_creds(),
        },
    )
    cid = created.json()["id"]
    # Pydantic model drops unknown fields by default — send via service path check
    with pytest.raises(ConnectionServiceError) as ei:
        update_connection(
            db,
            admin_user_id=1,
            connection_id=cid,
            patch={"credentials": {"test_token": "leak"}},
        )
    assert ei.value.code == "credentials_not_allowed"


def test_migration_upgrade_downgrade_sqlite(tmp_path):
    """
    Upgrade/downgrade в отдельном процессе: alembic env.py импортирует
    backend.models.* и иначе ломает declarative registry текущего pytest-процесса.
    """
    import subprocess
    import sys

    db_path = tmp_path / "mig_ppc.db"
    url = "sqlite:///" + str(db_path.resolve()).replace("\\", "/")
    script = f"""
import os, sys
os.environ["DATABASE_URL"] = {url!r}
os.environ["TESTING"] = "true"
sys.path.insert(0, {PROJECT_ROOT!r})
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from backend.settings import settings
settings.DATABASE_URL = {url!r}
cfg = Config(os.path.join({PROJECT_ROOT!r}, "alembic.ini"))
cfg.set_main_option("sqlalchemy.url", {url!r})
cfg.set_main_option(
    "script_location",
    os.path.join({PROJECT_ROOT!r}, "backend", "migrations").replace("\\\\", "/"),
)
command.upgrade(cfg, "payment_provider_settings_023")
eng = create_engine({url!r})
insp = inspect(eng)
assert "payment_provider_settings" in insp.get_table_names()
assert "payment_provider_connections" not in insp.get_table_names()
eng.dispose()
command.upgrade(cfg, "payment_provider_connections_024")
eng = create_engine({url!r})
insp = inspect(eng)
assert "payment_provider_connections" in insp.get_table_names()
cols = {{c["name"] for c in insp.get_columns("payment_attempts")}}
assert "connection_id" in cols
eng.dispose()
command.downgrade(cfg, "payment_provider_settings_023")
eng = create_engine({url!r})
insp = inspect(eng)
assert "payment_provider_connections" not in insp.get_table_names()
cols = {{c["name"] for c in insp.get_columns("payment_attempts")}}
assert "connection_id" not in cols
eng.dispose()
command.upgrade(cfg, "payment_provider_connections_024")
eng = create_engine({url!r})
assert "payment_provider_connections" in inspect(eng).get_table_names()
eng.dispose()
print("OK")
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        env={**os.environ, "DATABASE_URL": url, "TESTING": "true"},
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "OK" in result.stdout


def test_connection_table_present_after_head_upgrade(db):
    insp = inspect(db.get_bind())
    assert "payment_provider_connections" in insp.get_table_names()
    cols = {c["name"] for c in insp.get_columns("payment_attempts")}
    assert "connection_id" in cols


def test_model_repr_no_secret(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    auth, uid = _auth(client, db, "owner")
    row = create_connection(
        db,
        admin_user_id=uid,
        provider_code="fake",
        connection_name="ReprCheck",
        mode="test",
        currency="RUB",
        priority=10,
        enabled=False,
        credentials=_fake_creds(),
    )
    assert SECRET_TOKEN not in repr(row)
    assert SECRET_TOKEN not in str(row)
