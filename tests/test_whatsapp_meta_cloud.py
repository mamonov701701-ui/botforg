"""
Тесты WhatsApp Meta Cloud: GET verification, POST подпись X-Hub-Signature-256, normalize_incoming.
Перед запуском: alembic upgrade head.
"""
import hmac
import hashlib
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError

from backend.main import app
from backend.database import SessionLocal
from backend.channels.whatsapp.providers.meta_cloud import MetaCloudProvider

client = TestClient(app)

META_SIGNATURE_HEADER = "X-Hub-Signature-256"


def _has_bot_channel_connections() -> bool:
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM bot_channel_connections LIMIT 1"))
        return True
    except SQLOperationalError:
        return False
    finally:
        db.close()


def _compute_meta_signature(raw_body: bytes, app_secret: str) -> str:
    """HMAC-SHA256(raw_body, app_secret) -> sha256=<hex>."""
    key = app_secret.encode("utf-8")
    hex_digest = hmac.new(key, raw_body, digestmod=hashlib.sha256).hexdigest()
    return f"sha256={hex_digest}"


@pytest.fixture(scope="module")
def meta_cloud_bot_id():
    """Бот с подключением whatsapp, provider=meta_cloud, verify_token и app_secret."""
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
                "VALUES (:oid, 'Meta Cloud Test', 'meta_cloud_test_bot', 'tok', 1)"
            ),
            {"oid": owner_id},
        )
        db.commit()
        r = db.execute(text("SELECT id FROM bots WHERE username = 'meta_cloud_test_bot' ORDER BY id DESC LIMIT 1"))
        row = r.fetchone()
        if not row:
            return None
        bot_id = row[0]
        creds = json.dumps({
            "provider": "meta_cloud",
            "token": "fake_token",
            "phone_number_id": "123456",
            "verify_token": "my_verify_token_123",
            "app_secret": "test_app_secret_for_hmac",
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


# --- GET verification ---


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_get_verify_success(meta_cloud_bot_id):
    """GET с hub.mode=subscribe и верным hub.verify_token возвращает hub.challenge (200)."""
    if not meta_cloud_bot_id:
        pytest.skip("Could not create test bot")
    resp = client.get(
        f"/webhooks/whatsapp/{meta_cloud_bot_id}",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "my_verify_token_123",
            "hub.challenge": "challenge_string_ok",
        },
    )
    assert resp.status_code == 200
    assert resp.text == "challenge_string_ok"


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_get_verify_fail_wrong_token(meta_cloud_bot_id):
    """GET с неверным hub.verify_token -> 403."""
    if not meta_cloud_bot_id:
        pytest.skip("Could not create test bot")
    resp = client.get(
        f"/webhooks/whatsapp/{meta_cloud_bot_id}",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "challenge",
        },
    )
    assert resp.status_code == 403


# --- POST signature ---


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_post_wrong_signature_401(meta_cloud_bot_id):
    """POST без подписи или с неверной подписью -> 401."""
    if not meta_cloud_bot_id:
        pytest.skip("Could not create test bot")
    body = {"object": "whatsapp_business_account", "entry": []}
    body_bytes = json.dumps(body).encode("utf-8")
    resp = client.post(
        f"/webhooks/whatsapp/{meta_cloud_bot_id}",
        content=body_bytes,
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 401

    resp2 = client.post(
        f"/webhooks/whatsapp/{meta_cloud_bot_id}",
        content=body_bytes,
        headers={"Content-Type": "application/json", META_SIGNATURE_HEADER: "sha256=invalid"},
    )
    assert resp2.status_code == 401


@pytest.mark.skipif(
    not _has_bot_channel_connections(),
    reason="bot_channel_connections table missing (run: alembic upgrade head)",
)
def test_post_correct_signature_200(meta_cloud_bot_id):
    """POST с верной подписью X-Hub-Signature-256 -> 200."""
    if not meta_cloud_bot_id:
        pytest.skip("Could not create test bot")
    app_secret = "test_app_secret_for_hmac"
    body = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "15550000000", "phone_number_id": "123456"},
                            "messages": [
                                {
                                    "from": "79001234567",
                                    "id": "wamid.xxx",
                                    "timestamp": "1234567890",
                                    "type": "text",
                                    "text": {"body": "Hello"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }
    body_bytes = json.dumps(body).encode("utf-8")
    signature = compute_meta_signature(body_bytes, app_secret)
    resp = client.post(
        f"/webhooks/whatsapp/{meta_cloud_bot_id}",
        content=body_bytes,
        headers={"Content-Type": "application/json", META_SIGNATURE_HEADER: signature},
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True


# --- normalize_incoming ---


def test_normalize_incoming_sample_payload():
    """normalize_incoming на типовом payload Meta не падает, возвращает text, chat_id, update_type."""
    provider = MetaCloudProvider()
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "123456"},
                            "messages": [
                                {
                                    "from": "79001234567",
                                    "id": "wamid.abc",
                                    "timestamp": "1234567890",
                                    "type": "text",
                                    "text": {"body": "Привет"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }
    out = provider.normalize_incoming(payload)
    assert out.channel == "whatsapp"
    assert out.chat_id == "79001234567"
    assert out.text == "Привет"
    assert out.raw is not None
    assert (out.raw or {}).get("update_type") == "message"
    assert (out.raw or {}).get("message_id") == "wamid.abc"

    empty = provider.normalize_incoming({})
    assert empty.channel == "whatsapp"
    assert empty.chat_id is None
    assert (empty.raw or {}).get("update_type") == "unknown"
