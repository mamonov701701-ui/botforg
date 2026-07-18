"""
Админ API журнала платёжных операций (Этап 6.11.3).

Доступ: require_tariff_admin (owner / admin / BF Администратор).
Секреты и raw provider payload не возвращаются.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User
from backend.schemas.payment_operations_admin import (
    PaymentOperationDetailOut,
    PaymentOperationListOut,
)
from backend.services.payment_operations_admin import (
    PaymentOperationsAdminError,
    get_payment_operation_detail,
    list_payment_operations,
)

router = APIRouter(
    prefix="/api/admin/payments",
    tags=["Payment Operations Admin"],
)


@router.get("/operations", response_model=PaymentOperationListOut)
async def admin_list_payment_operations(
    user_id: int | None = Query(None, ge=1),
    status_filter: str | None = Query(
        None,
        alias="status",
        min_length=1,
        max_length=64,
        description="CheckoutIntent status",
    ),
    provider: str | None = Query(None, min_length=1, max_length=64),
    checkout_intent_id: int | None = Query(None, ge=1),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    data = list_payment_operations(
        db,
        user_id=user_id,
        status=status_filter,
        provider=provider,
        checkout_intent_id=checkout_intent_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return PaymentOperationListOut.model_validate(data)


@router.get(
    "/operations/{checkout_intent_id}",
    response_model=PaymentOperationDetailOut,
)
async def admin_get_payment_operation(
    checkout_intent_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    try:
        data = get_payment_operation_detail(
            db, checkout_intent_id=checkout_intent_id
        )
    except PaymentOperationsAdminError as exc:
        if exc.code == "intent_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return PaymentOperationDetailOut.model_validate(data)
