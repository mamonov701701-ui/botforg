"""
Tests for auth endpoints (email/register, email/login).
"""
import pytest
from fastapi.testclient import TestClient
from jose import jwt

from backend.settings import settings


def test_register_and_login(client: TestClient):
    """Register new user and login."""
    email = f"test_{__import__('uuid').uuid4().hex[:8]}@example.com"
    password = "SecretPass123!"

    res = client.post(
        "/auth/email/register",
        json={"email": email, "name": "Tester", "password": password},
    )
    assert res.status_code == 200

    res = client.post(
        "/auth/email/login",
        json={"email": email, "password": password},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    payload = jwt.decode(data["access_token"], settings.JWT_SECRET, algorithms=["HS256"])
    assert payload["sub"].isdigit()
    assert payload["tv"] == 0
    assert "iat" in payload
    assert "exp" in payload

    me = client.get(
        "/me", headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_login_invalid_credentials(client: TestClient):
    """Login with wrong password fails."""
    res = client.post(
        "/auth/email/login",
        json={"email": "nonexistent@example.com", "password": "WrongPass123!"},
    )
    assert res.status_code in (401, 422)


def test_register_weak_password(client: TestClient):
    """Registration with weak password."""
    res = client.post(
        "/auth/email/register",
        json={"email": "test@example.com", "name": "T", "password": "123"},
    )
    assert res.status_code in (400, 422)


def test_protected_endpoint_without_auth(client: TestClient):
    """Protected endpoint returns 401 without token."""
    res = client.get("/bots/")
    assert res.status_code == 401
