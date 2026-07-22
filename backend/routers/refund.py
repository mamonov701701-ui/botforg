"""
Пользовательский refund API (Этап 6.14.3.3 / 6.14.10A / 6.14.10V-1).

POST/GET /me/refund-requests, cancel, provide-information.
status_history — только на detail, из refund_audit_events.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.auth.rate_limit import check_rate_limit
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.checkout import CheckoutIntent
from backend.models.refund import (
    RefundAuditEvent,
    RefundRequest,
    RefundRevision,
)
from backend.models.user import User
from backend.schemas.refund import (
    RefundablePurchaseListOut,
    RefundProvideInformationIn,
    RefundRequestCancelIn,
    RefundRequestCreateIn,
    RefundRequestOut,
    RefundStatusHistoryItemOut,
)
from backend.services.refund_api_presenters import (
    format_money,
    is_proposed_amount_undefined,
    recommended_refund_amount_str,
)
from backend.services.refund_audit_presentation import (
    PresentationContext,
    build_public_status_history,
    extract_public_decision_message,
)
from backend.services.refund_notification_producer import RefundNotificationEnqueueError
from backend.services.refund_revisions import (
    RefundRevisionServiceError,
    cancel_request,
    provide_user_information,
)
from backend.services.refund_submit import RefundSubmitError, create_refund_request
from backend.services.refundable_purchases import list_refundable_purchases

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


def _load_request_audits(db: Session, request_id: int) -> list[RefundAuditEvent]:
    return (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == int(request_id))
        .order_by(
            RefundAuditEvent.created_at.asc(),
            RefundAuditEvent.id.asc(),
        )
        .all()
    )


def _request_out(
    db: Session,
    request: RefundRequest,
    *,
    include_history: bool = False,
    intent: CheckoutIntent | None = None,
) -> RefundRequestOut:
    revision = _current_revision(db, request)
    undefined = is_proposed_amount_undefined(revision, request)
    currency = None
    refund_type = None
    calculation_status = None
    if revision is not None:
        currency = revision.currency
        refund_type = revision.refund_type
        calculation_status = revision.calculation_status

    status_history: list[RefundStatusHistoryItemOut] = []
    public_decision_message: str | None = None
    if include_history:
        audits = _load_request_audits(db, request.id)
        ctx = PresentationContext(
            recommended_refund_amount=recommended_refund_amount_str(revision, request),
            currency=currency,
            proposed_amount_undefined=undefined,
        )
        status_history = [
            RefundStatusHistoryItemOut(
                id=item.id,
                occurred_at=item.occurred_at,
                title=item.title,
                description=item.description,
                category=item.category,
                status=item.status,
            )
            for item in build_public_status_history(audits, ctx=ctx)
        ]
        public_decision_message = extract_public_decision_message(
            audits, current_status=request.status
        )

    if intent is None:
        intent = db.get(CheckoutIntent, int(request.checkout_intent_id))

    product_currency = None
    if intent is not None:
        product_currency = intent.currency
    if currency is None:
        currency = product_currency

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
        status_history=status_history,
        public_decision_message=public_decision_message,
        product_type=intent.product_type if intent else None,
        product_code=intent.product_code if intent else None,
        product_name=intent.product_name if intent else None,
        amount=format_money(intent.amount) if intent is not None else None,
        paid_at=intent.paid_at if intent else None,
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
        "invalid_status_for_reply",
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": code, "message": exc.message},
        )
    if code in ("message_required", "message_too_long"):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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


@router.get("/me/refundable-purchases", response_model=RefundablePurchaseListOut)
async def list_my_refundable_purchases(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Paid/fulfilled покупки текущего пользователя для формы возврата.
    Без credentials и без ручного ввода чужих ID.
    """
    data = list_refundable_purchases(
        db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )
    return RefundablePurchaseListOut.model_validate(data)


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
    return _request_out(db, req, include_history=True)


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
    intent_ids = {int(r.checkout_intent_id) for r in rows if r.checkout_intent_id}
    intents: dict[int, CheckoutIntent] = {}
    if intent_ids:
        for intent in (
            db.query(CheckoutIntent)
            .filter(CheckoutIntent.id.in_(tuple(intent_ids)))
            .all()
        ):
            intents[int(intent.id)] = intent
    # Список без timeline (масштабирование: не грузим audit для каждой строки).
    return [
        _request_out(
            db,
            row,
            include_history=False,
            intent=intents.get(int(row.checkout_intent_id)),
        )
        for row in rows
    ]


@router.get("/me/refund-requests/{request_id}", response_model=RefundRequestOut)
async def get_my_refund_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = _get_owned_request(db, user_id=current_user.id, request_id=request_id)
    return _request_out(db, req, include_history=True)


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
    return _request_out(db, updated, include_history=True)


@router.post(
    "/me/refund-requests/{request_id}/provide-information",
    response_model=RefundRequestOut,
)
async def provide_information_for_my_refund_request(
    request_id: int,
    body: RefundProvideInformationIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ответ пользователя на needs_information (6.14.10В-1)."""
    check_rate_limit(
        request,
        "refund_provide_information",
        subject=f"user:{int(current_user.id)}",
    )
    req = _get_owned_request(db, user_id=current_user.id, request_id=request_id)
    try:
        updated = provide_user_information(
            db,
            req.id,
            expected_version=body.expected_version,
            actor_user_id=current_user.id,
            message=body.message,
        )
    except RefundRevisionServiceError as exc:
        raise _http_from_revision_error(exc) from exc
    except RefundNotificationEnqueueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": exc.code, "message": "Не удалось сохранить ответ"},
        ) from exc
    return _request_out(db, updated, include_history=True)
