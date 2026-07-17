"""
YooKassaPaymentProvider — HTTP-адаптер ЮKassa API v3 (Этап 6.10B).

Официальный base URL только: https://api.yookassa.ru/v3
Аутентификация: HTTP Basic (shop_id:secret_key).
Webhook authenticity (официально): IP allowlist + сверка объекта платежа через API.
HMAC webhook secret в API ЮKassa нет — не используем.
"""
from __future__ import annotations

import ipaddress
import json
import logging
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse

import httpx

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
from backend.settings import settings

logger = logging.getLogger(__name__)

PROVIDER_NAME = "yookassa"
API_BASE = "https://api.yookassa.ru/v3"
DEFAULT_TIMEOUT_SEC = 15.0

# Official notification source networks (yookassa.ru/developers/using-api/webhooks)
YOOKASSA_WEBHOOK_NETWORKS = (
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("2a02:5180::/32"),
)
YOOKASSA_WEBHOOK_HOSTS = frozenset(
    {
        ipaddress.ip_address("77.75.156.11"),
        ipaddress.ip_address("77.75.156.35"),
    }
)

_STATUS_MAP = {
    "pending": NormalizedPaymentStatus.PENDING,
    "waiting_for_capture": NormalizedPaymentStatus.PENDING,
    "succeeded": NormalizedPaymentStatus.SUCCEEDED,
    "canceled": NormalizedPaymentStatus.CANCELLED,
    "cancelled": NormalizedPaymentStatus.CANCELLED,
}


def is_yookassa_webhook_ip(ip: str | None) -> bool:
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False
    if addr in YOOKASSA_WEBHOOK_HOSTS:
        return True
    return any(addr in net for net in YOOKASSA_WEBHOOK_NETWORKS)


def _timeout() -> float:
    raw = getattr(settings, "PAYMENT_PROVIDER_HTTP_TIMEOUT_SEC", None)
    try:
        value = float(raw) if raw is not None else DEFAULT_TIMEOUT_SEC
    except (TypeError, ValueError):
        value = DEFAULT_TIMEOUT_SEC
    return max(1.0, min(value, 60.0))


def _map_status(raw: str | None) -> NormalizedPaymentStatus:
    key = (raw or "").strip().lower()
    if key in _STATUS_MAP:
        return _STATUS_MAP[key]
    return NormalizedPaymentStatus.PENDING


def _amount_from_obj(obj: dict[str, Any]) -> tuple[Decimal | None, str | None]:
    amount = obj.get("amount") if isinstance(obj, dict) else None
    if not isinstance(amount, dict):
        return None, None
    value = amount.get("value")
    currency = amount.get("currency")
    try:
        dec = Decimal(str(value)) if value is not None else None
    except Exception:
        dec = None
    return dec, str(currency).upper() if currency else None


class YooKassaPaymentProvider(PaymentProvider):
    name = PROVIDER_NAME
    is_fake = False

    def __init__(
        self,
        *,
        shop_id: str,
        secret_key: str,
        api_base: str = API_BASE,
        timeout_sec: float | None = None,
    ) -> None:
        sid = (shop_id or "").strip()
        secret = (secret_key or "").strip()
        if not sid or not secret:
            raise PaymentProviderError(
                "YooKassa shop_id and secret_key are required",
                code="missing_credentials",
            )
        base = (api_base or API_BASE).rstrip("/")
        parsed = urlparse(base)
        if parsed.scheme != "https" or parsed.hostname != "api.yookassa.ru":
            raise PaymentProviderError(
                "Invalid YooKassa API base (SSRF protection)",
                code="invalid_api_base",
            )
        self._shop_id = sid
        self._secret_key = secret
        self._api_base = base
        self._timeout = timeout_sec if timeout_sec is not None else _timeout()

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self._api_base,
            auth=(self._shop_id, self._secret_key),
            timeout=self._timeout,
            headers={"Content-Type": "application/json"},
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {}
        if idempotency_key:
            headers["Idempotence-Key"] = idempotency_key[:64]
        try:
            with self._client() as client:
                response = client.request(method, path, json=json_body, headers=headers)
        except httpx.TimeoutException as exc:
            raise PaymentProviderError(
                "YooKassa request timed out",
                code="provider_timeout",
            ) from exc
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                "YooKassa network error",
                code="provider_network_error",
            ) from exc

        if response.status_code == 401:
            raise PaymentProviderError(
                "YooKassa credentials rejected",
                code="invalid_credentials",
            )
        if response.status_code >= 400:
            # Do not log Authorization or body secrets
            logger.warning(
                "YooKassa API error status=%s path=%s",
                response.status_code,
                path,
            )
            raise PaymentProviderError(
                f"YooKassa API error ({response.status_code})",
                code="provider_http_error",
            )
        if not response.content:
            return {}
        try:
            data = response.json()
        except Exception as exc:
            raise PaymentProviderError(
                "Invalid YooKassa JSON response",
                code="invalid_provider_response",
            ) from exc
        if not isinstance(data, dict):
            raise PaymentProviderError(
                "Unexpected YooKassa response shape",
                code="invalid_provider_response",
            )
        return data

    def verify_credentials(self) -> tuple[bool, str]:
        """
        Safe credential check: GET /payments?limit=1 (no charge).
        200 → ok; 401 → fail.
        """
        try:
            self._request("GET", "/payments", json_body=None)
            return True, "Учётные данные ЮKassa приняты"
        except PaymentProviderError as exc:
            if exc.code == "invalid_credentials":
                return False, "Неверный shop_id или secret_key"
            if exc.code == "provider_timeout":
                return False, "ЮKassa не ответила вовремя"
            return False, "Проверка ЮKassa не пройдена"

    def create_payment(self, request: CreatePaymentRequest) -> CreatePaymentResult:
        amount = Decimal(str(request.amount)).quantize(Decimal("0.01"))
        currency = (request.currency or "RUB").upper()
        return_url = (request.return_url or getattr(settings, "YOOKASSA_REDIRECT_URL", None) or "").strip()
        if not return_url:
            raise PaymentProviderError(
                "return_url is required for YooKassa redirect confirmation",
                code="return_url_required",
            )
        body: dict[str, Any] = {
            "amount": {"value": f"{amount:.2f}", "currency": currency},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": return_url},
            "description": (request.description or "BotForg payment")[:128],
            "metadata": dict(request.metadata or {}),
        }
        data = self._request(
            "POST",
            "/payments",
            json_body=body,
            idempotency_key=request.idempotency_key,
        )
        payment_id = str(data.get("id") or "")
        if not payment_id:
            raise PaymentProviderError(
                "YooKassa response missing payment id",
                code="invalid_provider_response",
            )
        confirmation = data.get("confirmation") if isinstance(data.get("confirmation"), dict) else {}
        confirmation_url = confirmation.get("confirmation_url")
        return CreatePaymentResult(
            provider=self.name,
            provider_payment_id=payment_id,
            status=_map_status(str(data.get("status") or "")),
            confirmation_url=str(confirmation_url) if confirmation_url else None,
            raw={"id": payment_id, "status": data.get("status")},
        )

    def get_payment_status(self, provider_payment_id: str) -> PaymentStatusResult:
        pid = (provider_payment_id or "").strip()
        if not pid:
            raise PaymentProviderError("provider_payment_id required", code="payment_id_required")
        data = self._request("GET", f"/payments/{pid}")
        amount, currency = _amount_from_obj(data)
        return PaymentStatusResult(
            provider=self.name,
            provider_payment_id=str(data.get("id") or pid),
            status=_map_status(str(data.get("status") or "")),
            amount=amount,
            currency=currency,
            raw={"id": data.get("id"), "status": data.get("status")},
        )

    def verify_and_parse_webhook(
        self,
        *,
        headers: dict[str, str],
        body: bytes,
        payload: dict[str, Any] | None = None,
    ) -> ParsedWebhookEvent:
        """
        Official authenticity (object check):
        parse notification JSON, then re-fetch payment via API and compare
        id/status/amount/currency.

        IP allowlist is enforced by the webhook router (official CIDR list).
        There is no HMAC webhook secret in YooKassa API.
        """
        _ = headers  # reserved; authenticity via API re-fetch + router IP check
        data = payload
        if data is None:
            try:
                data = json.loads(body.decode("utf-8") or "{}")
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise PaymentProviderError(
                    "Invalid YooKassa webhook JSON",
                    code="invalid_webhook_payload",
                ) from exc
        if not isinstance(data, dict):
            raise PaymentProviderError(
                "Invalid YooKassa webhook payload",
                code="invalid_webhook_payload",
            )

        event_type = str(data.get("event") or "")
        obj = data.get("object") if isinstance(data.get("object"), dict) else {}
        payment_id = str(obj.get("id") or "")
        if not payment_id:
            raise PaymentProviderError(
                "Webhook missing payment id",
                code="invalid_webhook_payload",
            )

        live = self.get_payment_status(payment_id)
        notify_amount, notify_currency = _amount_from_obj(obj)
        if live.amount is not None and notify_amount is not None and live.amount != notify_amount:
            raise PaymentProviderError(
                "Webhook amount mismatch with API payment",
                code="webhook_amount_mismatch",
            )
        if (
            live.currency
            and notify_currency
            and live.currency.upper() != notify_currency.upper()
        ):
            raise PaymentProviderError(
                "Webhook currency mismatch with API payment",
                code="webhook_currency_mismatch",
            )

        event_id = f"yookassa:{event_type}:{payment_id}:{obj.get('status') or live.status.value}"
        meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        return ParsedWebhookEvent(
            provider=self.name,
            provider_event_id=event_id,
            event_type=event_type or f"payment.{live.status.value}",
            provider_payment_id=payment_id,
            status=live.status,
            amount=live.amount if live.amount is not None else notify_amount,
            currency=live.currency or notify_currency,
            metadata={str(k): v for k, v in meta.items()},
            raw={"event": event_type, "id": payment_id, "status": live.status.value},
        )

    def cancel_payment(self, provider_payment_id: str) -> CancelPaymentResult:
        pid = (provider_payment_id or "").strip()
        data = self._request(
            "POST",
            f"/payments/{pid}/cancel",
            json_body={},
            idempotency_key=f"cancel-{pid}"[:64],
        )
        return CancelPaymentResult(
            provider=self.name,
            provider_payment_id=str(data.get("id") or pid),
            status=_map_status(str(data.get("status") or "")),
            raw={"id": data.get("id"), "status": data.get("status")},
        )

    def refund_payment(
        self,
        provider_payment_id: str,
        *,
        amount: Any | None = None,
        currency: str | None = None,
    ) -> RefundPaymentResult:
        pid = (provider_payment_id or "").strip()
        if amount is None:
            raise PaymentProviderError("refund amount required", code="refund_amount_required")
        cur = (currency or "RUB").upper()
        dec = Decimal(str(amount)).quantize(Decimal("0.01"))
        body = {
            "payment_id": pid,
            "amount": {"value": f"{dec:.2f}", "currency": cur},
        }
        data = self._request(
            "POST",
            "/refunds",
            json_body=body,
            idempotency_key=f"refund-{pid}-{dec}-{cur}"[:64],
        )
        refund_id = str(data.get("id") or "")
        ref_amount, ref_currency = _amount_from_obj(data)
        return RefundPaymentResult(
            provider=self.name,
            provider_payment_id=pid,
            refund_id=refund_id,
            status=_map_status(str(data.get("status") or NormalizedPaymentStatus.SUCCEEDED.value)),
            amount=ref_amount if ref_amount is not None else dec,
            currency=ref_currency or cur,
            raw={"id": refund_id, "status": data.get("status")},
        )

    def __repr__(self) -> str:
        return f"YooKassaPaymentProvider(shop_id={self._shop_id!r})"
