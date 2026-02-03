"""
P0-1: Защита от утечек секретов каналов.
GET /bots/{id}/channels не должен возвращать token, app_secret, verify_token, credentials_json и их значения.
"""
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError

from backend.main import app
from backend.database import SessionLocal
from backend.auth.rate_limit import rate_limit_store

client = TestClient(app)

# Уникальные значения, которые не должны появиться в ответе API
LEAK_CHECK_TOKEN = "leak_check_token_value_xyz"
LEAK_CHECK_APP_SECRET = "leak_check_app_secret_value_xyz"
LEAK_CHECK_VERIFY_TOKEN = "leak_check_verify_token_value_xyz"


def _has_bot_channel_connections() -> bool:
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM bot_channel_connections LIMIT 1"))
        return True
    except SQLOperationalError:
        return False
    finally:
        db.close()


@pytest.fixture(scope="module")
def channel_list_bot_id():
    """Бот с подключением whatsapp meta_cloud и тестовыми секретами."""
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None, None
        owner_id = row[0]
        db.execute(
            text(
                "INSERT INTO bots (owner_id, title, username, token, is_active) "
                "VALUES (:oid, 'Secrets Leak Test Bot', 'secrets_leak_test_bot', 'bot-tok', 1)"
            ),
            {"oid": owner_id},
        )
        db.commit()
        r = db.execute(text("SELECT id FROM bots WHERE username = 'secrets_leak_test_bot' ORDER BY id DESC LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None, None
        bot_id = row[0]
        creds = json.dumps({
            "provider": "meta_cloud",
            "token": LEAK_CHECK_TOKEN,
            "phone_number_id": "123",
            "verify_token": LEAK_CHECK_VERIFY_TOKEN,
            "app_secret": LEAK_CHECK_APP_SECRET,
        })
        db.execute(
            text(
                "INSERT INTO bot_channel_connections (bot_id, channel, is_enabled, credentials_json) "
                "VALUES (:bot_id, 'whatsapp', 1, :creds)"
            ),
            {"bot_id": bot_id, "creds": creds},
        )
        db.commit()
        return bot_id, owner_id
    finally:
        db.close()


@pytest.fixture(scope="module")
def auth_headers(channel_list_bot_id):
    """JWT владельца бота для GET /bots/{bot_id}/channels."""
    bot_id, owner_id = channel_list_bot_id
    if bot_id is None or owner_id is None:
        return None
    rate_limit_store.clear()
    uid = uuid.uuid4().hex[:8]
    email = f"secrets_test_{uid}@example.com"
    password = "SecretPass123!"
    client.post("/auth/email/register", json={"email": email, "password": password, "name": "Secrets Test"})
    r = client.post("/auth/email/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    token = r.json().get("access_token")
    if not token:
        return None
    # Привязываем бота к этому пользователю (владелец)
    db = SessionLocal()
    try:
        r = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email})
        row = r.fetchone()
        if not row:
            return None
        new_owner_id = row[0]
        db.execute(text("UPDATE bots SET owner_id = :oid WHERE id = :bid"), {"oid": new_owner_id, "bid": bot_id})
        db.commit()
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_channel_list_does_not_leak_secrets(channel_list_bot_id, auth_headers):
    """GET /bots/{id}/channels не содержит секретов и их значений."""
    bot_id, _ = channel_list_bot_id
    if bot_id is None:
        pytest.skip("Could not create test bot")
    if auth_headers is None:
        pytest.skip("Could not get auth")
    resp = client.get(f"/bots/{bot_id}/channels", headers=auth_headers)
    assert resp.status_code == 200
    text_response = resp.text
    # Не должно быть ключей/полей с секретами
    assert "credentials_json" not in text_response
    # Не должно быть значений наших тестовых секретов
    assert LEAK_CHECK_TOKEN not in text_response
    assert LEAK_CHECK_APP_SECRET not in text_response
    assert LEAK_CHECK_VERIFY_TOKEN not in text_response
    # Ответ — список; каждый элемент без полей token, app_secret, verify_token
    data = resp.json()
    assert isinstance(data, list)
    for item in data:
        assert "token" not in item
        assert "app_secret" not in item
        assert "verify_token" not in item
        assert "credentials" not in item
        assert "credentials_json" not in item
