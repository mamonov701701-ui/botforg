"""
Тесты PaymentProvider abstraction (Этап 6.8).
"""
from decimal import Decimal

import pytest

from backend.payments import (
    CreatePaymentRequest,
    NormalizedPaymentStatus,
    clear_provider_cache,
    get_default_provider_name,
    get_payment_provider,
    list_available_provider_names,
    mask_secret,
    provider_config_public_view,
)
from backend.payments.registry import PaymentProviderRegistryError
from backend.services.checkout_intents import create_checkout_intent
from backend.services.payment_fulfillment import create_payment_attempt
from backend.settings import settings
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)


@pytest.fixture(autouse=True)
def _clear_registry_cache():
    clear_provider_cache()
    yield
    clear_provider_cache()


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_default_provider_name_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_DEFAULT", "yookassa")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "yookassa,stripe")
    assert get_default_provider_name() == "yookassa"
    assert "yookassa" in list_available_provider_names()


def test_unknown_provider_fails(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "yookassa")
    with pytest.raises(PaymentProviderRegistryError) as exc:
        get_payment_provider("not_a_real_provider")
    assert exc.value.code == "unknown_provider"


def test_fake_provider_available_in_test_mode(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", False)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "yookassa")
    clear_provider_cache()
    assert "fake" in list_available_provider_names()
    provider = get_payment_provider("fake")
    assert provider.is_fake is True
    result = provider.create_payment(
        CreatePaymentRequest(
            amount=Decimal("100.00"),
            currency="RUB",
            description="test",
            idempotency_key="k1",
        )
    )
    assert result.provider == "fake"
    assert result.status == NormalizedPaymentStatus.PENDING
    assert result.provider_payment_id.startswith("fake_")


def test_fake_provider_forbidden_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "fake,yookassa")
    clear_provider_cache()
    assert "fake" not in list_available_provider_names()
    with pytest.raises(PaymentProviderRegistryError) as exc:
        get_payment_provider("fake")
    assert exc.value.code == "fake_provider_forbidden"


def test_production_fail_closed_without_fake_flags(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", False)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", False)
    clear_provider_cache()
    with pytest.raises(PaymentProviderRegistryError):
        get_payment_provider("fake")


def test_attempt_keeps_provider_when_default_changes(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_DEFAULT", "fake")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "fake,yookassa")
    clear_provider_cache()

    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="tariff",
        code="business",
        idempotency_key="prov-keep-1",
    )
    attempt = create_payment_attempt(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        idempotency_key="att-keep-1",
        provider=None,
    )
    assert attempt.provider == "fake"

    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_DEFAULT", "yookassa")
    clear_provider_cache()
    db.refresh(attempt)
    assert attempt.provider == "fake"


def test_registry_public_view_hides_secrets(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", "shop_1234567890")
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", "secret_super_sensitive_value")
    monkeypatch.setattr(settings, "STRIPE_API_KEY", "sk_test_abcdefghijklmnop")
    view = provider_config_public_view()
    blob = str(view)
    assert "secret_super_sensitive_value" not in blob
    assert "sk_test_abcdefghijklmnop" not in blob
    assert view["secrets_configured"]["yookassa"] is True
    assert view["secrets_configured"]["stripe"] is True
    assert mask_secret("secret_super_sensitive_value").endswith("alue")
    assert "secret_super" not in mask_secret("secret_super_sensitive_value")


def test_unimplemented_real_provider_not_instantiated(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", False)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", False)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "yookassa")
    clear_provider_cache()
    with pytest.raises(PaymentProviderRegistryError) as exc:
        get_payment_provider("yookassa")
    assert exc.value.code == "provider_not_implemented"


def test_fake_webhook_signature_roundtrip(monkeypatch):
    import hashlib
    import json

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    clear_provider_cache()
    provider = get_payment_provider("fake")
    created = provider.create_payment(
        CreatePaymentRequest(
            amount=Decimal("10.00"),
            currency="RUB",
            description="hook",
            idempotency_key="hook-1",
        )
    )
    provider.mark_succeeded(created.provider_payment_id)
    payload = {
        "event_id": "evt-1",
        "provider_payment_id": created.provider_payment_id,
        "status": "succeeded",
        "amount": "10.00",
        "currency": "RUB",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = hashlib.sha256(body).hexdigest()
    parsed = provider.verify_and_parse_webhook(
        headers={"X-Fake-Signature": sig},
        body=body,
    )
    assert parsed.status == NormalizedPaymentStatus.SUCCEEDED
    assert parsed.provider_payment_id == created.provider_payment_id
