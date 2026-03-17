import pytest

from conftest import register_and_get_token, create_test_bot


def test_create_incoming_message(client):
    """Test creating an incoming message"""
    auth_header = register_and_get_token(client)

    # Create test bot and enable store_messages (152-ФЗ: по умолчанию content не сохраняется)
    bot_id = create_test_bot(client, auth_header)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header},
    )

    # Create incoming message
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Hello, this is a test message",
        "status": "received",
        "language": "en",
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["bot_id"] == bot_id
    assert data["direction"] == "incoming"
    assert data["content"] == "Hello, this is a test message"
    assert data["status"] == "received"
    assert data["language"] == "en"
    assert data["is_paid"] is False


def test_create_outgoing_message(client):
    """Test creating an outgoing message"""
    auth_header = register_and_get_token(client)

    # Create test bot and enable store_messages (152-ФЗ: по умолчанию content не сохраняется)
    bot_id = create_test_bot(client, auth_header)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header},
    )

    # Create outgoing message
    message_data = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Thank you for your message!",
        "status": "sent",
        "language": "en",
        "is_paid": True,
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["bot_id"] == bot_id
    assert data["direction"] == "outgoing"
    assert data["content"] == "Thank you for your message!"
    assert data["status"] == "sent"
    assert data["is_paid"] is True


def test_create_message_requires_auth(client):
    """Test that creating a message requires authentication"""

    message_data = {"bot_id": 1, "direction": "incoming", "content": "Test message"}

    res = client.post("/messages/", json=message_data)
    assert res.status_code == 401


def test_create_message_invalid_bot(client):
    """Test creating a message with invalid bot ID"""
    auth_header = register_and_get_token(client)

    message_data = {
        "bot_id": 999999,  # Non-existent bot
        "direction": "incoming",
        "content": "Test message",
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 404
    assert "Bot not found" in res.json()["detail"]


def test_create_message_invalid_direction(client):
    """Test creating a message with invalid direction"""
    auth_header = register_and_get_token(client)

    bot_id = create_test_bot(client, auth_header)

    message_data = {
        "bot_id": bot_id,
        "direction": "invalid",  # Invalid direction
        "content": "Test message",
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 422


def test_create_message_empty_content(client):
    """Test creating a message with empty content"""
    auth_header = register_and_get_token(client)

    bot_id = create_test_bot(client, auth_header)

    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "",  # Empty content
    }

    res = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 422


def test_get_messages(client):
    """Test getting list of messages"""
    auth_header = register_and_get_token(client)

    # Create test bot and enable store_messages (152-ФЗ: по умолчанию content не сохраняется)
    bot_id = create_test_bot(client, auth_header)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header},
    )

    # Create messages
    message_data1 = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "First message",
        "status": "received",
    }
    message_data2 = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Second message",
        "status": "sent",
    }

    res1 = client.post(
        "/messages/", json=message_data1, headers={"Authorization": auth_header}
    )
    res2 = client.post(
        "/messages/", json=message_data2, headers={"Authorization": auth_header}
    )
    assert res1.status_code == 201
    assert res2.status_code == 201

    # Get messages list
    res_list = client.get("/messages/", headers={"Authorization": auth_header})
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2

    # Check message content
    contents = [item["content"] for item in data["items"]]
    assert "First message" in contents
    assert "Second message" in contents


def test_get_messages_with_filters(client):
    """Test getting messages with filters"""
    auth_header = register_and_get_token(client)

    # Create test bot and enable store_messages (152-ФЗ: по умолчанию content не сохраняется)
    bot_id = create_test_bot(client, auth_header)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header},
    )

    # Create messages
    message_data1 = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Incoming message",
        "status": "received",
    }
    message_data2 = {
        "bot_id": bot_id,
        "direction": "outgoing",
        "content": "Outgoing message",
        "status": "sent",
    }

    res1 = client.post(
        "/messages/", json=message_data1, headers={"Authorization": auth_header}
    )
    res2 = client.post(
        "/messages/", json=message_data2, headers={"Authorization": auth_header}
    )
    assert res1.status_code == 201
    assert res2.status_code == 201

    # Filter by direction
    res_filtered = client.get(
        "/messages/?direction=incoming", headers={"Authorization": auth_header}
    )
    assert res_filtered.status_code == 200
    data = res_filtered.json()
    assert data["total"] == 1
    assert data["items"][0]["direction"] == "incoming"

    # Filter by status
    res_filtered = client.get(
        "/messages/?status=sent", headers={"Authorization": auth_header}
    )
    assert res_filtered.status_code == 200
    data = res_filtered.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "sent"


def test_get_messages_requires_auth(client):
    """Test that getting messages list requires authentication"""
    res = client.get("/messages/")
    assert res.status_code == 401


def test_get_message(client):
    """Test getting a specific message"""
    auth_header = register_and_get_token(client)

    # Create test bot and enable store_messages (152-ФЗ: по умолчанию content не сохраняется)
    bot_id = create_test_bot(client, auth_header)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header},
    )
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Specific message",
        "status": "received",
    }

    res_create = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201
    message_id = res_create.json()["id"]

    # Get the specific message
    res_get = client.get(
        f"/messages/{message_id}", headers={"Authorization": auth_header}
    )
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["id"] == message_id
    assert data["content"] == "Specific message"


def test_get_nonexistent_message(client):
    """Test getting a message that doesn't exist"""
    auth_header = register_and_get_token(client)

    res = client.get("/messages/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Message not found" in res.json()["detail"]


def test_update_message(client):
    """Test updating a message"""
    auth_header = register_and_get_token(client)

    # Create test bot and message
    bot_id = create_test_bot(client, auth_header)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Original message",
        "status": "received",
    }

    res_create = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201
    message_id = res_create.json()["id"]

    # Update the message
    update_data = {
        "status": "error",
        "error": "Failed to process message",
        "language": "ru",
    }

    res_update = client.patch(
        f"/messages/{message_id}",
        json=update_data,
        headers={"Authorization": auth_header},
    )
    assert res_update.status_code == 200
    data = res_update.json()
    assert data["status"] == "error"
    assert data["error"] == "Failed to process message"
    assert data["language"] == "ru"


def test_update_nonexistent_message(client):
    """Test updating a message that doesn't exist"""
    auth_header = register_and_get_token(client)

    update_data = {"status": "error"}
    res = client.patch(
        "/messages/999999", json=update_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 404
    assert "Message not found" in res.json()["detail"]


def test_delete_message(client):
    """Test deleting a message"""
    auth_header = register_and_get_token(client)

    # Create test bot and message
    bot_id = create_test_bot(client, auth_header)
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "Message to delete",
        "status": "received",
    }

    res_create = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header}
    )
    assert res_create.status_code == 201
    message_id = res_create.json()["id"]

    # Delete the message
    res_delete = client.delete(
        f"/messages/{message_id}", headers={"Authorization": auth_header}
    )
    assert res_delete.status_code == 200
    data = res_delete.json()
    assert data["status"] == "deleted"

    # Verify message is deleted
    res_get = client.get(
        f"/messages/{message_id}", headers={"Authorization": auth_header}
    )
    assert res_get.status_code == 404


def test_delete_nonexistent_message(client):
    """Test deleting a message that doesn't exist"""
    auth_header = register_and_get_token(client)

    res = client.delete("/messages/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Message not found" in res.json()["detail"]


def test_access_other_user_message_forbidden(client):
    """Test that users cannot access other users' messages"""

    # Create two users
    auth_header1 = register_and_get_token(client)
    auth_header2 = register_and_get_token(client)

    # User 1 creates bot and enable store_messages
    bot_id = create_test_bot(client, auth_header1)
    client.patch(
        f"/bots/{bot_id}",
        json={"store_messages": True},
        headers={"Authorization": auth_header1},
    )
    message_data = {
        "bot_id": bot_id,
        "direction": "incoming",
        "content": "User 1 message",
        "status": "received",
    }

    res_create = client.post(
        "/messages/", json=message_data, headers={"Authorization": auth_header1}
    )
    assert res_create.status_code == 201
    message_id = res_create.json()["id"]

    # User 1 can see their message
    res_get1 = client.get(
        f"/messages/{message_id}", headers={"Authorization": auth_header1}
    )
    assert res_get1.status_code == 200

    # User 2 cannot see User 1's message (403 Forbidden for security)
    res_get2 = client.get(
        f"/messages/{message_id}", headers={"Authorization": auth_header2}
    )
    assert res_get2.status_code in [403, 404]
