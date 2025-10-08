import os
import sys
import uuid
from unittest.mock import Mock, patch

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


@patch("requests.get")
def test_connect_valid_bot(mock_get):
    """Test connecting a valid bot with mocked Telegram API"""
    unique_id = uuid.uuid4().hex[:8]
    # Mock successful Telegram API response
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

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    bot_data = {
        "title": "Test Bot",
        "username": f"test_bot_{unique_id}",
        "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{unique_id}",
        "webhook_url": "https://example.com/webhook",
    }

    res = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Test Bot"
    assert data["username"] == f"test_bot_{unique_id}"
    assert data["is_active"] is True
    assert "token" not in data  # Token should not be returned


@patch("requests.get")
def test_reject_invalid_token(mock_get):
    """Test rejecting invalid bot token"""
    # Mock failed Telegram API response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ok": False,
        "error_code": 401,
        "description": "Unauthorized",
    }
    mock_get.return_value = mock_response

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    bot_data = {
        "title": "Invalid Bot",
        "username": "invalid_bot",
        "token": "123456789:invalid_token_format",
        "webhook_url": "https://example.com/webhook",
    }

    res = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 400
    assert "Invalid Telegram bot token" in res.json()["detail"]


def test_connect_bot_requires_auth():
    """Test that connecting a bot requires authentication"""
    client = TestClient(app)

    bot_data = {
        "title": "Test Bot",
        "username": "test_bot",
        "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    }

    res = client.post("/bots/connect", json=bot_data)
    assert res.status_code == 401


@patch("requests.get")
def test_username_mismatch(mock_get):
    """Test rejecting bot when username doesn't match Telegram API"""
    # Mock successful Telegram API response with different username
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ok": True,
        "result": {
            "id": 123456789,
            "is_bot": True,
            "first_name": "Real Bot",
            "username": "real_bot",  # Different from provided username
            "can_join_groups": True,
            "can_read_all_group_messages": False,
            "supports_inline_queries": False,
        },
    }
    mock_get.return_value = mock_response

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    bot_data = {
        "title": "Test Bot",
        "username": "test_bot",  # Different from API response
        "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    }

    res = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 400
    assert "Username mismatch" in res.json()["detail"]


@patch("requests.get")
def test_get_bots_list(mock_get):
    """Test getting list of user's bots"""
    unique_id = uuid.uuid4().hex[:8]
    # Mock successful Telegram API response for bot creation
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

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a bot first
    bot_data = {
        "title": "Test Bot",
        "username": f"test_bot_{unique_id}",
        "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{unique_id}",
    }
    res_create = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201

    # Get bots list
    res_list = client.get("/bots/", headers={"Authorization": auth_header})
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["title"] == "Test Bot"
    assert data["items"][0]["username"] == f"test_bot_{unique_id}"


def test_get_bots_requires_auth():
    """Test that getting bots list requires authentication"""
    client = TestClient(app)
    res = client.get("/bots/")
    assert res.status_code == 401


@patch("requests.get")
def test_patch_bot(mock_get):
    """Test updating bot title and is_active"""
    unique_id = uuid.uuid4().hex[:8]
    # Mock successful Telegram API response for bot creation
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

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a bot first
    bot_data = {
        "title": "Original Title",
        "username": f"test_bot_{unique_id}",
        "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{unique_id}",
    }
    res_create = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201
    bot_id = res_create.json()["id"]

    # Update bot
    update_data = {"title": "Updated Title", "is_active": False}
    res_update = client.patch(
        f"/bots/{bot_id}", json=update_data, headers={"Authorization": auth_header}
    )
    assert res_update.status_code == 200
    data = res_update.json()
    assert data["title"] == "Updated Title"
    assert data["is_active"] is False


@patch("requests.get")
@patch("requests.post")
def test_delete_bot(mock_post, mock_get):
    """Test deactivating a bot (soft delete)"""
    unique_id = uuid.uuid4().hex[:8]
    # Mock successful Telegram API response for bot creation
    mock_get_response = Mock()
    mock_get_response.status_code = 200
    mock_get_response.json.return_value = {
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
    mock_get.return_value = mock_get_response

    # Mock successful webhook deletion
    mock_post_response = Mock()
    mock_post_response.status_code = 200
    mock_post_response.json.return_value = {"ok": True}
    mock_post.return_value = mock_post_response

    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a bot first
    bot_data = {
        "title": "Test Bot",
        "username": f"test_bot_{unique_id}",
        "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{unique_id}",
        "webhook_url": "https://example.com/webhook",
    }
    res_create = client.post(
        "/bots/connect", json=bot_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201
    bot_id = res_create.json()["id"]

    # Delete (deactivate) bot
    res_delete = client.delete(
        f"/bots/{bot_id}", headers={"Authorization": auth_header}
    )
    assert res_delete.status_code == 200
    data = res_delete.json()
    assert data["status"] == "deactivated"

    # Verify bot is deactivated
    res_get = client.get(f"/bots/{bot_id}", headers={"Authorization": auth_header})
    assert res_get.status_code == 200
    assert res_get.json()["is_active"] is False


def test_delete_nonexistent_bot():
    """Test deleting a bot that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    res = client.delete("/bots/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Bot not found" in res.json()["detail"]


def test_update_nonexistent_bot():
    """Test updating a bot that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    update_data = {"title": "New Title"}
    res = client.patch(
        "/bots/999999", json=update_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 404
    assert "Bot not found" in res.json()["detail"]


def test_get_nonexistent_bot():
    """Test getting a bot that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    res = client.get("/bots/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Bot not found" in res.json()["detail"]
