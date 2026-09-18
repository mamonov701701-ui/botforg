from datetime import datetime, timezone

import pytest

from backend.ai.orchestration import AiInvocationConflict, execute_text_generation
from backend.ai.reservations import AiReservationError, reserve_for_invocation
from backend.auth.password import hash_password
from backend.models.ai_provider import AiCreditReservation, AiInvocation, AiModelCatalog, AiProviderConfig
from backend.models.user import User
from backend.services.ai_credits import get_balance, grant_credits


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(db, email="ai-provider@example.com"):
    row = User(email=email, name="AI Provider", plan_code="start", role="user", hashed_password=hash_password("TestPassword123!"))
    db.add(row); db.commit()
    return row


def _route(db, *, rule=None, enabled=True, capabilities=None):
    provider = AiProviderConfig(code="mock", display_name="Mock", adapter_code="mock", enabled=enabled, status="healthy", routing_priority=10)
    db.add(provider); db.flush()
    model = AiModelCatalog(provider_id=provider.id, model_code="mock-text", display_name="Mock text", enabled=enabled, capabilities=capabilities or ["text_generation"], routing_priority=10, pricing_version="test-v1", pricing_rule=rule or {"maximum_ai_credits": 30, "ai_credits_per_request": 18})
    db.add(model); db.commit()
    return model


def _grant(db, user, amount=100):
    grant_credits(db, user_id=user.id, amount=amount, credit_class="purchased", source_type="test", source_ref_type="test", source_ref_id=user.id, idempotency_key=f"grant-{user.id}", expires_at=None)
    db.commit()


def test_success_settles_only_actual_charge_and_never_stores_prompt(db):
    user = _user(db); _grant(db, user); _route(db)
    invocation = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="request-1", input_text="sensitive prompt")
    assert invocation.status == "succeeded"
    assert invocation.ai_credits_charged == 18
    reservation = db.query(AiCreditReservation).filter_by(invocation_id=invocation.id).one()
    assert (reservation.status, reservation.reserved_amount, reservation.settled_amount, reservation.released_amount) == ("settled", 30, 18, 12)
    assert get_balance(db, user_id=user.id).total_spendable == 82
    assert "prompt" not in str(invocation.metadata_json or {})


def test_insufficient_credits_prevents_provider_dispatch(db):
    user = _user(db); _grant(db, user, 29); _route(db)
    invocation = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="request-1", input_text="hello")
    assert invocation.status == "failed" and invocation.error_code == "insufficient_credits"
    assert db.query(AiCreditReservation).count() == 0
    assert get_balance(db, user_id=user.id).total_spendable == 29


def test_confirmed_failure_releases_and_timeout_retains_reservation(db):
    user = _user(db); _grant(db, user); _route(db)
    failed = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="failed", input_text="hello", parameters={"mock_behavior": "unavailable"})
    assert failed.status == "failed"
    assert db.query(AiCreditReservation).filter_by(invocation_id=failed.id).one().status == "released"
    unknown = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="timeout", input_text="hello", parameters={"mock_behavior": "timeout"})
    assert unknown.status == "provider_unknown"
    assert db.query(AiCreditReservation).filter_by(invocation_id=unknown.id).one().status == "provider_unknown"
    assert get_balance(db, user_id=user.id).total_spendable == 100


def test_same_key_replays_and_different_payload_fails_closed(db):
    user = _user(db); _grant(db, user); _route(db)
    first = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="same", input_text="one")
    replay = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="same", input_text="one")
    assert replay.id == first.id and get_balance(db, user_id=user.id).total_spendable == 82
    with pytest.raises(AiInvocationConflict):
        execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="same", input_text="two")


def test_disabled_or_incompatible_catalog_never_reserves(db):
    user = _user(db); _grant(db, user); _route(db, enabled=False)
    invocation = execute_text_generation(db, user_id=user.id, feature="test_feature", idempotency_key="no-route", input_text="hello")
    assert invocation.status == "failed" and invocation.error_code == "no_eligible_model"
    assert db.query(AiCreditReservation).count() == 0


def test_active_reservations_reduce_availability_across_sessions(client, db):
    user = _user(db); _grant(db, user); model = _route(db, rule={"maximum_ai_credits": 80, "ai_credits_per_request": 1})
    first = AiInvocation(user_id=user.id, feature="f", capability="text_generation", idempotency_key="a", request_fingerprint="a", status="created")
    db.add(first); db.commit(); reserve_for_invocation(db, first, model.pricing_rule); db.commit()
    from backend.tests.conftest import TestingSessionLocal
    second_db = TestingSessionLocal()
    try:
        second = AiInvocation(user_id=user.id, feature="f", capability="text_generation", idempotency_key="b", request_fingerprint="b", status="created")
        second_db.add(second); second_db.commit()
        with pytest.raises(AiReservationError) as error:
            reserve_for_invocation(second_db, second, model.pricing_rule)
        assert error.value.code == "insufficient_credits"
        second_db.rollback()
    finally:
        second_db.close()
    assert get_balance(db, user_id=user.id).total_spendable == 100


def test_generic_pricing_supports_non_token_usage():
    from backend.ai.pricing import calculate_charge
    assert calculate_charge({"ai_credits_per_request": 1, "ai_credits_per_images": 2, "ai_credits_per_seconds": 3, "ai_credits_per_vendor_units": 4}, {"images": 2, "seconds": 1, "vendor_units": 3}) == 20
