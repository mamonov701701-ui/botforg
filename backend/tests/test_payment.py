import pytest

from backend.tests.conftest import register_and_get_token


def test_create_payment(client):
    """Test creating a payment"""
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


def test_create_payment_requires_auth(client):
    """Test that creating a payment requires authentication"""

    payment_data = {
        "amount": "100.00",
        "currency": "RUB",
        "type": "messages",
        "payload": "payment_for_messages",
    }

    res = client.post("/payments/", json=payment_data)
    assert res.status_code == 401


def test_get_my_payments(client):
    """Test getting user's payments"""
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


def test_get_my_payments_requires_auth(client):
    """Test that getting payments requires authentication"""
    res = client.get("/payments/my-payments")
    assert res.status_code == 401


def test_get_payment(client):
    """Test getting a specific payment"""
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


def test_get_nonexistent_payment(client):
    """Test getting a payment that doesn't exist"""
    auth_header = register_and_get_token(client)

    res = client.get("/payments/999999", headers={"Authorization": auth_header})
    assert res.status_code == 404
    assert "Payment not found" in res.json()["detail"]


def test_payment_validation(client):
    """Test payment data validation"""
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
