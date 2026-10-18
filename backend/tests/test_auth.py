"""
Tests for auth endpoints (email/register, email/login).
"""
import pytest
import time
from datetime import timedelta
from fastapi.testclient import TestClient
from jose import jwt

from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal
from backend.models.user import User
from backend.models.legal import Consent, LegalDocType
from backend.services.legal_documents import create_draft, publish_revision
from backend.models.auth import AccountActionToken
from backend.services.account_security import token_digest, utcnow
from backend.services.account_security import create_session
from backend.core.security import create_jwt_token


def _registration_docs():
    with TestingSessionLocal() as db:
        owner = User(email="legal-actor@example.com", name="Legal Actor", role="owner", hashed_password="not-for-login")
        db.add(owner)
        db.flush()
        revisions = {}
        for doc_type in (LegalDocType.PUBLIC_OFFER.value, LegalDocType.PRIVACY_POLICY.value, LegalDocType.PERSONAL_DATA_CONSENT.value):
            rev = create_draft(db, doc_type=doc_type, version="1.0", title=doc_type, body_markdown=f"# {doc_type}", actor_user_id=owner.id, commit=False)
            publish_revision(db, revision_id=rev.id, actor_user_id=owner.id, commit=False)
            revisions[doc_type] = rev.id
        db.commit()
        return revisions


def _legal_acceptances():
    return {"terms_accepted": True, "privacy_acknowledged": True, "personal_data_consent_accepted": True}


def test_register_and_login(client: TestClient, monkeypatch):
    """Register new user and login."""
    email = f"test_{__import__('uuid').uuid4().hex[:8]}@example.com"
    password = "SecretPass123!"
    revisions = _registration_docs()
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda address, token: sent.append(token) or "test_capture")

    res = client.post(
        "/auth/email/register",
        json={"email": email, "name": "Tester", "username": "tester_one", "password": password,
              "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances()},
    )
    assert res.status_code == 200
    assert "access_token" not in res.json()
    assert len(sent) == 1
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == email).one()
        results = {row.doc_type: row.confirmation_result for row in db.query(Consent).filter(Consent.user_id == user.id)}
        assert results == {
            LegalDocType.PUBLIC_OFFER.value: "accepted",
            LegalDocType.PRIVACY_POLICY.value: "acknowledged",
            LegalDocType.PERSONAL_DATA_CONSENT.value: "accepted",
        }
        assert LegalDocType.ADVERTISING_CONSENT.value not in results

    pending_login = client.post("/auth/email/login", json={"email": email, "password": password})
    assert pending_login.status_code == 403
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == email).one()
        session = create_session(db, user, "unverified-test")
        db.commit()
        unverified_token = create_jwt_token(user.id, user.token_version, session_id=session.id)
    denied_headers = {"Authorization": f"Bearer {unverified_token}"}
    assert client.get("/me", headers=denied_headers).status_code == 401
    assert client.get("/bots/", headers=denied_headers).status_code == 401
    assert client.post("/auth/email/verify-preview", json={"token": sent[0]}).status_code == 200
    assert client.post("/auth/email/verify-preview", json={"token": sent[0]}).status_code == 200
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 200
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 400

    res = client.post(
        "/auth/email/login",
        json={"email": email, "password": password},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    payload = jwt.decode(data["access_token"], settings.JWT_SECRET, algorithms=["HS256"])
    assert payload["sub"].isdigit()
    assert payload["tv"] == 0
    assert "iat" in payload
    assert "exp" in payload

    me = client.get(
        "/me", headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_registration_existing_email_is_neutral_without_duplicate_or_mail(client: TestClient, monkeypatch):
    revisions = _registration_docs()
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda address, token: sent.append((address, token)) or "smtp_accepted")
    payload = {"email": "registration-privacy@example.com", "name": "Tester", "username": "privacy_first", "password": "SecretPass123!", "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances()}
    created = client.post("/auth/email/register", json=payload)
    assert created.status_code == 200
    assert len(sent) == 1
    payload["username"] = "privacy_second"
    repeated = client.post("/auth/email/register", json=payload)
    assert repeated.status_code == 200
    assert repeated.json() == created.json()
    assert "delivery_state" not in repeated.json()
    assert len(sent) == 1
    with TestingSessionLocal() as db:
        assert db.query(User).filter(User.email == payload["email"]).count() == 1
        assert db.query(User).filter(User.username == "privacy_second").count() == 0
        assert db.query(AccountActionToken).filter(AccountActionToken.purpose == "verify_email").count() == 1


def test_registration_delivery_failure_keeps_neutral_response(client: TestClient, monkeypatch):
    revisions = _registration_docs()
    payload = {"email": "delivery-neutral@example.com", "name": "Tester", "username": "delivery_neutral", "password": "SecretPass123!", "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances()}
    def fail_delivery(*_args):
        raise OSError("local smtp unavailable")
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", fail_delivery)
    response = client.post("/auth/email/register", json=payload)
    assert response.status_code == 200
    assert "delivery_state" not in response.json()
    with TestingSessionLocal() as db:
        assert db.query(User).filter(User.email == payload["email"]).count() == 1
        assert db.query(AccountActionToken).filter(AccountActionToken.purpose == "verify_email", AccountActionToken.consumed_at.is_(None)).count() == 0


def test_registration_timing_floor_and_ip_throttle(client: TestClient, monkeypatch):
    revisions = _registration_docs()
    delivered = []
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda address, token: delivered.append(address) or "smtp_accepted")
    payload = {"email": "registration-throttle@example.com", "name": "Tester", "username": "throttle_one", "password": "SecretPass123!", "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances()}
    started = time.monotonic()
    created = client.post("/auth/email/register", json=payload)
    new_elapsed = time.monotonic() - started
    assert created.status_code == 200 and new_elapsed >= 0.45
    payload["username"] = "throttle_two"
    started = time.monotonic()
    duplicate = client.post("/auth/email/register", json=payload)
    duplicate_elapsed = time.monotonic() - started
    assert duplicate.status_code == 200 and duplicate_elapsed >= 0.45
    assert duplicate.json() == created.json()
    for number in range(3, 6):
        payload["username"] = f"throttle_{number}"
        assert client.post("/auth/email/register", json=payload).status_code == 200
    payload["username"] = "throttle_six"
    assert client.post("/auth/email/register", json=payload).status_code == 429
    assert delivered == ["registration-throttle@example.com"]


def test_login_invalid_credentials(client: TestClient):
    """Login with wrong password fails."""
    res = client.post(
        "/auth/email/login",
        json={"email": "nonexistent@example.com", "password": "WrongPass123!"},
    )
    assert res.status_code in (401, 422)


def test_register_weak_password(client: TestClient):
    """Registration with weak password."""
    res = client.post(
        "/auth/email/register",
        json={"email": "test@example.com", "name": "T", "password": "123"},
    )
    assert res.status_code in (400, 422)


def test_protected_endpoint_without_auth(client: TestClient):
    """Protected endpoint returns 401 without token."""
    res = client.get("/bots/")
    assert res.status_code == 401


def test_registration_rejects_underage_and_missing_consent(client: TestClient):
    revisions = _registration_docs()
    payload = {"email": "underage@example.com", "name": "Underage", "username": "underage_one", "password": "SecretPass123!", "date_of_birth": "2010-10-09", "legal_revision_ids": revisions, **_legal_acceptances()}
    assert client.post("/auth/email/register", json=payload).status_code == 400
    payload["date_of_birth"] = "1990-10-09"
    payload["legal_revision_ids"] = {**revisions, "public_offer": -1}
    assert client.post("/auth/email/register", json=payload).status_code == 400
    payload["legal_revision_ids"] = revisions
    payload["personal_data_consent_accepted"] = False
    assert client.post("/auth/email/register", json=payload).status_code == 400
    with TestingSessionLocal() as db:
        assert db.query(User).filter(User.email == "underage@example.com").count() == 0


def test_verification_token_hash_expiry_and_resend(client: TestClient, monkeypatch):
    revisions = _registration_docs()
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda address, token: sent.append(token) or "test_capture")
    email = "stage8-token@example.com"
    registered = client.post("/auth/email/register", json={"email": email, "name": "Token Tester", "username": "token_tester", "password": "SecretPass123!", "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances()})
    assert registered.status_code == 200
    with TestingSessionLocal() as db:
        first = db.query(AccountActionToken).filter(AccountActionToken.purpose == "verify_email").one()
        assert first.token_hash == token_digest(sent[0])
        assert first.token_hash != sent[0]
        first.expires_at = utcnow() - timedelta(seconds=1)
        first.created_at = utcnow() - timedelta(minutes=2)
        db.commit()
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 400
    assert client.post("/auth/email/resend-verification", json={"email": email}).status_code == 200
    assert len(sent) == 2
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 400
    assert client.post("/auth/email/verify", json={"token": sent[1]}).status_code == 200
    assert client.post("/auth/email/resend-verification", json={"email": "unknown@example.com"}).status_code == 200


def test_unverified_email_correction_invalidates_old_link(client: TestClient, monkeypatch):
    revisions = _registration_docs()
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda address, token, **kwargs: sent.append((address, token)) or "test_capture")
    original = "stage8-correct-old@example.com"
    replacement = "stage8-correct-new@example.com"
    registered = client.post("/auth/email/register", json={
        "email": original, "name": "Correct Tester", "username": "correct_tester", "password": "SecretPass123!",
        "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances(),
    })
    assert registered.status_code == 200
    corrected = client.post("/auth/email/correct-email", json={
        "email": original, "password": "SecretPass123!", "new_email": replacement,
    })
    assert corrected.status_code == 200
    assert client.post("/auth/email/verify", json={"token": sent[0][1]}).status_code == 400
    assert client.post("/auth/email/login", json={"email": original, "password": "SecretPass123!"}).status_code == 403
    assert client.post("/auth/email/verify", json={"token": sent[1][1]}).status_code == 200
    assert client.post("/auth/email/login", json={"email": replacement, "password": "SecretPass123!"}).status_code == 200
