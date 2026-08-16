"""
Checkout intent API (Этап 6.5 + 8.3.1).

POST /me/checkout-intents — создать pending intent из публичного каталога.
GET  /me/checkout-intents — история покупок (paginated).
GET  /me/checkout-intents/{id} — только свои intents.
Без платёжного провайдера и без выдачи entitlement.
"""
from __future__ import annotations

from datetime import datetime
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
    ConfirmAddonTermsIn,
)
from backend.services.checkout_intents import (
    CheckoutIntentError,
    confirm_custom_addon_terms,
    create_checkout_intent,
    get_user_checkout_intent,
    is_custom_terms_confirmed,
    terms_confirmation_of,
)
from backend.services.checkout_purchase_history import list_user_checkout_intents

router = APIRouter(tags=["checkout"])


def _intent_out(intent) -> CheckoutIntentOut:
    conf = terms_confirmation_of(intent)
    confirmed_at = None
    if conf and conf.get("confirmed_at"):
        raw = conf.get("confirmed_at")
        if isinstance(raw, datetime):
            confirmed_at = raw
        elif isinstance(raw, str):
            try:
                confirmed_at = datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(
                    tzinfo=None
                )
            except ValueError:
                confirmed_at = None
    data = CheckoutIntentOut.model_validate(intent)
    return data.model_copy(
        update={
            "product_units": intent.product_units,
            "price_grid_snapshot": intent.price_grid_snapshot
            if isinstance(intent.price_grid_snapshot, dict)
            else None,
            "terms_confirmed": is_custom_terms_confirmed(intent),
            "terms_confirmed_at": confirmed_at,
        }
    )


def _http_from_checkout_error(exc: CheckoutIntentError) -> HTTPException:
    code = exc.code
    if code == "legal_launch_not_ready":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": exc.message},
        )
    if code in ("product_unavailable", "product_unpriced", "intent_not_found"):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "current_tariff_already_active",
        "price_changed",
        "intent_not_payable",
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    if code == "addon_not_available_for_current_tariff":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "invalid_product_type",
        "code_required",
        "idempotency_required",
        "quantity_required",
        "quantity_not_allowed",
        "invalid_quantity",
        "terms_confirmation_required",
        "confirmation_mismatch",
        "confirmation_not_applicable",
        "invalid_confirmation",
    ):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "pricing_unavailable",
        "pricing_incomplete",
        "pricing_gap",
        "pricing_overlap",
        "custom_pack_not_available",
    ):
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
            quantity=body.quantity,
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


@router.post(
    "/me/checkout-intents/{intent_id}/confirm-addon-terms",
    response_model=CheckoutIntentOut,
)
async def confirm_my_addon_terms(
    intent_id: int,
    body: ConfirmAddonTermsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Explicit user confirmation of locked custom-pack quote before payment.
    Stores immutable proof inside CheckoutIntent.price_grid_snapshot.
    """
    try:
        intent = confirm_custom_addon_terms(
            db,
            user_id=int(current_user.id),
            intent_id=intent_id,
            confirmed_amount=body.confirmed_amount,
            confirmed_currency=body.confirmed_currency,
            confirmed_quantity=body.confirmed_quantity,
        )
    except CheckoutIntentError as exc:
        raise _http_from_checkout_error(exc) from exc
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
