"""
Checkout intent API (Этап 6.5 + 8.3.1).

POST /me/checkout-intents — создать pending intent из публичного каталога.
GET  /me/checkout-intents — история покупок (paginated).
GET  /me/checkout-intents/{id} — только свои intents.
Без платёжного провайдера и без выдачи entitlement.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.checkout import CheckoutIntentStatus, CheckoutProductType
from backend.models.user import User
from backend.schemas.checkout import (
    CheckoutIntentCreateIn,
    CheckoutIntentOut,
    CheckoutPurchaseListOut,
)
from backend.services.checkout_intents import (
    CheckoutIntentError,
    create_checkout_intent,
    get_user_checkout_intent,
)
from backend.services.checkout_purchase_history import list_user_checkout_intents

router = APIRouter(tags=["checkout"])


def _intent_out(intent) -> CheckoutIntentOut:
    return CheckoutIntentOut.model_validate(intent)


def _http_from_checkout_error(exc: CheckoutIntentError) -> HTTPException:
    code = exc.code
    if code == "legal_launch_not_ready":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": exc.message},
        )
    if code in ("product_unavailable", "product_unpriced"):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": exc.message},
        )
    if code == "current_tariff_already_active":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    if code == "addon_not_available_for_current_tariff":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": exc.message},
        )
    if code in ("invalid_product_type", "code_required", "idempotency_required"):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": code, "message": exc.message},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": exc.message},
    )


@router.get("/me/checkout-intents", response_model=CheckoutPurchaseListOut)
async def list_my_checkout_intents(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    product_type: Literal["tariff", "addon"] | None = Query(None),
    status_filter: str | None = Query(
        None,
        alias="status",
        min_length=1,
        max_length=32,
        description="CheckoutIntent status",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    История собственных CheckoutIntent (все статусы, не refundable-only).

    Сортировка: created_at DESC, id DESC. Без live-запросов к провайдеру.
    """
    if status_filter is not None:
        st = status_filter.strip().lower()
        valid = {s.value for s in CheckoutIntentStatus}
        if st not in valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_status",
                    "message": f"Unknown checkout intent status: {status_filter}",
                },
            )
        status_filter = st

    data = list_user_checkout_intents(
        db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        product_type=product_type,
        status=status_filter,
    )
    return CheckoutPurchaseListOut.model_validate(data)


@router.post(
    "/me/checkout-intents",
    response_model=CheckoutIntentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_checkout_intent(
    body: CheckoutIntentCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Создать pending checkout intent.

    Клиент передаёт только product_type + code (+ idempotency_key).
    Цена, валюта и описание берутся из активного публичного каталога.
    """
    try:
        intent = create_checkout_intent(
            db,
            user_id=current_user.id,
            product_type=CheckoutProductType(body.product_type),
            code=body.code,
            idempotency_key=body.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_product_type", "message": str(exc)},
        ) from exc
    except CheckoutIntentError as exc:
        raise _http_from_checkout_error(exc) from exc

    # Идемпотентный повтор возвращает существующую запись — 200 удобнее, но
    # контракт этапа фиксирует create endpoint; статус 201 допустим и при replay.
    return _intent_out(intent)


@router.get("/me/checkout-intents/{intent_id}", response_model=CheckoutIntentOut)
async def get_my_checkout_intent(
    intent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Прочитать собственный checkout intent. Чужой → 404."""
    intent = get_user_checkout_intent(
        db, user_id=current_user.id, intent_id=intent_id
    )
    if not intent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checkout intent не найден",
        )
    return _intent_out(intent)
