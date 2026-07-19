"""
FakePaymentProvider — только для автоматических тестов / явного test mode.

Недоступен в production без явного fail-closed отказа registry.
Refund contract: Этап 6.14.5 (parity with YooKassa statuses).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from backend.payments.base import PaymentProvider, PaymentProviderError
from backend.payments.dto import (
    CancelPaymentResult,
    CreatePaymentRequest,
    CreatePaymentResult,
    CreateRefundRequest,
    NormalizedPaymentStatus,
    NormalizedRefundStatus,
    ParsedWebhookEvent,
    PaymentStatusResult,
    RefundPaymentResult,
    RefundStatusResult,
)

PROVIDER_NAME = "fake"
FAKE_PROVIDER_NAME = PROVIDER_NAME


def _money(amount: Decimal | Any) -> Decimal:
    return Decimal(str(amount)).quantize(Decimal("0.01"))


def _refund_fingerprint(request: CreateRefundRequest) -> str:
    payload = {
        "provider_payment_id": (request.provider_payment_id or "").strip(),
        "amount": f"{_money(request.amount):.2f}",
        "currency": (request.currency or "RUB").upper(),
        "description": (request.description or "").strip(),
        "metadata": dict(request.metadata or {}),
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


class FakePaymentProvider(PaymentProvider):
    name = PROVIDER_NAME
    is_fake = True

    def __init__(self) -> None:
        self._payments: dict[str, dict[str, Any]] = {}
        self._refunds: dict[str, dict[str, Any]] = {}
        # idempotency_key -> refund_id
        self._refund_idempotency: dict[str, str] = {}

    def create_payment(self, request: CreatePaymentRequest) -> CreatePaymentResult:
        payment_id = f"fake_{uuid.uuid4().hex[:16]}"
        record = {
            "id": payment_id,
            "amount": Decimal(str(request.amount)),
            "currency": (request.currency or "RUB").upper(),
            "status": NormalizedPaymentStatus.PENDING.value,
            "description": request.description,
            "metadata": dict(request.metadata or {}),
            "idempotency_key": request.idempotency_key,
        }
        self._payments[payment_id] = record
        return CreatePaymentResult(
            provider=self.name,
            provider_payment_id=payment_id,
            status=NormalizedPaymentStatus.PENDING,
            confirmation_url=f"https://payments.test/fake/confirm/{payment_id}",
            raw={"test": True, "id": payment_id},
        )

    def get_payment_status(self, provider_payment_id: str) -> PaymentStatusResult:
        record = self._payments.get(provider_payment_id)
        if not record:
            raise PaymentProviderError(
                f"Fake payment {provider_payment_id!r} not found",
                code="payment_not_found",
            )
        return PaymentStatusResult(
            provider=self.name,
            provider_payment_id=provider_payment_id,
            status=NormalizedPaymentStatus(record["status"]),
            amount=record["amount"],
            currency=record["currency"],
            raw={
                "test": True,
                **{
                    k: str(v) if k == "amount" else v
                    for k, v in record.items()
                    if k != "amount"
                },
            },
        )

    def verify_and_parse_webhook(
        self,
        *,
        headers: dict[str, str],
        body: bytes,
        payload: dict[str, Any] | None = None,
    ) -> ParsedWebhookEvent:
        data = payload
        if data is None:
            try:
                data = json.loads(body.decode("utf-8") or "{}")
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise PaymentProviderError(
                    "Invalid fake webhook JSON",
                    code="invalid_webhook_payload",
                ) from exc

        expected = hashlib.sha256(body or b"").hexdigest()
        got = (headers or {}).get("X-Fake-Signature") or (headers or {}).get(
            "x-fake-signature"
        )
        if got != expected:
            raise PaymentProviderError(
                "Invalid fake webhook signature",
                code="invalid_webhook_signature",
            )

        payment_id = str(data.get("provider_payment_id") or data.get("id") or "")
        if not payment_id:
            raise PaymentProviderError(
                "Fake webhook missing provider_payment_id",
                code="invalid_webhook_payload",
            )
        status_raw = str(data.get("status") or NormalizedPaymentStatus.SUCCEEDED.value)
        try:
            status = NormalizedPaymentStatus(status_raw)
        except ValueError as exc:
            raise PaymentProviderError(
                f"Unknown status {status_raw!r}",
                code="invalid_status",
            ) from exc

        event_id = str(data.get("event_id") or f"fake_evt_{uuid.uuid4().hex[:12]}")
        amount = data.get("amount")
        return ParsedWebhookEvent(
            provider=self.name,
            provider_event_id=event_id,
            event_type=str(data.get("event_type") or f"payment.{status.value}"),
            provider_payment_id=payment_id,
            status=status,
            amount=Decimal(str(amount)) if amount is not None else None,
            currency=(data.get("currency") or "RUB"),
            occurred_at=datetime.now(timezone.utc),
            metadata=dict(data.get("metadata") or {}),
            raw=dict(data),
        )

    def cancel_payment(self, provider_payment_id: str) -> CancelPaymentResult:
        record = self._payments.get(provider_payment_id)
        if not record:
            raise PaymentProviderError(
                f"Fake payment {provider_payment_id!r} not found",
                code="payment_not_found",
            )
        record["status"] = NormalizedPaymentStatus.CANCELLED.value
        return CancelPaymentResult(
            provider=self.name,
            provider_payment_id=provider_payment_id,
            status=NormalizedPaymentStatus.CANCELLED,
            raw={"test": True},
        )

    def refund_payment(self, request: CreateRefundRequest) -> RefundPaymentResult:
        key = (request.idempotency_key or "").strip()
        if not key:
            raise PaymentProviderError(
                "idempotency_key required",
                code="idempotency_key_required",
            )
        pid = (request.provider_payment_id or "").strip()
        record = self._payments.get(pid)
        if not record:
            raise PaymentProviderError(
                f"Fake payment {pid!r} not found",
                code="payment_not_found",
            )

        amount = _money(request.amount)
        currency = (request.currency or "RUB").upper()
        fingerprint = _refund_fingerprint(request)

        existing_id = self._refund_idempotency.get(key)
        if existing_id:
            existing = self._refunds[existing_id]
            if existing["fingerprint"] != fingerprint:
                raise PaymentProviderError(
                    "Idempotency key reused with different refund payload",
                    code="idempotency_conflict",
                )
            return self._to_refund_result(existing)

        if record["status"] != NormalizedPaymentStatus.SUCCEEDED.value:
            # allow refund after mark_succeeded in tests
            record["status"] = NormalizedPaymentStatus.SUCCEEDED.value

        paid = _money(record["amount"])
        if amount <= 0 or amount > paid:
            raise PaymentProviderError(
                "Invalid refund amount",
                code="invalid_refund_amount",
            )

        refund_id = f"fake_rf_{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc)
        refund_rec = {
            "id": refund_id,
            "payment_id": pid,
            "amount": amount,
            "currency": currency,
            "status": NormalizedRefundStatus.SUCCEEDED.value,
            "created_at": created_at,
            "description": (request.description or "").strip() or None,
            "metadata": dict(request.metadata or {}),
            "fingerprint": fingerprint,
            "idempotency_key": key,
            "cancellation_details": None,
        }
        self._refunds[refund_id] = refund_rec
        self._refund_idempotency[key] = refund_id

        if amount == paid:
            record["status"] = NormalizedPaymentStatus.REFUNDED.value

        return self._to_refund_result(refund_rec)

    def get_refund_status(self, refund_id: str) -> RefundStatusResult:
        rid = (refund_id or "").strip()
        refund = self._refunds.get(rid)
        if not refund:
            raise PaymentProviderError(
                f"Fake refund {rid!r} not found",
                code="refund_not_found",
            )
        result = self._to_refund_result(refund)
        return RefundStatusResult(
            provider=result.provider,
            refund_id=result.refund_id,
            provider_payment_id=result.provider_payment_id,
            status=result.status,
            amount=result.amount,
            currency=result.currency,
            created_at=result.created_at,
            cancellation_details=result.cancellation_details,
            raw=result.raw,
        )

    def _to_refund_result(self, refund: dict[str, Any]) -> RefundPaymentResult:
        status = NormalizedRefundStatus(str(refund["status"]))
        raw = {
            "id": refund["id"],
            "status": status.value,
            "payment_id": refund["payment_id"],
            "amount": {
                "value": f"{_money(refund['amount']):.2f}",
                "currency": refund["currency"],
            },
            "created_at": refund["created_at"].isoformat().replace("+00:00", "Z")
            if isinstance(refund.get("created_at"), datetime)
            else None,
            "test": True,
        }
        return RefundPaymentResult(
            provider=self.name,
            provider_payment_id=str(refund["payment_id"]),
            refund_id=str(refund["id"]),
            status=status,
            amount=_money(refund["amount"]),
            currency=str(refund["currency"]),
            created_at=refund.get("created_at"),
            cancellation_details=refund.get("cancellation_details"),
            raw=raw,
        )

    def mark_succeeded(self, provider_payment_id: str) -> None:
        """Тестовый helper: перевести платёж в succeeded."""
        record = self._payments.get(provider_payment_id)
        if not record:
            raise PaymentProviderError(
                f"Fake payment {provider_payment_id!r} not found",
                code="payment_not_found",
            )
        record["status"] = NormalizedPaymentStatus.SUCCEEDED.value
