"""Этап 6.14.10Б: notification outbox + refund email producer/worker."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.notification import (
    NotificationOutbox,
    NotificationOutboxStatus,
)
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.email_transport import (
    EmailMessagePayload,
    EmailTransportError,
    LoggingEmailTransport,
    SmtpEmailTransport,
    classify_email_error,
)
from backend.services.notification_outbox_worker import (
    claim_outbox_batch,
    compute_backoff_seconds,
    process_outbox_row,
    recover_stale_processing,
    run_outbox_once,
)
from backend.services.notification_templates.refund_email import (
    assert_payload_safe,
    build_refund_email,
)
from backend.services.refund_notification_producer import (
    RefundNotificationEnqueueError,
    RefundNotificationResultKind,
    after_refund_audit_written,
    build_idempotency_key,
    enqueue_refund_notification_from_audit,
)
from backend.services.refund_revisions import mark_needs_information, reject_request
from backend.services.refund_submit import create_refund_request
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _auth(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


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


def _seed_paid(db, user_id: int, *, key: str):
    pkg = _addon_pkg(db)
    paid_at = _utc() - timedelta(hours=1)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"fake:pay-{key}",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=pkg.price,
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-{key}",
        payment_provider="fake",
        provider_payment_id=f"pay-{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="fake",
        provider_payment_id=f"pay-{key}",
        amount=pkg.price,
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pa-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    return intent


class FailOnceTransport:
    def __init__(self, *, temporary: bool = True):
        self.calls = 0
        self.temporary = temporary

    def send(self, message: EmailMessagePayload) -> None:
        self.calls += 1
        raise EmailTransportError(
            "boom",
            code="smtp_connection" if self.temporary else "invalid_email",
            temporary=self.temporary,
        )


class CountingTransport:
    def __init__(self):
        self.calls = 0
        self.messages: list[EmailMessagePayload] = []

    def send(self, message: EmailMessagePayload) -> None:
        self.calls += 1
        self.messages.append(message)


def test_create_refund_enqueues_outbox(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-1")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-1-key",
    )
    rows = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.aggregate_type == "refund_request",
            NotificationOutbox.aggregate_id == str(req.id),
        )
        .all()
    )
    assert rows
    created = [r for r in rows if "создана" in str(r.payload_json.get("title", "")).lower()]
    assert created
    payload = created[0].payload_json
    assert_payload_safe(payload)
    assert "status_changed" not in str(payload)
    assert "event_metadata" not in payload
    assert created[0].status == NotificationOutboxStatus.PENDING.value
    key = created[0].idempotency_key
    assert key.startswith(f"refund:{req.id}:")
    assert ":email:" in key


def test_idempotent_enqueue_no_duplicate(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-2")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-2-key",
    )
    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action == RefundAuditAction.CREATED.value,
        )
        .one()
    )
    before = db.query(NotificationOutbox).filter(
        NotificationOutbox.aggregate_id == str(req.id)
    ).count()
    again = enqueue_refund_notification_from_audit(db, request=req, audit_event=audit)
    db.commit()
    after = db.query(NotificationOutbox).filter(
        NotificationOutbox.aggregate_id == str(req.id)
    ).count()
    assert after == before
    assert again.kind == RefundNotificationResultKind.DUPLICATE
    assert again.outbox is not None


def test_non_key_event_does_not_enqueue(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-3")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-3-key",
    )
    before = db.query(NotificationOutbox).count()
    ev = RefundAuditEvent(
        refund_request_id=req.id,
        actor_type=RefundAuditActorType.SYSTEM.value,
        action=RefundAuditAction.LEDGER_ENTRY_CREATED.value,
        previous_status=None,
        new_status=None,
        reason=None,
        event_metadata={"note": "ledger"},
    )
    db.add(ev)
    db.flush()
    out = enqueue_refund_notification_from_audit(db, request=req, audit_event=ev)
    db.commit()
    assert out.kind == RefundNotificationResultKind.SKIPPED_NOT_REQUIRED
    assert out.outbox is None
    assert db.query(NotificationOutbox).count() == before


def test_needs_information_enqueues_safe_payload(client, db):
    _, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="ob-ni")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-ni-key",
    )
    mark_needs_information(
        db,
        req.id,
        expected_version=int(req.version),
        actor_user_id=admin_uid,
        reason="Уточните дату покупки, пожалуйста.",
    )
    rows = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id == str(req.id))
        .all()
    )
    titles = [r.payload_json.get("title") for r in rows]
    assert any("дополнительная информация" in str(t).lower() for t in titles)
    ni = next(
        r for r in rows if "дополнительная" in str(r.payload_json.get("title", "")).lower()
    )
    assert "уточните дату" in ni.payload_json["description"].lower()
    assert_payload_safe(ni.payload_json)


def test_worker_sends_and_marks_sent(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-w1")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-w1-key",
    )
    transport = CountingTransport()
    stats = run_outbox_once(db, worker_id="t1", transport=transport, commit=True)
    assert stats["claimed"] >= 1
    assert stats["sent"] >= 1
    assert transport.calls >= 1
    msg = transport.messages[0]
    assert "BotForg" in msg.subject
    assert "возврат" in msg.subject.lower() or "Заявка" in msg.subject
    body_l = msg.body_text.lower()
    assert "traceback" not in body_l
    assert "provider_refund" not in body_l
    assert "event_metadata" not in body_l
    sent = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.status == NotificationOutboxStatus.SENT.value)
        .count()
    )
    assert sent >= 1
    # second run does not resend sent
    transport2 = CountingTransport()
    stats2 = run_outbox_once(db, worker_id="t2", transport=transport2, commit=True)
    assert stats2["sent"] == 0
    assert transport2.calls == 0


def test_two_workers_do_not_claim_same_row(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-race")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-race-key",
    )
    pending = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.status == NotificationOutboxStatus.PENDING.value)
        .all()
    )
    assert pending
    # Claim in first session
    db1 = TestingSessionLocal()
    db2 = TestingSessionLocal()
    try:
        c1 = claim_outbox_batch(db1, worker_id="w-a", batch_size=50)
        db1.commit()
        c2 = claim_outbox_batch(db2, worker_id="w-b", batch_size=50)
        db2.commit()
        ids1 = {r.id for r in c1}
        ids2 = {r.id for r in c2}
        assert ids1.isdisjoint(ids2)
    finally:
        db1.close()
        db2.close()


def test_temporary_error_retry_and_backoff(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-retry")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-retry-key",
    )
    transport = FailOnceTransport(temporary=True)
    run_outbox_once(db, worker_id="tr", transport=transport, commit=True)
    row = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id.isnot(None))
        .order_by(NotificationOutbox.id.desc())
        .first()
    )
    # find retry row for this user refund
    rows = db.query(NotificationOutbox).filter(
        NotificationOutbox.status == NotificationOutboxStatus.RETRY.value
    ).all()
    assert rows
    assert rows[0].attempts >= 1
    avail = rows[0].available_at
    if avail.tzinfo is None:
        assert avail > datetime.utcnow()
    else:
        assert avail > _utc()
    assert compute_backoff_seconds(1) == 30
    assert compute_backoff_seconds(2) == 60


def test_permanent_error_failed_permanent(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-perm")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-perm-key",
    )
    transport = FailOnceTransport(temporary=False)
    run_outbox_once(db, worker_id="tp", transport=transport, commit=True)
    failed = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.status == NotificationOutboxStatus.FAILED_PERMANENT.value)
        .count()
    )
    assert failed >= 1


def test_stale_processing_recovery(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-stale")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-stale-key",
    )
    row = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.status == NotificationOutboxStatus.PENDING.value)
        .first()
    )
    assert row
    row.status = NotificationOutboxStatus.PROCESSING.value
    row.locked_at = _utc() - timedelta(hours=2)
    row.locked_by = "dead-worker"
    db.commit()
    n = recover_stale_processing(db)
    db.commit()
    assert n >= 1
    db.refresh(row)
    assert row.status == NotificationOutboxStatus.RETRY.value
    assert row.locked_at is None


def test_malformed_payload_permanent(db):
    row = NotificationOutbox(
        notification_type="refund_status",
        channel="email",
        recipient_user_id=None,
        recipient_email="a@b.c",
        aggregate_type="refund_request",
        aggregate_id="1",
        event_type="created",
        idempotency_key="test-malformed-1",
        payload_json={},  # missing title/description
        status=NotificationOutboxStatus.PROCESSING.value,
        attempts=0,
        available_at=_utc(),
        locked_at=_utc(),
        locked_by="t",
        created_at=_utc(),
        updated_at=_utc(),
    )
    db.add(row)
    db.commit()
    result = process_outbox_row(db, row, transport=CountingTransport())
    db.commit()
    assert result == NotificationOutboxStatus.FAILED_PERMANENT.value


def test_email_template_russian_safe():
    subject, body = build_refund_email(
        title="Заявка на возврат создана",
        description="Мы получили вашу заявку.",
        status_label="Отправлена",
        request_id=42,
        detail_url="http://localhost:5173/dashboard/finance/refunds/42",
    )
    assert "BotForg" in subject
    assert "создана" in subject.lower() or "Заявка" in subject
    assert "42" in body
    assert "автоматически" in body.lower()
    assert "traceback" not in body.lower()


def test_classify_errors():
    code, tmp = classify_email_error(
        EmailTransportError("x", code="invalid_email", temporary=False)
    )
    assert code == "invalid_email"
    assert tmp is False
    code2, tmp2 = classify_email_error(
        EmailTransportError("x", code="smtp_connection", temporary=True)
    )
    assert tmp2 is True


def test_idempotency_key_stable():
    k1 = build_idempotency_key(refund_id=5, audit_event_id=9, user_id=3)
    k2 = build_idempotency_key(refund_id=5, audit_event_id=9, user_id=3)
    assert k1 == k2
    assert k1 == "refund:5:9:email:3:v1"


def test_logging_transport_no_real_send():
    t = LoggingEmailTransport()
    t.send(
        EmailMessagePayload(
            to_email="user@example.com",
            subject="t",
            body_text="b",
        )
    )


def test_migration_indexes_exist(db):
    from sqlalchemy import inspect

    insp = inspect(db.bind)
    tables = set(insp.get_table_names())
    assert "notification_outbox" in tables
    indexes = {ix["name"] for ix in insp.get_indexes("notification_outbox")}
    assert "ix_notification_outbox_status_available" in indexes
    # unique via UniqueConstraint — may appear as index name
    uniques = set()
    for uq in insp.get_unique_constraints("notification_outbox"):
        uniques.add(uq["name"])
    assert "uq_notification_outbox_idempotency" in uniques or any(
        "idempotency" in (n or "") for n in indexes
    )


def test_batch_limit_respected(client, db):
    _, uid = _auth(client, db)
    for i in range(3):
        intent = _seed_paid(db, uid, key=f"ob-batch-{i}")
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key=f"ob-batch-key-{i}",
        )
    claimed = claim_outbox_batch(db, worker_id="batch-w", batch_size=1)
    assert len(claimed) == 1


def test_max_attempts_to_failed_permanent(client, db):
    from backend.settings import settings

    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-max")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-max-key",
    )
    row = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.status == NotificationOutboxStatus.PENDING.value)
        .order_by(NotificationOutbox.id.desc())
        .first()
    )
    assert row
    row.attempts = int(settings.NOTIFICATION_OUTBOX_MAX_ATTEMPTS) - 1
    db.commit()
    transport = FailOnceTransport(temporary=True)
    run_outbox_once(db, worker_id="max-w", transport=transport, commit=True)
    db.refresh(row)
    assert row.status == NotificationOutboxStatus.FAILED_PERMANENT.value


def test_enqueue_rollback_does_not_leave_outbox(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-rb")
    before = db.query(NotificationOutbox).count()
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-rb-key",
        commit=False,
    )
    assert db.query(NotificationOutbox).count() > before
    db.rollback()
    assert db.query(NotificationOutbox).count() == before


def test_required_event_enqueues_atomically(client, db):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-atom")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-atom-key",
    )
    assert db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    outbox = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id == str(req.id))
        .all()
    )
    assert outbox
    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action == RefundAuditAction.CREATED.value,
        )
        .one()
    )
    result = after_refund_audit_written(db, request=req, audit_event=audit)
    assert result.kind == RefundNotificationResultKind.DUPLICATE
    assert result.ok is True


def test_enqueue_db_error_rolls_back_refund(client, db, monkeypatch):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-dberr")
    before_req = db.query(RefundRequest).count()
    before_out = db.query(NotificationOutbox).count()
    before_audit = db.query(RefundAuditEvent).count()

    def boom(*_a, **_k):
        raise RefundNotificationEnqueueError("forced db failure", code="enqueue_db")

    monkeypatch.setattr(
        "backend.services.refund_notification_producer.enqueue_refund_notification_from_audit",
        boom,
    )
    with pytest.raises(RefundNotificationEnqueueError):
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="ob-dberr-key",
            commit=True,
        )
    assert db.query(RefundRequest).count() == before_req
    assert db.query(NotificationOutbox).count() == before_out
    assert db.query(RefundAuditEvent).count() == before_audit


def test_malformed_payload_rolls_back(client, db, monkeypatch):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-mal")
    before_req = db.query(RefundRequest).count()

    monkeypatch.setattr(
        "backend.services.refund_notification_producer.present_public_event",
        lambda *_a, **_k: None,
    )
    with pytest.raises(RefundNotificationEnqueueError) as ei:
        create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key="ob-mal-key",
            commit=True,
        )
    assert ei.value.code == "malformed_payload"
    assert db.query(RefundRequest).count() == before_req


def test_arbitrary_integrity_error_not_treated_as_duplicate(client, db, monkeypatch):
    _, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="ob-ie")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-ie-key",
    )
    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action == RefundAuditAction.CREATED.value,
        )
        .one()
    )
    key = build_idempotency_key(
        refund_id=int(req.id),
        audit_event_id=int(audit.id),
        user_id=int(uid),
    )
    db.query(NotificationOutbox).filter(NotificationOutbox.idempotency_key == key).delete()
    db.commit()

    class BoomNested:
        def __enter__(self):
            raise IntegrityError("stmt", {}, Exception("unrelated constraint"))

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(db, "begin_nested", lambda: BoomNested())
    with pytest.raises(RefundNotificationEnqueueError) as ei:
        enqueue_refund_notification_from_audit(db, request=req, audit_event=audit)
    assert ei.value.code == "enqueue_integrity_error"


def test_skipped_no_recipient_does_not_break_refund(client, db):
    _, uid = _auth(client, db)
    user = db.get(User, uid)
    user.email = "not-an-email"
    db.commit()
    intent = _seed_paid(db, uid, key="ob-norec")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-norec-key",
    )
    assert req.id is not None
    assert (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id == str(req.id))
        .count()
        == 0
    )
    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action == RefundAuditAction.CREATED.value,
        )
        .one()
    )
    result = enqueue_refund_notification_from_audit(db, request=req, audit_event=audit)
    assert result.kind == RefundNotificationResultKind.SKIPPED_NO_RECIPIENT
    assert result.outbox is None


def test_missing_email_skipped_on_create(client, db):
    _, uid = _auth(client, db)
    user = db.get(User, uid)
    user.email = ""
    db.commit()
    intent = _seed_paid(db, uid, key="ob-empty")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-empty-key",
    )
    assert req.id is not None
    assert (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id == str(req.id))
        .count()
        == 0
    )


def test_reject_enqueues_and_duplicate_safe(client, db):
    _, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="ob-rej")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ob-rej-key",
    )
    reject_request(
        db,
        req.id,
        expected_version=int(req.version),
        actor_user_id=admin_uid,
        reason="Не подходит под условия возврата.",
    )
    rows = (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.aggregate_id == str(req.id))
        .all()
    )
    rejected_rows = [
        r for r in rows if r.payload_json.get("status") == RefundRequestStatus.REJECTED.value
    ]
    assert rejected_rows
    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.new_status == RefundRequestStatus.REJECTED.value,
        )
        .order_by(RefundAuditEvent.id.desc())
        .first()
    )
    assert audit is not None
    result = after_refund_audit_written(db, request=req, audit_event=audit)
    assert result.kind == RefundNotificationResultKind.DUPLICATE
    db.commit()
