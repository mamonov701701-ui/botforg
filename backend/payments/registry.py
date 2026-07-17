"""
Registry / factory платёжных провайдеров (Этап 6.8).

Выбор провайдера живёт здесь — не в tariff / checkout / entitlement services.
Секреты не возвращаются наружу.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Iterable

from backend.payments.base import PaymentProvider, PaymentProviderError
from backend.payments.dto import ProviderPublicInfo
from backend.payments.providers.fake import FAKE_PROVIDER_NAME, FakePaymentProvider
from backend.settings import settings

# Зарезервированные имена будущих адаптеров (ещё не подключены).
KNOWN_PROVIDER_NAMES = frozenset(
    {
        FAKE_PROVIDER_NAME,
        "yookassa",
        "robokassa",
        "cloudpayments",
        "stripe",
    }
)


class PaymentProviderRegistryError(PaymentProviderError):
    pass


def _env_is_production() -> bool:
    return (getattr(settings, "ENVIRONMENT", "") or "").strip().lower() == "production"


def _test_mode_enabled() -> bool:
    if bool(getattr(settings, "TESTING", False)):
        return True
    return bool(getattr(settings, "PAYMENT_PROVIDER_TEST_MODE", False))


def _allow_fake_provider() -> bool:
    """Fake доступен только вне production и при test/dev флаге."""
    if _env_is_production():
        return False
    if _test_mode_enabled():
        return True
    return bool(getattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", False))


def parse_available_providers(raw: str | None = None) -> list[str]:
    value = raw if raw is not None else getattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "")
    text = (value or "").strip()
    if not text:
        # Дефолтный список без fake; fake добавляется динамически при allow.
        return ["yookassa"]
    names: list[str] = []
    for part in text.split(","):
        name = part.strip().lower()
        if name and name not in names:
            names.append(name)
    return names


def get_default_provider_name() -> str:
    name = (getattr(settings, "PAYMENT_PROVIDER_DEFAULT", "") or "").strip().lower()
    if not name:
        available = list_available_provider_names()
        if not available:
            raise PaymentProviderRegistryError(
                "No payment providers available",
                code="no_providers",
            )
        return available[0]
    return name


def list_available_provider_names() -> list[str]:
    names = parse_available_providers()
    if _allow_fake_provider() and FAKE_PROVIDER_NAME not in names:
        names = [FAKE_PROVIDER_NAME, *names]
    elif not _allow_fake_provider():
        names = [n for n in names if n != FAKE_PROVIDER_NAME]
    return names


def _build_provider(name: str) -> PaymentProvider:
    key = (name or "").strip().lower()
    if key == FAKE_PROVIDER_NAME:
        if not _allow_fake_provider():
            raise PaymentProviderRegistryError(
                "Fake payment provider is disabled (fail-closed)",
                code="fake_provider_forbidden",
            )
        return FakePaymentProvider()

    # Реальные адаптеры появятся на следующих этапах.
    if key in KNOWN_PROVIDER_NAMES:
        raise PaymentProviderRegistryError(
            f"Payment provider {key!r} is not implemented yet",
            code="provider_not_implemented",
        )
    raise PaymentProviderRegistryError(
        f"Unknown payment provider {key!r}",
        code="unknown_provider",
    )


@lru_cache(maxsize=16)
def _cached_provider(name: str, allow_fake: bool, test_mode: bool, env: str) -> PaymentProvider:
    # cache key includes flags so settings monkeypatches in tests can bust via clear
    return _build_provider(name)


def clear_provider_cache() -> None:
    _cached_provider.cache_clear()


def get_payment_provider(name: str | None = None) -> PaymentProvider:
    """
    Получить экземпляр провайдера по имени или default.
    Не возвращает секреты.
    """
    resolved = (name or get_default_provider_name()).strip().lower()
    available = list_available_provider_names()
    if resolved not in available and resolved != FAKE_PROVIDER_NAME:
        # unknown / not listed
        if resolved not in KNOWN_PROVIDER_NAMES and resolved != FAKE_PROVIDER_NAME:
            raise PaymentProviderRegistryError(
                f"Unknown payment provider {resolved!r}",
                code="unknown_provider",
            )
        if resolved not in available:
            raise PaymentProviderRegistryError(
                f"Payment provider {resolved!r} is not available",
                code="provider_unavailable",
            )

    if resolved == FAKE_PROVIDER_NAME and not _allow_fake_provider():
        raise PaymentProviderRegistryError(
            "Fake payment provider is disabled (fail-closed)",
            code="fake_provider_forbidden",
        )

    return _cached_provider(
        resolved,
        _allow_fake_provider(),
        _test_mode_enabled(),
        (getattr(settings, "ENVIRONMENT", "") or "").strip().lower(),
    )


def get_default_payment_provider() -> PaymentProvider:
    return get_payment_provider(None)


def list_provider_public_info() -> list[ProviderPublicInfo]:
    """Список провайдеров для диагностики/будущей админки — без секретов."""
    infos: list[ProviderPublicInfo] = []
    for name in list_available_provider_names():
        infos.append(
            ProviderPublicInfo(
                name=name,
                available=True,
                test_mode=_test_mode_enabled(),
                is_fake=(name == FAKE_PROVIDER_NAME),
            )
        )
    return infos


def mask_secret(value: str | None, *, visible: int = 4) -> str:
    """Маскирование секрета для логов/админки."""
    if not value:
        return ""
    text = str(value)
    if len(text) <= visible:
        return "*" * len(text)
    return "*" * (len(text) - visible) + text[-visible:]


def provider_config_public_view() -> dict:
    """Публичный срез конфигурации без секретов."""
    return {
        "default": get_default_provider_name() if list_available_provider_names() else None,
        "available": list_available_provider_names(),
        "test_mode": _test_mode_enabled(),
        "fake_allowed": _allow_fake_provider(),
        "environment": (getattr(settings, "ENVIRONMENT", "") or "").strip().lower(),
        # Только факт наличия секретов, не значения
        "secrets_configured": {
            "yookassa": bool(
                getattr(settings, "YOOKASSA_SHOP_ID", None)
                and getattr(settings, "YOOKASSA_SECRET_KEY", None)
            ),
            "stripe": bool(getattr(settings, "STRIPE_API_KEY", None)),
            "cloudpayments": bool(
                getattr(settings, "CLOUDPAYMENTS_PUBLIC_ID", None)
                and getattr(settings, "CLOUDPAYMENTS_SECRET_KEY", None)
            ),
        },
    }


def iter_registered_names() -> Iterable[str]:
    return tuple(list_available_provider_names())
