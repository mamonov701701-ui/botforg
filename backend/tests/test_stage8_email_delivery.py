"""Account email and outbox integration against an isolated local SMTP sink."""

from contextlib import contextmanager
from datetime import timedelta
from email import policy
from email.parser import BytesParser
import re
import socketserver
import threading
from unittest.mock import Mock
import pytest
from urllib.parse import urlsplit, parse_qs

from backend.models.auth import AccountActionToken
from backend.models.notification import NotificationOutbox
from backend.services.account_security import utcnow
from backend.services.email_transport import EmailMessagePayload, EmailTransportError, SmtpEmailTransport
from backend.services.notification_outbox_worker import run_outbox_once
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, register_and_get_token
from backend.tests.test_auth import _registration_docs, _legal_acceptances


class _SmtpSink(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self):
        self.messages: list[bytes] = []
        super().__init__(("127.0.0.1", 0), _SmtpHandler)


class _SmtpHandler(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b"220 local-test-smtp ready\r\n")
        data = bytearray()
        in_data = False
        while line := self.rfile.readline():
            if in_data:
                if line == b".\r\n":
                    self.server.messages.append(bytes(data))
                    data = bytearray()
                    in_data = False
                    self.wfile.write(b"250 accepted\r\n")
                else:
                    data.extend(line[1:] if line.startswith(b"..") else line)
                continue
            command = line.split(b" ", 1)[0].upper().strip()
            if command in {b"EHLO", b"HELO"}:
                self.wfile.write(b"250-local-test-smtp\r\n250 OK\r\n")
            elif command in {b"MAIL", b"RCPT", b"RSET"}:
                self.wfile.write(b"250 OK\r\n")
            elif command == b"DATA":
                in_data = True
                self.wfile.write(b"354 send data\r\n")
            elif command == b"QUIT":
                self.wfile.write(b"221 bye\r\n")
                break
            else:
                self.wfile.write(b"500 unsupported\r\n")


@contextmanager
def local_smtp():
    server = _SmtpSink()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _body(message: bytes) -> str:
    return BytesParser(policy=policy.default).parsebytes(message).get_content()


def test_registration_email_resend_and_confirmation_via_local_smtp(client, monkeypatch, caplog):
    revisions = _registration_docs()
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        monkeypatch.setattr("backend.auth.email.get_email_transport", lambda: SmtpEmailTransport())
        registered = client.post("/auth/email/register", json={
            "email": "smtp-stage8@example.com", "name": "SMTP Tester", "username": "smtp_tester", "password": "SecretPass123!",
            "date_of_birth": "1990-10-09", "legal_revision_ids": revisions, **_legal_acceptances(),
        })
        assert registered.status_code == 200, registered.text
        assert "delivery_state" not in registered.json()
        assert len(sink.messages) == 1
        duplicate = client.post("/auth/email/register", json={
            "email": "smtp-stage8@example.com", "name": "Another Tester", "username": "smtp_second",
            "password": "AnotherPass123!", "date_of_birth": "1990-10-09",
            "legal_revision_ids": revisions, **_legal_acceptances(),
        })
        assert duplicate.status_code == 200 and duplicate.json() == registered.json()
        assert len(sink.messages) == 1
        first_body = _body(sink.messages[0])
        first_url = re.search(r"https?://\S+/auth/verify#token=\S+", first_body).group(0)
        first_token = parse_qs(urlsplit(first_url).fragment)["token"][0]
        assert client.post("/auth/email/verify-preview", json={"token": first_token}).status_code == 200
        assert client.post("/auth/email/login", json={"email": "smtp-stage8@example.com", "password": "SecretPass123!"}).status_code == 403
        with TestingSessionLocal() as db:
            row = db.query(AccountActionToken).filter(AccountActionToken.purpose == "verify_email").one()
            row.created_at = utcnow().replace(year=2020)
            db.commit()
        assert client.post("/auth/email/resend-verification", json={"email": "smtp-stage8@example.com"}).status_code == 200
        assert len(sink.messages) == 2
        second_url = re.search(r"https?://\S+/auth/verify#token=\S+", _body(sink.messages[1])).group(0)
        second_token = parse_qs(urlsplit(second_url).fragment)["token"][0]
        assert second_token != first_token
        assert client.post("/auth/email/verify", json={"token": first_token}).status_code == 400
        assert client.post("/auth/email/verify", json={"token": second_token}).status_code == 200
        login = client.post("/auth/email/login", json={"email": "smtp-stage8@example.com", "password": "SecretPass123!"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        assert client.get("/me", headers=headers).status_code == 200
        assert client.patch("/me", json={"name": "Updated SMTP Tester"}, headers=headers).json()["name"] == "Updated SMTP Tester"
        assert client.get("/me/settings", headers=headers).status_code == 200
        assert len(client.get("/api/user/security/sessions", headers=headers).json()) == 1
        assert first_token not in caplog.text and second_token not in caplog.text


def test_security_outbox_retries_smtp_outage_and_sends_once(client, monkeypatch, caplog):
    token = register_and_get_token(client)
    headers = {"Authorization": token}
    changed = client.post("/api/user/security/change-password", json={
        "current_password": "SecretPass123!", "new_password": "AnotherPass123!",
    }, headers=headers)
    assert changed.status_code == 200
    with TestingSessionLocal() as db:
        assert db.query(NotificationOutbox).filter(NotificationOutbox.event_type == "password_changed").count() == 1
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        transport = SmtpEmailTransport()
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1] + 1)
        with TestingSessionLocal() as db:
            first = run_outbox_once(db, transport=transport)
            assert first["retry"] == 1
            row = db.query(NotificationOutbox).filter(NotificationOutbox.event_type == "password_changed").one()
            row.available_at = utcnow()
            db.commit()
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        with TestingSessionLocal() as db:
            second = run_outbox_once(db, transport=transport)
            third = run_outbox_once(db, transport=transport)
            assert second["sent"] == 1 and third["claimed"] == 0
        assert len(sink.messages) == 1
        assert "Пароль аккаунта изменён" in _body(sink.messages[0])
        assert "SecretPass123!" not in caplog.text


def test_smtp_transport_fails_when_sender_is_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    with pytest.raises(EmailTransportError) as error:
        SmtpEmailTransport().send(EmailMessagePayload(
            to_email="member@example.com", subject="BotForg", body_text="No secret",
        ))
    assert error.value.code == "smtp_not_configured"


def _reset_token(message: bytes) -> str:
    url = re.search(r"https?://\S+/auth/reset#token=\S+", _body(message)).group(0)
    return parse_qs(urlsplit(url).fragment)["token"][0]


def test_password_reset_reissue_delivers_latest_link_and_revokes_sessions(client, monkeypatch, caplog):
    original = register_and_get_token(client)
    headers = {"Authorization": original}
    email = client.get("/me", headers=headers).json()["email"]
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        monkeypatch.setattr("backend.auth.email.get_email_transport", lambda: SmtpEmailTransport())
        first = client.post("/auth/email/request-reset", json={"email": email})
        assert first.status_code == 200 and len(sink.messages) == 1
        token_one = _reset_token(sink.messages[0])
        with TestingSessionLocal() as db:
            row = db.query(AccountActionToken).filter(AccountActionToken.purpose == "password_reset").one()
            assert row.expires_at - row.created_at == timedelta(hours=24)
            assert row.consumed_at is None
        assert client.get("/auth/email/reset").status_code == 405
        assert client.post("/auth/email/reset", json={"token": token_one, "new_password": "short"}).status_code == 400
        assert client.post("/auth/email/reset", json={"token": "invalid", "new_password": "ChangedPass123!"}).status_code == 400
        second = client.post("/auth/email/request-reset", json={"email": email})
        assert second.status_code == 200 and len(sink.messages) == 2
        token_two = _reset_token(sink.messages[1])
        assert token_two != token_one
        assert client.post("/auth/email/reset", json={"token": token_one, "new_password": "ChangedPass123!"}).status_code == 400
        assert client.post("/auth/email/reset", json={"token": token_two, "new_password": "ChangedPass123!"}).status_code == 200
        assert client.post("/auth/email/reset", json={"token": token_two, "new_password": "AgainPass123!"}).status_code == 400
        assert client.get("/me", headers=headers).status_code == 401
        assert client.post("/auth/email/login", json={"email": email, "password": "SecretPass123!"}).status_code == 401
        assert client.post("/auth/email/login", json={"email": email, "password": "ChangedPass123!"}).status_code == 200
        assert token_one not in caplog.text and token_two not in caplog.text


def test_failed_repeat_delivery_preserves_previous_link(client, monkeypatch, caplog):
    original = register_and_get_token(client)
    email = client.get("/me", headers={"Authorization": original}).json()["email"]
    warning = Mock()
    monkeypatch.setattr("backend.auth.email_routes.logger.warning", warning)
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        monkeypatch.setattr("backend.auth.email.get_email_transport", lambda: SmtpEmailTransport())
        assert client.post("/auth/email/request-reset", json={"email": email}).status_code == 200
        previous = _reset_token(sink.messages[0])
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1] + 1)
        failed = client.post("/auth/email/request-reset", json={"email": email})
        assert failed.status_code == 200
        assert "почта доступна" in failed.json()["message"]
        assert len(sink.messages) == 1
        with TestingSessionLocal() as db:
            rows = db.query(AccountActionToken).filter(AccountActionToken.purpose == "password_reset").all()
            assert len(rows) == 1 and rows[0].consumed_at is None
        warning.assert_called_once_with("password_reset_delivery_failed code=%s", "smtp_connection")
        assert previous not in caplog.text
        assert client.post("/auth/email/reset", json={"token": previous, "new_password": "ChangedPass123!"}).status_code == 200


def test_expired_reset_link_does_not_change_password_and_new_link_works(client, monkeypatch):
    original = register_and_get_token(client)
    email = client.get("/me", headers={"Authorization": original}).json()["email"]
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        monkeypatch.setattr("backend.auth.email.get_email_transport", lambda: SmtpEmailTransport())
        assert client.post("/auth/email/request-reset", json={"email": email}).status_code == 200
        expired = _reset_token(sink.messages[0])
        with TestingSessionLocal() as db:
            row = db.query(AccountActionToken).filter(AccountActionToken.purpose == "password_reset").one()
            row.expires_at = utcnow() - timedelta(seconds=1)
            db.commit()
        assert client.post("/auth/email/reset", json={"token": expired, "new_password": "ChangedPass123!"}).status_code == 400
        assert client.post("/auth/email/login", json={"email": email, "password": "SecretPass123!"}).status_code == 200
        assert client.post("/auth/email/request-reset", json={"email": email}).status_code == 200
        assert len(sink.messages) == 2
        fresh = _reset_token(sink.messages[1])
        assert client.post("/auth/email/reset", json={"token": fresh, "new_password": "ChangedPass123!"}).status_code == 200


def test_reset_rate_limit_reports_429_without_issuing_mail(client, monkeypatch):
    original = register_and_get_token(client)
    email = client.get("/me", headers={"Authorization": original}).json()["email"]
    sent = []
    monkeypatch.setattr("backend.auth.email_routes.send_password_reset_email", lambda *_: sent.append(True))
    for number in range(5):
        assert client.post("/auth/email/request-reset", json={"email": f"absent{number}@example.com"}).status_code == 200
    limited = client.post("/auth/email/request-reset", json={"email": email})
    assert limited.status_code == 429
    assert "через" in limited.json()["detail"]
    assert sent == []
    with TestingSessionLocal() as db:
        assert db.query(AccountActionToken).filter(AccountActionToken.purpose == "password_reset").count() == 0


def test_unverified_email_gets_neutral_reset_response_without_mail_until_confirmed(client, monkeypatch):
    revisions = _registration_docs()
    verification_tokens = []
    reset_tokens = []
    monkeypatch.setattr(
        "backend.auth.email_routes.send_verification_email",
        lambda _email, token: verification_tokens.append(token),
    )
    monkeypatch.setattr(
        "backend.auth.email_routes.send_password_reset_email",
        lambda _email, token: reset_tokens.append(token),
    )
    email = "unverified-reset-qa@example.com"
    registered = client.post("/auth/email/register", json={
        "email": email, "name": "Reset QA", "username": "unverified_reset_qa",
        "password": "SecretPass123!", "date_of_birth": "1990-10-09",
        "legal_revision_ids": revisions, **_legal_acceptances(),
    })
    assert registered.status_code == 200
    assert len(verification_tokens) == 1
    before = client.post("/auth/email/request-reset", json={"email": email})
    assert before.status_code == 200
    assert reset_tokens == []
    with TestingSessionLocal() as db:
        assert db.query(AccountActionToken).filter(AccountActionToken.purpose == "password_reset").count() == 0

    assert client.post("/auth/email/verify", json={"token": verification_tokens[0]}).status_code == 200
    after = client.post("/auth/email/request-reset", json={"email": email})
    assert after.status_code == 200
    assert len(reset_tokens) == 1


def test_repeated_login_alert_delivers_once_to_local_smtp(client, monkeypatch, caplog):
    token = register_and_get_token(client)
    email = client.get("/me", headers={"Authorization": token}).json()["email"]
    for _ in range(4):
        response = client.post("/auth/email/login", json={"email": email, "password": "WrongPass123!"})
        assert response.status_code == 401
    with local_smtp() as sink:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", sink.server_address[1])
        monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
        with TestingSessionLocal() as db:
            result = run_outbox_once(db, transport=SmtpEmailTransport())
            assert result["sent"] == 1
        assert len(sink.messages) == 1
        body = _body(sink.messages[0])
        assert "несколько неудачных попыток входа" in body
        assert "Дата и время события (UTC)" in body
        assert "WrongPass123!" not in body and "WrongPass123!" not in caplog.text
