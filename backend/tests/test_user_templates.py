import os
import sys
import uuid

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


def create_test_template(client: TestClient, auth_header: str) -> int:
    """Create a test template and return its ID."""
    template_data = {
        "name": "Test Template",
        "description": "Test description",
        "category": "test",
        "is_public": True,
    }
    res = client.post(
        "/templates/", json=template_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 201
    return res.json()["id"]


def test_create_user_template():
    """Test creating a user template"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a test template first
    template_id = create_test_template(client, auth_header)

    user_template_data = {
        "title": "My User Template",
        "description": "This is my custom template",
        "template_id": template_id,
    }

    res = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "My User Template"
    assert data["description"] == "This is my custom template"
    assert data["template_id"] == template_id
    assert data["is_active"] is True


def test_create_user_template_without_reference():
    """Test creating a user template without referencing another template"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    user_template_data = {
        "title": "Standalone User Template",
        "description": "This template is not based on any other template",
    }

    res = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Standalone User Template"
    assert data["template_id"] is None


def test_create_user_template_requires_auth():
    """Test that creating a user template requires authentication"""
    client = TestClient(app)

    user_template_data = {
        "title": "Unauthorized Template",
        "description": "Should fail",
    }

    res = client.post("/user-templates/", json=user_template_data)
    assert res.status_code == 401


def test_create_user_template_invalid_reference():
    """Test creating a user template with invalid template_id"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    user_template_data = {
        "title": "Invalid Reference Template",
        "description": "This should fail",
        "template_id": 999999,  # Non-existent template
    }

    res = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 404
    assert "Referenced template not found" in res.json()["detail"]


def test_get_user_templates_list():
    """Test getting list of user templates"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a test template first
    template_id = create_test_template(client, auth_header)

    # Create user templates
    user_template_data1 = {
        "title": "First User Template",
        "description": "First template",
        "template_id": template_id,
    }
    user_template_data2 = {
        "title": "Second User Template",
        "description": "Second template",
    }

    res1 = client.post(
        "/user-templates/",
        json=user_template_data1,
        headers={"Authorization": auth_header},
    )
    res2 = client.post(
        "/user-templates/",
        json=user_template_data2,
        headers={"Authorization": auth_header},
    )
    assert res1.status_code == 201
    assert res2.status_code == 201

    # Get user templates list
    res_list = client.get("/user-templates/", headers={"Authorization": auth_header})
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2

    # Check that we only get our own templates
    titles = [item["title"] for item in data["items"]]
    assert "First User Template" in titles
    assert "Second User Template" in titles


def test_get_user_templates_requires_auth():
    """Test that getting user templates list requires authentication"""
    client = TestClient(app)
    res = client.get("/user-templates/")
    assert res.status_code == 401


def test_get_user_template():
    """Test getting a specific user template"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a user template
    user_template_data = {
        "title": "Specific User Template",
        "description": "This is a specific template",
    }

    res_create = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    template_id = res_create.json()["id"]

    # Get the specific template
    res_get = client.get(
        f"/user-templates/{template_id}", headers={"Authorization": auth_header}
    )
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["id"] == template_id
    assert data["title"] == "Specific User Template"


def test_get_nonexistent_user_template():
    """Test getting a user template that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    res = client.get("/user-templates/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "User template not found" in res.json()["detail"]


def test_update_user_template():
    """Test updating a user template"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a user template
    user_template_data = {
        "title": "Original Title",
        "description": "Original description",
    }

    res_create = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    template_id = res_create.json()["id"]

    # Update the template
    update_data = {
        "title": "Updated Title",
        "description": "Updated description",
        "is_active": False,
    }

    res_update = client.patch(
        f"/user-templates/{template_id}",
        json=update_data,
        headers={"Authorization": auth_header},
    )
    assert res_update.status_code == 200
    data = res_update.json()
    assert data["title"] == "Updated Title"
    assert data["description"] == "Updated description"
    assert data["is_active"] is False


def test_update_user_template_invalid_reference():
    """Test updating a user template with invalid template_id"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a user template
    user_template_data = {"title": "Test Template", "description": "Test description"}

    res_create = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    template_id = res_create.json()["id"]

    # Try to update with invalid template_id
    update_data = {"template_id": 999999}  # Non-existent template

    res_update = client.patch(
        f"/user-templates/{template_id}",
        json=update_data,
        headers={"Authorization": auth_header},
    )
    assert res_update.status_code == 404
    assert "Referenced template not found" in res_update.json()["detail"]


def test_update_nonexistent_user_template():
    """Test updating a user template that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    update_data = {"title": "New Title"}
    res = client.patch(
        "/user-templates/999999",
        json=update_data,
        headers={"Authorization": auth_header},
    )
    assert res.status_code == 404
    assert "User template not found" in res.json()["detail"]


def test_delete_user_template():
    """Test deleting (deactivating) a user template"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a user template
    user_template_data = {
        "title": "Template to Delete",
        "description": "Will be deleted",
    }

    res_create = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header},
    )
    assert res_create.status_code == 201
    template_id = res_create.json()["id"]

    # Delete (deactivate) the template
    res_delete = client.delete(
        f"/user-templates/{template_id}", headers={"Authorization": auth_header}
    )
    assert res_delete.status_code == 200
    data = res_delete.json()
    assert data["status"] == "deleted"

    # Verify template is deactivated
    res_get = client.get(
        f"/user-templates/{template_id}", headers={"Authorization": auth_header}
    )
    assert res_get.status_code == 200
    assert res_get.json()["is_active"] is False


def test_delete_nonexistent_user_template():
    """Test deleting a user template that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    res = client.delete(
        "/user-templates/999999", headers={"Authorization": auth_header}
    )
    assert res.status_code == 404
    assert "User template not found" in res.json()["detail"]


def test_user_template_isolation():
    """Test that users can only access their own templates"""
    client = TestClient(app)

    # Create two users
    auth_header1 = register_and_get_token(client)
    auth_header2 = register_and_get_token(client)

    # User 1 creates a template
    user_template_data = {
        "title": "User 1 Template",
        "description": "Only user 1 should see this",
    }

    res_create = client.post(
        "/user-templates/",
        json=user_template_data,
        headers={"Authorization": auth_header1},
    )
    assert res_create.status_code == 201
    template_id = res_create.json()["id"]

    # User 1 can see their template
    res_get1 = client.get(
        f"/user-templates/{template_id}", headers={"Authorization": auth_header1}
    )
    assert res_get1.status_code == 200

    # User 2 cannot see User 1's template
    res_get2 = client.get(
        f"/user-templates/{template_id}", headers={"Authorization": auth_header2}
    )
    assert res_get2.status_code == 404
