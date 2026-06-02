"""
API сводки тарифов и лимитов для раздела «Финансы и лимиты» (Этап 5.4).
"""
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User
from backend.schemas.tariff import TariffSummaryOut, tariff_summary_from_service
from backend.services.tariff_limits import get_user_tariff_limits
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(tags=["tariff"])


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
