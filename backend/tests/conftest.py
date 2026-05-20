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
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Use file-based test DB so Alembic can run migrations (includes token_version)
_test_db_path = os.path.abspath(os.path.join(PROJECT_ROOT, "test_botforg.db"))
TEST_DATABASE_URL = "sqlite:///" + _test_db_path.replace("\\", "/")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["TESTING"] = "true"

# Import after setting DATABASE_URL
from backend.database import Base, get_db  # noqa: E402
import backend.models  # noqa: F401 - ensure all models registered with Base
from backend.main import app  # noqa: E402
from backend.auth.rate_limit import rate_limit_store  # noqa: E402

# Clear rate limit store at import time
rate_limit_store.clear()

# Run Alembic migrations for correct schema (token_version, etc.)
from alembic import command
from alembic.config import Config
_alembic_cfg = Config(os.path.join(PROJECT_ROOT, "alembic.ini"))
_alembic_cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
_alembic_cfg.set_main_option("script_location", os.path.join(PROJECT_ROOT, "backend", "migrations").replace("\\", "/"))
# Reuse existing DB if present (alembic upgrade is idempotent); skip remove on Windows PermissionError
try:
    if os.path.exists(_test_db_path):
        os.remove(_test_db_path)
except OSError:
    pass
command.upgrade(_alembic_cfg, "head")

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def pytest_sessionfinish(session, exitstatus):
    """Close DB connections to avoid PermissionError on Windows."""
    test_engine.dispose()


def override_get_db():
    """Override get_db dependency for testing."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def client():
    """Create a TestClient with isolated test database."""
    # Clear rate limit store
    rate_limit_store.clear()
    
    # Clear all data before each test (only tables that exist in migrated DB)
    # Исключаем plans — справочные данные, не очищаем.
    # Один connection + отключение FK на SQLite, иначе остаются orphans (reuse user id=1 → лимит ботов).
    from sqlalchemy import inspect, text

    inspector = inspect(test_engine)
    existing_tables = set(inspector.get_table_names())
    skip_tables = {"plans"}
    with test_engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys=OFF"))
        for table in reversed(Base.metadata.sorted_tables):
            if table.name in existing_tables and table.name not in skip_tables:
                conn.execute(text(f"DELETE FROM {table.name}"))
        if conn.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys=ON"))
    
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
    """Create a test Bot (Telegram) and return its ID."""
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


def get_user_id(client: TestClient, auth_header: str) -> int:
    """Get current user ID from /me endpoint."""
    res = client.get("/me", headers={"Authorization": auth_header})
    assert res.status_code == 200, f"GET /me failed: {res.text}"
    return res.json()["id"]


def create_test_bot_instance(client: TestClient, auth_header: str) -> int:
    """
    Create a BotInstance (template-based) for bot_tags, bot_user_state API.
    Returns BotInstance.id.
    """
    from backend.models.bot import BotInstance
    from backend.models.template import Template

    user_id = get_user_id(client, auth_header)
    db = TestingSessionLocal()
    try:
        template = Template(
            name="Test Template",
            description="For tests",
            category="test",
            is_public=False,
            user_id=user_id,
        )
        db.add(template)
        db.commit()
        db.refresh(template)

        unique_id = uuid.uuid4().hex[:8]
        bot_instance = BotInstance(
            user_id=user_id,
            token=f"test_token_{unique_id}",
            username=f"test_instance_{unique_id}",
            template_id=template.id,
            is_active=True,
        )
        db.add(bot_instance)
        db.commit()
        db.refresh(bot_instance)
        return bot_instance.id
    finally:
        db.close()

