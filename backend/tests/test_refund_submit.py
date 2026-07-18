"""Этап 6.14.3.2: create refund request + duplicate / idempotency guards."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.refund import (
    REFUND_TERMINAL_STATUSES,
    RefundAuditAction,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.services.refund_submit import RefundSubmitError, create_refund_request
from backend.tests.conftest import get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _addon_pkg(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "msg_1000").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="msg_1000",
        name_ru="+1 000 сообщений",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("190.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def _seed_owned_paid(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "190.00",
    attempt_status: str = PaymentAttemptStatus.SUCCEEDED.value,
):
    paid_at = _utc() - timedelta(hours=1)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"yookassa:yk_{key}",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=Decimal(amount),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-{key}",
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="yookassa",
        provider_payment_id=f"yk_{key}",
        amount=Decimal(amount),
        currency="RUB",
        status=attempt_status,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    return intent, attempt


def test_terminal_statuses_match_contract():
    assert REFUND_TERMINAL_STATUSES == frozenset(
        {
            RefundRequestStatus.COMPLETED.value,
            RefundRequestStatus.REJECTED.value,
            RefundRequestStatus.CANCELED.value,
        }
    )


def test_create_refund_request_success(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_owned_paid(db, uid, key="sub-ok")

    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-ok-1",
        user_comment="please refund",
    )
    db.refresh(req)
    assert req.id is not None
    assert req.user_id == uid
    assert req.checkout_intent_id == intent.id
    assert req.payment_attempt_id == attempt.id
    assert req.idempotency_key == "idem-ok-1"
    assert req.status in {
        RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        RefundRequestStatus.CALCULATION_FAILED.value,
    }
    assert req.current_revision_number == 1

    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .one()
    )
    assert rev.revision_number == 1

    actions = {
        e.action
        for e in db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .all()
    }
    assert RefundAuditAction.CREATED.value in actions
    assert RefundAuditAction.REVISION_CREATED.value in actions


def test_foreign_checkout_intent_forbidden(client, db):
    token_a = register_and_get_token(client)
    uid_a = get_user_id(client, token_a)
    token_b = register_and_get_token(client)
    uid_b = get_user_id(client, token_b)
    intent, _ = _seed_owned_paid(db, uid_a, key="sub-foreign")

    with pytest.raises(RefundSubmitError) as ei:
        create_refund_request(
            db,
            user_id=uid_b,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="idem-foreign",
        )
    assert ei.value.code == "intent_forbidden"


def test_payment_not_succeeded_forbidden(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(
        db,
        uid,
        key="sub-fail",
        attempt_status=PaymentAttemptStatus.PENDING.value,
    )
    with pytest.raises(RefundSubmitError) as ei:
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="idem-pending",
        )
    assert ei.value.code == "attempt_not_succeeded"


def test_second_open_request_forbidden(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(db, uid, key="sub-dup")

    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-dup-1",
    )
    with pytest.raises(RefundSubmitError) as ei:
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="idem-dup-2",
        )
    assert ei.value.code == "duplicate_open_request"


def test_terminal_request_allows_new(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(db, uid, key="sub-term")

    first = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-term-1",
    )
    first.status = RefundRequestStatus.REJECTED.value
    first.completed_at = _utc()
    db.commit()

    second = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-term-2",
    )
    assert second.id != first.id
    assert second.checkout_intent_id == intent.id


def test_idempotency_same_payload_replays(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, attempt = _seed_owned_paid(db, uid, key="sub-idem-ok")

    a = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        reason_category="unused",
        user_comment="same",
        idempotency_key="idem-same-ok",
    )
    audits_before = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == a.id)
        .count()
    )
    revs_before = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == a.id)
        .count()
    )

    b = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        reason_category="unused",
        user_comment="same",
        idempotency_key="idem-same-ok",
    )
    assert a.id == b.id
    assert (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == a.id)
        .count()
        == audits_before
    )
    assert (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == a.id)
        .count()
        == revs_before
    )


def test_idempotency_conflict_different_intent(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent_a, _ = _seed_owned_paid(db, uid, key="sub-idem-a")
    intent_b, _ = _seed_owned_paid(db, uid, key="sub-idem-b")

    first = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent_a.id,
        reason_category="unused",
        idempotency_key="idem-conflict-intent",
    )
    with pytest.raises(RefundSubmitError) as ei:
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent_b.id,
            reason_category="unused",
            idempotency_key="idem-conflict-intent",
        )
    assert ei.value.code == "idempotency_conflict"
    assert (
        db.query(RefundRequest)
        .filter(RefundRequest.user_id == uid, RefundRequest.idempotency_key == "idem-conflict-intent")
        .count()
        == 1
    )
    assert (
        db.query(RefundRequest).filter(RefundRequest.id == first.id).one().checkout_intent_id
        == intent_a.id
    )


def test_idempotency_conflict_different_reason(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(db, uid, key="sub-idem-reason")

    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-conflict-reason",
    )
    with pytest.raises(RefundSubmitError) as ei:
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="other_reason",
            idempotency_key="idem-conflict-reason",
        )
    assert ei.value.code == "idempotency_conflict"
    assert (
        db.query(RefundRequest)
        .filter(RefundRequest.checkout_intent_id == intent.id)
        .count()
        == 1
    )


def test_concurrent_open_request_one_wins(client, db):
    """Two parallel connections / transactions for the same CheckoutIntent."""
    from backend.tests.conftest import TEST_DATABASE_URL

    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(db, uid, key="sub-race")
    intent_id = intent.id
    # Release fixture connection before NullPool race (StaticPool shares one conn).
    db.close()

    race_engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
    )

    @event.listens_for(race_engine, "connect")
    def _busy_timeout(dbapi_conn, _connection_record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()

    RaceSession = sessionmaker(autocommit=False, autoflush=False, bind=race_engine)
    barrier = threading.Barrier(2)
    outcomes: list[tuple[str, object]] = []
    lock = threading.Lock()

    def _worker(idem_suffix: str) -> None:
        session = RaceSession()
        try:
            barrier.wait(timeout=15)
            try:
                req = create_refund_request(
                    session,
                    user_id=uid,
                    checkout_intent_id=intent_id,
                    reason_category="unused",
                    idempotency_key=f"idem-race-{idem_suffix}",
                )
                with lock:
                    outcomes.append(("ok", req.id))
            except RefundSubmitError as exc:
                with lock:
                    outcomes.append(("err", exc.code))
        finally:
            session.close()

    t1 = threading.Thread(target=_worker, args=("1",))
    t2 = threading.Thread(target=_worker, args=("2",))
    t1.start()
    t2.start()
    t1.join(timeout=60)
    t2.join(timeout=60)
    assert not t1.is_alive() and not t2.is_alive()

    oks = [o for o in outcomes if o[0] == "ok"]
    errs = [o for o in outcomes if o[0] == "err"]
    assert len(outcomes) == 2
    assert len(oks) == 1, outcomes
    assert len(errs) == 1, outcomes
    assert errs[0][1] == "duplicate_open_request"

    verify = RaceSession()
    try:
        reqs = (
            verify.query(RefundRequest)
            .filter(RefundRequest.checkout_intent_id == intent_id)
            .all()
        )
        assert len(reqs) == 1
        req = reqs[0]
        revs = (
            verify.query(RefundRevision)
            .filter(RefundRevision.refund_request_id == req.id)
            .all()
        )
        assert len(revs) == 1
        assert revs[0].revision_number == 1
        actions = {
            e.action
            for e in verify.query(RefundAuditEvent)
            .filter(RefundAuditEvent.refund_request_id == req.id)
            .all()
        }
        assert RefundAuditAction.CREATED.value in actions
        assert RefundAuditAction.REVISION_CREATED.value in actions
    finally:
        verify.close()
        race_engine.dispose()


def test_rollback_leaves_no_partial_request(client, db, monkeypatch):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    intent, _ = _seed_owned_paid(db, uid, key="sub-rb")

    def _boom(*args, **kwargs):
        raise RuntimeError("forced failure after request insert")

    monkeypatch.setattr(
        "backend.services.refund_submit.create_initial_automatic_revision",
        _boom,
    )
    with pytest.raises(RuntimeError):
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="idem-rb",
        )

    leftover = (
        db.query(RefundRequest)
        .filter(RefundRequest.checkout_intent_id == intent.id)
        .count()
    )
    assert leftover == 0
    audits = (
        db.query(RefundAuditEvent)
        .join(RefundRequest, RefundAuditEvent.refund_request_id == RefundRequest.id)
        .filter(RefundRequest.checkout_intent_id == intent.id)
        .count()
    )
    assert audits == 0


def test_migration_includes_submit_guards(db):
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy import text

    insp = sa_inspect(db.bind)
    col_names = {c["name"] for c in insp.get_columns("refund_requests")}
    assert "idempotency_key" in col_names
    index_names = {i["name"] for i in insp.get_indexes("refund_requests")}
    assert "uq_refund_requests_one_open_per_intent" in index_names
    assert "uq_refund_requests_user_idempotency" in index_names

    rev = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert rev == "refund_submit_026"
