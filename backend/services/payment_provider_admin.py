"""
Admin service: настройки платёжных провайдеров без секретов (Этап 6.9).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.payment_provider_settings import PaymentProviderSetting
from backend.payments.providers.fake import FAKE_PROVIDER_NAME
from backend.payments.registry import (
    _allow_fake_provider,
    _env_is_production,
    clear_provider_cache,
    mask_secret,
)
from backend.schemas.payment_provider_admin import PaymentProviderOut, PaymentProviderUpdateIn
from backend.services.tariff_admin_audit import write_admin_audit_log
from backend.settings import settings

# Env keys required for "configured" — никогда не возвращаем значения секретов.
PROVIDER_ENV_REQUIREMENTS: dict[str, list[str]] = {
    "yookassa": ["YOOKASSA_SHOP_ID", "YOOKASSA_SECRET_KEY"],
    "stripe": ["STRIPE_API_KEY"],
    "cloudpayments": ["CLOUDPAYMENTS_PUBLIC_ID", "CLOUDPAYMENTS_SECRET_KEY"],
    "robokassa": ["ROBOKASSA_MERCHANT_LOGIN", "ROBOKASSA_PASSWORD1"],
    "fake": [],
}

# Публичные идентификаторы (не секреты) — можно маскировать для UI.
PROVIDER_PUBLIC_ID_ENV: dict[str, list[str]] = {
    "yookassa": ["YOOKASSA_SHOP_ID"],
    "stripe": [],
    "cloudpayments": ["CLOUDPAYMENTS_PUBLIC_ID"],
    "robokassa": ["ROBOKASSA_MERCHANT_LOGIN"],
    "fake": [],
}

IMPLEMENTED_ADAPTERS = frozenset({FAKE_PROVIDER_NAME})

ENTITY_TYPE = "payment_provider"


class PaymentProviderAdminError(Exception):
    def __init__(self, message: str, *, code: str = "provider_admin_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _env_value(name: str) -> str | None:
    val = getattr(settings, name, None)
    if val is None:
        # robokassa keys may not exist on Settings yet
        import os

        val = os.environ.get(name)
    text = (str(val) if val is not None else "").strip()
    return text or None


def _missing_required(code: str) -> list[str]:
    missing: list[str] = []
    for key in PROVIDER_ENV_REQUIREMENTS.get(code, []):
        if not _env_value(key):
            missing.append(key)
    return missing


def _masked_identifiers(code: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for key in PROVIDER_PUBLIC_ID_ENV.get(code, []):
        raw = _env_value(key)
        if raw:
            out[key] = mask_secret(raw, visible=4)
        else:
            out[key] = ""
    return out


def _adapter_implemented(code: str) -> bool:
    return code in IMPLEMENTED_ADAPTERS


def _compute_readiness(row: PaymentProviderSetting) -> tuple[bool, str, list[str]]:
    """
    Returns (configured, readiness_status, missing_required_settings).
    """
    code = row.code
    missing = _missing_required(code)
    configured = len(missing) == 0

    if code == FAKE_PROVIDER_NAME:
        if _env_is_production():
            return True, "forbidden_in_production", []
        if not _allow_fake_provider():
            return True, "fake_disabled", []
        if not row.enabled:
            return True, "disabled", []
        return True, "ready", []

    if not configured:
        return False, "missing_secrets", missing

    if not _adapter_implemented(code):
        return True, "adapter_missing", missing

    if not row.enabled:
        return True, "disabled", missing

    if row.mode == "production" and _env_is_production() and not configured:
        return False, "not_ready", missing

    return True, "ready", missing


def _can_be_default(row: PaymentProviderSetting) -> None:
    if not row.enabled:
        raise PaymentProviderAdminError(
            "Нельзя назначить default отключённый провайдер",
            code="default_disabled",
        )
    configured, readiness, missing = _compute_readiness(row)
    if row.code == FAKE_PROVIDER_NAME and _env_is_production():
        raise PaymentProviderAdminError(
            "Fake provider запрещён в production (fail-closed)",
            code="fake_provider_forbidden",
        )
    if readiness in ("forbidden_in_production", "fake_disabled"):
        raise PaymentProviderAdminError(
            f"Провайдер {row.code!r} недоступен: {readiness}",
            code="provider_not_ready",
        )
    if row.mode == "production" and not configured:
        raise PaymentProviderAdminError(
            "Production provider без обязательных env-настроек нельзя сделать default",
            code="missing_secrets",
        )
    if readiness == "missing_secrets":
        raise PaymentProviderAdminError(
            f"Не хватает настроек: {', '.join(missing)}",
            code="missing_secrets",
        )
    if readiness == "adapter_missing" and row.mode == "production":
        raise PaymentProviderAdminError(
            "Production default требует реализованный adapter",
            code="adapter_missing",
        )


def _safe_snapshot(row: PaymentProviderSetting) -> dict[str, Any]:
    configured, readiness, missing = _compute_readiness(row)
    return {
        "code": row.code,
        "display_name": row.display_name,
        "enabled": bool(row.enabled),
        "mode": row.mode,
        "currency": row.currency,
        "priority": int(row.priority),
        "is_default_for_new_payments": bool(row.is_default_for_new_payments),
        "configured": configured,
        "readiness_status": readiness,
        "missing_required_settings": missing,
        "masked_identifiers": _masked_identifiers(row.code),
        "last_health_check_status": row.last_health_check_status,
        "last_webhook_status": row.last_webhook_status,
    }


def to_out(row: PaymentProviderSetting) -> PaymentProviderOut:
    configured, readiness, missing = _compute_readiness(row)
    return PaymentProviderOut(
        code=row.code,
        display_name=row.display_name,
        enabled=bool(row.enabled),
        mode=row.mode,
        currency=row.currency,
        priority=int(row.priority),
        is_default_for_new_payments=bool(row.is_default_for_new_payments),
        configured=configured,
        readiness_status=readiness,
        missing_required_settings=missing,
        masked_identifiers=_masked_identifiers(row.code),
        adapter_implemented=_adapter_implemented(row.code),
        is_fake=(row.code == FAKE_PROVIDER_NAME),
        last_health_check_at=row.last_health_check_at,
        last_health_check_status=row.last_health_check_status,
        last_health_check_message=row.last_health_check_message,
        last_webhook_status=row.last_webhook_status,
        last_webhook_at=row.last_webhook_at,
        updated_at=row.updated_at,
    )


def ensure_provider_rows(db: Session) -> None:
    """Идемпотентно создать строки для известных кодов (если миграция seed пропущена)."""
    existing = {r.code for r in db.query(PaymentProviderSetting).all()}
    defaults = [
        ("yookassa", "ЮKassa", True, 10, True),
        ("cloudpayments", "CloudPayments", False, 20, False),
        ("stripe", "Stripe", False, 30, False),
        ("robokassa", "Robokassa", False, 40, False),
        ("fake", "Fake (тесты)", False, 100, False),
    ]
    # If no default yet and yookassa will be inserted or exists
    has_default = (
        db.query(PaymentProviderSetting)
        .filter(PaymentProviderSetting.is_default_for_new_payments.is_(True))
        .first()
        is not None
    )
    for code, name, enabled, priority, is_default in defaults:
        if code in existing:
            continue
        use_default = is_default and not has_default
        db.add(
            PaymentProviderSetting(
                code=code,
                display_name=name,
                enabled=enabled,
                mode="test",
                currency="RUB",
                priority=priority,
                is_default_for_new_payments=use_default,
            )
        )
        if use_default:
            has_default = True
    db.flush()


def list_provider_settings(db: Session) -> list[PaymentProviderOut]:
    ensure_provider_rows(db)
    rows = (
        db.query(PaymentProviderSetting)
        .order_by(
            PaymentProviderSetting.priority.asc(),
            PaymentProviderSetting.code.asc(),
        )
        .all()
    )
    return [to_out(r) for r in rows]


def get_provider_setting(db: Session, code: str) -> PaymentProviderSetting:
    ensure_provider_rows(db)
    row = (
        db.query(PaymentProviderSetting)
        .filter(PaymentProviderSetting.code == code.strip().lower())
        .first()
    )
    if not row:
        raise PaymentProviderAdminError(
            f"Провайдер {code!r} не найден",
            code="provider_not_found",
        )
    return row


def update_provider_setting(
    db: Session,
    *,
    code: str,
    patch: PaymentProviderUpdateIn,
    admin_user_id: int,
) -> PaymentProviderOut:
    row = get_provider_setting(db, code)
    before = _safe_snapshot(row)

    if patch.display_name is not None:
        row.display_name = patch.display_name.strip()
    if patch.mode is not None:
        row.mode = patch.mode
    if patch.currency is not None:
        row.currency = patch.currency.strip().upper()
    if patch.priority is not None:
        row.priority = int(patch.priority)
    if patch.enabled is not None:
        if patch.enabled and row.code == FAKE_PROVIDER_NAME and _env_is_production():
            raise PaymentProviderAdminError(
                "Fake provider нельзя включить в production",
                code="fake_provider_forbidden",
            )
        row.enabled = bool(patch.enabled)
        if not row.enabled and row.is_default_for_new_payments:
            raise PaymentProviderAdminError(
                "Сначала назначьте другой default, затем отключите провайдер",
                code="cannot_disable_default",
            )

    row.updated_at = _utcnow()
    after = _safe_snapshot(row)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="payment_provider_update",
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=before,
        new_value=after,
        comment=f"provider={row.code}",
        commit=False,
    )
    db.commit()
    db.refresh(row)
    clear_provider_cache()
    return to_out(row)


def set_default_provider(
    db: Session,
    *,
    code: str,
    admin_user_id: int,
) -> PaymentProviderOut:
    row = get_provider_setting(db, code)
    _can_be_default(row)

    before_defaults = [
        _safe_snapshot(r)
        for r in db.query(PaymentProviderSetting)
        .filter(PaymentProviderSetting.is_default_for_new_payments.is_(True))
        .all()
    ]
    before = _safe_snapshot(row)

    for other in db.query(PaymentProviderSetting).all():
        other.is_default_for_new_payments = other.id == row.id
        other.updated_at = _utcnow()

    row.is_default_for_new_payments = True
    after = _safe_snapshot(row)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="payment_provider_set_default",
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value={"previous_defaults": before_defaults, "target_before": before},
        new_value=after,
        comment=f"set_default={row.code}",
        commit=False,
    )
    db.commit()
    db.refresh(row)
    clear_provider_cache()
    return to_out(row)


def run_health_check(
    db: Session,
    *,
    code: str,
    admin_user_id: int,
) -> dict[str, Any]:
    """
    Health-check без реального платежа: env/readiness/fake rules only.
    """
    row = get_provider_setting(db, code)
    configured, readiness, missing = _compute_readiness(row)
    at = _utcnow()

    if row.code == FAKE_PROVIDER_NAME and _env_is_production():
        status = "fail"
        message = "Fake provider запрещён в production"
    elif readiness == "ready":
        status = "ok"
        message = "Конфигурация и правила готовности в порядке (без вызова эквайринга)"
    elif readiness == "adapter_missing" and configured:
        status = "degraded"
        message = "Секреты настроены, adapter ещё не реализован"
    elif readiness == "missing_secrets":
        status = "fail"
        message = f"Не хватает env: {', '.join(missing)}"
    elif readiness == "disabled":
        status = "fail"
        message = "Провайдер отключён"
    else:
        status = "fail"
        message = f"Не готов: {readiness}"

    before = _safe_snapshot(row)
    row.last_health_check_at = at
    row.last_health_check_status = status
    row.last_health_check_message = message
    row.updated_at = at
    after = _safe_snapshot(row)

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action="payment_provider_health_check",
        entity_type=ENTITY_TYPE,
        entity_id=row.id,
        old_value=before,
        new_value=after,
        comment=f"health={status}",
        commit=False,
    )
    db.commit()
    db.refresh(row)

    return {
        "code": row.code,
        "status": status,
        "message": message,
        "configured": configured,
        "readiness_status": readiness,
        "checked_at": at,
        "details": {
            "missing_required_settings": missing,
            "adapter_implemented": _adapter_implemented(row.code),
            "mode": row.mode,
            "enabled": bool(row.enabled),
        },
    }


def get_default_provider_code_from_db(db: Session) -> str | None:
    """Код default из БД, если enabled и проходит fail-closed checks."""
    ensure_provider_rows(db)
    row = (
        db.query(PaymentProviderSetting)
        .filter(PaymentProviderSetting.is_default_for_new_payments.is_(True))
        .first()
    )
    if not row:
        return None
    try:
        _can_be_default(row)
    except PaymentProviderAdminError:
        return None
    return row.code


def resolve_default_provider_code(db: Session) -> str:
    """DB default → fallback env registry."""
    from backend.payments.registry import get_default_provider_name

    code = get_default_provider_code_from_db(db)
    if code:
        return code
    return get_default_provider_name()


def assert_no_secrets_in_payload(payload: Any) -> None:
    """Тестовый/защитный хелпер: запрещённые ключи в JSON."""
    forbidden = (
        "secret",
        "password",
        "api_key",
        "apikey",
        "private_key",
        "YOOKASSA_SECRET_KEY",
        "STRIPE_API_KEY",
        "CLOUDPAYMENTS_SECRET_KEY",
        "ROBOKASSA_PASSWORD",
    )
    text = str(payload).lower()
    for token in forbidden:
        # allow key names in missing_required_settings list
        if token.lower() in ("yookassa_secret_key", "stripe_api_key", "cloudpayments_secret_key"):
            continue
        if f"sk_" in text or "secret_super" in text:
            raise AssertionError("Secret value leaked into payload")
