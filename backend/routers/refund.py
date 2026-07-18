"""
Пользовательский refund API (Этап 6.14.3.3).

POST/GET /me/refund-requests, cancel.
Без admin API, provider refund и entitlement mutate.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.refund import (
    RefundRequest,
    RefundRevision,
)
from backend.models.user import User
from backend.schemas.refund import (
    RefundRequestCancelIn,
    RefundRequestCreateIn,
    RefundRequestOut,
)
from backend.services.refund_api_presenters import (
    is_proposed_amount_undefined,
    recommended_refund_amount_str,
)
from backend.services.refund_revisions import (
    RefundRevisionServiceError,
    cancel_request,
)
from backend.services.refund_submit import RefundSubmitError, create_refund_request

router = APIRouter(tags=["refunds"])


def _current_revision(db: Session, request: RefundRequest) -> RefundRevision | None:
    if not request.current_revision_number:
        return None
    return (
        db.query(RefundRevision)
        .filter(
            RefundRevision.refund_request_id == request.id,
            RefundRevision.revision_number == request.current_revision_number,
        )
        .first()
    )


def _request_out(db: Session, request: RefundRequest) -> RefundRequestOut:
    revision = _current_revision(db, request)
    undefined = is_proposed_amount_undefined(revision, request)
    currency = None
    refund_type = None
    calculation_status = None
    if revision is not None:
        currency = revision.currency
        refund_type = revision.refund_type
        calculation_status = revision.calculation_status
    return RefundRequestOut(
        id=request.id,
        checkout_intent_id=request.checkout_intent_id,
        payment_attempt_id=request.payment_attempt_id,
        status=request.status,
        reason_category=request.reason_category,
        user_comment=request.user_comment,
        current_revision_number=int(request.current_revision_number or 0),
        version=int(request.version or 1),
        recommended_refund_amount=recommended_refund_amount_str(revision, request),
        currency=currency,
        refund_type=refund_type,
        calculation_status=calculation_status,
        proposed_amount_undefined=undefined,
        created_at=request.created_at,
        updated_at=request.updated_at,
        submitted_at=request.submitted_at,
        completed_at=request.completed_at,
    )


def _http_from_submit_error(exc: RefundSubmitError) -> HTTPException:
    code = exc.code
    if code in ("intent_not_found", "intent_forbidden", "attempt_not_found"):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "duplicate_open_request",
        "idempotency_conflict",
        "version_conflict",
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "idempotency_required",
        "idempotency_too_long",
        "reason_required",
        "attempt_not_succeeded",
        "attempt_intent_mismatch",
    ):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": code, "message": exc.message},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": exc.message},
    )


def _http_from_revision_error(exc: RefundRevisionServiceError) -> HTTPException:
    code = exc.code
    if code in ("request_not_found",):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": exc.message},
        )
    if code in (
        "request_terminal",
        "approved_terminal",
        "financials_frozen",
        "invalid_status_transition",
        "version_conflict",
        "status_not_editable",
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": exc.message},
    )


def _get_owned_request(
    db: Session, *, user_id: int, request_id: int
) -> RefundRequest:
    req = (
        db.query(RefundRequest)
        .filter(
            RefundRequest.id == int(request_id),
            RefundRequest.user_id == int(user_id),
        )
        .first()
    )
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "request_not_found",
                "message": "Refund request not found",
            },
        )
    return req


@router.post(
    "/me/refund-requests",
    response_model=RefundRequestOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_refund_request(
    body: RefundRequestCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        req = create_refund_request(
            db,
            user_id=current_user.id,
            checkout_intent_id=body.checkout_intent_id,
            reason_category=body.reason_category,
            idempotency_key=body.idempotency_key,
            user_comment=body.user_comment,
            payment_attempt_id=body.payment_attempt_id,
        )
    except RefundSubmitError as exc:
        raise _http_from_submit_error(exc) from exc
    return _request_out(db, req)


@router.get("/me/refund-requests", response_model=list[RefundRequestOut])
async def list_my_refund_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(RefundRequest)
        .filter(RefundRequest.user_id == current_user.id)
        .order_by(RefundRequest.id.desc())
        .all()
    )
    return [_request_out(db, row) for row in rows]


@router.get("/me/refund-requests/{request_id}", response_model=RefundRequestOut)
async def get_my_refund_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = _get_owned_request(db, user_id=current_user.id, request_id=request_id)
    return _request_out(db, req)


@router.post(
    "/me/refund-requests/{request_id}/cancel",
    response_model=RefundRequestOut,
)
async def cancel_my_refund_request(
    request_id: int,
    body: RefundRequestCancelIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ownership first — do not leak foreign ids via cancel service codes.
    req = _get_owned_request(db, user_id=current_user.id, request_id=request_id)
    try:
        updated = cancel_request(
            db,
            req.id,
            expected_version=body.expected_version,
            actor_user_id=current_user.id,
            reason=body.reason,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    return _request_out(db, updated)
