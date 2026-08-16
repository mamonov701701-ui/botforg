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
from backend.services.addon_custom_pack import (
    CUSTOM_MESSAGES_CODE,
    CUSTOM_PACK_TITLE_RU,
    ensure_custom_messages_package,
    is_capacity_addon_type,
    is_custom_messages_code,
    is_reserved_addon_code,
)
from backend.services.addon_package_types import is_sellable_addon_type, enum_value
from backend.services.addon_pricing import AddonPricingError, quote_custom_messages
from backend.services.addon_validity import resolve_addon_validity_days
from backend.services.legal_documents import get_published_by_type
from backend.services.legal_launch import (
    LegalLaunchError,
    assert_production_payments_allowed,
)
from backend.services.refund_invariants import round_money
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
    if not pkg or is_reserved_addon_code(pkg.code):
        raise CheckoutIntentError(
            f"Addon code={code!r} is not available",
            code="product_unavailable",
        )
    if not is_sellable_addon_type(pkg.type):
        raise CheckoutIntentError(
            f"Addon code={code!r} is not available",
            code="product_unavailable",
        )
    return pkg


def _custom_messages_anchor(db: Session) -> AddonPackage:
    return ensure_custom_messages_package(db)


def create_checkout_intent(
    db: Session,
    *,
    user_id: int,
    product_type: CheckoutProductType | str,
    code: str,
    idempotency_key: str,
    quantity: int | None = None,
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
    price_grid_snapshot = None
    if type_val == CheckoutProductType.TARIFF:
        if quantity is not None:
            raise CheckoutIntentError(
                "Количество задаётся только для настраиваемого пакета",
                code="quantity_not_allowed",
            )
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
        if is_custom_messages_code(code_norm):
            assert_addon_purchase_allowed(db, user_id=user_id)
            if quantity is None:
                raise CheckoutIntentError(
                    "Укажите количество сообщений",
                    code="quantity_required",
                )
            try:
                quote = quote_custom_messages(db, quantity=quantity)
            except AddonPricingError as exc:
                raise CheckoutIntentError(exc.message, code=exc.code) from exc
            pkg = _custom_messages_anchor(db)
            name = (quote.product_name or pkg.name_ru or CUSTOM_PACK_TITLE_RU).strip()
            description = pkg.description_ru
            amount = quote.total
            currency = quote.currency
            product_units = quote.quantity
            snap = quote.as_snapshot()
            snap["calculated_at"] = _utcnow().isoformat()
            snap["package_code"] = code_norm
            snap["code"] = code_norm
            snap["title"] = name
            snap["user_id"] = int(user_id)
            price_grid_snapshot = snap
        else:
            if quantity is not None:
                raise CheckoutIntentError(
                    "Количество задаётся только для настраиваемого пакета",
                    code="quantity_not_allowed",
                )
            pkg = _catalog_addon(db, code_norm)
            assert_addon_purchase_allowed(db, user_id=user_id)
            name = (pkg.name_ru or pkg.code).strip()
            description = pkg.description_ru
            amount = Decimal(str(pkg.price))
            currency = (pkg.currency or "RUB").strip() or "RUB"
            product_units = int(pkg.amount or 0)
            resource_type = enum_value(pkg.type) or "messages"
            capacity = is_capacity_addon_type(resource_type)
            price_grid_snapshot = {
                "kind": "fixed_addon",
                "package_code": code_norm,
                "code": code_norm,
                "title": name,
                "product_name": name,
                "anchor_code": code_norm,
                "resource_type": resource_type,
                "quantity": product_units,
                "currency": currency,
                "total": format(round_money(amount), "f"),
                "duration_kind": (
                    "tariff_period_end" if capacity else "activation_days"
                ),
                "validity_days": (
                    None if capacity else resolve_addon_validity_days(pkg)
                ),
                "user_id": int(user_id),
                "bands": [],
                "calculated_at": _utcnow().isoformat(),
            }
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
    formula_version = DEFAULT_REFUND_FORMULA_VERSION if has_legal else None

    if isinstance(price_grid_snapshot, dict):
        price_grid_snapshot = {
            **price_grid_snapshot,
            "user_id": int(user_id),
            "offer_revision_id": offer.id if offer else None,
            "refund_policy_revision_id": refund_pol.id if refund_pol else None,
            "tariff_terms_revision_id": tariff_terms.id if tariff_terms else None,
            "refund_formula_version": formula_version,
        }

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
        refund_formula_version=formula_version,
        price_grid_snapshot=price_grid_snapshot,
        legal_snapshot_at=_utcnow() if has_legal else None,
    )
    db.add(intent)
    db.flush()
    if isinstance(intent.price_grid_snapshot, dict) and intent.id is not None:
        snap = dict(intent.price_grid_snapshot)
        if snap.get("checkout_intent_id") != int(intent.id):
            snap["checkout_intent_id"] = int(intent.id)
            intent.price_grid_snapshot = snap
            db.flush()
    if commit:
        db.commit()
        db.refresh(intent)
    return intent


def assert_custom_intent_price_current(db: Session, intent: CheckoutIntent) -> None:
    """Recompute authoritative addon price before creating a payment obligation."""
    if (intent.product_type or "") != CheckoutProductType.ADDON.value:
        return

    if is_custom_messages_code(intent.product_code):
        qty = intent.product_units
        if qty is None:
            raise CheckoutIntentError(
                "Укажите количество сообщений",
                code="quantity_required",
            )
        try:
            quote = quote_custom_messages(db, quantity=int(qty))
        except AddonPricingError as exc:
            clear_terms_confirmation(intent)
            raise CheckoutIntentError(exc.message, code=exc.code) from exc
        if round_money(quote.total) != round_money(intent.amount):
            clear_terms_confirmation(intent)
            raise CheckoutIntentError(
                "Стоимость пакета изменилась. Обновите расчёт и создайте заказ заново.",
                code="price_changed",
            )
        if (quote.currency or "RUB").strip().upper() != (
            intent.currency or "RUB"
        ).strip().upper():
            clear_terms_confirmation(intent)
            raise CheckoutIntentError(
                "Стоимость пакета изменилась. Обновите расчёт и создайте заказ заново.",
                code="price_changed",
            )
        return

    # Fixed catalog addon: re-read public package price.
    try:
        pkg = _catalog_addon(db, intent.product_code or "")
    except CheckoutIntentError:
        clear_terms_confirmation(intent)
        raise
    if round_money(pkg.price) != round_money(intent.amount) or (
        pkg.currency or "RUB"
    ).strip().upper() != (intent.currency or "RUB").strip().upper():
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Стоимость пакета изменилась. Обновите расчёт и создайте заказ заново.",
            code="price_changed",
        )
    if int(pkg.amount or 0) != int(intent.product_units or 0):
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Состав пакета изменился. Обновите расчёт и создайте заказ заново.",
            code="price_changed",
        )


def _snapshot_dict(intent: CheckoutIntent) -> dict:
    raw = intent.price_grid_snapshot
    return dict(raw) if isinstance(raw, dict) else {}


def terms_confirmation_of(intent: CheckoutIntent) -> dict | None:
    snap = _snapshot_dict(intent)
    conf = snap.get("terms_confirmation")
    return conf if isinstance(conf, dict) else None


def is_custom_terms_confirmed(intent: CheckoutIntent) -> bool:
    """Alias: true when addon purchase terms were confirmed."""
    return is_addon_terms_confirmed(intent)


def is_addon_terms_confirmed(intent: CheckoutIntent) -> bool:
    conf = terms_confirmation_of(intent)
    return bool(conf and conf.get("confirmed") is True)


def clear_terms_confirmation(intent: CheckoutIntent) -> None:
    """Invalidate prior user confirmation (e.g. after price_changed)."""
    if (intent.product_type or "") != CheckoutProductType.ADDON.value:
        return
    snap = _snapshot_dict(intent)
    if "terms_confirmation" not in snap:
        return
    snap = dict(snap)
    snap.pop("terms_confirmation", None)
    intent.price_grid_snapshot = snap


def assert_custom_intent_terms_confirmed(intent: CheckoutIntent) -> None:
    """Block payment start until user explicitly confirmed the locked addon offer."""
    if (intent.product_type or "") != CheckoutProductType.ADDON.value:
        return
    conf = terms_confirmation_of(intent)
    if not conf or conf.get("confirmed") is not True:
        raise CheckoutIntentError(
            "Подтвердите количество, стоимость и срок действия пакета перед оплатой.",
            code="terms_confirmation_required",
        )
    try:
        confirmed_total = round_money(conf.get("total"))
        confirmed_qty = int(conf.get("quantity"))
    except Exception as exc:
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Подтверждение условий недействительно. Подтвердите покупку заново.",
            code="terms_confirmation_required",
        ) from exc
    if confirmed_total != round_money(intent.amount):
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Стоимость пакета изменилась. Подтвердите новые условия.",
            code="price_changed",
        )
    if confirmed_qty != int(intent.product_units or 0):
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Количество пакета изменилось. Подтвердите новые условия.",
            code="price_changed",
        )
    conf_cur = str(conf.get("currency") or "RUB").strip().upper()
    intent_cur = str(intent.currency or "RUB").strip().upper()
    if conf_cur != intent_cur:
        clear_terms_confirmation(intent)
        raise CheckoutIntentError(
            "Стоимость пакета изменилась. Подтвердите новые условия.",
            code="price_changed",
        )


def confirm_custom_addon_terms(
    db: Session,
    *,
    user_id: int,
    intent_id: int,
    confirmed_amount: Decimal | str,
    confirmed_currency: str,
    confirmed_quantity: int,
    commit: bool = True,
) -> CheckoutIntent:
    """
    Record immutable proof that the user accepted the locked addon offer
    (fixed catalog pack or custom messages pack).
    """
    intent = get_user_checkout_intent(db, user_id=user_id, intent_id=intent_id)
    if intent is None:
        raise CheckoutIntentError("Checkout intent не найден", code="intent_not_found")
    if (intent.product_type or "") != CheckoutProductType.ADDON.value:
        raise CheckoutIntentError(
            "Подтверждение условий доступно только для дополнений",
            code="confirmation_not_applicable",
        )
    if intent.status not in (
        CheckoutIntentStatus.PENDING.value,
        CheckoutIntentStatus.AWAITING_PAYMENT.value,
    ):
        raise CheckoutIntentError(
            "Этот заказ нельзя подтвердить",
            code="intent_not_payable",
        )

    try:
        body_amount = round_money(confirmed_amount)
        body_qty = int(confirmed_quantity)
        body_cur = (confirmed_currency or "RUB").strip().upper() or "RUB"
    except Exception as exc:
        raise CheckoutIntentError(
            "Некорректные параметры подтверждения",
            code="invalid_confirmation",
        ) from exc

    if body_qty != int(intent.product_units or 0):
        raise CheckoutIntentError(
            "Подтверждённое количество не совпадает с заказом",
            code="confirmation_mismatch",
        )
    if body_amount != round_money(intent.amount) or body_cur != (
        intent.currency or "RUB"
    ).strip().upper():
        raise CheckoutIntentError(
            "Подтверждённая сумма не совпадает с заказом",
            code="confirmation_mismatch",
        )

    assert_custom_intent_price_current(db, intent)

    snap = _snapshot_dict(intent)
    if not snap:
        snap = {
            "kind": "fixed_addon" if not is_custom_messages_code(intent.product_code) else "graduated_addon",
            "quantity": int(intent.product_units or 0),
            "total": format(round_money(intent.amount), "f"),
            "currency": (intent.currency or "RUB").strip().upper() or "RUB",
        }
    now = _utcnow()
    package_code = str(
        snap.get("package_code")
        or snap.get("code")
        or snap.get("anchor_code")
        or intent.product_code
        or ""
    )
    title = str(
        snap.get("title") or snap.get("product_name") or intent.product_name or ""
    )
    snap["package_code"] = package_code
    snap["code"] = package_code
    snap["title"] = title
    snap["terms_confirmation"] = {
        "confirmed": True,
        "confirmed_at": now.isoformat(),
        "user_id": int(user_id),
        "checkout_intent_id": int(intent.id),
        "package_code": package_code,
        "code": package_code,
        "title": title,
        "product_code": package_code,
        "product_name": title,
        "resource_type": snap.get("resource_type") or "messages",
        "quantity": int(intent.product_units or 0),
        "total": format(round_money(intent.amount), "f"),
        "currency": (intent.currency or "RUB").strip().upper() or "RUB",
        "validity_days": int(snap.get("validity_days") or 30),
        "average_unit_price": snap.get("average_unit_price"),
        "bands": list(snap.get("bands") or []),
        "calculated_at": snap.get("calculated_at"),
        "pricing_grid_version_id": snap.get("pricing_grid_version_id"),
        "offer_revision_id": intent.offer_revision_id,
        "refund_policy_revision_id": intent.refund_policy_revision_id,
        "tariff_terms_revision_id": intent.tariff_terms_revision_id,
        "refund_formula_version": intent.refund_formula_version,
    }
    intent.price_grid_snapshot = snap
    intent.updated_at = now
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
