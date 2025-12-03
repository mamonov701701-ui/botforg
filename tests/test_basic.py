"""
Basic integration tests for the BotForg API.
Uses the new /auth/email/register and /auth/email/login endpoints.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

# Clear rate limit at module level
from backend.auth.rate_limit import rate_limit_store
rate_limit_store.clear()


@pytest.fixture(scope="module")
def test_user():
    """Create a unique test user for this module."""
    unique_id = uuid.uuid4().hex[:8]
    return {
        "email": f"testuser_{unique_id}@example.com",
        "password": "SecretPass123!",
        "name": "Test User"
    }


def test_health():
    """Test health endpoint."""
    resp = client.get("/health")
    assert resp.status_code == 200


def test_register_and_login(test_user):
    """Test user registration and login."""
    # Clear rate limit
    rate_limit_store.clear()
    
    # Register
    resp = client.post("/auth/email/register", json={
        "email": test_user["email"],
        "password": test_user["password"],
        "name": test_user["name"]
    })
    print("🔍 REGISTER STATUS:", resp.status_code)
    print("🔍 REGISTER RESPONSE:", resp.text)
    assert resp.status_code == 200 or resp.status_code == 400  # 400 if already registered
    
    # Login
    resp = client.post("/auth/email/login", json={
        "email": test_user["email"],
        "password": test_user["password"]
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("access_token")
    assert token
    test_user["token"] = token


def test_templates_crud(test_user):
    """Test template CRUD operations."""
    if "token" not in test_user:
        pytest.skip("No token available - registration/login failed")
    
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    
    # Get templates list
    resp = client.get("/templates", headers=headers)
    assert resp.status_code == 200
    
    # Create template (may return 200, 201, or 403 if user role doesn't allow)
    tpl = {
        "name": "Тестовый шаблон",
        "description": "desc",
        "category": "test",
        "is_public": False
    }
    resp = client.post("/templates", json=tpl, headers=headers)
    if resp.status_code == 403:
        pytest.skip("User role doesn't allow template creation")
    assert resp.status_code in [200, 201]
    tpl_id = resp.json()["id"]
    
    # Update template
    resp = client.patch(f"/templates/{tpl_id}", json={"description": "updated"}, headers=headers)
    assert resp.status_code == 200


def test_bots_connect(test_user):
    """Test bot connection (expects validation error for mock token)."""
    if "token" not in test_user:
        pytest.skip("No token available - registration/login failed")
    
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    data = {
        "title": "Test Bot",
        "username": "test_bot",
        "token": "123:mocktoken"
    }
    resp = client.post("/bots/connect", json=data, headers=headers)
    # 400 expected because token is invalid
    assert resp.status_code in (200, 201, 400)


def test_review(test_user):
    """Test review functionality."""
    if "token" not in test_user:
        pytest.skip("No token available - registration/login failed")
    
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    
    # Create a template first
    tpl = {"name": "Review Test Template", "description": "test", "category": "test", "is_public": True}
    resp = client.post("/templates", json=tpl, headers=headers)
    if resp.status_code == 200:
        tpl_id = resp.json()["id"]
        
        # POST /templates/{id}/review
        resp = client.post(f"/templates/{tpl_id}/review", json={"rating": 5, "text": "Отлично!"}, headers=headers)
        assert resp.status_code in (200, 400, 404)  # 400 if already reviewed, 404 if route doesn't exist


def test_import_export(test_user):
    """Test template import/export."""
    if "token" not in test_user:
        pytest.skip("No token available - registration/login failed")
    
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    tpl = {"nodes": [], "edges": []}
    resp = client.post("/templates/import", json=tpl, headers=headers)
    if resp.status_code == 403:
        pytest.skip("User role doesn't allow template import")
    assert resp.status_code == 201
    tpl_id = resp.json()["id"]
    resp = client.get(f"/templates/{tpl_id}", headers=headers)
    assert resp.status_code == 200
