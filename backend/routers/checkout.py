"""
Checkout intent API (Этап 6.5).

POST /me/checkout-intents — создать pending intent из публичного каталога.
GET  /me/checkout-intents/{id} — только свои intents.
Без платёжного провайдера и без выдачи entitlement.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.checkout import CheckoutProductType
from backend.models.user import User
from backend.schemas.checkout import CheckoutIntentCreateIn, CheckoutIntentOut
from backend.services.checkout_intents import (
    CheckoutIntentError,
    create_checkout_intent,
    get_user_checkout_intent,
)

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
