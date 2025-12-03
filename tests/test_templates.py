"""
Tests for template API endpoints.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.main import app

# Clear rate limit at module level
from backend.auth.rate_limit import rate_limit_store
rate_limit_store.clear()


def register_and_get_token(client: TestClient) -> str:
    """Register a new user and return a Bearer token string."""
    rate_limit_store.clear()
    
    unique = uuid.uuid4().hex
    email = f"test_{unique}@example.com"
    password = "SecretPass123!"
    
    # Register
    register_payload = {
        "email": email,
        "name": "Tester",
        "password": password,
    }
    res_register = client.post("/auth/email/register", json=register_payload)
    # Registration may return 200 or fail if user exists
    
    # Login to get token
    login_payload = {
        "email": email,
        "password": password,
    }
    res_login = client.post("/auth/email/login", json=login_payload)
    assert res_login.status_code == 200, f"Login failed: {res_login.text}"
    token = res_login.json()["access_token"]
    return f"Bearer {token}"


def test_get_templates_list_returns_list():
    """GET /templates/ should return 200 and a JSON list."""
    client = TestClient(app)
    res = client.get("/templates/")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_post_templates_requires_auth():
    """POST /templates/ without Authorization should return 401."""
    client = TestClient(app)
    payload = {
        "name": "Unauthorized Template",
        "description": "Should fail",
        "category": "test",
        "is_public": True,
    }
    res = client.post("/templates/", json=payload)
    assert res.status_code == 401


def test_create_template_and_get_by_id():
    """POST /templates/ creates a template (201) and GET /templates/{id} returns it."""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    create_payload = {
        "name": "My Template",
        "description": "Test description",
        "category": "demo",
        "is_public": True,
    }
    res_create = client.post(
        "/templates/",
        json=create_payload,
        headers={"Authorization": auth_header},
    )
    # Template API may return 200 or 201
    assert res_create.status_code in [200, 201], res_create.text
    created = res_create.json()
    assert created["name"] == create_payload["name"]
    assert created["description"] == create_payload["description"]

    tpl_id = created["id"]
    res_get = client.get(f"/templates/{tpl_id}")
    assert res_get.status_code == 200
    fetched = res_get.json()
    assert fetched["id"] == tpl_id
    assert fetched["name"] == create_payload["name"]
    assert fetched["description"] == create_payload["description"]


def test_get_template_not_found():
    """GET /templates/{id} should return 404 for a non-existent template."""
    client = TestClient(app)
    res = client.get("/templates/9999999")
    assert res.status_code == 404


def test_delete_template():
    """DELETE /templates/{template_id} should delete template and return 200."""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Создаем шаблон для удаления
    create_payload = {
        "name": "Template to Delete",
        "description": "Will be deleted",
        "category": "test",
        "is_public": True,
    }
    res_create = client.post(
        "/templates/",
        json=create_payload,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code in [200, 201]
    template_id = res_create.json()["id"]

    # Удаляем шаблон
    res_delete = client.delete(
        f"/templates/{template_id}",
        headers={"Authorization": auth_header},
    )
    assert res_delete.status_code == 200
    assert res_delete.json()["status"] == "deleted"

    # Проверяем, что шаблон действительно удален
    res_get = client.get(f"/templates/{template_id}")
    assert res_get.status_code == 404
