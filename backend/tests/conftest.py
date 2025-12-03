"""
Pytest configuration and shared fixtures for backend tests.
"""

import os
import sys
import uuid
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure we can import the FastAPI app from backend/main.py
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from main import app  # noqa: E402
from database import Base, get_db  # noqa: E402
from auth.rate_limit import rate_limit_store  # noqa: E402

# Clear rate limit store at import time
rate_limit_store.clear()

# Create test database engine (in-memory SQLite for isolation)
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Override get_db dependency for testing."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Setup test database once at module import
Base.metadata.create_all(bind=test_engine)
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def client():
    """Create a TestClient with isolated test database."""
    # Clear rate limit store
    rate_limit_store.clear()
    
    # Clear all data before each test
    for table in reversed(Base.metadata.sorted_tables):
        with test_engine.connect() as conn:
            conn.execute(table.delete())
            conn.commit()
    
    # Patch rate limiter to do nothing
    with patch("backend.auth.email_routes.check_rate_limit", lambda req, action: None):
        yield TestClient(app)


def register_and_get_token(client: TestClient) -> str:
    """Register a new user and return a Bearer token string."""
    unique = uuid.uuid4().hex
    email = f"test_{unique}@example.com"
    password = "SecretPass123!"  # Strong password
    
    # Register
    register_payload = {
        "email": email,
        "name": "Tester",
        "password": password,
    }
    res_register = client.post("/auth/email/register", json=register_payload)
    # Registration may return 200 or fail if user exists (in shared test DB)
    if res_register.status_code != 200:
        # User might already exist, try to login
        pass
    
    # Login to get token
    login_payload = {
        "email": email,
        "password": password,
    }
    res_login = client.post("/auth/email/login", json=login_payload)
    assert res_login.status_code == 200, f"Login failed: {res_login.text}"
    token = res_login.json()["access_token"]
    return f"Bearer {token}"


def create_test_bot(client: TestClient, auth_header: str) -> int:
    """Create a test bot and return its ID."""
    with patch("requests.get") as mock_get:
        unique_id = uuid.uuid4().hex[:8]
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "result": {
                "id": 123456789,
                "is_bot": True,
                "first_name": "Test Bot",
                "username": f"test_bot_{unique_id}",
                "can_join_groups": True,
                "can_read_all_group_messages": False,
                "supports_inline_queries": False,
            },
        }
        mock_get.return_value = mock_response

        bot_data = {
            "title": "Test Bot",
            "username": f"test_bot_{unique_id}",
            "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{unique_id}",
        }
        res = client.post(
            "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
        )
        assert res.status_code == 201, f"Bot creation failed: {res.text}"
        return res.json()["id"]

