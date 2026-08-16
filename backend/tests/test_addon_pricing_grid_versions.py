"""Versioned addon pricing grids (Этап 7.2)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.tariff import (
    AddonPricingGridVersion,
    AddonPricingGridVersionStatus,
    AddonPricingTier,
    AdminAuditLog,
)
from backend.models.user import User
from backend.services.addon_pricing import AddonPricingError, quote_custom_messages
from backend.tests.addon_pricing_grid_seed import (
    clear_pricing_grids,
    seed_active_message_grid,
)
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _promote(db, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).one()
    user.role = "owner"
    db.commit()


def _auth_owner(client, db):
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    _promote(db, uid)
    return {"Authorization": auth}, uid


@pytest.fixture(autouse=True)
def _clean(db):
    clear_pricing_grids(db)
    yield
    clear_pricing_grids(db)


def _create_draft(client, headers, **body):
    payload = {"resource_type": "messages", "currency": "RUB"}
    payload.update(body)
    return client.post(
        "/api/admin/tariffs/addon-pricing-grids",
        json=payload,
        headers=headers,
    )


def _add_tier(client, headers, version_id: int, **body):
    payload = {
        "range_start": 1,
        "range_end": 999,
        "unit_price": "0.30",
    }
    payload.update(body)
    return client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{version_id}/tiers",
        json=payload,
        headers=headers,
    )


def test_create_draft_edit_tiers_and_publish(client, db):
    headers, _ = _auth_owner(client, db)
    draft = _create_draft(client, headers)
    assert draft.status_code == 201, draft.text
    vid = draft.json()["id"]
    assert draft.json()["status"] == "draft"

    assert _add_tier(client, headers, vid, range_end=999).status_code == 201
    assert (
        _add_tier(
            client, headers, vid, range_start=1000, range_end=None, unit_price="0.20"
        ).status_code
        == 201
    )

    published = client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/publish",
        headers=headers,
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "active"
    assert published.json()["tiers_count"] == 2

    active = (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.resource_type == "messages",
            AddonPricingGridVersion.status
            == AddonPricingGridVersionStatus.ACTIVE.value,
        )
        .all()
    )
    assert len(active) == 1
    assert int(active[0].id) == vid

    audits = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.action == "addon_pricing_grid_published")
        .all()
    )
    assert len(audits) >= 1


def test_reject_publish_with_gap(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    assert _add_tier(client, headers, vid, range_end=999).status_code == 201
    assert (
        _add_tier(
            client, headers, vid, range_start=2000, range_end=None, unit_price="0.20"
        ).status_code
        == 201
    )
    res = client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/publish",
        headers=headers,
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "pricing_gap"


def test_publish_swaps_active_and_quote_uses_new(client, db):
    seed_active_message_grid(
        db,
        [(1, None, "0.50")],
    )
    old = (
        db.query(AddonPricingGridVersion)
        .filter(
            AddonPricingGridVersion.status
            == AddonPricingGridVersionStatus.ACTIVE.value
        )
        .one()
    )
    headers, _ = _auth_owner(client, db)
    draft = _create_draft(client, headers, based_on_version_id=int(old.id))
    assert draft.status_code == 201, draft.text
    vid = draft.json()["id"]
    # Replace copied tiers with a different open-ended price
    for t in draft.json().get("tiers") or []:
        client.delete(
            f"/api/admin/tariffs/addon-pricing-grids/{vid}/tiers/{t['id']}",
            headers=headers,
        )
    assert (
        _add_tier(
            client, headers, vid, range_start=1, range_end=None, unit_price="0.10"
        ).status_code
        == 201
    )
    pub = client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/publish",
        headers=headers,
    )
    assert pub.status_code == 200, pub.text

    db.refresh(old)
    assert old.status == AddonPricingGridVersionStatus.ARCHIVED.value

    quote = quote_custom_messages(db, quantity=100)
    assert quote.total == Decimal("10.00")
    assert quote.pricing_grid_version_id == vid


def test_old_snapshot_unchanged_when_tiers_change_after_purchase(client, db):
    """Historical checkout snapshot stays frozen after a new grid is published."""
    from datetime import datetime, timedelta, timezone

    from backend.models.checkout import CheckoutIntent
    from backend.models.plan import Plan
    from backend.models.tariff import SubscriptionStatus, UserSubscription
    from backend.services.addon_custom_pack import ensure_custom_messages_package
    from backend.services.addon_pricing import quote_custom_messages as qcm

    seed_active_message_grid(db, [(1, None, "0.30")])
    ensure_custom_messages_package(db)
    db.commit()

    headers, uid = _auth_owner(client, db)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
    )
    db.commit()

    quote = qcm(db, quantity=100)
    snap = quote.as_snapshot()
    intent = CheckoutIntent(
        user_id=uid,
        product_type="addon",
        product_code="custom_messages",
        product_name="Настроить пакет",
        amount=quote.total,
        currency=quote.currency,
        status="pending",
        idempotency_key="grid-snap-freeze-1",
        price_grid_snapshot=snap,
    )
    db.add(intent)
    db.commit()
    frozen_total = snap["total"]
    frozen_version = snap.get("pricing_grid_version_id")

    # Publish a cheaper grid (empty draft — do not copy active tiers)
    draft_res = client.post(
        "/api/admin/tariffs/addon-pricing-grids",
        json={
            "resource_type": "messages",
            "currency": "RUB",
            "based_on_version_id": None,
            "note": "cheaper",
        },
        headers=headers,
    )
    # create_draft_from_version copies active when based_on is None — clear copies
    assert draft_res.status_code == 201, draft_res.text
    draft = draft_res.json()
    vid = draft["id"]
    for t in draft.get("tiers") or []:
        assert (
            client.delete(
                f"/api/admin/tariffs/addon-pricing-grids/{vid}/tiers/{t['id']}",
                headers=headers,
            ).status_code
            == 204
        )
    assert (
        _add_tier(
            client, headers, vid, range_start=1, range_end=None, unit_price="0.01"
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/admin/tariffs/addon-pricing-grids/{vid}/publish",
            headers=headers,
        ).status_code
        == 200
    )

    db.refresh(intent)
    assert intent.price_grid_snapshot["total"] == frozen_total
    assert intent.price_grid_snapshot.get("pricing_grid_version_id") == frozen_version
    fresh = qcm(db, quantity=100)
    assert fresh.total == Decimal("1.00")
    assert fresh.pricing_grid_version_id == vid


def test_currency_mismatch_rejected(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers, currency="RUB").json()["id"]
    res = _add_tier(client, headers, vid, currency="USD")
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "currency_mismatch"


def test_cannot_edit_active_tiers(client, db):
    version = seed_active_message_grid(db, [(1, None, "0.30")])
    tier = (
        db.query(AddonPricingTier)
        .filter(AddonPricingTier.grid_version_id == int(version.id))
        .one()
    )
    headers, _ = _auth_owner(client, db)
    res = client.patch(
        f"/api/admin/tariffs/addon-pricing-grids/{version.id}/tiers/{tier.id}",
        json={"unit_price": "0.99"},
        headers=headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "grid_not_draft"


def test_legacy_flat_create_returns_gone(client, db):
    headers, _ = _auth_owner(client, db)
    res = client.post(
        "/api/admin/tariffs/addon-pricing-tiers",
        json={
            "resource_type": "messages",
            "range_start": 1,
            "range_end": None,
            "unit_price": "0.30",
        },
        headers=headers,
    )
    assert res.status_code == 410


def test_quote_fails_closed_without_active_version(client, db):
    clear_pricing_grids(db)
    with pytest.raises(AddonPricingError) as exc:
        quote_custom_messages(db, quantity=100)
    assert exc.value.code == "pricing_unavailable"


def test_delete_draft_and_block_when_referenced(client, db):
    headers, uid = _auth_owner(client, db)
    draft = _create_draft(client, headers).json()
    vid = draft["id"]
    assert _add_tier(client, headers, vid, range_end=None).status_code == 201
    assert (
        client.delete(
            f"/api/admin/tariffs/addon-pricing-grids/{vid}",
            headers=headers,
        ).status_code
        == 204
    )
    assert (
        db.query(AddonPricingGridVersion)
        .filter(AddonPricingGridVersion.id == vid)
        .first()
        is None
    )
    audit = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.action == "addon_pricing_grid_draft_deleted")
        .order_by(AdminAuditLog.id.desc())
        .first()
    )
    assert audit is not None

    # Active cannot be deleted
    active = seed_active_message_grid(db, [(1, None, "0.25")])
    res = client.delete(
        f"/api/admin/tariffs/addon-pricing-grids/{active.id}",
        headers=headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "grid_not_draft"


def test_archive_active_stops_sales(client, db):
    headers, _ = _auth_owner(client, db)
    active = seed_active_message_grid(db, [(1, None, "0.20")])
    assert quote_custom_messages(db, quantity=10).total > 0
    res = client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{active.id}/archive",
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "archived"
    with pytest.raises(AddonPricingError) as exc:
        quote_custom_messages(db, quantity=10)
    assert exc.value.code == "pricing_unavailable"
    system = client.get(
        "/api/admin/tariffs/addons/system/custom-messages",
        headers=headers,
    )
    assert system.status_code == 200
    body = system.json()
    assert body["sales_enabled"] is False
    assert "выключены" in body["sales_status_label"].lower()


def test_publish_normalizes_technical_upper_bound(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    assert (
        _add_tier(
            client, headers, vid, range_start=1, range_end=10_000_000, unit_price="0.30"
        ).status_code
        == 201
    )
    pub = client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/publish",
        headers=headers,
    )
    assert pub.status_code == 200, pub.text
    tiers = pub.json()["tiers"]
    assert len(tiers) == 1
    assert tiers[0]["range_end"] is None
