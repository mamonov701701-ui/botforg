"""
Pytest configuration and shared fixtures for backend tests.
"""

import os
import sys
import uuid
import re
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import close_all_sessions, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure we can import the FastAPI app from backend/main.py
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
# Do NOT insert BACKEND_DIR: it creates a second top-level `models` package
# (models.user.User vs backend.models.user.User) and breaks SQLAlchemy mappers.

# Pytest can load this file as top-level ``conftest`` while many legacy tests
# import helpers through ``backend.tests.conftest``.  Without the alias Python
# executes this module twice, creating a second engine/database and replacing
# the app dependency override.  The autouse reset then cleans one database
# while requests and test sessions use the other, leaking rows between tests.
sys.modules.setdefault("backend.tests.conftest", sys.modules[__name__])

# Use one file-based DB per pytest run/xdist worker so another pytest process
# cannot delete or migrate a database while this process still uses it.
_test_run_id = os.environ.get("BOTFORG_TEST_RUN_ID") or uuid.uuid4().hex
_test_worker_id = os.environ.get("PYTEST_XDIST_WORKER") or f"pid{os.getpid()}"
_safe_test_run_id = re.sub(r"[^a-zA-Z0-9_-]", "_", _test_run_id)
_safe_test_worker_id = re.sub(r"[^a-zA-Z0-9_-]", "_", _test_worker_id)
_test_db_path = os.path.abspath(
    os.path.join(PROJECT_ROOT, f"test_botforg_{_safe_test_run_id}_{_safe_test_worker_id}.db")
)
_dev_db_path = os.path.abspath(os.path.join(PROJECT_ROOT, "botforg.db"))
if os.path.normcase(_test_db_path) == os.path.normcase(_dev_db_path):
    raise RuntimeError("Refusing to use the development database as a test database")
TEST_DATABASE_URL = "sqlite:///" + _test_db_path.replace("\\", "/")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["TESTING"] = "true"
# Enable mock /me/plan and /billing/quota for existing tests (non-production).
os.environ.setdefault("ALLOW_DEV_TARIFF_FULFILLMENT", "true")

# Import after setting DATABASE_URL.  Alembic's env.py reads the singleton
# settings object, so pin it too before importing backend.database/app.
from backend.settings import settings  # noqa: E402
settings.DATABASE_URL = TEST_DATABASE_URL
from backend.payments.registry import clear_provider_cache  # noqa: E402

# Import after setting DATABASE_URL
from backend.database import Base, engine as app_engine, get_db  # noqa: E402
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

# Plans are migration-managed reference data.  Snapshot exactly the rows at
# head, then restore that baseline for every test instead of retaining plans
# created by earlier tests.
from backend.models.plan import Plan  # noqa: E402
with test_engine.connect() as _seed_connection:
    _PLAN_SEED_ROWS = [dict(row) for row in _seed_connection.execute(select(Plan.__table__)).mappings()]


def activate_test_subscription(db, user, plan_code: str):
    """Give a test user a durable effective plan without using users.plan_code.

    Test fixtures used to treat the legacy metadata column as an entitlement.
    Keep legacy codes only as migration inputs while tests that need a paid plan
    create the same subscription source used in production.
    """
    from datetime import datetime, timezone
    from backend.models.plan import Plan
    from backend.models.tariff import SubscriptionStatus, UserSubscription

    normalized = {"free": "start", "pro": "business_pro", "developer": "team"}.get(
        plan_code, plan_code
    )
    # Start is the resolver fallback.  A fixture that requests it must not
    # accidentally create a higher-precedence subscription and mask plan gifts.
    if normalized == "start":
        return
    plan = db.query(Plan).filter(Plan.code == normalized).one()
    db.add(
        UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=datetime(2020, 1, 1, tzinfo=timezone.utc),
            current_period_end=datetime(2030, 1, 1, tzinfo=timezone.utc),
            auto_renew=False,
            payment_provider="test_fixture",
        )
    )
    db.commit()


def pytest_sessionfinish(session, exitstatus):
    """Close DB connections to avoid PermissionError on Windows."""
    close_all_sessions()
    test_engine.dispose()
    app_engine.dispose()
    try:
        if os.path.exists(_test_db_path):
            os.remove(_test_db_path)
    except OSError:
        # A failed test process can leave a handle behind on Windows; the next
        # run has its own path and never reuses this database.
        pass


def override_get_db():
    """Override get_db dependency for testing."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function", autouse=True)
def reset_test_database():
    """Reset the run-specific test database for every test, even without client."""
    # Clear rate limit store
    rate_limit_store.clear()
    # Providers are cached process-globally.  A previous test may have built a
    # provider while settings/env were monkeypatched or its DB connection existed.
    clear_provider_cache()
    
    # Clear all data before each test, then restore only the migration-managed
    # plan baseline.  Retaining arbitrary plans leaked test state across tests.
    # One connection + disabled FKs on SQLite avoids leftover orphans.
    from sqlalchemy import inspect, text

    inspector = inspect(test_engine)
    existing_tables = set(inspector.get_table_names())
    with test_engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys=OFF"))
        for table in reversed(Base.metadata.sorted_tables):
            if table.name in existing_tables:
                conn.execute(text(f"DELETE FROM {table.name}"))
        if _PLAN_SEED_ROWS:
            conn.execute(Plan.__table__.insert(), _PLAN_SEED_ROWS)
        if conn.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys=ON"))

    yield

    # Do not let a provider built during this test survive monkeypatch teardown
    # into the next test's clean database.
    clear_provider_cache()


@pytest.fixture(scope="function")
def client():
    """Create a TestClient backed by the function-isolated test database."""
    # Clear rate limit store
    rate_limit_store.clear()
    
    # Patch rate limiter to do nothing
    with patch("backend.auth.email_routes.check_rate_limit", lambda req, action: None):
        with TestClient(app) as test_client:
            yield test_client


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
