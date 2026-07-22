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
    tariff_summary_from_service,
)
from backend.services.addon_validity import resolve_addon_validity_days
from backend.services.tariff_limits import get_user_tariff_limits
from fastapi import APIRouter, Depends
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
    return PublicAddonOut(
        code=pkg.code,
        name_ru=pkg.name_ru,
        description_ru=pkg.description_ru,
        type=type_val,
        amount=int(pkg.amount),
        price=pkg.price,
        currency=pkg.currency or "RUB",
        duration_type=pkg.duration_type,
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
    return [_public_addon_out(p) for p in packages]


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
