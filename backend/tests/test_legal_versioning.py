"""Этап 6.14.9B-1A: юридические редакции, checklist, gate production-платежей."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.checkout import CheckoutIntent
from backend.models.legal import (
    Consent,
    LegalChecklistItemKey,
    LegalConsentSource,
    LegalDocType,
    LegalDocumentRevision,
    LegalRevisionStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AdminAuditLog,
)
from backend.models.user import User
from backend.services.checkout_intents import (
    CheckoutIntentError,
    create_checkout_intent,
)
from backend.services.checkout_pay import CheckoutPayError, start_checkout_payment
from backend.services.legal_consent import record_consent
from backend.services.legal_documents import (
    LegalDocumentError,
    create_draft,
    get_published_by_type,
    list_public_documents,
    publish_revision,
    update_draft,
)
from backend.services.legal_launch import (
    compute_legal_launch_status,
    set_checklist_item,
)
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _auth(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


def _admin(client, db):
    return _auth(client, db, role="admin")


def _publish_required(db, admin_uid: int):
    """Publish all REQUIRED_PUBLISHED_DOC_TYPES for launch ready path."""
    from backend.models.legal import REQUIRED_PUBLISHED_DOC_TYPES

    for i, doc_type in enumerate(sorted(REQUIRED_PUBLISHED_DOC_TYPES)):
        rev = create_draft(
            db,
            doc_type=doc_type,
            version=f"1.{i}",
            title=doc_type,
            body_markdown=f"# {doc_type}\nbody",
            actor_user_id=admin_uid,
            commit=False,
        )
        publish_revision(db, revision_id=rev.id, actor_user_id=admin_uid, commit=False)
    db.commit()


def _complete_checklist(db, admin_uid: int):
    for key in LegalChecklistItemKey:
        set_checklist_item(
            db,
            item_key=key.value,
            is_completed=True,
            actor_user_id=admin_uid,
            commit=False,
        )
    db.commit()


def _ensure_addon(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "msg_legal").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="msg_legal",
        name_ru="+100 сообщений",
        type=AddonPackageType.MESSAGES,
        amount=100,
        price=Decimal("50.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def test_revision_lifecycle_and_publish_rules(client, db):
    headers, admin_uid = _admin(client, db)
    rev = create_draft(
        db,
        doc_type=LegalDocType.PUBLIC_OFFER.value,
        version="1.0",
        title="Оферта",
        body_markdown="# Offer",
        actor_user_id=admin_uid,
        internal_notes="secret lawyer note",
        commit=True,
    )
    assert rev.status == LegalRevisionStatus.DRAFT.value

    # Direct draft → publish (no ready_for_review / lawyer_approved required).
    published = publish_revision(
        db, revision_id=rev.id, actor_user_id=admin_uid, commit=True
    )
    assert published.status == LegalRevisionStatus.PUBLISHED.value

    with pytest.raises(LegalDocumentError) as ei2:
        update_draft(
            db,
            revision_id=rev.id,
            actor_user_id=admin_uid,
            title="hack",
        )
    assert ei2.value.code == "revision_immutable"

    # Second version archives first
    rev2 = create_draft(
        db,
        doc_type=LegalDocType.PUBLIC_OFFER.value,
        version="2.0",
        title="Оферта 2",
        body_markdown="# Offer 2",
        actor_user_id=admin_uid,
        commit=True,
    )
    publish_revision(db, revision_id=rev2.id, actor_user_id=admin_uid, commit=True)
    db.refresh(published)
    assert published.status == LegalRevisionStatus.ARCHIVED.value
    assert get_published_by_type(db, LegalDocType.PUBLIC_OFFER.value).id == rev2.id

    pub_list = list_public_documents(db)
    assert all(r.status == LegalRevisionStatus.PUBLISHED.value for r in pub_list)
    # Only one public_offer published
    offers = [r for r in pub_list if r.doc_type == LegalDocType.PUBLIC_OFFER.value]
    assert len(offers) == 1
    assert published.content_sha256
    assert published.published_at is not None

    # Re-publish of published is rejected (draft only)
    with pytest.raises(LegalDocumentError) as ei3:
        publish_revision(db, revision_id=rev2.id, actor_user_id=admin_uid)
    assert ei3.value.code == "invalid_status_transition"

    # Legacy statuses (e.g. lawyer_approved) are not publishable in the simplified flow.
    legacy = create_draft(
        db,
        doc_type=LegalDocType.ACCEPTABLE_USE.value,
        version="1.0",
        title="Acceptable use",
        body_markdown="# Acceptable use",
        actor_user_id=admin_uid,
        commit=True,
    )
    legacy.status = LegalRevisionStatus.LAWYER_APPROVED.value
    db.commit()
    with pytest.raises(LegalDocumentError) as ei4:
        publish_revision(db, revision_id=legacy.id, actor_user_id=admin_uid)
    assert ei4.value.code == "invalid_status_transition"
    db.refresh(legacy)
    assert legacy.status == LegalRevisionStatus.LAWYER_APPROVED.value


def test_publish_is_atomic_on_commit_failure(client, db, monkeypatch):
    """При ошибке commit статусы не должны частично сохраняться."""
    headers, admin_uid = _admin(client, db)
    first = create_draft(
        db,
        doc_type=LegalDocType.PRIVACY_POLICY.value,
        version="1.0",
        title="Privacy",
        body_markdown="# P1",
        actor_user_id=admin_uid,
        commit=True,
    )
    publish_revision(db, revision_id=first.id, actor_user_id=admin_uid, commit=True)
    db.refresh(first)
    assert first.status == LegalRevisionStatus.PUBLISHED.value

    second = create_draft(
        db,
        doc_type=LegalDocType.PRIVACY_POLICY.value,
        version="2.0",
        title="Privacy 2",
        body_markdown="# P2",
        actor_user_id=admin_uid,
        commit=True,
    )

    real_commit = db.commit

    def boom():
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(db, "commit", boom)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        publish_revision(db, revision_id=second.id, actor_user_id=admin_uid, commit=True)

    monkeypatch.setattr(db, "commit", real_commit)
    db.expire_all()
    db.refresh(first)
    db.refresh(second)
    assert first.status == LegalRevisionStatus.PUBLISHED.value
    assert second.status == LegalRevisionStatus.DRAFT.value
    assert get_published_by_type(db, LegalDocType.PRIVACY_POLICY.value).id == first.id


def test_publish_does_not_require_manual_archive(client, db):
    """Публикация сама архивирует предыдущую published — ручной archive не нужен."""
    _, admin_uid = _admin(client, db)
    v1 = create_draft(
        db,
        doc_type=LegalDocType.COOKIES_POLICY.value,
        version="1.0",
        title="Cookies",
        body_markdown="# C1",
        actor_user_id=admin_uid,
        commit=True,
    )
    publish_revision(db, revision_id=v1.id, actor_user_id=admin_uid, commit=True)

    v2 = create_draft(
        db,
        doc_type=LegalDocType.COOKIES_POLICY.value,
        version="2.0",
        title="Cookies 2",
        body_markdown="# C2",
        actor_user_id=admin_uid,
        commit=True,
    )
    # Без вызова archive_revision — сразу publish.
    published = publish_revision(
        db, revision_id=v2.id, actor_user_id=admin_uid, commit=True
    )
    db.refresh(v1)
    assert published.status == LegalRevisionStatus.PUBLISHED.value
    assert v1.status == LegalRevisionStatus.ARCHIVED.value
    assert get_published_by_type(db, LegalDocType.COOKIES_POLICY.value).id == v2.id


def test_public_api_hides_drafts_and_notes(client, db):
    headers, admin_uid = _admin(client, db)
    create_draft(
        db,
        doc_type=LegalDocType.REFUND_POLICY.value,
        version="0.1",
        title="Draft policy",
        body_markdown="secret draft",
        actor_user_id=admin_uid,
        internal_notes="do not leak",
        commit=True,
    )
    res = client.get("/legal/documents")
    assert res.status_code == 200
    assert res.json() == []

    rev = create_draft(
        db,
        doc_type=LegalDocType.COOKIES_POLICY.value,
        version="1.0",
        title="Cookies",
        body_markdown="cookies body",
        actor_user_id=admin_uid,
        internal_notes="internal",
        commit=True,
    )
    publish_revision(db, revision_id=rev.id, actor_user_id=admin_uid, commit=True)

    cur = client.get("/legal/documents/cookies-policy")
    assert cur.status_code == 200
    body = cur.json()
    assert body["title"] == "Cookies"
    assert "internal_notes" not in body
    assert "internal" not in body.get("body_markdown", "")

    admin_list = client.get(
        "/api/admin/legal/revisions",
        headers=headers,
    )
    assert admin_list.status_code == 200
    admin_item = next(i for i in admin_list.json() if i["id"] == rev.id)
    assert admin_item.get("internal_notes") == "internal"


def test_consent_stores_revision_hash_source(client, db):
    _, admin_uid = _admin(client, db)
    _, uid = _auth(client, db)
    rev = create_draft(
        db,
        doc_type=LegalDocType.ADVERTISING_CONSENT.value,
        version="1.0",
        title="Ads",
        body_markdown="ads text",
        actor_user_id=admin_uid,
        commit=True,
    )
    publish_revision(db, revision_id=rev.id, actor_user_id=admin_uid, commit=True)
    db.refresh(rev)

    row = record_consent(
        db,
        user_id=uid,
        doc_type=LegalDocType.ADVERTISING_CONSENT.value,
        source=LegalConsentSource.CHECKOUT.value,
        revision_id=rev.id,
        ip="127.0.0.1",
        user_agent="pytest",
        commit=True,
    )
    assert row.revision_id == rev.id
    assert row.content_sha256 == rev.content_sha256
    assert row.source == LegalConsentSource.CHECKOUT.value
    assert row.confirmation_result == "accepted"


def test_checkout_snapshot_immutable_and_old_intents_untouched(client, db):
    _, admin_uid = _admin(client, db)
    _, uid = _auth(client, db)
    _ensure_addon(db)

    # Old intent without legal fields (simulate pre-migration style row).
    old = CheckoutIntent(
        user_id=uid,
        product_type="addon",
        product_code="msg_legal",
        product_name="old",
        amount=Decimal("50.00"),
        currency="RUB",
        status="pending",
        idempotency_key="old-pre-legal",
    )
    db.add(old)
    db.commit()
    db.refresh(old)
    assert old.offer_revision_id is None
    assert old.legal_snapshot_at is None

    _publish_required(db, admin_uid)
    offer = get_published_by_type(db, LegalDocType.PUBLIC_OFFER.value)
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="msg_legal",
        idempotency_key="new-with-legal",
        commit=True,
    )
    assert intent.offer_revision_id == offer.id
    assert intent.refund_formula_version == "proportional_v1"
    assert intent.product_units == 100
    snap_offer = intent.offer_revision_id

    # Publish new offer — existing intent snapshot must not change.
    rev2 = create_draft(
        db,
        doc_type=LegalDocType.PUBLIC_OFFER.value,
        version="9.9",
        title="New offer",
        body_markdown="new",
        actor_user_id=admin_uid,
        commit=True,
    )
    publish_revision(db, revision_id=rev2.id, actor_user_id=admin_uid, commit=True)
    db.refresh(intent)
    assert intent.offer_revision_id == snap_offer
    db.refresh(old)
    assert old.offer_revision_id is None


def test_production_checkout_and_pay_blocked(client, db, monkeypatch):
    _, uid = _auth(client, db)
    _ensure_addon(db)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    st = compute_legal_launch_status(db)
    assert st.payments_blocked is True

    with pytest.raises(CheckoutIntentError) as ei:
        create_checkout_intent(
            db,
            user_id=uid,
            product_type="addon",
            code="msg_legal",
            idempotency_key="prod-block",
        )
    assert ei.value.code == "legal_launch_not_ready"

    # Pre-create intent as if from earlier env, then pay must also block.
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="msg_legal",
        idempotency_key="prod-pay-block",
        commit=True,
    )
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(CheckoutPayError) as pe:
        start_checkout_payment(
            db,
            user_id=uid,
            intent_id=intent.id,
            idempotency_key="pay-1",
        )
    assert pe.value.code == "legal_launch_not_ready"


def test_development_not_blocked(client, db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    _, uid = _auth(client, db)
    _ensure_addon(db)
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="msg_legal",
        idempotency_key="dev-ok",
        commit=True,
    )
    assert intent.id is not None
    st = compute_legal_launch_status(db)
    assert st.payments_blocked is False


def test_payment_readiness_still_required_when_legal_ready(client, db, monkeypatch):
    """Legal ready does not skip payment connection checks."""
    headers, admin_uid = _admin(client, db)
    _, uid = _auth(client, db)
    _ensure_addon(db)
    _publish_required(db, admin_uid)
    _complete_checklist(db, admin_uid)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    st = compute_legal_launch_status(db)
    assert st.legal_launch_ready is True
    assert st.payments_blocked is False

    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="msg_legal",
        idempotency_key="legal-ready-pay",
        commit=True,
    )
    with pytest.raises(CheckoutPayError) as pe:
        start_checkout_payment(
            db,
            user_id=uid,
            intent_id=intent.id,
            idempotency_key="pay-no-conn",
        )
    assert pe.value.code in {
        "no_default_connection",
        "default_connection_not_ready",
    }


def test_audit_excludes_internal_notes(client, db):
    _, admin_uid = _admin(client, db)
    rev = create_draft(
        db,
        doc_type=LegalDocType.ACCEPTABLE_USE.value,
        version="1.0",
        title="AUP",
        body_markdown="aup",
        actor_user_id=admin_uid,
        internal_notes="TOP SECRET",
        commit=True,
    )
    audits = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.entity_id == rev.id)
        .all()
    )
    blob = str([a.new_value for a in audits]) + str([a.old_value for a in audits])
    assert "TOP SECRET" not in blob
    assert "internal_notes" not in blob


def test_admin_api_rbac(client, db):
    user_headers, uid = _auth(client, db)
    user = db.query(User).filter(User.id == uid).one()
    user.role = "user"
    db.commit()
    res = client.get("/api/admin/legal/checklist", headers=user_headers)
    assert res.status_code == 403

    admin_headers, _ = _admin(client, db)
    res2 = client.get("/api/admin/legal/launch-status", headers=admin_headers)
    assert res2.status_code == 200
    assert "legal_launch_ready" in res2.json()


def test_consent_rejects_without_published_revision(client, db):
    headers, uid = _auth(client, db)
    res = client.post(
        "/legal/consent",
        headers=headers,
        json={"doc_type": "privacy_policy", "doc_version": "1.0"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is False
    assert body.get("code") == "no_published_revision"
    assert db.query(Consent).filter(Consent.user_id == uid).count() == 0


def test_legal_account_overview_hides_ip_and_shows_snapshots(client, db):
    admin_headers, admin_uid = _admin(client, db)
    headers, uid = _auth(client, db)
    _publish_required(db, admin_uid)
    _ensure_addon(db)

    privacy = get_published_by_type(db, LegalDocType.PRIVACY_POLICY.value)
    assert privacy is not None
    record_consent(
        db,
        user_id=uid,
        doc_type="privacy_policy",
        source=LegalConsentSource.LOGIN.value,
        doc_version=privacy.version,
        ip="10.0.0.1",
        user_agent="secret-ua",
        commit=True,
    )
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="msg_legal",
        idempotency_key="legal-account-snap",
        commit=True,
    )
    assert intent.legal_snapshot_at is not None

    res = client.get("/legal/account", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["current_documents"]) >= 1
    assert any(a["doc_type"] == LegalDocType.PRIVACY_POLICY.value for a in data["accepted"])
    raw = res.text
    assert "10.0.0.1" not in raw
    assert "secret-ua" not in raw
    assert "user_agent" not in raw
    assert "internal_notes" not in raw
    snaps = data["purchase_snapshots"]
    assert any(s["checkout_intent_id"] == intent.id for s in snaps)
    snap = next(s for s in snaps if s["checkout_intent_id"] == intent.id)
    assert snap["offer"] is not None
    assert snap["offer"]["version"]

    other = client.get("/legal/account")
    assert other.status_code in (401, 403)


def test_migration_head_includes_legal_versioning(db):
    from sqlalchemy import text

    rev = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    # After upgrade in test DB may still be previous head until migrate —
    # conftest typically upgrades to head; assert revision file chain exists.
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option(
        "script_location",
        str(root / "backend" / "migrations").replace("\\", "/"),
    )
    script = ScriptDirectory.from_config(cfg)
    assert "legal_versioning_029" in script.get_heads()
