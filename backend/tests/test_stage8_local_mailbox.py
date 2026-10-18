"""The Development receiver accepts existing SMTP transport and exposes mail locally."""

import importlib.util
from pathlib import Path
import threading
from urllib.request import urlopen

from backend.services.email_transport import (
    EmailMessagePayload,
    LoggingEmailTransport,
    SmtpEmailTransport,
    get_email_transport,
)
from backend.settings import settings


def _mailbox_module():
    path = Path(__file__).resolve().parents[2] / "scripts" / "dev-local-mailbox.py"
    spec = importlib.util.spec_from_file_location("botforg_dev_local_mailbox", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_local_mailbox_receives_smtp_and_shows_link(monkeypatch, caplog):
    mailbox = _mailbox_module()
    assert mailbox.SMTP_ADDRESS[0] == mailbox.WEB_ADDRESS[0] == "127.0.0.1"
    with mailbox.SmtpServer(("127.0.0.1", 0), mailbox.SmtpHandler) as smtp, \
         mailbox.ThreadingHTTPServer(("127.0.0.1", 0), mailbox.WebHandler) as web:
        smtp_thread = threading.Thread(target=smtp.serve_forever, daemon=True)
        web_thread = threading.Thread(target=web.serve_forever, daemon=True)
        smtp_thread.start()
        web_thread.start()
        try:
            monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
            monkeypatch.setattr(settings, "SMTP_PORT", smtp.server_address[1])
            monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
            SmtpEmailTransport().send(EmailMessagePayload(
                to_email="local-qa@example.com", subject="Stage 8 local QA",
                body_text="Open http://localhost:5173/auth/verify#token=local-test-only",
            ))
            base = f"http://127.0.0.1:{web.server_address[1]}"
            assert b"botforg-dev-local-mailbox" in urlopen(base + "/healthz", timeout=3).read()
            assert b"Stage 8 local QA" in urlopen(base + "/", timeout=3).read()
            detail = urlopen(base + "/messages/1", timeout=3).read().decode()
            assert "Открыть ссылку подтверждения" in detail
            assert "local-test-only" in detail
            assert "local-test-only" not in caplog.text
        finally:
            smtp.shutdown()
            web.shutdown()
            smtp_thread.join(timeout=2)
            web_thread.join(timeout=2)


def test_production_never_selects_log_only_transport(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert isinstance(get_email_transport(), SmtpEmailTransport)
    assert not isinstance(get_email_transport(), LoggingEmailTransport)
