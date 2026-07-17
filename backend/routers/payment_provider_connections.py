"""
Admin API: PaymentProviderDefinition + PaymentProviderConnection (Этап 6.10A).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.payment_credentials_admin import (
    require_payment_connection_viewer,
    require_payment_credentials_manager,
)
from backend.models.user import User
from backend.payments.definitions.catalog import definitions_as_dicts
from backend.schemas.payment_provider_connection import (
    ConnectionCreateIn,
    ConnectionCredentialsIn,
    ConnectionOut,
    ConnectionUpdateIn,
    ConnectionVerifyOut,
)
from backend.services.payment_provider_connections import (
    ConnectionServiceError,
    connection_to_out,
    create_connection,
    delete_connection,
    get_connection,
    list_connections,
    replace_credentials,
    set_default_connection,
    update_connection,
    verify_connection,
)

router = APIRouter(tags=["Payment Provider Connections"])


def _raise(err: ConnectionServiceError) -> None:
    detail: dict = {"message": str(err), "code": err.code}
    if getattr(err, "field", None):
        detail["field"] = err.field
    raise HTTPException(
        status_code=err.http_status,
        detail=detail,
    )


@router.get("/api/admin/payment-provider-definitions")
async def admin_list_definitions(
    _admin: User = Depends(require_payment_connection_viewer),
):
    return definitions_as_dicts()


@router.get(
    "/api/admin/payment-provider-connections",
    response_model=list[ConnectionOut],
)
async def admin_list_connections(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_payment_connection_viewer),
):
    rows = list_connections(db)
    return [ConnectionOut.model_validate(connection_to_out(r)) for r in rows]


@router.get(
    "/api/admin/payment-provider-connections/{connection_id}",
    response_model=ConnectionOut,
)
async def admin_get_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_payment_connection_viewer),
):
    try:
        row = get_connection(db, connection_id)
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionOut.model_validate(connection_to_out(row))


@router.post(
    "/api/admin/payment-provider-connections",
    response_model=ConnectionOut,
    status_code=201,
)
async def admin_create_connection(
    body: ConnectionCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_credentials_manager),
):
    try:
        row = create_connection(
            db,
            admin_user_id=admin.id,
            provider_code=body.provider_code,
            connection_name=body.connection_name,
            mode=body.mode,
            currency=body.currency,
            priority=body.priority,
            enabled=body.enabled,
            credentials=body.credentials,
        )
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionOut.model_validate(connection_to_out(row))


@router.patch(
    "/api/admin/payment-provider-connections/{connection_id}",
    response_model=ConnectionOut,
)
async def admin_patch_connection(
    connection_id: int,
    body: ConnectionUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_connection_viewer),
):
    # Viewer may PATCH non-secret settings; credentials never accepted here.
    payload = body.model_dump(exclude_unset=True)
    try:
        row = update_connection(
            db,
            admin_user_id=admin.id,
            connection_id=connection_id,
            patch=payload,
        )
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionOut.model_validate(connection_to_out(row))


@router.put(
    "/api/admin/payment-provider-connections/{connection_id}/credentials",
    response_model=ConnectionOut,
)
async def admin_replace_credentials(
    connection_id: int,
    body: ConnectionCredentialsIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_credentials_manager),
):
    try:
        row = replace_credentials(
            db,
            admin_user_id=admin.id,
            connection_id=connection_id,
            credentials=body.credentials,
        )
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionOut.model_validate(connection_to_out(row))


@router.post(
    "/api/admin/payment-provider-connections/{connection_id}/set-default",
    response_model=ConnectionOut,
)
async def admin_set_default(
    connection_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_connection_viewer),
):
    try:
        row = set_default_connection(
            db, admin_user_id=admin.id, connection_id=connection_id
        )
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionOut.model_validate(connection_to_out(row))


@router.post(
    "/api/admin/payment-provider-connections/{connection_id}/verify",
    response_model=ConnectionVerifyOut,
)
async def admin_verify_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_credentials_manager),
):
    try:
        result = verify_connection(
            db, admin_user_id=admin.id, connection_id=connection_id
        )
    except ConnectionServiceError as err:
        _raise(err)
        return  # pragma: no cover
    return ConnectionVerifyOut.model_validate(result)


@router.delete(
    "/api/admin/payment-provider-connections/{connection_id}",
    status_code=204,
)
async def admin_delete_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_payment_credentials_manager),
):
    try:
        delete_connection(db, admin_user_id=admin.id, connection_id=connection_id)
    except ConnectionServiceError as err:
        _raise(err)
