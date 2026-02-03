"""
Smoke-тесты контура 152-ФЗ: согласия, экспорт/удаление ПДн, retention.
Перед запуском примените миграции: alembic upgrade head
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError as SQLOperationalError

from backend.main import app
from backend.database import SessionLocal
from backend.auth.rate_limit import rate_limit_store
from backend.services.retention_cleanup import run_retention_cleanup_once

client = TestClient(app)


def _has_consents_table() -> bool:
    """Проверка наличия таблицы consents (миграции 152-ФЗ применены)."""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM consents LIMIT 1"))
        return True
    except SQLOperationalError:
        return False
    finally:
        db.close()


@pytest.fixture(scope="module")
def legal_user():
    """Пользователь для тестов legal/privacy."""
    uid = uuid.uuid4().hex[:8]
    return {
        "email": f"legal_{uid}@example.com",
        "password": "SecretPass123!",
        "name": "Legal Test",
    }


def test_legal_docs_public():
    """GET /legal/docs и /legal/doc/{type} доступны без авторизации."""
    resp = client.get("/legal/docs")
    assert resp.status_code == 200
    data = resp.json()
    assert "privacy_policy" in data
    assert "terms" in data
    assert "consent_text" in data
    assert "version" in data["privacy_policy"]
    assert "text" in data["privacy_policy"]

    resp = client.get("/legal/doc/privacy_policy")
    assert resp.status_code == 200
    assert "text/markdown" in resp.headers.get("content-type", "")


@pytest.mark.skipif(not _has_consents_table(), reason="consents table missing (run: alembic upgrade head)")
def test_legal_consent_flow(legal_user):
    """Регистрация, вход, проверка статуса согласий, принятие согласий."""
    rate_limit_store.clear()
    # Регистрация
    r = client.post("/auth/email/register", json={
        "email": legal_user["email"],
        "password": legal_user["password"],
        "name": legal_user["name"],
    })
    assert r.status_code in (200, 400)
    # Вход
    r = client.post("/auth/email/login", json={
        "email": legal_user["email"],
        "password": legal_user["password"],
    })
    assert r.status_code == 200, r.text
    token = r.json().get("access_token")
    assert token
    headers = {"Authorization": f"Bearer {token}"}

    # Статус согласий (может быть пусто)
    r = client.get("/legal/consent/status", headers=headers)
    assert r.status_code == 200
    assert "accepted" in r.json()

    # Принять политику и условия
    r = client.get("/legal/docs")
    assert r.status_code == 200
    docs = r.json()
    v_pp = docs["privacy_policy"]["version"]
    v_terms = docs["terms"]["version"]

    r = client.post("/legal/consent", json={"doc_type": "privacy_policy", "doc_version": v_pp}, headers=headers)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    r = client.post("/legal/consent", json={"doc_type": "terms", "doc_version": v_terms}, headers=headers)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # Статус после принятия
    r = client.get("/legal/consent/status", headers=headers)
    assert r.status_code == 200
    accepted = {a["doc_type"] for a in r.json()["accepted"]}
    assert "privacy_policy" in accepted
    assert "terms" in accepted


@pytest.mark.skipif(not _has_consents_table(), reason="consents table missing (run: alembic upgrade head)")
def test_privacy_export(legal_user):
    """POST /privacy/export возвращает данные пользователя."""
    rate_limit_store.clear()
    r = client.post("/auth/email/register", json={
        "email": legal_user["email"],
        "password": legal_user["password"],
        "name": legal_user["name"],
    })
    assert r.status_code in (200, 400)
    r = client.post("/auth/email/login", json={
        "email": legal_user["email"],
        "password": legal_user["password"],
    })
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.post("/privacy/export", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "profile" in data
    assert "consents" in data
    assert "bots" in data
    assert "messages" in data
    assert "messages_stored" in data
    assert "minimal_storage_default" in data
    assert "note" in data
    assert data["profile"]["email"] == legal_user["email"]


@pytest.mark.skipif(not _has_consents_table(), reason="consents table missing (run: alembic upgrade head)")
def test_privacy_delete(legal_user):
    """POST /privacy/delete анонимизирует аккаунт и отзывает токены (старый токен даёт 401)."""
    rate_limit_store.clear()
    email = f"delete_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/email/register", json={
        "email": email,
        "password": legal_user["password"],
        "name": legal_user["name"],
    })
    assert r.status_code in (200, 400)
    r = client.post("/auth/email/login", json={"email": email, "password": legal_user["password"]})
    assert r.status_code == 200
    old_token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {old_token}"}

    r = client.post("/privacy/delete", headers=headers)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # Старый токен должен дать 401 на защищённом эндпоинте (token_version revoke)
    r_me = client.get("/me", headers=headers)
    assert r_me.status_code == 401


def test_chat_hash_determinism():
    """chat_hash: одинаковые channel/chat_id -> один hash; разные -> разный. chat_id в БД/ответах не хранится."""
    from backend.utils.chat_hash import make_chat_hash

    h1 = make_chat_hash("telegram", "123")
    h2 = make_chat_hash("telegram", "123")
    assert h1 == h2
    assert make_chat_hash("telegram", "456") != h1
    assert make_chat_hash("web", "123") != h1


def test_retention_cleanup_smoke():
    """Запуск очистки retention не падает (smoke). Требует таблицы bots/messages/events."""
    try:
        run_retention_cleanup_once()
    except SQLOperationalError:
        pytest.skip("DB schema not ready for retention (run: alembic upgrade head)")
    assert True
