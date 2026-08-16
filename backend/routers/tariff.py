"""
API тарифов: сводка пользователя (5.4) и публичный каталог (6.1).
"""
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage
from backend.models.user import User
from backend.schemas.tariff import (
    PublicAddonOut,
    PublicTariffOut,
    TariffSummaryOut,
    CustomAddonQuoteIn,
    CustomAddonQuoteOut,
    CustomMessagesConfigOut,
    tariff_summary_from_service,
)
from backend.services.addon_custom_pack import (
    MAX_CUSTOM_QUANTITY,
    MIN_CUSTOM_QUANTITY,
    custom_messages_validity_days,
    ensure_custom_messages_package,
    is_capacity_addon_type,
    is_reserved_addon_code,
)
from backend.services.addon_package_types import is_sellable_addon_type
from backend.services.addon_pricing import (
    AddonPricingError,
    assert_custom_pack_sellable,
    normalize_pricing_resource_type,
    quote_custom_messages,
)
from backend.services.addon_validity import resolve_addon_validity_days
from backend.services.checkout_intents import CheckoutIntentError, assert_addon_purchase_allowed
from backend.services.tariff_limits import get_user_tariff_limits
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(tags=["tariff"])


def _public_tariff_out(plan: Plan) -> PublicTariffOut:
    name = (plan.name_ru or plan.name or plan.code or "").strip() or plan.code
    return PublicTariffOut(
        code=plan.code,
        name=name,
        description_ru=plan.description_ru,
        price_month=plan.price_month,
        currency=(plan.currency or "RUB"),
        is_recommended=bool(plan.is_recommended),
        sort_order=int(plan.sort_order or 0),
        limits=dict(plan.limits or {}),
    )


def _public_addon_out(pkg: AddonPackage) -> PublicAddonOut:
    type_val = pkg.type.value if hasattr(pkg.type, "value") else str(pkg.type)
    duration_type = pkg.duration_type
    if is_capacity_addon_type(type_val):
        duration_type = "current_billing_period"
    return PublicAddonOut(
        code=pkg.code,
        name_ru=pkg.name_ru,
        description_ru=pkg.description_ru,
        type=type_val,
        amount=int(pkg.amount),
        price=pkg.price,
        currency=pkg.currency or "RUB",
        duration_type=duration_type,
        validity_days=resolve_addon_validity_days(pkg),
        available_from_plan=pkg.available_from_plan,
        max_per_period=pkg.max_per_period,
        sort_order=int(pkg.sort_order or 0),
    )


@router.get("/tariffs", response_model=list[PublicTariffOut])
async def list_public_tariffs(db: Session = Depends(get_db)):
    """
    Публичный каталог тарифов (read-only).

    Только is_active и is_public; сортировка по sort_order, затем code.
    Авторизация не требуется.
    """
    plans = (
        db.query(Plan)
        .filter(Plan.is_active.is_(True), Plan.is_public.is_(True))
        .order_by(Plan.sort_order.asc(), Plan.code.asc())
        .all()
    )
    return [_public_tariff_out(p) for p in plans]


@router.get("/addons", response_model=list[PublicAddonOut])
async def list_public_addons(db: Session = Depends(get_db)):
    """
    Публичный каталог пакетов расширения (read-only).

    Только is_active и is_public; сортировка по sort_order, затем code.
    Авторизация не требуется.
    """
    packages = (
        db.query(AddonPackage)
        .filter(AddonPackage.is_active.is_(True), AddonPackage.is_public.is_(True))
        .order_by(AddonPackage.sort_order.asc(), AddonPackage.code.asc())
        .all()
    )
    return [
        _public_addon_out(p)
        for p in packages
        if is_sellable_addon_type(p.type) and not is_reserved_addon_code(p.code)
    ]


def _quote_http(exc: AddonPricingError | CheckoutIntentError) -> HTTPException:
    code = exc.code
    if code == "addon_not_available_for_current_tariff":
        status_code = status.HTTP_403_FORBIDDEN
    elif code in ("product_unavailable", "pricing_unavailable"):
        status_code = status.HTTP_404_NOT_FOUND
    elif code == "custom_pack_not_available":
        status_code = status.HTTP_404_NOT_FOUND
    else:
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": exc.message},
    )


@router.post("/me/addons/custom-quote", response_model=CustomAddonQuoteOut)
async def quote_custom_addon(
    body: CustomAddonQuoteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authoritative graduated quote. Client sends quantity only."""
    try:
        resource_type = normalize_pricing_resource_type(body.resource_type)
        assert_custom_pack_sellable(resource_type)
        assert_addon_purchase_allowed(db, user_id=int(current_user.id))
        quote = quote_custom_messages(db, quantity=body.quantity)
    except AddonPricingError as exc:
        raise _quote_http(exc) from exc
    except CheckoutIntentError as exc:
        raise _quote_http(exc) from exc
    return CustomAddonQuoteOut(
        resource_type=quote.resource_type,
        quantity=quote.quantity,
        currency=quote.currency,
        total=quote.total,
        average_unit_price=quote.average_unit_price,
        validity_days=quote.validity_days,
        checkout_code=quote.checkout_code,
        product_name=quote.product_name,
        min_quantity=MIN_CUSTOM_QUANTITY,
        max_quantity=MAX_CUSTOM_QUANTITY,
        bands=[
            {
                "tier_id": band.tier_id,
                "range_start": band.range_start,
                "range_end": band.range_end,
                "units": band.units,
                "unit_price": band.unit_price,
                "subtotal": band.subtotal,
            }
            for band in quote.bands
        ],
    )


@router.get("/me/addons/custom-messages-config", response_model=CustomMessagesConfigOut)
async def custom_messages_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backend-authoritative min/max and sales availability for custom messages UX."""
    from backend.models.tariff import AddonPackageType, AddonPricingGridVersion, AddonPricingGridVersionStatus

    pkg = ensure_custom_messages_package(db)
    active = (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.resource_type == AddonPackageType.MESSAGES.value,
            AddonPricingGridVersion.status == AddonPricingGridVersionStatus.ACTIVE.value,
        )
        .first()
    )
    _ = current_user  # auth required; plan gate is separate on quote/checkout
    currency = "RUB"
    if active is not None and active.currency:
        currency = str(active.currency).strip().upper() or "RUB"
    elif pkg.currency:
        currency = str(pkg.currency).strip().upper() or "RUB"
    return CustomMessagesConfigOut(
        min_quantity=MIN_CUSTOM_QUANTITY,
        max_quantity=MAX_CUSTOM_QUANTITY,
        validity_days=custom_messages_validity_days(pkg),
        sales_enabled=active is not None,
        currency=currency,
    )


@router.get("/me/tariff/summary", response_model=TariffSummaryOut)
async def get_my_tariff_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Сводка по текущему тарифу, лимитам, использованию, пакетам и предупреждениям.

    Только чтение: не списывает сообщения и не изменяет UsageCounter.
    """
    summary = get_user_tariff_limits(db, current_user.id)
    return tariff_summary_from_service(summary)
