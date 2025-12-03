import pytest
from fastapi.testclient import TestClient

from conftest import register_and_get_token, create_test_bot


def create_test_user_template(client: TestClient, auth_header: str) -> int:
    """Create a test user template and return its ID."""
    user_template_data = {
        "title": "Test User Template",
        "description": "Test user template description",
    }
    res = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 201
    return res.json()["id"]


def test_create_bot_template(client):
    """Test creating a bot template binding"""
    auth_header = register_and_get_token(client)

    # Create test bot and user template
    bot_id = create_test_bot(client, auth_header)
    user_template_id = create_test_user_template(client, auth_header)

    # Create bot template binding
    bot_template_data = {"bot_id": bot_id, "user_template_id": user_template_id}

    res = client.post(
        "/bot-templates/",
        json=bot_template_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["bot_id"] == bot_id
    assert data["user_template_id"] == user_template_id
    assert data["is_active"] is True


def test_create_duplicate_binding_disables_old(client):
    """Test that creating a new binding for the same bot deactivates the old one"""
    auth_header = register_and_get_token(client)

    # Create test bot and user templates
    bot_id = create_test_bot(client, auth_header)
    user_template_id1 = create_test_user_template(client, auth_header)
    user_template_id2 = create_test_user_template(client, auth_header)

    # Create first binding
    bot_template_data1 = {"bot_id": bot_id, "user_template_id": user_template_id1}
    res1 = client.post(
        "/bot-templates/",
        json=bot_template_data1,
        headers={"Authorization": auth_header},
    )
    assert res1.status_code == 201
    binding_id1 = res1.json()["id"]

    # Create second binding for the same bot
    bot_template_data2 = {"bot_id": bot_id, "user_template_id": user_template_id2}
    res2 = client.post(
        "/bot-templates/",
        json=bot_template_data2,
        headers={"Authorization": auth_header},
    )
    assert res2.status_code == 201
    binding_id2 = res2.json()["id"]

    # Check that first binding is deactivated
    res_get1 = client.get(
        f"/bot-templates/{binding_id1}", headers={"Authorization": auth_header}
    )
    assert res_get1.status_code == 200
    assert res_get1.json()["is_active"] is False

    # Check that second binding is active
    res_get2 = client.get(
        f"/bot-templates/{binding_id2}", headers={"Authorization": auth_header}
    )
    assert res_get2.status_code == 200
    assert res_get2.json()["is_active"] is True


def test_get_bot_templates(client):
    """Test getting list of bot template bindings"""
    auth_header = register_and_get_token(client)

    # Create test bot and user template
    bot_id = create_test_bot(client, auth_header)
    user_template_id = create_test_user_template(client, auth_header)

    # Create bot template binding
    bot_template_data = {"bot_id": bot_id, "user_template_id": user_template_id}
    res_create = client.post(
        "/bot-templates/",
        json=bot_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201

    # Get bot templates list
    res_list = client.get("/bot-templates/", headers={"Authorization": auth_header})
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["bot_id"] == bot_id
    assert data["items"][0]["user_template_id"] == user_template_id


def test_update_binding(client):
    """Test updating a bot template binding"""
    auth_header = register_and_get_token(client)

    # Create test bot and user template
    bot_id = create_test_bot(client, auth_header)
    user_template_id = create_test_user_template(client, auth_header)

    # Create bot template binding
    bot_template_data = {"bot_id": bot_id, "user_template_id": user_template_id}
    res_create = client.post(
        "/bot-templates/",
        json=bot_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    binding_id = res_create.json()["id"]

    # Update the binding
    update_data = {"is_active": False}
    res_update = client.patch(
        f"/bot-templates/{binding_id}",
        json=update_data,
        headers={"Authorization": auth_header},
    )
    assert res_update.status_code == 200
    data = res_update.json()
    assert data["is_active"] is False


def test_delete_binding(client):
    """Test deleting (deactivating) a bot template binding"""
    auth_header = register_and_get_token(client)

    # Create test bot and user template
    bot_id = create_test_bot(client, auth_header)
    user_template_id = create_test_user_template(client, auth_header)

    # Create bot template binding
    bot_template_data = {"bot_id": bot_id, "user_template_id": user_template_id}
    res_create = client.post(
        "/bot-templates/",
        json=bot_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    binding_id = res_create.json()["id"]

    # Delete (deactivate) the binding
    res_delete = client.delete(
        f"/bot-templates/{binding_id}", headers={"Authorization": auth_header}
    )
    assert res_delete.status_code == 200
    data = res_delete.json()
    assert data["status"] == "deleted"

    # Verify binding is deactivated
    res_get = client.get(
        f"/bot-templates/{binding_id}", headers={"Authorization": auth_header}
    )
    assert res_get.status_code == 200
    assert res_get.json()["is_active"] is False


def test_access_other_user_binding_forbidden(client):
    """Test that users cannot access other users' bot template bindings"""

    # Create two users
    auth_header1 = register_and_get_token(client)
    auth_header2 = register_and_get_token(client)

    # User 1 creates bot and user template
    bot_id = create_test_bot(client, auth_header1)
    user_template_id = create_test_user_template(client, auth_header1)

    # User 1 creates bot template binding
    bot_template_data = {"bot_id": bot_id, "user_template_id": user_template_id}
    res_create = client.post(
        "/bot-templates/",
        json=bot_template_data,
        headers={"Authorization": auth_header1},
    )
    assert res_create.status_code == 201
    binding_id = res_create.json()["id"]

    # User 1 can see their binding
    res_get1 = client.get(
        f"/bot-templates/{binding_id}", headers={"Authorization": auth_header1}
    )
    assert res_get1.status_code == 200

    # User 2 cannot see User 1's binding (403 Forbidden for security)
    res_get2 = client.get(
        f"/bot-templates/{binding_id}", headers={"Authorization": auth_header2}
    )
    assert res_get2.status_code in [403, 404]
