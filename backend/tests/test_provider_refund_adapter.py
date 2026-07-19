"""Provider refund adapter contract tests (Этап 6.14.5) — Fake + YooKassa."""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

import httpx
import pytest

from backend.payments.base import PaymentProviderError
from backend.payments.dto import (
    CreatePaymentRequest,
    CreateRefundRequest,
    NormalizedRefundStatus,
)
from backend.payments.providers.fake import FakePaymentProvider
from backend.payments.providers.yookassa import YooKassaPaymentProvider


def _fake_succeeded_payment(amount: str = "190.00") -> tuple[FakePaymentProvider, str]:
    p = FakePaymentProvider()
    created = p.create_payment(
        CreatePaymentRequest(
            amount=Decimal(amount),
            currency="RUB",
            description="test",
            idempotency_key="pay-1",
            return_url="https://example.test/return",
        )
    )
    p.mark_succeeded(created.provider_payment_id)
    return p, created.provider_payment_id


def _yookassa() -> YooKassaPaymentProvider:
    return YooKassaPaymentProvider(shop_id="123456", secret_key="test_secret_key_value")


def _mock_response(status_code: int, payload: dict | None):
    class Resp:
        def __init__(self) -> None:
            self.status_code = status_code
            self.content = b"ok" if payload is not None else b""

        def json(self):
            return payload if payload is not None else {}

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    return mock_client


# --- Fake ---


def test_fake_refund_succeeded():
    p, pid = _fake_succeeded_payment()
    result = p.refund_payment(
        CreateRefundRequest(
            provider_payment_id=pid,
            amount=Decimal("190.00"),
            currency="RUB",
            idempotency_key="rf-full-1",
        )
    )
    assert result.status == NormalizedRefundStatus.SUCCEEDED
    assert result.amount == Decimal("190.00")
    assert result.refund_id.startswith("fake_rf_")
    assert result.provider_payment_id == pid
    assert p.get_payment_status(pid).status.value == "refunded"


def test_fake_partial_refund():
    p, pid = _fake_succeeded_payment()
    result = p.refund_payment(
        CreateRefundRequest(
            provider_payment_id=pid,
            amount=Decimal("50.00"),
            currency="RUB",
            idempotency_key="rf-partial-1",
        )
    )
    assert result.status == NormalizedRefundStatus.SUCCEEDED
    assert result.amount == Decimal("50.00")
    assert p.get_payment_status(pid).status.value == "succeeded"


def test_fake_get_refund_status():
    p, pid = _fake_succeeded_payment()
    created = p.refund_payment(
        CreateRefundRequest(
            provider_payment_id=pid,
            amount=Decimal("10.00"),
            currency="RUB",
            idempotency_key="rf-get-1",
        )
    )
    status = p.get_refund_status(created.refund_id)
    assert status.refund_id == created.refund_id
    assert status.status == NormalizedRefundStatus.SUCCEEDED
    assert status.amount == Decimal("10.00")


def test_fake_idempotency_replay_same_key():
    p, pid = _fake_succeeded_payment()
    req = CreateRefundRequest(
        provider_payment_id=pid,
        amount=Decimal("20.00"),
        currency="RUB",
        idempotency_key="rf-replay-1",
    )
    first = p.refund_payment(req)
    second = p.refund_payment(req)
    assert first.refund_id == second.refund_id
    assert len(p._refunds) == 1


def test_fake_idempotency_conflict_different_payload():
    p, pid = _fake_succeeded_payment()
    p.refund_payment(
        CreateRefundRequest(
            provider_payment_id=pid,
            amount=Decimal("20.00"),
            currency="RUB",
            idempotency_key="rf-conflict-1",
        )
    )
    with pytest.raises(PaymentProviderError) as exc:
        p.refund_payment(
            CreateRefundRequest(
                provider_payment_id=pid,
                amount=Decimal("30.00"),
                currency="RUB",
                idempotency_key="rf-conflict-1",
            )
        )
    assert exc.value.code == "idempotency_conflict"


def test_fake_unknown_payment():
    p = FakePaymentProvider()
    with pytest.raises(PaymentProviderError) as exc:
        p.refund_payment(
            CreateRefundRequest(
                provider_payment_id="missing",
                amount=Decimal("10.00"),
                currency="RUB",
                idempotency_key="rf-missing",
            )
        )
    assert exc.value.code == "payment_not_found"


# --- YooKassa ---


def test_yookassa_refund_post_body_and_idempotence_key():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_ok_1",
            "status": "succeeded",
            "payment_id": "pay_1",
            "amount": {"value": "10.00", "currency": "RUB"},
            "created_at": "2026-07-19T12:00:00.000Z",
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        result = p.refund_payment(
            CreateRefundRequest(
                provider_payment_id="pay_1",
                amount=Decimal("10.00"),
                currency="RUB",
                idempotency_key="caller-owned-key-abc",
                description="BotForg refund",
                metadata={"refund_request_id": "42"},
            )
        )
    assert result.status == NormalizedRefundStatus.SUCCEEDED
    assert result.refund_id == "rf_ok_1"
    call_kwargs = mock_client.request.call_args
    assert call_kwargs.args[0] == "POST"
    assert call_kwargs.args[1] == "/refunds"
    body = call_kwargs.kwargs["json"]
    assert body["payment_id"] == "pay_1"
    assert body["amount"] == {"value": "10.00", "currency": "RUB"}
    assert call_kwargs.kwargs["headers"]["Idempotence-Key"] == "caller-owned-key-abc"
    # Must not invent amount-derived key
    assert "10.00" not in call_kwargs.kwargs["headers"]["Idempotence-Key"]


@pytest.mark.parametrize(
    "yk_status,expected",
    [
        ("pending", NormalizedRefundStatus.PENDING),
        ("succeeded", NormalizedRefundStatus.SUCCEEDED),
        ("canceled", NormalizedRefundStatus.CANCELED),
    ],
)
def test_yookassa_refund_status_mapping(yk_status, expected):
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_map",
            "status": yk_status,
            "payment_id": "pay_1",
            "amount": {"value": "5.00", "currency": "RUB"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        result = p.refund_payment(
            CreateRefundRequest(
                provider_payment_id="pay_1",
                amount=Decimal("5.00"),
                currency="RUB",
                idempotency_key=f"map-{yk_status}",
            )
        )
    assert result.status == expected


def test_yookassa_get_refund_status():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_get",
            "status": "pending",
            "payment_id": "pay_9",
            "amount": {"value": "7.00", "currency": "RUB"},
            "created_at": "2026-07-19T12:00:00.000Z",
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        result = p.get_refund_status("rf_get")
    assert result.refund_id == "rf_get"
    assert result.status == NormalizedRefundStatus.PENDING
    assert result.provider_payment_id == "pay_9"
    assert mock_client.request.call_args.args[0] == "GET"
    assert mock_client.request.call_args.args[1] == "/refunds/rf_get"


def test_yookassa_amount_mismatch():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_bad_amt",
            "status": "succeeded",
            "payment_id": "pay_1",
            "amount": {"value": "99.00", "currency": "RUB"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="mismatch-amt",
                )
            )
    assert exc.value.code == "invalid_provider_response"


def test_yookassa_payment_id_mismatch():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_bad_pay",
            "status": "succeeded",
            "payment_id": "other_pay",
            "amount": {"value": "10.00", "currency": "RUB"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="mismatch-pay",
                )
            )
    assert exc.value.code == "invalid_provider_response"


def test_yookassa_currency_mismatch():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_bad_cur",
            "status": "succeeded",
            "payment_id": "pay_1",
            "amount": {"value": "10.00", "currency": "USD"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="mismatch-cur",
                )
            )
    assert exc.value.code == "invalid_provider_response"


def test_yookassa_empty_refund_id():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "",
            "status": "succeeded",
            "payment_id": "pay_1",
            "amount": {"value": "10.00", "currency": "RUB"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="empty-id",
                )
            )
    assert exc.value.code == "invalid_provider_response"


def test_yookassa_unknown_status():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_unk",
            "status": "weird",
            "payment_id": "pay_1",
            "amount": {"value": "10.00", "currency": "RUB"},
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="unk-status",
                )
            )
    assert exc.value.code == "invalid_provider_response"


def test_yookassa_timeout():
    p = _yookassa()
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.side_effect = httpx.TimeoutException("timeout")
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="timeout-1",
                )
            )
    assert exc.value.code == "provider_timeout"
    assert mock_client.request.call_count == 1


def test_yookassa_401():
    p = _yookassa()
    mock_client = _mock_response(401, {})
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="auth-fail",
                )
            )
    assert exc.value.code == "invalid_credentials"


def test_yookassa_http_error():
    p = _yookassa()
    mock_client = _mock_response(400, {"type": "error"})
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        with pytest.raises(PaymentProviderError) as exc:
            p.refund_payment(
                CreateRefundRequest(
                    provider_payment_id="pay_1",
                    amount=Decimal("10.00"),
                    currency="RUB",
                    idempotency_key="http-fail",
                )
            )
    assert exc.value.code == "provider_http_error"


def test_yookassa_sanitized_raw_no_secrets():
    p = _yookassa()
    mock_client = _mock_response(
        200,
        {
            "id": "rf_safe",
            "status": "canceled",
            "payment_id": "pay_1",
            "amount": {"value": "10.00", "currency": "RUB"},
            "created_at": "2026-07-19T12:00:00.000Z",
            "cancellation_details": {
                "party": "yoo_money",
                "reason": "insufficient_funds",
                "secret_blob": "should_not_pass",
            },
            "secret_key": "sk_live_xxx",
            "authorization": "Basic abc",
        },
    )
    with patch(
        "backend.payments.providers.yookassa.httpx.Client", return_value=mock_client
    ):
        result = p.refund_payment(
            CreateRefundRequest(
                provider_payment_id="pay_1",
                amount=Decimal("10.00"),
                currency="RUB",
                idempotency_key="safe-raw",
            )
        )
    assert result.status == NormalizedRefundStatus.CANCELED
    assert result.cancellation_details == {
        "party": "yoo_money",
        "reason": "insufficient_funds",
    }
    raw_s = str(result.raw)
    assert "sk_live" not in raw_s
    assert "Basic" not in raw_s
    assert "secret_blob" not in raw_s
    assert result.raw["id"] == "rf_safe"
    assert set(result.raw.keys()) <= {
        "id",
        "status",
        "payment_id",
        "amount",
        "created_at",
        "cancellation_details",
    }


def test_yookassa_requires_caller_idempotency_key():
    p = _yookassa()
    with pytest.raises(PaymentProviderError) as exc:
        p.refund_payment(
            CreateRefundRequest(
                provider_payment_id="pay_1",
                amount=Decimal("10.00"),
                currency="RUB",
                idempotency_key="  ",
            )
        )
    assert exc.value.code == "idempotency_key_required"
