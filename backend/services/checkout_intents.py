"""
Создание checkout intent из публичного каталога (Этап 6.5).

Цена/валюта/описание — только с сервера. Entitlement не создаётся.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
)
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage


class CheckoutIntentError(Exception):
    def __init__(self, message: str, *, code: str = "checkout_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


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

    if type_val == CheckoutProductType.TARIFF:
        plan = _catalog_tariff(db, code_norm)
        name = (plan.name_ru or plan.name or plan.code).strip()
        description = plan.description_ru
        amount = Decimal(str(plan.price_month))
        currency = (plan.currency or "RUB").strip() or "RUB"
    elif type_val == CheckoutProductType.ADDON:
        pkg = _catalog_addon(db, code_norm)
        name = (pkg.name_ru or pkg.code).strip()
        description = pkg.description_ru
        amount = Decimal(str(pkg.price))
        currency = (pkg.currency or "RUB").strip() or "RUB"
    else:
        raise CheckoutIntentError(
            f"Unsupported product_type={type_val!r}",
            code="invalid_product_type",
        )

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
