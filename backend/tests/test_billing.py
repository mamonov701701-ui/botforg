import os
import sys
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

# Ensure we can import the FastAPI app from backend/main.py
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from main import app  # noqa: E402


def register_and_get_token(client: TestClient) -> str:
    """Register a new user and return a Bearer token string."""
    unique = uuid.uuid4().hex
    payload = {
        "email": f"test_{unique}@example.com",
        "name": "Tester",
        "password": "Secret123",
        "role": "user",
    }
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return f"Bearer {token}"


def create_test_bot(client: TestClient, auth_header: str) -> int:
    """Create a test bot and return its ID."""
    from unittest.mock import Mock, patch

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
        assert res.status_code == 201
        return res.json()["id"]


def test_create_free_message():
    """Test creating a free message within quota"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot
    bot_id = create_test_bot(client, auth_header)

    # Create message (should be free within quota)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Free message",
        "status": "received",
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["is_paid"] is False

    # Check billing record was created
    billing_res = client.get("/billing/", headers={"Authorization": auth_header})
    assert billing_res.status_code == 200
    billing_data = billing_res.json()
    assert billing_data["total"] == 1
    assert billing_data["items"][0]["is_paid"] is False
    assert billing_data["items"][0]["price"] == "0.00"


def test_create_paid_message():
    """Test creating a paid message when quota exceeded"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot
    bot_id = create_test_bot(client, auth_header)

    # Set user quota to 0 to force paid messages
    quota_update = {"monthly_limit": 0, "used_messages": 0}
    client.patch(
        "/billing/quota", json=quota_update, headers={"Authorization": auth_header}
    )

    # Create message (should be paid)
    message_data = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Paid message",
        "status": "sent",
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["is_paid"] is True

    # Check billing record was created
    billing_res = client.get("/billing/", headers={"Authorization": auth_header})
    assert billing_res.status_code == 200
    billing_data = billing_res.json()
    assert billing_data["total"] == 1
    assert billing_data["items"][0]["is_paid"] is True
    assert billing_data["items"][0]["price"] == "1.00"


def test_quota_limit_enforcement():
    """Test that quota limits are enforced correctly"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot
    bot_id = create_test_bot(client, auth_header)

    # Set quota to 2 messages
    quota_update = {"monthly_limit": 2, "used_messages": 0}
    client.patch(
        "/billing/quota", json=quota_update, headers={"Authorization": auth_header}
    )

    # Create first message (should be free)
    message_data1 = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "First message",
        "status": "received",
    }
    res1 = client.post(
        "/messages/", json=message_data1, headers={"Authorization": auth_header}
    )
    assert res1.status_code == 201
    assert res1.json()["is_paid"] is False

    # Create second message (should be free)
    message_data2 = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Second message",
        "status": "sent",
    }
    res2 = client.post(
        "/messages/", json=message_data2, headers={"Authorization": auth_header}
    )
    assert res2.status_code == 201
    assert res2.json()["is_paid"] is False

    # Create third message (should be paid)
    message_data3 = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Third message",
        "status": "received",
    }
    res3 = client.post(
        "/messages/", json=message_data3, headers={"Authorization": auth_header}
    )
    assert res3.status_code == 201
    assert res3.json()["is_paid"] is True


def test_get_billing_records():
    """Test getting billing records list"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot and message
    bot_id = create_test_bot(client, auth_header)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Test message",
        "status": "received",
    }
    client.post("/messages/", json=message_data, headers={"Authorization": auth_header})

    # Get billing records
    res = client.get("/billing/", headers={"Authorization": auth_header})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["action"] == "message"
    assert data["items"][0]["direction"] == "incoming"


def test_get_billing_records_requires_auth():
    """Test that getting billing records requires authentication"""
    client = TestClient(app)
    res = client.get("/billing/")
    assert res.status_code == 401


def test_get_summary():
    """Test getting user quota summary"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Get summary (should create default quota if not exists)
    res = client.get("/billing/summary", headers={"Authorization": auth_header})
    assert res.status_code == 200
    data = res.json()
    assert data["monthly_limit"] == 1000
    assert data["used_messages"] == 0

    # Create a message to increase used_messages
    bot_id = create_test_bot(client, auth_header)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Test message",
        "status": "received",
    }
    client.post("/messages/", json=message_data, headers={"Authorization": auth_header})

    # Check summary again
    res2 = client.get("/billing/summary", headers={"Authorization": auth_header})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["used_messages"] == 1


def test_get_summary_requires_auth():
    """Test that getting summary requires authentication"""
    client = TestClient(app)
    res = client.get("/billing/summary")
    assert res.status_code == 401


def test_register_message_billing():
    """Test manual registration of message billing"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot and message first
    bot_id = create_test_bot(client, auth_header)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Test message",
        "status": "received",
    }
    message_res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    message_id = message_res.json()["id"]

    # Register billing record manually
    billing_data = {
        "user_id": 1,  # Will be overridden by current user
        "message_id": message_id,
        "action": "message",
        "direction": "outgoing",
        "is_paid": True,
        "price": "2.50",
    }

    res = client.post(
        "/billing/message", json=billing_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["action"] == "message"
    assert data["direction"] == "outgoing"
    assert data["is_paid"] is True
    assert data["price"] == "2.50"


def test_register_billing_for_other_user_forbidden():
    """Test that users cannot create billing records for other users"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Try to create billing record for another user
    billing_data = {
        "user_id": 999,  # Different user ID
        "action": "message",
        "direction": "incoming",
        "is_paid": False,
        "price": "0.00",
    }

    res = client.post(
        "/billing/message", json=billing_data, headers={"Authorization": auth_header}
    )
    assert (
        res.status_code == 200
    )  # Теперь всегда создает запись для текущего пользователя
    data = res.json()
    assert data["user_id"] != 999  # Проверяем, что user_id не равен переданному


def test_update_user_quota():
    """Test updating user quota"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create initial quota by getting summary
    client.get("/billing/summary", headers={"Authorization": auth_header})

    # Update quota
    quota_update = {"monthly_limit": 500, "used_messages": 10}

    res = client.patch(
        "/billing/quota", json=quota_update, headers={"Authorization": auth_header}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["monthly_limit"] == 500
    assert data["used_messages"] == 10


def test_update_nonexistent_quota():
    """Test updating quota that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Try to update quota without creating it first
    quota_update = {"monthly_limit": 500}

    res = client.patch(
        "/billing/quota", json=quota_update, headers={"Authorization": auth_header}
    )
    assert res.status_code == 200  # Now creates quota automatically
    data = res.json()
    assert data["monthly_limit"] == 500


def test_access_other_user_billing_forbidden():
    """Test that users cannot access other users' billing records"""
    client = TestClient(app)

    # Create two users
    auth_header1 = register_and_get_token(client)
    auth_header2 = register_and_get_token(client)

    # User 1 creates a message (and billing record)
    bot_id = create_test_bot(client, auth_header1)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "User 1 message",
        "status": "received",
    }
    client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header1}
    )

    # User 1 can see their billing records
    res1 = client.get("/billing/", headers={"Authorization": auth_header1})
    assert res1.status_code == 200
    assert res1.json()["total"] == 1

    # User 2 cannot see User 1's billing records
    res2 = client.get("/billing/", headers={"Authorization": auth_header2})
    assert res2.status_code == 200
    assert res2.json()["total"] == 0  # No records for User 2


def test_correct_pricing_calculation():
    """Test that pricing is calculated correctly"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create test bot
    bot_id = create_test_bot(client, auth_header)

    # Set quota to 1 message
    quota_update = {"monthly_limit": 1, "used_messages": 0}
    client.patch(
        "/billing/quota", json=quota_update, headers={"Authorization": auth_header}
    )

    # Create first message (free)
    message_data1 = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Free message",
        "status": "received",
    }
    client.post(
        "/messages/", json=message_data1, headers={"Authorization": auth_header}
    )

    # Create second message (paid)
    message_data2 = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Paid message",
        "status": "sent",
    }
    client.post(
        "/messages/", json=message_data2, headers={"Authorization": auth_header}
    )

    # Check billing records
    billing_res = client.get("/billing/", headers={"Authorization": auth_header})
    assert billing_res.status_code == 200
    billing_data = billing_res.json()
    assert billing_data["total"] == 2

    # Check first record (paid - most recent first)
    assert billing_data["items"][0]["price"] == "1.00"
    assert billing_data["items"][0]["is_paid"] is True

    # Check second record (free)
    assert billing_data["items"][1]["price"] == "0.00"
    assert billing_data["items"][1]["is_paid"] is False
