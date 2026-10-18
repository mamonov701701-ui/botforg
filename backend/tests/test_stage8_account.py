"""Stage 8 security paths on the isolated, migrated pytest database."""

from datetime import date, timedelta
from io import BytesIO
import time

from PIL import Image

from backend.auth.email_routes import _adult
from backend.models.auth import Account, AccountActionToken, AccountDeletionRequest, AccountSession, DisplayNameHistory, SecurityAuditEvent
from backend.models.notification import NotificationOutbox
from backend.models.user import User
from backend.models.custom_block import CustomBlock
from backend.services.account_security import _hotp, token_digest, utcnow
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


def _auth(client):
    token = register_and_get_token(client)
    headers = {"Authorization": token}
    user = client.get("/me", headers=headers).json()
    return headers, user


def test_calendar_age_rule():
    today = date(2026, 10, 9)
    assert _adult(date(2008, 10, 9), today)
    assert not _adult(date(2008, 10, 10), today)
    assert _adult(date(2008, 2, 29), today)
    assert not _adult(date(2027, 1, 1), today)


def test_email_change_pending_until_post_confirmation(client, monkeypatch):
    headers, person = _auth(client)
    sent = []
    monkeypatch.setattr("backend.routers.user_security.send_verification_email", lambda email, token, **kwargs: sent.append(token) or "test_capture")
    response = client.post("/api/user/security/change-email", json={"new_email": "new-stage8@example.com", "current_password": "SecretPass123!"}, headers=headers)
    assert response.status_code == 200, response.text
    assert client.get("/me", headers=headers).json()["email"] == person["email"]
    assert client.post("/auth/email/verify-preview", json={"token": sent[0]}).status_code == 200
    assert client.get("/me", headers=headers).status_code == 200
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 200
    assert client.post("/auth/email/verify", json={"token": sent[0]}).status_code == 400
    assert client.get("/me", headers=headers).status_code == 401
    login = client.post("/auth/email/login", json={"email": "new-stage8@example.com", "password": "SecretPass123!"})
    assert login.status_code == 200
    with TestingSessionLocal() as db:
        recipients = {row.recipient_email for row in db.query(NotificationOutbox).filter(NotificationOutbox.event_type == "email_change_completed").all()}
        assert recipients == {person["email"], "new-stage8@example.com"}


def test_session_revocation_and_password_change(client):
    first, person = _auth(client)
    second_login = client.post("/auth/email/login", json={"email": person["email"], "password": "SecretPass123!"})
    second = {"Authorization": f"Bearer {second_login.json()['access_token']}"}
    rows = client.get("/api/user/security/sessions", headers=first).json()
    assert len(rows) == 2
    assert sum(bool(row["current"]) for row in rows) == 1
    assert client.post("/api/user/security/sessions/revoke-others", headers=first).status_code == 200
    assert client.get("/me", headers=second).status_code == 401
    assert client.get("/me", headers=first).status_code == 200
    changed = client.post("/api/user/security/change-password", json={"current_password": "SecretPass123!", "new_password": "AnotherPass123!"}, headers=first)
    assert changed.status_code == 200
    assert client.get("/me", headers=first).status_code == 401
    assert client.post("/auth/email/login", json={"email": person["email"], "password": "SecretPass123!"}).status_code == 401
    assert client.post("/auth/email/login", json={"email": person["email"], "password": "AnotherPass123!"}).status_code == 200


def test_password_reset_uses_verified_email_once_and_revokes_session(client, monkeypatch):
    headers, person = _auth(client)
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_password_reset_email", lambda email, token: sent.append(token))
    assert client.post("/auth/email/request-reset", json={"email": person["email"]}).status_code == 200
    assert len(sent) == 1
    assert client.post("/auth/email/reset", json={"token": sent[0], "new_password": "NewSecret123!"}).status_code == 200
    assert client.post("/auth/email/reset", json={"token": sent[0], "new_password": "OtherSecret123!"}).status_code == 400
    assert client.get("/me", headers=headers).status_code == 401
    assert client.post("/auth/email/login", json={"email": person["email"], "password": "SecretPass123!"}).status_code == 401
    assert client.post("/auth/email/login", json={"email": person["email"], "password": "NewSecret123!"}).status_code == 200
    assert client.post("/auth/email/request-reset", json={"email": "absent-stage8@example.com"}).status_code == 200
    assert len(sent) == 1


def test_totp_requires_second_step_and_backup_is_single_use(client):
    headers, person = _auth(client)
    setup = client.post("/api/user/security/totp/setup", json={"password": "SecretPass123!"}, headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    code = _hotp(secret, int(time.time() // 30))
    confirmed = client.post("/api/user/security/totp/confirm", json={"code": code}, headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    with TestingSessionLocal() as db:
        assert db.query(NotificationOutbox).filter_by(event_type="totp_enabled").count() == 1
    backup = confirmed.json()["backup_codes"][0]
    assert client.get("/me", headers=headers).status_code == 401
    login = client.post("/auth/email/login", json={"email": person["email"], "password": "SecretPass123!"})
    assert login.status_code == 200
    assert "access_token" not in login.json()
    challenge = login.json()["challenge"]
    assert client.get("/me", headers={"Authorization": f"Bearer {challenge}"}).status_code == 401
    assert client.post("/auth/email/complete-2fa", json={"challenge": challenge, "code": code}).status_code == 401
    completed = client.post("/auth/email/complete-2fa", json={"challenge": challenge, "code": backup})
    assert completed.status_code == 200, completed.text
    assert client.get("/me", headers={"Authorization": f"Bearer {completed.json()['access_token']}"}).status_code == 200
    assert client.post("/auth/email/complete-2fa", json={"challenge": challenge, "code": backup}).status_code == 401
    second = client.post("/auth/email/login", json={"email": person["email"], "password": "SecretPass123!"}).json()["challenge"]
    assert client.post("/auth/email/complete-2fa", json={"challenge": second, "code": backup}).status_code == 401
    active = {"Authorization": f"Bearer {completed.json()['access_token']}"}
    disabled = client.post("/api/user/security/totp/disable", json={
        "current_password": "SecretPass123!", "code": confirmed.json()["backup_codes"][1],
    }, headers=active)
    assert disabled.status_code == 200
    assert client.get("/me", headers=active).status_code == 401
    with TestingSessionLocal() as db:
        assert db.query(NotificationOutbox).filter_by(event_type="totp_disabled").count() == 1


def test_cancelled_totp_setup_invalidates_old_secret(client):
    headers, _ = _auth(client)
    first = client.post("/api/user/security/totp/setup", json={"password": "SecretPass123!"}, headers=headers)
    assert first.status_code == 200
    old_code = _hotp(first.json()["secret"], int(time.time() // 30))
    assert client.post("/api/user/security/totp/cancel", headers=headers).status_code == 200
    assert client.post("/api/user/security/totp/confirm", json={"code": old_code}, headers=headers).status_code == 400
    second = client.post("/api/user/security/totp/setup", json={"password": "SecretPass123!"}, headers=headers)
    assert second.status_code == 200
    assert second.json()["secret"] != first.json()["secret"]
    assert client.post("/api/user/security/totp/confirm", json={"code": old_code}, headers=headers).status_code == 400
    new_code = _hotp(second.json()["secret"], int(time.time() // 30))
    assert client.post("/api/user/security/totp/confirm", json={"code": new_code}, headers=headers).status_code == 200
    assert client.post("/api/user/security/totp/cancel", headers=headers).status_code == 401


def test_profile_phone_avatar_and_deletion_request(client):
    headers, person = _auth(client)
    with TestingSessionLocal() as db:
        block = CustomBlock(stable_key=f"stage8-owner-{person['id']}", owner_user_id=person["id"], created_by_user_id=person["id"])
        db.add(block)
        db.commit()
        block_id = block.id
    updated = client.patch("/me", json={"name": "New Public Name", "date_of_birth": "1990-01-02"}, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["public_id"] == person["public_id"]
    with TestingSessionLocal() as db:
        assert db.query(DisplayNameHistory).filter(DisplayNameHistory.user_id == person["id"]).count() == 1
        assert db.get(CustomBlock, block_id).owner_user_id == person["id"]
    invalid = client.put("/me/phone", json={"phone": "12345"}, headers=headers)
    assert invalid.status_code == 400
    phone = client.put("/me/phone", json={"phone": "+7 999 123-45-67"}, headers=headers)
    assert phone.status_code == 200, phone.text
    assert phone.json()["phone"] == "+79991234567"
    assert phone.json()["phone_verified"] is False
    assert client.delete("/me/phone", headers=headers).json()["phone"] is None
    buffer = BytesIO()
    Image.new("RGB", (24, 24), color="red").save(buffer, format="JPEG")
    mismatched = client.post("/me/avatar", files={"file": ("mismatch.png", buffer.getvalue(), "image/png")}, headers=headers)
    assert mismatched.status_code == 400
    avatar = client.post("/me/avatar", files={"file": ("unsafe.svg", buffer.getvalue(), "image/jpeg")}, headers=headers)
    assert avatar.status_code == 200, avatar.text
    assert avatar.json()["avatar"].startswith("/uploads/avatars/")
    assert avatar.json()["avatar"].endswith(".png")
    assert client.delete("/me/avatar", headers=headers).json()["avatar"] is None
    assert client.get("/privacy/deletion-request", headers=headers).json()["status"] == "none"
    assert client.post("/privacy/delete", json={"current_password": "wrong"}, headers=headers).status_code == 401
    requested = client.post("/privacy/delete", json={"current_password": "SecretPass123!"}, headers=headers)
    assert requested.status_code == 200
    assert requested.json()["status"] == "pending_review"
    assert client.get("/me", headers=headers).status_code == 200


def test_optional_consent_withdrawal_is_reflected_in_status(client):
    headers, _ = _auth(client)
    assert client.get("/privacy/optional-consents", headers=headers).json() == {"advertising_consent": False}
    assert client.post("/privacy/optional-consents/advertising", json={"accepted": True}, headers=headers).status_code == 503


def test_deletion_request_owner_review_is_audited_and_non_destructive(client):
    headers, person = _auth(client)
    first = client.post("/privacy/delete", json={"current_password": "SecretPass123!"}, headers=headers)
    second = client.post("/privacy/delete", json={"current_password": "SecretPass123!"}, headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["requested_at"] == second.json()["requested_at"]
    assert client.get("/privacy/admin/deletion-requests", headers=headers).status_code == 403
    with TestingSessionLocal() as db:
        request_id = db.query(AccountDeletionRequest.id).filter(AccountDeletionRequest.user_id == person["id"]).scalar()
        assert client.post(f"/privacy/admin/deletion-requests/{request_id}/review", json={"status": "in_review"}, headers=headers).status_code == 403
        user = db.get(User, person["id"])
        user.role = "owner"
        db.commit()
    queue = client.get("/privacy/admin/deletion-requests", headers=headers)
    assert queue.status_code == 200
    request_id = queue.json()[0]["id"]
    invalid = client.post(f"/privacy/admin/deletion-requests/{request_id}/review", json={"status": "completed"}, headers=headers)
    assert invalid.status_code == 422
    reviewed = client.post(f"/privacy/admin/deletion-requests/{request_id}/review", json={"status": "awaiting_legal_policy"}, headers=headers)
    assert reviewed.status_code == 200
    assert client.get("/privacy/deletion-request", headers=headers).json()["status"] == "awaiting_legal_policy"
    repeated = client.post("/privacy/delete", json={"current_password": "SecretPass123!"}, headers=headers)
    assert repeated.status_code == 200 and repeated.json()["status"] == "awaiting_legal_policy"
    assert client.get("/me", headers=headers).status_code == 200
    with TestingSessionLocal() as db:
        assert db.get(User, person["id"]).email == person["email"]
        assert db.query(AccountDeletionRequest).filter(AccountDeletionRequest.user_id == person["id"]).count() == 1
        assert db.query(SecurityAuditEvent).filter(SecurityAuditEvent.event_type.like("deletion_review_%")).count() == 1


def test_existing_oauth_login_cannot_bypass_totp(client, monkeypatch):
    headers, person = _auth(client)
    setup = client.post("/api/user/security/totp/setup", json={"password": "SecretPass123!"}, headers=headers)
    assert setup.status_code == 200
    code = _hotp(setup.json()["secret"], int(time.time() // 30))
    confirmed = client.post("/api/user/security/totp/confirm", json={"code": code}, headers=headers)
    assert confirmed.status_code == 200
    backup = confirmed.json()["backup_codes"][0]
    with TestingSessionLocal() as db:
        db.add(Account(user_id=person["id"], provider="google", provider_user_id="stage8-google-user", email=person["email"]))
        db.commit()
        before = db.query(AccountSession).filter(AccountSession.user_id == person["id"], AccountSession.revoked_at.is_(None)).count()
        assert before == 0

    class FakeGoogleClient:
        async def authorize_access_token(self, request):
            return {"userinfo": {"sub": "stage8-google-user", "email": person["email"], "name": "Tester"}}

    monkeypatch.setattr("backend.auth.routes.oauth.create_client", lambda provider: FakeGoogleClient())
    callback = client.get("/auth/google/callback", follow_redirects=False)
    assert callback.status_code in (302, 307)
    assert "/auth/two-factor" in callback.headers["location"]
    assert "totp_challenge=" in callback.headers.get("set-cookie", "")
    assert "access_token=" not in callback.headers.get("set-cookie", "")
    assert client.get("/me").status_code == 401
    with TestingSessionLocal() as db:
        assert db.query(AccountSession).filter(AccountSession.user_id == person["id"], AccountSession.revoked_at.is_(None)).count() == 0
    completed = client.post("/auth/email/complete-2fa", json={"code": backup})
    assert completed.status_code == 200
    assert client.get("/me", headers={"Authorization": f"Bearer {completed.json()['access_token']}"}).status_code == 200

    class UnknownGoogleClient:
        async def authorize_access_token(self, request):
            return {"userinfo": {"sub": "unknown-google-user", "email": "oauth-unknown@example.com"}}

    monkeypatch.setattr("backend.auth.routes.oauth.create_client", lambda provider: UnknownGoogleClient())
    assert client.get("/auth/google/callback", follow_redirects=False).status_code == 403
