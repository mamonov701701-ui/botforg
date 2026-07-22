"""
Создание checkout intent из публичного каталога (Этап 6.5 + 6.14.9B-1A legal gate).

Цена/валюта/описание — только с сервера. Entitlement не создаётся.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
)
from backend.models.legal import (
    DEFAULT_REFUND_FORMULA_VERSION,
    LegalDocType,
)
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage
from backend.services.legal_documents import get_published_by_type
from backend.services.legal_launch import (
    LegalLaunchError,
    assert_production_payments_allowed,
)
from backend.services.tariff_limits import get_user_tariff_limits


class CheckoutIntentError(Exception):
    def __init__(self, message: str, *, code: str = "checkout_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _effective_plan_code(db: Session, user_id: int) -> str | None:
    """Effective tariff code from entitlement summary (not legacy users.plan_code)."""
    try:
        summary = get_user_tariff_limits(db, user_id)
    except Exception:
        return None
    code = (getattr(summary, "plan_code", None) or "").strip()
    return code or None


def assert_tariff_not_already_active(
    db: Session,
    *,
    user_id: int,
    tariff_code: str,
) -> None:
    """
    Block purchasing the same tariff the user already has as effective plan.
    Raises CheckoutIntentError(code=current_tariff_already_active).
    """
    requested = (tariff_code or "").strip()
    if not requested:
        return
    current = _effective_plan_code(db, user_id)
    if current and current == requested:
        raise CheckoutIntentError(
            "Этот тариф уже активен",
            code="current_tariff_already_active",
        )


def assert_addon_purchase_allowed(db: Session, *, user_id: int) -> None:
    """
    Block addon checkout when effective plan.limits.addon_purchase is false.
    Uses entitlement summary (not legacy users.plan_code).
    Raises CheckoutIntentError(code=addon_not_available_for_current_tariff).
    """
    try:
        summary = get_user_tariff_limits(db, user_id)
    except Exception as exc:
        raise CheckoutIntentError(
            "Не удалось проверить доступность пакетов для текущего тарифа",
            code="addon_not_available_for_current_tariff",
        ) from exc
    if not bool(getattr(summary, "addon_purchase", False)):
        raise CheckoutIntentError(
            "Дополнительные пакеты доступны начиная с тарифа «Бизнес»",
            code="addon_not_available_for_current_tariff",
        )


def _catalog_tariff(db: Session, code: str) -> Plan:
    plan = (
        db.query(Plan)
        .filter(
            Plan.code == code,
            Plan.is_active.is_(True),
            Plan.is_public.is_(True),
        )
        .first()
    )
    if not plan:
        raise CheckoutIntentError(
            f"Tariff code={code!r} is not available",
            code="product_unavailable",
        )
    if plan.price_month is None:
        raise CheckoutIntentError(
            f"Tariff code={code!r} has no public price",
            code="product_unpriced",
        )
    return plan


def _catalog_addon(db: Session, code: str) -> AddonPackage:
    pkg = (
        db.query(AddonPackage)
        .filter(
            AddonPackage.code == code,
            AddonPackage.is_active.is_(True),
            AddonPackage.is_public.is_(True),
        )
        .first()
    )
    if not pkg:
        raise CheckoutIntentError(
            f"Addon code={code!r} is not available",
            code="product_unavailable",
        )
    return pkg


def create_checkout_intent(
    db: Session,
    *,
    user_id: int,
    product_type: CheckoutProductType | str,
    code: str,
    idempotency_key: str,
    commit: bool = True,
) -> CheckoutIntent:
    """
    Создать pending CheckoutIntent или вернуть существующий по idempotency_key.
    """
    key = (idempotency_key or "").strip()
    if not key:
        raise CheckoutIntentError(
            "idempotency_key is required",
            code="idempotency_required",
        )
    code_norm = (code or "").strip()
    if not code_norm:
        raise CheckoutIntentError("code is required", code="code_required")

    existing = (
        db.query(CheckoutIntent)
        .filter(
            CheckoutIntent.user_id == user_id,
            CheckoutIntent.idempotency_key == key,
        )
        .first()
    )
    if existing:
        return existing

    type_val = (
        product_type
        if isinstance(product_type, CheckoutProductType)
        else CheckoutProductType(str(product_type))
    )

    try:
        assert_production_payments_allowed(db)
    except LegalLaunchError as exc:
        raise CheckoutIntentError(exc.message, code=exc.code) from exc

    product_units: int | None = None
    if type_val == CheckoutProductType.TARIFF:
        plan = _catalog_tariff(db, code_norm)
        assert_tariff_not_already_active(db, user_id=user_id, tariff_code=code_norm)
        name = (plan.name_ru or plan.name or plan.code).strip()
        description = plan.description_ru
        amount = Decimal(str(plan.price_month))
        currency = (plan.currency or "RUB").strip() or "RUB"
        # Monthly messages from plan limits when available.
        limits = plan.limits if isinstance(plan.limits, dict) else {}
        if limits.get("monthly_messages") is not None:
            try:
                product_units = int(limits["monthly_messages"])
            except (TypeError, ValueError):
                product_units = None
    elif type_val == CheckoutProductType.ADDON:
        pkg = _catalog_addon(db, code_norm)
        assert_addon_purchase_allowed(db, user_id=user_id)
        name = (pkg.name_ru or pkg.code).strip()
        description = pkg.description_ru
        amount = Decimal(str(pkg.price))
        currency = (pkg.currency or "RUB").strip() or "RUB"
        product_units = int(pkg.amount or 0)
    else:
        raise CheckoutIntentError(
            f"Unsupported product_type={type_val!r}",
            code="invalid_product_type",
        )

    offer = get_published_by_type(db, LegalDocType.PUBLIC_OFFER.value)
    refund_pol = get_published_by_type(db, LegalDocType.REFUND_POLICY.value)
    tariff_terms = get_published_by_type(db, LegalDocType.TARIFF_TERMS.value)
    # Snapshot only when published revisions exist — never invent / backfill.
    has_legal = offer is not None or refund_pol is not None or tariff_terms is not None

    intent = CheckoutIntent(
        user_id=user_id,
        product_type=type_val.value,
        product_code=code_norm,
        product_name=name,
        description=description,
        amount=amount,
        currency=currency,
        status=CheckoutIntentStatus.PENDING.value,
        idempotency_key=key,
        product_units=product_units,
        offer_revision_id=offer.id if offer else None,
        refund_policy_revision_id=refund_pol.id if refund_pol else None,
        tariff_terms_revision_id=tariff_terms.id if tariff_terms else None,
        purchase_consent_event_ids=None,
        refund_formula_version=(
            DEFAULT_REFUND_FORMULA_VERSION if has_legal else None
        ),
        price_grid_snapshot=None,
        legal_snapshot_at=_utcnow() if has_legal else None,
    )
    db.add(intent)
    if commit:
        db.commit()
        db.refresh(intent)
    else:
        db.flush()
    return intent


def get_user_checkout_intent(
    db: Session,
    *,
    user_id: int,
    intent_id: int,
) -> CheckoutIntent | None:
    return (
        db.query(CheckoutIntent)
        .filter(
            CheckoutIntent.id == intent_id,
            CheckoutIntent.user_id == user_id,
        )
        .first()
    )
