import logging
from datetime import datetime, timezone

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.billing import BillingRecord, UserQuota
from backend.models.user import User as UserModel
from backend.schemas.billing import (
    BillingCreate,
    BillingListOut,
    BillingOut,
    UserQuotaOut,
    UserQuotaUpdate,
)
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=BillingListOut)
async def get_billing_records(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    """Получение списка записей биллинга пользователя"""

    billing_records = (
        db.query(BillingRecord)
        .filter(BillingRecord.user_id == current_user.id)
        .order_by(BillingRecord.created_at.desc())
        .all()
    )

    return {"total": len(billing_records), "items": billing_records}


@router.get("/summary", response_model=UserQuotaOut)
async def get_summary(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    """Получение сводки по квотам пользователя"""

    user_quota = (
        db.query(UserQuota).filter(UserQuota.user_id == current_user.id).first()
    )

    if not user_quota:
        # Создаем квоту по умолчанию, если её нет
        user_quota = UserQuota(
            user_id=current_user.id, monthly_limit=1000, used_messages=0
        )
        db.add(user_quota)
        db.commit()
        db.refresh(user_quota)

    return user_quota


@router.post("/message", response_model=BillingOut)
async def register_message_billing(
    billing_data: BillingCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Регистрация биллинга для сообщения"""

    # Создаем запись биллинга (user_id всегда из текущего пользователя)
    db_billing = BillingRecord(
        user_id=current_user.id,  # Используем ID текущего пользователя
        message_id=billing_data.message_id,
        action=billing_data.action,
        direction=billing_data.direction,
        is_paid=billing_data.is_paid,
        price=billing_data.price,
    )

    db.add(db_billing)
    db.commit()
    db.refresh(db_billing)

    logger.info(
        f"Billing record created: {billing_data.action} for user {current_user.email}"
    )
    return db_billing


@router.patch("/quota", response_model=UserQuotaOut)
async def update_user_quota(
    quota_update: UserQuotaUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление квоты пользователя"""

    user_quota = (
        db.query(UserQuota).filter(UserQuota.user_id == current_user.id).first()
    )

    if not user_quota:
        # Создаем квоту по умолчанию, если её нет
        user_quota = UserQuota(
            user_id=current_user.id, monthly_limit=1000, used_messages=0
        )
        db.add(user_quota)
        db.commit()
        db.refresh(user_quota)

    # Обновляем только указанные поля
    update_data = quota_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_quota, field, value)

    user_quota.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_quota)

    logger.info(f"User quota updated for user {current_user.email}")
    return user_quota
