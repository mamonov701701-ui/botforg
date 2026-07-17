"""
FakePaymentProvider — только для автоматических тестов / явного test mode.

Недоступен в production без явного fail-closed отказа registry.
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
    NormalizedPaymentStatus,
    ParsedWebhookEvent,
    PaymentStatusResult,
    RefundPaymentResult,
)

PROVIDER_NAME = "fake"
FAKE_PROVIDER_NAME = PROVIDER_NAME


class FakePaymentProvider(PaymentProvider):
    name = PROVIDER_NAME
    is_fake = True

    def __init__(self) -> None:
        self._payments: dict[str, dict[str, Any]] = {}

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
            raw={"test": True, **{k: str(v) if k == "amount" else v for k, v in record.items() if k != "amount"}},
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

        # Простая «подпись» для тестов: sha256(body) в X-Fake-Signature
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

    def refund_payment(
        self,
        provider_payment_id: str,
        *,
        amount: Any | None = None,
        currency: str | None = None,
    ) -> RefundPaymentResult:
        record = self._payments.get(provider_payment_id)
        if not record:
            raise PaymentProviderError(
                f"Fake payment {provider_payment_id!r} not found",
                code="payment_not_found",
            )
        if record["status"] != NormalizedPaymentStatus.SUCCEEDED.value:
            # allow refund after mark succeeded in tests
            record["status"] = NormalizedPaymentStatus.SUCCEEDED.value
        record["status"] = NormalizedPaymentStatus.REFUNDED.value
        refund_amount = Decimal(str(amount)) if amount is not None else record["amount"]
        return RefundPaymentResult(
            provider=self.name,
            provider_payment_id=provider_payment_id,
            refund_id=f"fake_rf_{uuid.uuid4().hex[:12]}",
            status=NormalizedPaymentStatus.REFUNDED,
            amount=refund_amount,
            currency=currency or record["currency"],
            raw={"test": True},
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
