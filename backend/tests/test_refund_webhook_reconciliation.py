"""Этап 6.14.7: refund webhook reconciliation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
    PaymentWebhookEvent,
)
from backend.models.refund import (
    RefundAuditActorType,
    RefundAuditEvent,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundLedgerProviderStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.payments.base import PaymentProviderError
from backend.payments.dto import (
    NormalizedRefundStatus,
    ParsedRefundWebhookEvent,
)
from backend.payments.registry import clear_provider_cache, get_payment_provider
from backend.services.refund_submit import create_refund_request
from backend.services.refund_webhook_reconciliation import (
    RefundWebhookReconcileError,
    reconcile_refund_webhook,
)
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _clear_provider_cache():
    clear_provider_cache()
    yield
    clear_provider_cache()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _auth(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


def _addon_pkg(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "msg_1000").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="msg_1000",
        name_ru="+1 000 сообщений",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("190.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def _seed_paid(db, user_id: int, *, key: str, provider: str = "fake"):
    paid_at = _utc() - timedelta(hours=1)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"{provider}:pay_{key}",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=Decimal("190.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-{key}",
        payment_provider=provider,
        provider_payment_id=f"pay_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider=provider,
        provider_payment_id=f"pay_{key}",
        amount=Decimal("190.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    db.refresh(addon)
    return intent, attempt, addon


def _create_approved(client, db, *, key: str, amount: Decimal | None = None):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _user_headers, uid = _auth(client, db)
    intent, attempt, addon = _seed_paid(db, uid, key=key)
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key=f"idem-{key}",
    )
    db.refresh(req)
    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    assert rev is not None
    if amount is not None:
        rev.proposed_refund_amount = amount
        rev.final_refund_amount = amount
        db.commit()
        db.refresh(rev)

    resp = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": rev.id},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    db.refresh(req)
    db.refresh(rev)
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "uid": uid,
        "intent": intent,
        "attempt": attempt,
        "addon": addon,
        "req": req,
        "rev": rev,
    }


def _enable_fake(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    clear_provider_cache()


def _seed_ledger(
    db,
    *,
    req: RefundRequest,
    rev: RefundRevision,
    attempt: PaymentAttempt,
    provider_refund_id: str,
    entry_type: str = RefundLedgerEntryType.RESERVED.value,
    provider_status: str = RefundLedgerProviderStatus.NOT_SUBMITTED.value,
    amount: Decimal | None = None,
    request_status: str = RefundRequestStatus.REFUND_PROCESSING.value,
):
    amt = amount if amount is not None else Decimal("190.00")
    entry = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=req.checkout_intent_id,
        payment_attempt_id=attempt.id,
        entry_type=entry_type,
        amount=amt,
        currency="RUB",
        idempotency_key=f"bf-rf-{req.id}-r{rev.id}",
        provider_refund_id=provider_refund_id,
        provider_status=provider_status,
    )
    db.add(entry)
    req.status = request_status
    db.add(req)
    db.commit()
    db.refresh(entry)
    db.refresh(req)
    return entry


def _event(
    *,
    refund_id: str,
    payment_id: str,
    status: NormalizedRefundStatus,
    amount: Decimal = Decimal("190.00"),
    currency: str = "RUB",
    provider: str = "fake",
    event_id: str | None = None,
    event_type: str | None = None,
) -> ParsedRefundWebhookEvent:
    et = event_type or f"refund.{status.value}"
    eid = event_id or f"{provider}:{et}:{refund_id}:{status.value}"
    return ParsedRefundWebhookEvent(
        provider=provider,
        provider_event_id=eid,
        event_type=et,
        provider_refund_id=refund_id,
        provider_payment_id=payment_id,
        status=status,
        amount=amount,
        currency=currency,
        raw={
            "event": et,
            "id": refund_id,
            "status": status.value,
            "payment_id": payment_id,
            "amount": {"value": f"{amount:.2f}", "currency": currency},
        },
    )


def test_reconcile_pending_keeps_processing(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-pend")
    rid = "rf_pend_1"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
        provider_status=RefundLedgerProviderStatus.PROVIDER_UNKNOWN.value,
        request_status=RefundRequestStatus.PROVIDER_UNKNOWN.value,
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.PENDING,
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.outcome == "pending"
    assert ctx["req"].status == RefundRequestStatus.REFUND_PROCESSING.value
    assert entry.entry_type == RefundLedgerEntryType.RESERVED.value


def test_reconcile_succeeded_full(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-ok")
    rid = "rf_ok_1"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    addon_before = ctx["addon"].amount
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    db.refresh(ctx["addon"])
    assert result.outcome == "succeeded"
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value
    assert ctx["addon"].amount == addon_before  # no entitlement mutate


def test_reconcile_canceled_marks_failed(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-can")
    rid = "rf_can_1"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.CANCELED,
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.outcome == "canceled"
    assert ctx["req"].status == RefundRequestStatus.REFUND_FAILED.value
    assert entry.entry_type == RefundLedgerEntryType.CANCELED.value


def test_reconcile_replay_idempotent(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-replay")
    rid = "rf_replay_1"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    ev = _event(
        refund_id=rid,
        payment_id=ctx["attempt"].provider_payment_id,
        status=NormalizedRefundStatus.SUCCEEDED,
        event_id="same-evt-1",
    )
    first = reconcile_refund_webhook(db, event=ev, attempt=ctx["attempt"])
    version = ctx["req"].version
    second = reconcile_refund_webhook(db, event=ev, attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert first.outcome == "succeeded"
    assert second.already_processed is True
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value
    assert ctx["req"].version == version  # no second bump
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value
    events = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.provider_event_id == "same-evt-1")
        .count()
    )
    assert events == 1


def test_reconcile_repeat_succeeded_no_double_confirm(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-rep-ok")
    rid = "rf_rep_ok"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
        provider_status=RefundLedgerProviderStatus.SUCCEEDED.value,
        request_status=RefundRequestStatus.REFUNDED.value,
    )
    confirmed_before = (
        db.query(RefundLedgerEntry)
        .filter(
            RefundLedgerEntry.checkout_intent_id == ctx["intent"].id,
            RefundLedgerEntry.entry_type == RefundLedgerEntryType.SUCCEEDED.value,
        )
        .count()
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
            event_id="evt-rep-ok",
        ),
        attempt=ctx["attempt"],
    )
    confirmed_after = (
        db.query(RefundLedgerEntry)
        .filter(
            RefundLedgerEntry.checkout_intent_id == ctx["intent"].id,
            RefundLedgerEntry.entry_type == RefundLedgerEntryType.SUCCEEDED.value,
        )
        .count()
    )
    assert result.outcome == "already_succeeded"
    assert confirmed_after == confirmed_before
    db.refresh(entry)
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value


def test_reconcile_recovers_provider_unknown(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-unk")
    rid = "rf_unk_1"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
        provider_status=RefundLedgerProviderStatus.PROVIDER_UNKNOWN.value,
        request_status=RefundRequestStatus.PROVIDER_UNKNOWN.value,
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.outcome == "succeeded"
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value


def test_reconcile_no_downgrade_after_succeeded(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-nodown")
    rid = "rf_nodown"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
        provider_status=RefundLedgerProviderStatus.SUCCEEDED.value,
        request_status=RefundRequestStatus.REFUNDED.value,
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.CANCELED,
            event_id="evt-nodown-cancel",
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.ignored is True
    assert result.outcome == "no_downgrade"
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value


def test_reconcile_unknown_refund_id_ignored(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-miss")
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id="rf_missing",
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
        ),
        attempt=ctx["attempt"],
    )
    assert result.ignored is True
    assert result.outcome == "ignored"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.APPROVED.value


def test_reconcile_payment_id_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-paymis")
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_paymis",
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_paymis",
                payment_id="other_pay",
                status=NormalizedRefundStatus.SUCCEEDED,
            ),
            attempt=ctx["attempt"],
        )
    assert ei.value.code == "payment_id_mismatch"


def test_reconcile_amount_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-amt")
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_amt",
        amount=Decimal("190.00"),
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_amt",
                payment_id=ctx["attempt"].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
                amount=Decimal("50.00"),
            ),
            attempt=ctx["attempt"],
        )
    assert ei.value.code == "amount_mismatch"


def test_reconcile_currency_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-cur")
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_cur",
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_cur",
                payment_id=ctx["attempt"].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
                currency="USD",
            ),
            attempt=ctx["attempt"],
        )
    assert ei.value.code == "currency_mismatch"


def test_reconcile_event_id_content_conflict(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-conf")
    rid = "rf_conf"
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    ev1 = _event(
        refund_id=rid,
        payment_id=ctx["attempt"].provider_payment_id,
        status=NormalizedRefundStatus.PENDING,
        event_id="shared-evt",
    )
    reconcile_refund_webhook(db, event=ev1, attempt=ctx["attempt"])
    ev2 = _event(
        refund_id=rid,
        payment_id=ctx["attempt"].provider_payment_id,
        status=NormalizedRefundStatus.SUCCEEDED,
        event_id="shared-evt",
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(db, event=ev2, attempt=ctx["attempt"])
    assert ei.value.code == "webhook_event_conflict"


def test_reconcile_provider_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-prov")
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_prov",
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_prov",
                payment_id=ctx["attempt"].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
                provider="yookassa",
            ),
            attempt=ctx["attempt"],
        )
    assert ei.value.code == "provider_mismatch"


def test_reconcile_payment_attempt_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-att")
    other = _seed_paid(db, ctx["uid"], key="wh-att-other", provider="fake")
    # Same connection_id so the dedicated connection check does not fire first.
    ctx["attempt"].connection_id = None
    other[1].connection_id = None
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_att",
    )
    # Point ledger at a different attempt while reconciling with the original.
    entry.payment_attempt_id = other[1].id
    db.add(entry)
    db.commit()
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_att",
                payment_id=ctx["attempt"].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
            ),
            attempt=ctx["attempt"],
        )
    assert ei.value.code == "payment_attempt_mismatch"


def test_reconcile_connection_mismatch(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-conn")
    other = _seed_paid(db, ctx["uid"], key="wh-conn-other", provider="fake")
    ctx["attempt"].connection_id = 101
    other[1].connection_id = 202
    db.add(ctx["attempt"])
    db.add(other[1])
    db.commit()
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id="rf_conn",
    )
    with pytest.raises(RefundWebhookReconcileError) as ei:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id="rf_conn",
                payment_id=other[1].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
            ),
            attempt=other[1],
        )
    assert ei.value.code == "connection_mismatch"


def test_reconcile_late_pending_after_canceled(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-late-pend")
    rid = "rf_late_pend"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.CANCELED.value,
        provider_status=RefundLedgerProviderStatus.CANCELED.value,
        request_status=RefundRequestStatus.REFUND_FAILED.value,
    )
    version = ctx["req"].version
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.PENDING,
            event_id="evt-late-pend",
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.ignored is True
    assert result.outcome == "ignored_after_canceled"
    assert ctx["req"].status == RefundRequestStatus.REFUND_FAILED.value
    assert ctx["req"].version == version
    assert entry.entry_type == RefundLedgerEntryType.CANCELED.value
    audits = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.reason == "no_transition_after_canceled",
        )
        .count()
    )
    assert audits == 1


def test_reconcile_late_succeeded_after_canceled(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-late-ok")
    rid = "rf_late_ok"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
        entry_type=RefundLedgerEntryType.CANCELED.value,
        provider_status=RefundLedgerProviderStatus.CANCELED.value,
        request_status=RefundRequestStatus.REFUND_FAILED.value,
    )
    result = reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
            event_id="evt-late-ok",
        ),
        attempt=ctx["attempt"],
    )
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert result.ignored is True
    assert result.outcome == "ignored_after_canceled"
    assert ctx["req"].status == RefundRequestStatus.REFUND_FAILED.value
    assert entry.entry_type == RefundLedgerEntryType.CANCELED.value
    assert (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.reason == "no_transition_after_canceled",
        )
        .count()
        == 1
    )


def test_reconcile_concurrent_succeeded_no_double_amount(client, db, monkeypatch):
    import threading

    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-race")
    rid = "rf_race"
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    attempt_id = ctx["attempt"].id
    outcomes: list[str] = []
    lock = threading.Lock()

    def worker(event_id: str) -> None:
        session = TestingSessionLocal()
        try:
            att = session.get(PaymentAttempt, attempt_id)
            assert att is not None
            res = reconcile_refund_webhook(
                session,
                event=_event(
                    refund_id=rid,
                    payment_id=att.provider_payment_id,
                    status=NormalizedRefundStatus.SUCCEEDED,
                    event_id=event_id,
                ),
                attempt=att,
            )
            with lock:
                outcomes.append(res.outcome)
        finally:
            session.close()

    t1 = threading.Thread(target=worker, args=("evt-race-a",))
    t2 = threading.Thread(target=worker, args=("evt-race-b",))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    db.expire_all()
    db.refresh(ctx["req"])
    succeeded_rows = (
        db.query(RefundLedgerEntry)
        .filter(
            RefundLedgerEntry.checkout_intent_id == ctx["intent"].id,
            RefundLedgerEntry.entry_type == RefundLedgerEntryType.SUCCEEDED.value,
        )
        .count()
    )
    assert succeeded_rows == 1
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value
    assert "succeeded" in outcomes
    # Race losers may surface as already_* or ignored; money must not double.
    assert set(outcomes) <= {
        "succeeded",
        "already_succeeded",
        "already_processed",
        "ignored",
    }


def test_reconcile_never_calls_refund_payment(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-nopost")
    rid = "rf_nopost"
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    with patch(
        "backend.payments.providers.fake.FakePaymentProvider.refund_payment"
    ) as refund_mock:
        reconcile_refund_webhook(
            db,
            event=_event(
                refund_id=rid,
                payment_id=ctx["attempt"].provider_payment_id,
                status=NormalizedRefundStatus.SUCCEEDED,
            ),
            attempt=ctx["attempt"],
        )
        refund_mock.assert_not_called()


def test_reconcile_audit_has_no_secrets(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="wh-aud")
    rid = "rf_aud"
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        provider_refund_id=rid,
    )
    reconcile_refund_webhook(
        db,
        event=_event(
            refund_id=rid,
            payment_id=ctx["attempt"].provider_payment_id,
            status=NormalizedRefundStatus.SUCCEEDED,
            event_id="evt-aud",
        ),
        attempt=ctx["attempt"],
    )
    audits = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == ctx["req"].id)
        .all()
    )
    assert any(a.actor_type == RefundAuditActorType.SYSTEM.value for a in audits)
    blob = json.dumps(
        [a.event_metadata for a in audits] + [
            e.payload
            for e in db.query(PaymentWebhookEvent)
            .filter(PaymentWebhookEvent.provider_event_id == "evt-aud")
            .all()
        ],
        default=str,
    ).lower()
    assert "secret_key" not in blob
    assert "live_" not in blob
    assert "password" not in blob


def test_yookassa_adapter_parses_refund_webhook(monkeypatch):
    from backend.payments.providers.yookassa import YooKassaPaymentProvider

    p = YooKassaPaymentProvider(shop_id="1", secret_key="test_secret")
    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": "rf_live_1",
            "payment_id": "pay_live_1",
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }
    body = json.dumps(payload).encode()

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": "rf_live_1",
                "payment_id": "pay_live_1",
                "status": "succeeded",
                "amount": {"value": "190.00", "currency": "RUB"},
                "created_at": "2024-01-01T00:00:00.000Z",
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        event = p.verify_and_parse_webhook(headers={}, body=body, payload=payload)
    assert isinstance(event, ParsedRefundWebhookEvent)
    assert event.provider_refund_id == "rf_live_1"
    assert event.provider_payment_id == "pay_live_1"
    assert event.status == NormalizedRefundStatus.SUCCEEDED
    assert "secret" not in json.dumps(event.raw).lower()


def test_payment_webhook_still_works(client, db, monkeypatch):
    """Regression: payment.succeeded path is not treated as refund."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", "42")
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", "test_secret")
    clear_provider_cache()

    _, uid = _auth(client, db)
    intent, attempt, _addon = _seed_paid(db, uid, key="pay-reg", provider="yookassa")
    intent.status = CheckoutIntentStatus.AWAITING_PAYMENT.value
    attempt.status = PaymentAttemptStatus.PENDING.value
    intent.fulfilled_addon_id = None
    db.add(intent)
    db.add(attempt)
    db.commit()

    payload = {
        "event": "payment.succeeded",
        "object": {
            "id": attempt.provider_payment_id,
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
            "metadata": {
                "checkout_intent_id": str(intent.id),
                "user_id": str(uid),
            },
        },
    }

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": attempt.provider_payment_id,
                "status": "succeeded",
                "amount": {"value": "190.00", "currency": "RUB"},
                "metadata": payload["object"]["metadata"],
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()

    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        res = client.post("/webhooks/payments/yookassa", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    # Must not be classified as refund reconciliation.
    assert body.get("reason") not in {
        "missing_refund_id",
        "not_refund_event",
        "unknown_refund_id",
    }


def test_yookassa_route_refund_webhook(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", "42")
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", "test_secret")
    clear_provider_cache()

    ctx = _create_approved(client, db, key="route-rf")
    # Switch attempt to yookassa for route lookup.
    attempt = ctx["attempt"]
    attempt.provider = "yookassa"
    attempt.provider_payment_id = "pay_route_rf"
    ctx["intent"].payment_provider = "yookassa"
    ctx["intent"].provider_payment_id = "pay_route_rf"
    db.add(attempt)
    db.add(ctx["intent"])
    db.commit()

    rid = "rf_route_1"
    _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=attempt,
        provider_refund_id=rid,
    )

    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": rid,
            "payment_id": "pay_route_rf",
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": rid,
                "payment_id": "pay_route_rf",
                "status": "succeeded",
                "amount": {"value": "190.00", "currency": "RUB"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()

    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with patch(
            "backend.payments.providers.yookassa.YooKassaPaymentProvider.refund_payment"
        ) as refund_mock:
            res = client.post("/webhooks/payments/yookassa", json=payload)
            refund_mock.assert_not_called()

    assert res.status_code == 200, res.text
    assert res.json().get("ok") is True
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.REFUNDED.value


def _yookassa_route_ctx(client, db, monkeypatch, *, key: str):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", "42")
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", "test_secret")
    clear_provider_cache()
    ctx = _create_approved(client, db, key=key)
    attempt = ctx["attempt"]
    attempt.provider = "yookassa"
    attempt.provider_payment_id = f"pay_{key}"
    ctx["intent"].payment_provider = "yookassa"
    ctx["intent"].provider_payment_id = f"pay_{key}"
    db.add(attempt)
    db.add(ctx["intent"])
    db.commit()
    rid = f"rf_{key}"
    entry = _seed_ledger(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=attempt,
        provider_refund_id=rid,
    )
    return ctx, attempt, entry, rid


def test_yookassa_refund_webhook_timeout_returns_503(client, db, monkeypatch):
    ctx, attempt, entry, rid = _yookassa_route_ctx(client, db, monkeypatch, key="to")
    status_before = ctx["req"].status
    entry_before = entry.entry_type
    audit_before = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == ctx["req"].id)
        .count()
    )
    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": rid,
            "payment_id": attempt.provider_payment_id,
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }
    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.get_refund_status",
        side_effect=PaymentProviderError("timeout", code="provider_timeout"),
    ):
        res = client.post("/webhooks/payments/yookassa", json=payload)
    assert res.status_code == 503
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert ctx["req"].status == status_before
    assert entry.entry_type == entry_before
    assert (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == ctx["req"].id)
        .count()
        == audit_before
    )


def test_yookassa_refund_webhook_network_error_returns_503(client, db, monkeypatch):
    ctx, attempt, entry, rid = _yookassa_route_ctx(client, db, monkeypatch, key="net")
    status_before = ctx["req"].status
    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.get_refund_status",
        side_effect=PaymentProviderError("net", code="provider_network_error"),
    ):
        res = client.post(
            "/webhooks/payments/yookassa",
            json={
                "event": "refund.succeeded",
                "object": {
                    "id": rid,
                    "payment_id": attempt.provider_payment_id,
                    "status": "succeeded",
                    "amount": {"value": "190.00", "currency": "RUB"},
                },
            },
        )
    assert res.status_code == 503
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert ctx["req"].status == status_before
    assert entry.entry_type == RefundLedgerEntryType.RESERVED.value


def test_yookassa_refund_webhook_invalid_credentials_returns_503(
    client, db, monkeypatch
):
    ctx, attempt, entry, rid = _yookassa_route_ctx(client, db, monkeypatch, key="cred")
    status_before = ctx["req"].status
    entry_before = entry.entry_type
    audit_before = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == ctx["req"].id)
        .count()
    )
    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.get_refund_status",
        side_effect=PaymentProviderError("creds", code="invalid_credentials"),
    ):
        with patch(
            "backend.payments.providers.yookassa.YooKassaPaymentProvider.refund_payment"
        ) as refund_mock:
            res = client.post(
                "/webhooks/payments/yookassa",
                json={
                    "event": "refund.succeeded",
                    "object": {
                        "id": rid,
                        "payment_id": attempt.provider_payment_id,
                        "status": "succeeded",
                        "amount": {"value": "190.00", "currency": "RUB"},
                    },
                },
            )
            refund_mock.assert_not_called()
    assert res.status_code == 503
    assert "secret" not in (res.text or "").lower()
    assert "credential" not in (res.json().get("detail") or "").lower()
    db.refresh(ctx["req"])
    db.refresh(entry)
    assert ctx["req"].status == status_before
    assert entry.entry_type == entry_before
    assert (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == ctx["req"].id)
        .count()
        == audit_before
    )


def test_yookassa_refund_webhook_payment_id_mismatch_400(client, db, monkeypatch):
    _ctx, attempt, _entry, rid = _yookassa_route_ctx(
        client, db, monkeypatch, key="mispay"
    )
    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": rid,
            "payment_id": attempt.provider_payment_id,
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": rid,
                "payment_id": "other_payment",
                "status": "succeeded",
                "amount": {"value": "190.00", "currency": "RUB"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        res = client.post("/webhooks/payments/yookassa", json=payload)
    assert res.status_code == 400


def test_yookassa_refund_webhook_amount_mismatch_400(client, db, monkeypatch):
    _ctx, attempt, _entry, rid = _yookassa_route_ctx(
        client, db, monkeypatch, key="misamt"
    )
    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": rid,
            "payment_id": attempt.provider_payment_id,
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": rid,
                "payment_id": attempt.provider_payment_id,
                "status": "succeeded",
                "amount": {"value": "50.00", "currency": "RUB"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        res = client.post("/webhooks/payments/yookassa", json=payload)
    assert res.status_code == 400


def test_yookassa_refund_webhook_currency_mismatch_400(client, db, monkeypatch):
    _ctx, attempt, _entry, rid = _yookassa_route_ctx(
        client, db, monkeypatch, key="miscur"
    )
    payload = {
        "event": "refund.succeeded",
        "object": {
            "id": rid,
            "payment_id": attempt.provider_payment_id,
            "status": "succeeded",
            "amount": {"value": "190.00", "currency": "RUB"},
        },
    }

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": rid,
                "payment_id": attempt.provider_payment_id,
                "status": "succeeded",
                "amount": {"value": "190.00", "currency": "USD"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        res = client.post("/webhooks/payments/yookassa", json=payload)
    assert res.status_code == 400


def test_yookassa_adapter_refund_notify_mismatches(monkeypatch):
    from backend.payments.providers.yookassa import YooKassaPaymentProvider

    p = YooKassaPaymentProvider(shop_id="1", secret_key="test_secret")

    def _run(notify_obj, live):
        payload = {"event": "refund.succeeded", "object": notify_obj}
        body = json.dumps(payload).encode()

        class Resp:
            status_code = 200
            content = b"ok"

            def json(self):
                return live

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.request.return_value = Resp()
        with patch(
            "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
        ):
            return p.verify_and_parse_webhook(headers={}, body=body, payload=payload)

    with pytest.raises(PaymentProviderError) as ei:
        _run(
            {
                "id": "rf1",
                "payment_id": "pay_a",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            },
            {
                "id": "rf1",
                "payment_id": "pay_b",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            },
        )
    assert ei.value.code == "webhook_payment_id_mismatch"

    with pytest.raises(PaymentProviderError) as ei:
        _run(
            {
                "id": "rf2",
                "payment_id": "pay_a",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            },
            {
                "id": "rf2",
                "payment_id": "pay_a",
                "status": "succeeded",
                "amount": {"value": "11.00", "currency": "RUB"},
            },
        )
    assert ei.value.code == "webhook_amount_mismatch"

    with pytest.raises(PaymentProviderError) as ei:
        _run(
            {
                "id": "rf3",
                "payment_id": "pay_a",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            },
            {
                "id": "rf3",
                "payment_id": "pay_a",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "USD"},
            },
        )
    assert ei.value.code == "webhook_currency_mismatch"


def test_refund_webhook_forbidden_ip(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", "42")
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", "test_secret")
    clear_provider_cache()
    monkeypatch.setattr(
        "backend.routers.checkout_pay.is_yookassa_webhook_ip",
        lambda _ip: False,
    )
    res = client.post(
        "/webhooks/payments/yookassa",
        json={
            "event": "refund.succeeded",
            "object": {
                "id": "rf_ip",
                "payment_id": "pay_ip",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            },
        },
    )
    assert res.status_code == 403
