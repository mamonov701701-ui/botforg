"""
Admin API настроек платёжных провайдеров (Этап 6.9).

Секреты не принимаются и не возвращаются.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User
from backend.schemas.payment_provider_admin import (
    PaymentProviderHealthOut,
    PaymentProviderOut,
    PaymentProviderUpdateIn,
)
from backend.services.payment_provider_admin import (
    PaymentProviderAdminError,
    get_provider_setting,
    list_provider_settings,
    run_health_check,
    set_default_provider,
    to_out,
    update_provider_setting,
)

router = APIRouter(
    prefix="/api/admin/payment-providers",
    tags=["Payment Provider Admin"],
)


def _http(exc: PaymentProviderAdminError) -> HTTPException:
    code = exc.code
    if code == "provider_not_found":
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    if code in (
        "fake_provider_forbidden",
        "default_disabled",
        "provider_not_ready",
        "missing_secrets",
        "adapter_missing",
        "cannot_disable_default",
    ):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            "code": code,
            "message": exc.message,
        })
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": exc.message},
    )


@router.get("", response_model=list[PaymentProviderOut])
async def admin_list_payment_providers(
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    return list_provider_settings(db)


@router.get("/{code}", response_model=PaymentProviderOut)
async def admin_get_payment_provider(
    code: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    try:
        row = get_provider_setting(db, code)
    except PaymentProviderAdminError as exc:
        raise _http(exc) from exc
    return to_out(row)


@router.patch("/{code}", response_model=PaymentProviderOut)
async def admin_update_payment_provider(
    code: str,
    body: PaymentProviderUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    # Reject any attempt to pass secrets via extra fields (Pydantic ignores extras by default)
    try:
        return update_provider_setting(
            db, code=code, patch=body, admin_user_id=admin.id
        )
    except PaymentProviderAdminError as exc:
        raise _http(exc) from exc


@router.post("/{code}/set-default", response_model=PaymentProviderOut)
async def admin_set_default_payment_provider(
    code: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        return set_default_provider(db, code=code, admin_user_id=admin.id)
    except PaymentProviderAdminError as exc:
        raise _http(exc) from exc


@router.post("/{code}/health-check", response_model=PaymentProviderHealthOut)
async def admin_health_check_payment_provider(
    code: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        result = run_health_check(db, code=code, admin_user_id=admin.id)
    except PaymentProviderAdminError as exc:
        raise _http(exc) from exc
    return PaymentProviderHealthOut(**result)
