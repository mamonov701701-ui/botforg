"""Этап 6.14.1: refund models, revisions, ledger, invariants (data foundation)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.refund import (
    RefundAuditActorType,
    RefundAuditAction,
    RefundAuditEvent,
    RefundCalculationStatus,
    RefundEntitlementAction,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundLedgerProviderStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
    RefundRevisionType,
    RefundType,
)
from backend.services.refund_invariants import (
    RefundInvariantError,
    assert_financials_not_frozen,
    assert_revision_immutable_update_forbidden,
    validate_current_revision,
    validate_ledger_total_within_paid,
    validate_optimistic_version,
    validate_refund_amount_bounds,
    validate_revision_ownership,
    validate_status_transition,
)
from backend.tests.conftest import get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utcnow():
    return datetime.now(timezone.utc)


def _seed_paid_intent(db, user_id: int, *, amount: str = "190.00", key: str):
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code="msg_1000",
        product_name="+1 000 сообщений",
        amount=Decimal(amount),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=key,
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        paid_at=_utcnow(),
        fulfilled_at=_utcnow(),
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="yookassa",
        provider_payment_id=f"yk_{key}",
        amount=Decimal(amount),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    return intent, attempt


def _create_request(db, user_id: int, intent: CheckoutIntent, attempt: PaymentAttempt):
    req = RefundRequest(
        user_id=user_id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        status=RefundRequestStatus.SUBMITTED.value,
        reason_category="unused",
        user_comment=None,
        current_revision_number=0,
        version=1,
        submitted_at=_utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _add_revision(
    db,
    req: RefundRequest,
    *,
    number: int,
    proposed: str,
    revision_type: str = RefundRevisionType.AUTOMATIC.value,
    prior: str = "0.00",
    created_by: int | None = None,
    paid: str = "190.00",
):
    paid_d = Decimal(paid)
    prior_d = Decimal(prior)
    prop_d = Decimal(proposed)
    refund_type = (
        RefundType.FULL.value
        if prop_d == (paid_d - prior_d)
        else RefundType.PARTIAL.value
    )
    rev = RefundRevision(
        refund_request_id=req.id,
        revision_number=number,
        revision_type=revision_type,
        created_by_user_id=created_by,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=refund_type,
        currency="RUB",
        paid_amount=paid_d,
        prior_refunded_amount=prior_d,
        proposed_refund_amount=prop_d,
        final_refund_amount=None,
        calculation_at=_utcnow(),
        entitlement_action=RefundEntitlementAction.CANCEL_ADDON.value,
        calculation_snapshot={"formula": "test"},
        entitlement_snapshot={"action": "cancel_addon"},
        usage_snapshot={"pool_used": 0},
    )
    db.add(rev)
    req.current_revision_number = number
    db.commit()
    db.refresh(rev)
    db.refresh(req)
    return rev


def test_create_refund_request(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-create-1")
    req = _create_request(db, uid, intent, attempt)
    assert req.id is not None
    assert req.status == RefundRequestStatus.SUBMITTED.value
    assert req.version == 1
    assert req.checkout_intent_id == intent.id
    assert req.payment_attempt_id == attempt.id


def test_multiple_immutable_revisions_and_unique_number(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-rev-1")
    req = _create_request(db, uid, intent, attempt)
    r1 = _add_revision(db, req, number=1, proposed="190.00")
    r2 = _add_revision(
        db,
        req,
        number=2,
        proposed="100.00",
        revision_type=RefundRevisionType.ADMIN.value,
        created_by=uid,
    )
    assert r1.id != r2.id
    assert req.current_revision_number == 2

    dup = RefundRevision(
        refund_request_id=req.id,
        revision_number=1,
        revision_type=RefundRevisionType.AUTOMATIC.value,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=RefundType.FULL.value,
        currency="RUB",
        paid_amount=Decimal("190.00"),
        prior_refunded_amount=Decimal("0.00"),
        proposed_refund_amount=Decimal("190.00"),
        calculation_at=_utcnow(),
        entitlement_action=RefundEntitlementAction.NONE.value,
    )
    db.add(dup)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_optimistic_locking_version_conflict(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-ver-1")
    req = _create_request(db, uid, intent, attempt)
    validate_optimistic_version(req, expected_version=1)
    with pytest.raises(RefundInvariantError) as exc:
        validate_optimistic_version(req, expected_version=2)
    assert exc.value.code == "version_conflict"
    req.version = 2
    db.commit()
    validate_optimistic_version(req, expected_version=2)


def test_refund_amount_bounds():
    assert validate_refund_amount_bounds(
        refund_amount="100.00",
        paid_amount="190.00",
        prior_refunded_amount="50.00",
    ) == Decimal("100.00")
    with pytest.raises(RefundInvariantError) as exc:
        validate_refund_amount_bounds(
            refund_amount="150.00",
            paid_amount="190.00",
            prior_refunded_amount="50.00",
        )
    assert exc.value.code == "refund_exceeds_cap"
    with pytest.raises(RefundInvariantError) as exc2:
        validate_refund_amount_bounds(
            refund_amount="-1.00",
            paid_amount="190.00",
        )
    assert exc2.value.code == "refund_negative"


def test_ledger_idempotency_unique_and_partial_sum(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-led-1")
    req = _create_request(db, uid, intent, attempt)
    rev = _add_revision(db, req, number=1, proposed="100.00")

    e1 = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        entry_type=RefundLedgerEntryType.PLANNED.value,
        amount=Decimal("100.00"),
        currency="RUB",
        idempotency_key="led-1",
        provider_status=RefundLedgerProviderStatus.LOCAL_ONLY.value,
    )
    db.add(e1)
    db.commit()

    validate_ledger_total_within_paid(
        paid_amount="190.00",
        existing_ledger_amounts=[Decimal("100.00")],
        new_amount="90.00",
    )
    with pytest.raises(RefundInvariantError) as exc:
        validate_ledger_total_within_paid(
            paid_amount="190.00",
            existing_ledger_amounts=[Decimal("100.00")],
            new_amount="91.00",
        )
    assert exc.value.code == "ledger_exceeds_paid"

    e2 = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        entry_type=RefundLedgerEntryType.RESERVED.value,
        amount=Decimal("90.00"),
        currency="RUB",
        idempotency_key="led-2",
        provider_status=RefundLedgerProviderStatus.NOT_SUBMITTED.value,
    )
    db.add(e2)
    db.commit()

    dup = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        entry_type=RefundLedgerEntryType.PLANNED.value,
        amount=Decimal("1.00"),
        currency="RUB",
        idempotency_key="led-1",
    )
    db.add(dup)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_approved_revision_ownership(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent_a, attempt_a = _seed_paid_intent(db, uid, key="rr-own-a")
    intent_b, attempt_b = _seed_paid_intent(db, uid, key="rr-own-b")
    req_a = _create_request(db, uid, intent_a, attempt_a)
    req_b = _create_request(db, uid, intent_b, attempt_b)
    rev_b = _add_revision(db, req_b, number=1, proposed="190.00")
    with pytest.raises(RefundInvariantError) as exc:
        validate_revision_ownership(req_a, rev_b)
    assert exc.value.code == "revision_ownership"

    rev_a = _add_revision(db, req_a, number=1, proposed="190.00")
    validate_current_revision(req_a, rev_a)
    req_a.approved_revision_id = rev_a.id
    db.commit()
    assert req_a.approved_revision_id == rev_a.id


def test_forbidden_status_transitions():
    validate_status_transition(
        current=RefundRequestStatus.SUBMITTED.value,
        new=RefundRequestStatus.CALCULATING.value,
    )
    with pytest.raises(RefundInvariantError) as exc:
        validate_status_transition(
            current=RefundRequestStatus.SUBMITTED.value,
            new=RefundRequestStatus.COMPLETED.value,
        )
    assert exc.value.code == "invalid_status_transition"
    with pytest.raises(RefundInvariantError):
        validate_status_transition(
            current=RefundRequestStatus.COMPLETED.value,
            new=RefundRequestStatus.SUBMITTED.value,
        )


def test_revision_immutable_helper_and_financial_freeze(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-imm-1")
    req = _create_request(db, uid, intent, attempt)
    assert_financials_not_frozen(req)
    req.status = RefundRequestStatus.REFUND_PROCESSING.value
    db.commit()
    with pytest.raises(RefundInvariantError) as exc:
        assert_financials_not_frozen(req)
    assert exc.value.code == "financials_frozen"
    with pytest.raises(RefundInvariantError) as exc2:
        assert_revision_immutable_update_forbidden()
    assert exc2.value.code == "revision_immutable"


def test_audit_event_without_secrets(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-aud-1")
    req = _create_request(db, uid, intent, attempt)
    rev = _add_revision(db, req, number=1, proposed="190.00")
    ev = RefundAuditEvent(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        actor_user_id=uid,
        actor_type=RefundAuditActorType.USER.value,
        action=RefundAuditAction.CREATED.value,
        previous_status=None,
        new_status=RefundRequestStatus.SUBMITTED.value,
        changed_fields={"status": {"old": None, "new": "submitted"}},
        reason=None,
        event_metadata={"note": "safe"},
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    assert ev.event_metadata == {"note": "safe"}
    assert "secret" not in str(ev.event_metadata).lower()


def test_stale_current_revision(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_paid_intent(db, uid, key="rr-stale-1")
    req = _create_request(db, uid, intent, attempt)
    r1 = _add_revision(db, req, number=1, proposed="190.00")
    _add_revision(db, req, number=2, proposed="100.00")
    with pytest.raises(RefundInvariantError) as exc:
        validate_current_revision(req, r1)
    assert exc.value.code == "stale_revision"


def test_migration_head_includes_refund_tables(db):
    from sqlalchemy import inspect

    insp = inspect(db.bind)
    tables = set(insp.get_table_names())
    assert "refund_requests" in tables
    assert "refund_revisions" in tables
    assert "refund_ledger_entries" in tables
    assert "refund_audit_events" in tables
