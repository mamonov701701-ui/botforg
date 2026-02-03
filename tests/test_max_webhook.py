"""
Минимальные тесты интеграции MAX: webhook secret (401/200) и normalize_incoming.
Перед запуском: alembic upgrade head (таблица bot_channel_connections).
"""
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError

from backend.main import app
from backend.database import SessionLocal
from backend.channels.max_adapter import MaxAdapter

client = TestClient(app)

# Заголовок MAX для секрета webhook
MAX_WEBHOOK_SECRET_HEADER = "X-Max-Bot-Api-Secret"


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
def max_webhook_bot_id():
    """Создаёт бота и подключение max с webhook_secret, возвращает bot_id."""
    db = SessionLocal()
    try:
        # Найти любого пользователя (для owner_id)
        r = db.execute(text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        owner_id = row[0]
        # Создать бота
        db.execute(
            text(
                "INSERT INTO bots (owner_id, title, username, token, is_active) "
                "VALUES (:oid, 'Max Test Bot', 'max_test_bot', 'test-token', 1)"
            ),
            {"oid": owner_id},
        )
        db.commit()
        r = db.execute(text("SELECT id FROM bots WHERE username = 'max_test_bot' ORDER BY id DESC LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        bot_id = row[0]
        creds = json.dumps({"token": "fake", "webhook_secret": "test-secret-42"})
        db.execute(
            text(
                "INSERT INTO bot_channel_connections (bot_id, channel, is_enabled, credentials_json) "
                "VALUES (:bot_id, 'max', 1, :creds)"
            ),
            {"bot_id": bot_id, "creds": creds},
        )
        db.commit()
        return bot_id
    finally:
        db.close()


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_max_webhook_wrong_secret_returns_401(max_webhook_bot_id):
    """Неверный или отсутствующий X-Max-Bot-Api-Secret -> 401."""
    if not max_webhook_bot_id:
        pytest.skip("Could not create test bot")
    resp = client.post(
        f"/webhooks/max/{max_webhook_bot_id}",
        json={"type": "message_created"},
        headers={},
    )
    assert resp.status_code == 401

    resp = client.post(
        f"/webhooks/max/{max_webhook_bot_id}",
        json={"type": "message_created"},
        headers={MAX_WEBHOOK_SECRET_HEADER: "wrong-secret"},
    )
    assert resp.status_code == 401


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_max_webhook_correct_secret_returns_200(max_webhook_bot_id):
    """Верный X-Max-Bot-Api-Secret -> 200."""
    if not max_webhook_bot_id:
        pytest.skip("Could not create test bot")
    resp = client.post(
        f"/webhooks/max/{max_webhook_bot_id}",
        json={"type": "message_created", "message": {}},
        headers={MAX_WEBHOOK_SECRET_HEADER: "test-secret-42"},
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True


def test_max_adapter_normalize_incoming_minimal_payload():
    """normalize_incoming не падает на минимальном/пустом payload."""
    adapter = MaxAdapter()
    out = adapter.normalize_incoming({})
    assert out.channel == "max"
    assert out.raw is not None
    assert (out.raw or {}).get("update_type") == "unknown"

    out2 = adapter.normalize_incoming({"type": "bot_started"})
    assert out2.channel == "max"
    assert (out2.raw or {}).get("update_type") == "bot_started"
