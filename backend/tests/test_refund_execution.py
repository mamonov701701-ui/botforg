"""Этап 6.14.6: admin refund execute orchestration."""
from __future__ import annotations

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
)
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundLedgerEntry,
    RefundLedgerEntryType,
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
    RefundPaymentResult,
    RefundStatusResult,
)
from backend.payments.registry import clear_provider_cache, get_payment_provider
from backend.services.refund_submit import create_refund_request
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
    assert req.status == RefundRequestStatus.APPROVED.value
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


def _seed_fake_payment(attempt: PaymentAttempt):
    provider = get_payment_provider("fake")
    provider._payments[attempt.provider_payment_id] = {
        "id": attempt.provider_payment_id,
        "amount": Decimal(str(attempt.amount)),
        "currency": (attempt.currency or "RUB").upper(),
        "status": "succeeded",
        "description": "test",
        "metadata": {},
        "idempotency_key": "seed",
    }
    return provider


def _mock_result(
    *,
    status: NormalizedRefundStatus,
    refund_id: str = "rf_1",
    payment_id: str = "pay_x",
    amount: str = "190.00",
) -> RefundPaymentResult:
    return RefundPaymentResult(
        provider="fake",
        provider_payment_id=payment_id,
        refund_id=refund_id,
        status=status,
        amount=Decimal(amount),
        currency="RUB",
        raw={"id": refund_id, "status": status.value},
    )


def test_execute_full_refund_success(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="exec-full")
    _seed_fake_payment(ctx["attempt"])
    addon_status_before = ctx["addon"].status

    resp = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["outcome"] == "succeeded"
    assert body["provider_refund_id"]
    assert body["detail"]["request"]["status"] == RefundRequestStatus.REFUNDED.value

    db.expire_all()
    req = db.get(RefundRequest, ctx["req"].id)
    ledger = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == req.id)
        .all()
    )
    assert len(ledger) == 1
    assert ledger[0].entry_type == RefundLedgerEntryType.SUCCEEDED.value
    assert ledger[0].provider_refund_id == body["provider_refund_id"]
    assert ledger[0].idempotency_key.startswith("bf-rf-")

    audits = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .all()
    )
    assert any(a.action == RefundAuditAction.LEDGER_ENTRY_CREATED.value for a in audits)
    assert any(a.action == RefundAuditAction.STATUS_CHANGED.value for a in audits)

    addon = db.get(UserAddon, ctx["addon"].id)
    assert addon.status == addon_status_before


def test_execute_partial_refund(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="exec-partial", amount=Decimal("50.00"))
    _seed_fake_payment(ctx["attempt"])

    resp = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["detail"]["request"]["status"] == (
        RefundRequestStatus.PARTIALLY_REFUNDED.value
    )


def test_execute_pending(client, db):
    ctx = _create_approved(client, db, key="exec-pending")
    mock_provider = MagicMock()
    mock_provider.refund_payment.return_value = _mock_result(
        status=NormalizedRefundStatus.PENDING,
        payment_id=ctx["attempt"].provider_payment_id,
        amount="190.00",
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "pending"
    assert resp.json()["detail"]["request"]["status"] == (
        RefundRequestStatus.REFUND_PROCESSING.value
    )
    db.expire_all()
    ledger = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .one()
    )
    assert ledger.entry_type == RefundLedgerEntryType.RESERVED.value


def test_execute_canceled(client, db):
    ctx = _create_approved(client, db, key="exec-cancel")
    mock_provider = MagicMock()
    mock_provider.refund_payment.return_value = _mock_result(
        status=NormalizedRefundStatus.CANCELED,
        payment_id=ctx["attempt"].provider_payment_id,
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "canceled"
    assert resp.json()["detail"]["request"]["status"] == (
        RefundRequestStatus.REFUND_FAILED.value
    )


def test_execute_provider_error(client, db):
    ctx = _create_approved(client, db, key="exec-err")
    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "http boom", code="provider_http_error"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "failed"
    assert resp.json()["detail"]["request"]["status"] == (
        RefundRequestStatus.REFUND_FAILED.value
    )


def test_execute_timeout_provider_unknown(client, db):
    ctx = _create_approved(client, db, key="exec-timeout")
    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "timeout", code="provider_timeout"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "provider_unknown"
    assert resp.json()["detail"]["request"]["status"] == (
        RefundRequestStatus.PROVIDER_UNKNOWN.value
    )
    db.expire_all()
    ledger = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .one()
    )
    assert ledger.entry_type == RefundLedgerEntryType.PROVIDER_UNKNOWN.value
    assert ledger.provider_refund_id is None


def test_repeat_execute_does_not_create_second_refund(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="exec-repeat")
    _seed_fake_payment(ctx["attempt"])

    r1 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r1.status_code == 200, r1.text
    db.refresh(ctx["req"])
    r2 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["already_completed"] is True
    assert r2.json()["outcome"] == "already_completed"
    assert r1.json()["provider_refund_id"] == r2.json()["provider_refund_id"]

    ledgers = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .all()
    )
    assert len(ledgers) == 1


def test_repeat_after_succeeded(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="exec-again")
    _seed_fake_payment(ctx["attempt"])
    first = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert first.status_code == 200
    db.refresh(ctx["req"])
    second = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert second.json()["already_completed"] is True


def test_provider_unknown_with_refund_id_uses_get_status(client, db):
    ctx = _create_approved(client, db, key="exec-unk-get")
    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "timeout", code="provider_timeout"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        r1 = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert r1.json()["outcome"] == "provider_unknown"
    db.expire_all()
    ledger = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .one()
    )
    ledger.provider_refund_id = "rf_known"
    req = db.get(RefundRequest, ctx["req"].id)
    db.commit()

    mock_provider2 = MagicMock()
    mock_provider2.get_refund_status.return_value = RefundStatusResult(
        provider="fake",
        refund_id="rf_known",
        provider_payment_id=ctx["attempt"].provider_payment_id,
        status=NormalizedRefundStatus.SUCCEEDED,
        amount=Decimal("190.00"),
        currency="RUB",
        raw={"id": "rf_known", "status": "succeeded"},
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider2,
    ):
        r2 = client.post(
            f"/api/admin/refunds/{req.id}/execute",
            json={"expected_version": req.version},
            headers=ctx["admin_headers"],
        )
    assert r2.status_code == 200, r2.text
    assert r2.json()["outcome"] == "succeeded"
    mock_provider2.refund_payment.assert_not_called()
    mock_provider2.get_refund_status.assert_called_once_with("rf_known")


def test_provider_unknown_without_refund_id_no_second_post(client, db):
    ctx = _create_approved(client, db, key="exec-unk-nopost")
    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "timeout", code="provider_timeout"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        r1 = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert r1.json()["outcome"] == "provider_unknown"
    db.refresh(ctx["req"])
    mock_provider.refund_payment.reset_mock()
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        r2 = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert r2.status_code == 409
    assert r2.json()["detail"]["code"] == "provider_unknown_no_refund_id"
    mock_provider.refund_payment.assert_not_called()


def test_execute_wrong_status(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _user_headers, uid = _auth(client, db)
    intent, _attempt, _addon = _seed_paid(db, uid, key="exec-bad-status")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-exec-bad-status",
    )
    db.refresh(req)
    resp = client.post(
        f"/api/admin/refunds/{req.id}/execute",
        json={"expected_version": req.version},
        headers=admin_headers,
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "execute_not_allowed"


def test_execute_stale_version(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved(client, db, key="exec-stale")
    _seed_fake_payment(ctx["attempt"])
    resp = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version + 5},
        headers=ctx["admin_headers"],
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "version_conflict"


def test_execute_amount_exceeds_available(client, db):
    ctx = _create_approved(client, db, key="exec-over")
    hold = RefundLedgerEntry(
        refund_request_id=ctx["req"].id,
        refund_revision_id=ctx["rev"].id,
        checkout_intent_id=ctx["intent"].id,
        payment_attempt_id=ctx["attempt"].id,
        entry_type=RefundLedgerEntryType.RESERVED.value,
        amount=Decimal("190.00"),
        currency="RUB",
        idempotency_key=f"hold-{ctx['req'].id}",
        provider_status="not_submitted",
        created_at=_utc(),
    )
    db.add(hold)
    db.commit()
    mock_provider = MagicMock()
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "amount_exceeds_available"
    mock_provider.refund_payment.assert_not_called()


def test_provider_and_connection_from_payment_attempt(client, db):
    ctx = _create_approved(client, db, key="exec-conn")
    ctx["attempt"].connection_id = 777
    db.commit()

    mock_provider = MagicMock()
    mock_provider.refund_payment.return_value = _mock_result(
        status=NormalizedRefundStatus.SUCCEEDED,
        payment_id=ctx["attempt"].provider_payment_id,
    )
    mock_conn = MagicMock()
    with (
        patch(
            "backend.services.refund_execution.get_connection",
            return_value=mock_conn,
        ) as get_conn,
        patch(
            "backend.services.refund_execution.decrypt_connection_credentials_for_internal_use",
            return_value={"shop_id": "1", "secret_key": "x"},
        ) as decrypt,
        patch(
            "backend.services.refund_execution.get_payment_provider",
            return_value=mock_provider,
        ) as get_prov,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert get_conn.call_count == 1
    assert get_conn.call_args.args[1] == 777
    decrypt.assert_called_once()
    assert get_prov.call_args.args[0] == ctx["attempt"].provider
    assert get_prov.call_args.kwargs["credentials"] == {
        "shop_id": "1",
        "secret_key": "x",
    }


def test_yookassa_execute_uses_mocked_http_only(client, db):
    ctx = _create_approved(client, db, key="exec-yk")
    ctx["attempt"].provider = "yookassa"
    db.commit()
    mock_provider = MagicMock()
    mock_provider.refund_payment.return_value = _mock_result(
        status=NormalizedRefundStatus.SUCCEEDED,
        payment_id=ctx["attempt"].provider_payment_id,
        refund_id="yk_rf_1",
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200
    assert resp.json()["provider_refund_id"] == "yk_rf_1"
    mock_provider.refund_payment.assert_called_once()
    call_req = mock_provider.refund_payment.call_args.args[0]
    assert call_req.idempotency_key.startswith("bf-rf-")
    assert call_req.provider_payment_id == ctx["attempt"].provider_payment_id
