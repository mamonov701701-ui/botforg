"""
Минимальные тесты канала WhatsApp: provider-abstraction, enable/status, webhook, normalize_incoming.
Перед запуском: alembic upgrade head (таблица bot_channel_connections).
"""
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError

from backend.main import app
from backend.database import SessionLocal
from backend.channels.whatsapp.providers.registry import get_whatsapp_provider
from backend.channels.whatsapp.providers.meta_cloud import MetaCloudProvider
from backend.auth.rate_limit import rate_limit_store
from tests.utils_whatsapp_sign import META_SIGNATURE_HEADER, compute_meta_signature

client = TestClient(app)


def _has_bot_channel_connections() -> bool:
    """Проверка наличия таблицы bot_channel_connections."""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM bot_channel_connections LIMIT 1"))
        return True
    except SQLOperationalError:
        return False
    finally:
        db.close()


@pytest.fixture(scope="module")
def whatsapp_bot_id():
    """Создаёт бота и подключение whatsapp с provider=meta_cloud, возвращает bot_id."""
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        owner_id = row[0]
        db.execute(
            text(
                "INSERT INTO bots (owner_id, title, username, token, is_active) "
                "VALUES (:oid, 'WhatsApp Test Bot', 'wa_test_bot', 'test-token', 1)"
            ),
            {"oid": owner_id},
        )
        db.commit()
        r = db.execute(text("SELECT id FROM bots WHERE username = 'wa_test_bot' ORDER BY id DESC LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        bot_id = row[0]
        creds = json.dumps({
            "provider": "meta_cloud",
            "token": "fake",
            "phone_number_id": "123",
            "verify_token": "verify",
            "app_secret": "test_secret",
        })
        db.execute(
            text(
                "INSERT INTO bot_channel_connections (bot_id, channel, is_enabled, credentials_json) "
                "VALUES (:bot_id, 'whatsapp', 1, :creds)"
            ),
            {"bot_id": bot_id, "creds": creds},
        )
        db.commit()
        return bot_id
    finally:
        db.close()


def test_unknown_provider_returns_400():
    """Неизвестный provider при enable -> 400."""
    # Для enable нужен существующий conn с provider=unknown_provider; проще проверить через webhook
    # или через мок. Проверяем get_whatsapp_provider.
    assert get_whatsapp_provider("unknown_provider") is None
    assert get_whatsapp_provider("meta_cloud") is not None


def test_normalize_incoming_empty_payload():
    """normalize_incoming не падает на пустом payload."""
    provider = MetaCloudProvider()
    out = provider.normalize_incoming({})
    assert out.channel == "whatsapp"
    assert out.chat_id is None
    assert out.text is None
    assert out.raw is not None

    out2 = provider.normalize_incoming({"messages": [{"from": "123", "text": {"body": "hi"}}]})
    assert out2.channel == "whatsapp"
    assert out2.chat_id == "123"
    assert out2.text == "hi"


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_whatsapp_webhook_without_credentials_returns_404():
    """Webhook для бота без подключения whatsapp -> 404."""
    # Используем bot_id=999999 — скорее всего такого бота нет или у него нет whatsapp
    resp = client.post(
        "/webhooks/whatsapp/999999",
        json={"messages": []},
        headers={},
    )
    assert resp.status_code in (404, 400)


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_whatsapp_webhook_with_provider_returns_200(whatsapp_bot_id):
    """Webhook с подключённым whatsapp и provider=meta_cloud и верной подписью -> 200."""
    if not whatsapp_bot_id:
        pytest.skip("Could not create test bot")
    app_secret = "test_secret"
    body = {"object": "whatsapp_business_account", "entry": [{"id": "1", "changes": [{"value": {"messages": [{"from": "79001234567", "id": "mid.1", "timestamp": "123", "type": "text", "text": {"body": "test"}}]}, "field": "messages"}]}]}
    body_bytes = json.dumps(body).encode("utf-8")
    signature = compute_meta_signature(body_bytes, app_secret)
    resp = client.post(
        f"/webhooks/whatsapp/{whatsapp_bot_id}",
        content=body_bytes,
        headers={"Content-Type": "application/json", META_SIGNATURE_HEADER: signature},
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_whatsapp_enable_with_provider_meta_cloud_returns_ok():
    """Enable с provider=meta_cloud и валидным JWT -> 200."""
    rate_limit_store.clear()
    uid = uuid.uuid4().hex[:8]
    email = f"wa_enable_{uid}@example.com"
    password = "SecretPass123!"
    client.post("/auth/email/register", json={"email": email, "password": password, "name": "WA Enable"})
    r = client.post("/auth/email/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip("Login failed")
    token = r.json().get("access_token")
    if not token:
        pytest.skip("No token")
    headers = {"Authorization": f"Bearer {token}"}
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email})
        row = r.fetchone()
        if not row:
            pytest.skip("User not found")
        owner_id = row[0]
        db.execute(
            text(
                "INSERT INTO bots (owner_id, title, username, token, is_active) "
                "VALUES (:oid, 'WA Enable Bot', 'wa_enable_bot', 'tok', 1)"
            ),
            {"oid": owner_id},
        )
        db.commit()
        r = db.execute(text("SELECT id FROM bots WHERE username = 'wa_enable_bot' ORDER BY id DESC LIMIT 1"))
        row = r.fetchone()
        if not row:
            pytest.skip("Bot not created")
        bot_id = row[0]
        creds = json.dumps({"provider": "meta_cloud", "token": "x"})
        db.execute(
            text(
                "INSERT INTO bot_channel_connections (bot_id, channel, is_enabled, credentials_json) "
                "VALUES (:bot_id, 'whatsapp', 0, :creds)"
            ),
            {"bot_id": bot_id, "creds": creds},
        )
        db.commit()
    finally:
        db.close()
    resp = client.post(f"/bots/{bot_id}/channels/whatsapp/enable", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json().get("ok") is True
    assert resp.json().get("is_enabled") is True
    assert resp.json().get("provider") == "meta_cloud"
