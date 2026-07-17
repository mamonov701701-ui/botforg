"""
Каталог типов платёжных провайдеров (Этап 6.10A).

Определения — код, не таблица БД. Адаптеры здесь не реализуются.
adapter_status=available только у реально реализованных адаптеров (сейчас: fake).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

AdapterStatus = Literal["planned", "available"]
Region = Literal["RU", "INTL", "DEV"]


@dataclass(frozen=True)
class CredentialFieldDef:
    name: str
    required: bool
    secret: bool
    label_ru: str
    help_text: str
    validation_pattern: str | None = None
    allowed_modes: tuple[str, ...] = ("test", "production")
    placeholder: str | None = None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "required": self.required,
            "secret": self.secret,
            "label_ru": self.label_ru,
            "help_text": self.help_text,
            "validation_pattern": self.validation_pattern,
            "allowed_modes": list(self.allowed_modes),
            "placeholder": self.placeholder,
        }


@dataclass(frozen=True)
class PaymentProviderDefinition:
    code: str
    display_name: str
    regions: tuple[str, ...]
    supported_currencies: tuple[str, ...]
    supported_features: tuple[str, ...]
    adapter_status: AdapterStatus
    credential_schema: tuple[CredentialFieldDef, ...]
    webhook_capabilities: tuple[str, ...]
    documentation_note: str
    is_fake: bool = False

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "display_name": self.display_name,
            "regions": list(self.regions),
            "supported_currencies": list(self.supported_currencies),
            "supported_features": list(self.supported_features),
            "adapter_status": self.adapter_status,
            "credential_schema": [f.to_public_dict() for f in self.credential_schema],
            "webhook_capabilities": list(self.webhook_capabilities),
            "documentation_note": self.documentation_note,
            "is_fake": self.is_fake,
            "can_connect": self.adapter_status == "available",
        }


def _f(
    name: str,
    *,
    secret: bool,
    label_ru: str,
    help_text: str,
    required: bool = True,
    pattern: str | None = None,
    modes: tuple[str, ...] = ("test", "production"),
    placeholder: str | None = None,
) -> CredentialFieldDef:
    return CredentialFieldDef(
        name=name,
        required=required,
        secret=secret,
        label_ru=label_ru,
        help_text=help_text,
        validation_pattern=pattern,
        allowed_modes=modes,
        placeholder=placeholder,
    )


YOOKASSA = PaymentProviderDefinition(
    code="yookassa",
    display_name="ЮKassa",
    regions=("RU",),
    supported_currencies=("RUB",),
    supported_features=("one_time_payment", "refunds", "webhooks"),
    adapter_status="available",
    credential_schema=(
        _f(
            "shop_id",
            secret=False,
            label_ru="Shop ID",
            help_text="Числовой идентификатор магазина из личного кабинета ЮKassa",
            pattern=r"^[0-9]{1,20}$",
            placeholder="123456",
        ),
        _f(
            "secret_key",
            secret=True,
            label_ru="Секретный ключ",
            help_text="Секретный ключ из личного кабинета ЮKassa (не отображается после сохранения)",
            pattern=r"^.{8,512}$",
        ),
    ),
    webhook_capabilities=(
        "payment.succeeded",
        "payment.waiting_for_capture",
        "payment.canceled",
        "refund.succeeded",
    ),
    documentation_note=(
        "Адаптер ЮKassa API v3 (Этап 6.10B). "
        "Webhook: IP allowlist + сверка объекта через API. HMAC secret в API отсутствует."
    ),
)

CLOUDPAYMENTS = PaymentProviderDefinition(
    code="cloudpayments",
    display_name="CloudPayments",
    regions=("RU",),
    supported_currencies=("RUB", "USD", "EUR"),
    supported_features=("one_time_payment", "refunds", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "public_id",
            secret=False,
            label_ru="Public ID",
            help_text="Публичный идентификатор терминала CloudPayments",
            pattern=r"^pk_[A-Za-z0-9_]+$",
        ),
        _f(
            "api_secret",
            secret=True,
            label_ru="API Secret",
            help_text="API-секрет CloudPayments (не отображается после сохранения)",
            pattern=r"^.{8,512}$",
        ),
    ),
    webhook_capabilities=("pay", "fail", "confirm", "refund"),
    documentation_note="Адаптер CloudPayments — planned. Подключение через UI пока запрещено.",
)

TBANK = PaymentProviderDefinition(
    code="tbank",
    display_name="Т-Банк (T-Bank)",
    regions=("RU",),
    supported_currencies=("RUB",),
    supported_features=("one_time_payment", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "terminal_key",
            secret=False,
            label_ru="Terminal Key",
            help_text="Ключ терминала T-Bank",
            pattern=r"^.{4,128}$",
        ),
        _f(
            "password",
            secret=True,
            label_ru="Пароль",
            help_text="Пароль терминала (не отображается после сохранения)",
            pattern=r"^.{4,512}$",
        ),
    ),
    webhook_capabilities=("AUTHORIZED", "CONFIRMED", "REJECTED", "REFUNDED"),
    documentation_note="Адаптер T-Bank — planned.",
)

ROBOKASSA = PaymentProviderDefinition(
    code="robokassa",
    display_name="Robokassa",
    regions=("RU",),
    supported_currencies=("RUB",),
    supported_features=("one_time_payment", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "merchant_login",
            secret=False,
            label_ru="Merchant Login",
            help_text="Логин магазина Robokassa",
            pattern=r"^.{2,128}$",
        ),
        _f(
            "password_1",
            secret=True,
            label_ru="Пароль #1",
            help_text="Пароль #1 для инициализации платежей",
            pattern=r"^.{4,512}$",
        ),
        _f(
            "password_2",
            secret=True,
            label_ru="Пароль #2",
            help_text="Пароль #2 для проверки ResultURL",
            pattern=r"^.{4,512}$",
        ),
    ),
    webhook_capabilities=("ResultURL", "SuccessURL", "FailURL"),
    documentation_note="Адаптер Robokassa — planned.",
)

STRIPE = PaymentProviderDefinition(
    code="stripe",
    display_name="Stripe",
    regions=("INTL",),
    supported_currencies=("USD", "EUR", "GBP"),
    supported_features=("one_time_payment", "refunds", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "publishable_key",
            secret=False,
            label_ru="Publishable key",
            help_text="Публичный ключ Stripe (pk_…)",
            pattern=r"^pk_(test|live)_[A-Za-z0-9]+$",
        ),
        _f(
            "secret_key",
            secret=True,
            label_ru="Secret key",
            help_text="Секретный ключ Stripe (sk_…) — не отображается после сохранения",
            pattern=r"^sk_(test|live)_[A-Za-z0-9]+$",
        ),
        _f(
            "webhook_signing_secret",
            secret=True,
            label_ru="Webhook signing secret",
            help_text="Секрет подписи webhook (whsec_…)",
            pattern=r"^whsec_[A-Za-z0-9]+$",
            required=False,
        ),
    ),
    webhook_capabilities=("checkout.session.completed", "payment_intent.succeeded", "charge.refunded"),
    documentation_note="Адаптер Stripe — planned.",
)

PAYPAL_BRAINTREE = PaymentProviderDefinition(
    code="paypal_braintree",
    display_name="PayPal / Braintree",
    regions=("INTL",),
    supported_currencies=("USD", "EUR", "GBP"),
    supported_features=("one_time_payment", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "merchant_id",
            secret=False,
            label_ru="Merchant ID",
            help_text="Braintree Merchant ID",
            pattern=r"^.{4,128}$",
        ),
        _f(
            "public_key",
            secret=False,
            label_ru="Public key",
            help_text="Braintree public key",
            pattern=r"^.{4,128}$",
        ),
        _f(
            "private_key",
            secret=True,
            label_ru="Private key",
            help_text="Braintree private key — не отображается после сохранения",
            pattern=r"^.{8,512}$",
        ),
        _f(
            "environment",
            secret=False,
            label_ru="Environment",
            help_text="sandbox или production",
            pattern=r"^(sandbox|production)$",
        ),
    ),
    webhook_capabilities=("transaction_settled", "dispute_opened"),
    documentation_note="Адаптер PayPal/Braintree — planned.",
)

ADYEN = PaymentProviderDefinition(
    code="adyen",
    display_name="Adyen",
    regions=("INTL",),
    supported_currencies=("USD", "EUR", "GBP"),
    supported_features=("one_time_payment", "refunds", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "merchant_account",
            secret=False,
            label_ru="Merchant account",
            help_text="Имя merchant account Adyen",
            pattern=r"^.{2,128}$",
        ),
        _f(
            "api_key",
            secret=True,
            label_ru="API key",
            help_text="API key Adyen — не отображается после сохранения",
            pattern=r"^.{16,512}$",
        ),
        _f(
            "hmac_key",
            secret=True,
            label_ru="HMAC key",
            help_text="HMAC-ключ для webhook",
            pattern=r"^[A-Fa-f0-9]{16,256}$",
            required=False,
        ),
        _f(
            "environment",
            secret=False,
            label_ru="Environment",
            help_text="test или live",
            pattern=r"^(test|live)$",
        ),
    ),
    webhook_capabilities=("AUTHORISATION", "REFUND", "CANCELLATION"),
    documentation_note="Адаптер Adyen — planned.",
)

CHECKOUT_COM = PaymentProviderDefinition(
    code="checkout_com",
    display_name="Checkout.com",
    regions=("INTL",),
    supported_currencies=("USD", "EUR", "GBP"),
    supported_features=("one_time_payment", "refunds", "webhooks"),
    adapter_status="planned",
    credential_schema=(
        _f(
            "public_key",
            secret=False,
            label_ru="Public key",
            help_text="Публичный ключ Checkout.com",
            pattern=r"^pk_(test|sbox|live)_[A-Za-z0-9]+$",
        ),
        _f(
            "secret_key",
            secret=True,
            label_ru="Secret key",
            help_text="Секретный ключ — не отображается после сохранения",
            pattern=r"^sk_(test|sbox|live)_[A-Za-z0-9]+$",
        ),
        _f(
            "webhook_signature_key",
            secret=True,
            label_ru="Webhook signature key",
            help_text="Ключ подписи webhook",
            pattern=r"^.{8,512}$",
            required=False,
        ),
        _f(
            "environment",
            secret=False,
            label_ru="Environment",
            help_text="sandbox или production",
            pattern=r"^(sandbox|production)$",
        ),
    ),
    webhook_capabilities=("payment_approved", "payment_captured", "payment_refunded"),
    documentation_note="Адаптер Checkout.com — planned.",
)

FAKE = PaymentProviderDefinition(
    code="fake",
    display_name="Fake (тесты)",
    regions=("DEV",),
    supported_currencies=("RUB", "USD"),
    supported_features=("one_time_payment",),
    adapter_status="available",
    credential_schema=(
        _f(
            "label",
            secret=False,
            label_ru="Метка",
            help_text="Произвольная метка тестового подключения",
            pattern=r"^.{1,64}$",
            required=False,
        ),
        _f(
            "test_token",
            secret=True,
            label_ru="Тестовый токен",
            help_text="Произвольный секрет для проверки шифрования (не для production)",
            pattern=r"^.{4,128}$",
        ),
    ),
    webhook_capabilities=("fake.paid", "fake.failed"),
    documentation_note=(
        "Единственный реализованный адаптер (Этап 6.8). "
        "Запрещён в production (fail-closed)."
    ),
    is_fake=True,
)

_DEFINITIONS: tuple[PaymentProviderDefinition, ...] = (
    YOOKASSA,
    CLOUDPAYMENTS,
    TBANK,
    ROBOKASSA,
    STRIPE,
    PAYPAL_BRAINTREE,
    ADYEN,
    CHECKOUT_COM,
    FAKE,
)

_BY_CODE: dict[str, PaymentProviderDefinition] = {d.code: d for d in _DEFINITIONS}


def list_provider_definitions() -> list[PaymentProviderDefinition]:
    return list(_DEFINITIONS)


def get_provider_definition(code: str) -> PaymentProviderDefinition | None:
    return _BY_CODE.get((code or "").strip().lower())


def require_provider_definition(code: str) -> PaymentProviderDefinition:
    definition = get_provider_definition(code)
    if definition is None:
        raise KeyError(f"Unknown payment provider definition: {code!r}")
    return definition


def public_identifier_field_names(definition: PaymentProviderDefinition) -> list[str]:
    """Несекретные поля, из которых собирается masked public identifier."""
    return [f.name for f in definition.credential_schema if not f.secret]


def definitions_as_dicts() -> list[dict[str, Any]]:
    return [d.to_public_dict() for d in _DEFINITIONS]
