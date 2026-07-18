"""
Админский refund API (Этап 6.14.3.4 read / 6.14.3.5 write).

Write: recalculate, admin revision, needs-information, reject, confirm, approve.
Без provider refund, refund_processing, entitlement mutate.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User
from backend.schemas.refund_admin import (
    RefundAdminApproveIn,
    RefundAdminConfirmIn,
    RefundAdminDetailOut,
    RefundAdminEditIn,
    RefundAdminListOut,
    RefundAdminNeedsInformationIn,
    RefundAdminRecalculateIn,
    RefundAdminRejectIn,
)
from backend.services.refund_admin_read import (
    RefundAdminReadError,
    get_refund_request_admin,
    list_refund_requests_admin,
)
from backend.services.refund_revisions import (
    RefundRevisionServiceError,
    approve_revision,
    confirm_admin_revision,
    create_admin_revision,
    mark_needs_information,
    recalculate_automatic_revision,
    reject_request,
)

router = APIRouter(
    prefix="/api/admin/refunds",
    tags=["Refund Admin"],
)


def _http_from_revision_error(exc: RefundRevisionServiceError) -> HTTPException:
    code = exc.code
    if code in (
        "request_not_found",
        "revision_not_found",
        "based_on_not_found",
    ):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "version_conflict",
        "stale_revision",
        "revision_stale",
        "request_terminal",
        "approved_terminal",
        "financials_frozen",
        "status_not_editable",
        "invalid_status_transition",
        "approve_not_allowed",
        "recalculate_not_allowed",
        "admin_edit_not_allowed",
        "invalid_confirm_status",
        "revision_ownership",
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "adjustment_required",
        "calculation_not_ok",
        "invalid_refund_type",
        "full_partial_mismatch",
        "negative_revoke_units",
        "revoke_exceeds_total",
        "refund_exceeds_cap",
        "refund_negative",
    ):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": code, "message": exc.message},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": exc.message},
    )


def _detail_out(db: Session, request_id: int) -> RefundAdminDetailOut:
    data = get_refund_request_admin(db, request_id=request_id)
    return RefundAdminDetailOut.model_validate(data)


@router.get("", response_model=RefundAdminListOut)
async def admin_list_refunds(
    status_filter: str | None = Query(
        None,
        alias="status",
        min_length=1,
        max_length=64,
    ),
    user_id: int | None = Query(None, ge=1),
    reason_category: str | None = Query(None, min_length=1, max_length=64),
    manual_review: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    data = list_refund_requests_admin(
        db,
        status=status_filter,
        user_id=user_id,
        reason_category=reason_category,
        manual_review=manual_review,
        limit=limit,
        offset=offset,
    )
    return RefundAdminListOut.model_validate(data)


@router.get("/{request_id}", response_model=RefundAdminDetailOut)
async def admin_get_refund(
    request_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    try:
        data = get_refund_request_admin(db, request_id=request_id)
    except RefundAdminReadError as exc:
        if exc.code == "request_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return RefundAdminDetailOut.model_validate(data)


@router.post("/{request_id}/recalculate", response_model=RefundAdminDetailOut)
async def admin_recalculate_refund(
    request_id: int,
    body: RefundAdminRecalculateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        recalculate_automatic_revision(
            db,
            request_id,
            expected_version=body.expected_version,
            actor_user_id=admin.id,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _detail_out(db, request_id)


@router.post("/{request_id}/revisions", response_model=RefundAdminDetailOut)
async def admin_create_refund_revision(
    request_id: int,
    body: RefundAdminEditIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        create_admin_revision(
            db,
            request_id,
            based_on_revision_id=body.based_on_revision_id,
            admin_user_id=admin.id,
            expected_version=body.expected_version,
            proposed_refund_amount=body.proposed_refund_amount,
            adjustment_reason_category=body.adjustment_reason_category,
            adjustment_comment=body.adjustment_comment,
            refund_type=body.refund_type,
            entitlement_action=body.entitlement_action,
            entitlement_effective_at=body.entitlement_effective_at,
            addon_revoke_units=body.addon_revoke_units,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _detail_out(db, request_id)


@router.post("/{request_id}/needs-information", response_model=RefundAdminDetailOut)
async def admin_mark_needs_information(
    request_id: int,
    body: RefundAdminNeedsInformationIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        mark_needs_information(
            db,
            request_id,
            expected_version=body.expected_version,
            actor_user_id=admin.id,
            reason=body.reason,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _detail_out(db, request_id)


@router.post("/{request_id}/reject", response_model=RefundAdminDetailOut)
async def admin_reject_refund(
    request_id: int,
    body: RefundAdminRejectIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        reject_request(
            db,
            request_id,
            expected_version=body.expected_version,
            actor_user_id=admin.id,
            reason=body.reason,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _detail_out(db, request_id)


@router.post("/{request_id}/confirm", response_model=RefundAdminDetailOut)
async def admin_confirm_refund_revision(
    request_id: int,
    body: RefundAdminConfirmIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """admin_edited → awaiting_final_confirmation (если предусмотрено workflow)."""
    try:
        confirm_admin_revision(
            db,
            request_id,
            expected_version=body.expected_version,
            actor_user_id=admin.id,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _detail_out(db, request_id)


@router.post("/{request_id}/approve", response_model=RefundAdminDetailOut)
async def admin_approve_refund_revision(
    request_id: int,
    body: RefundAdminApproveIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        result = approve_revision(
            db,
            request_id,
            revision_id=body.revision_id,
            expected_version=body.expected_version,
            actor_user_id=admin.id,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc

    if result.stale or not result.approved:
        new_id = result.new_revision.id if result.new_revision is not None else None
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "revision_stale",
                "message": (
                    "Revision inputs are stale; a new automatic revision was created"
                ),
                "new_revision_id": new_id,
            },
        )
    return _detail_out(db, request_id)
