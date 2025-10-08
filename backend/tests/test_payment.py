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


def test_create_payment():
    """Test creating a payment"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    payment_data = {
        "amount": "100.00",
        "currency": "RUB",
        "type": "messages",
        "payload": "payment_for_messages",
    }

    res = client.post(
        "/payments/", json=payment_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["amount"] == "100.00"
    assert data["currency"] == "RUB"
    assert data["type"] == "messages"
    assert data["status"] == "pending"
    assert data["payload"] == "payment_for_messages"


def test_create_payment_requires_auth():
    """Test that creating a payment requires authentication"""
    client = TestClient(app)

    payment_data = {
        "amount": "100.00",
        "currency": "RUB",
        "type": "messages",
        "payload": "payment_for_messages",
    }

    res = client.post("/payments/", json=payment_data)
    assert res.status_code == 401


def test_get_my_payments():
    """Test getting user's payments"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a payment first
    payment_data = {
        "amount": "50.00",
        "currency": "RUB",
        "type": "subscription",
        "payload": "monthly_subscription",
    }

    client.post("/payments/", json=payment_data, headers={"Authorization": auth_header})

    # Get payments list
    res = client.get("/payments/my-payments", headers={"Authorization": auth_header})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_get_my_payments_requires_auth():
    """Test that getting payments requires authentication"""
    client = TestClient(app)
    res = client.get("/payments/my-payments")
    assert res.status_code == 401


def test_get_payment():
    """Test getting a specific payment"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Create a payment first
    payment_data = {
        "amount": "75.00",
        "currency": "RUB",
        "type": "purchase",
        "payload": "template_purchase",
    }

    create_res = client.post(
        "/payments/", json=payment_data, headers={"Authorization": auth_header}
    )
    assert create_res.status_code == 200
    payment_id = create_res.json()["id"]

    # Get the specific payment
    res = client.get(f"/payments/{payment_id}", headers={"Authorization": auth_header})
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == payment_id
    assert data["amount"] == "75.00"


def test_get_nonexistent_payment():
    """Test getting a payment that doesn't exist"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    res = client.get("/payments/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Payment not found" in res.json()["detail"]


def test_payment_validation():
    """Test payment data validation"""
    client = TestClient(app)
    auth_header = register_and_get_token(client)

    # Test invalid amount
    payment_data = {
        "amount": "-10.00",  # Negative amount
        "currency": "RUB",
        "type": "messages",
        "payload": "test",
    }

    res = client.post(
        "/payments/", json=payment_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 422

    # Test invalid type
    payment_data = {
        "amount": "100.00",
        "currency": "RUB",
        "type": "invalid_type",  # Invalid type
        "payload": "test",
    }

    res = client.post(
        "/payments/", json=payment_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 422

    # Test empty payload
    payment_data = {
        "amount": "100.00",
        "currency": "RUB",
        "type": "messages",
        "payload": "",  # Empty payload
    }

    res = client.post(
        "/payments/", json=payment_data, headers={"Authorization": auth_header}
    )
    assert res.status_code == 422
