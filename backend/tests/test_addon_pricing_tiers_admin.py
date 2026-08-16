"""Admin API for addon pricing tiers — grid version flow (Этап 7.2)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.models.tariff import AddonPricingTier
from backend.models.user import User
from backend.tests.addon_pricing_grid_seed import clear_pricing_grids
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
def _clean_tiers(db):
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
        "currency": "RUB",
    }
    payload.update(body)
    return client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{version_id}/tiers",
        json=payload,
        headers=headers,
    )


def _publish(client, headers, version_id: int):
    return client.post(
        f"/api/admin/tariffs/addon-pricing-grids/{version_id}/publish",
        headers=headers,
    )


def test_create_and_list_pricing_tier(client, db):
    headers, _ = _auth_owner(client, db)
    draft = _create_draft(client, headers)
    assert draft.status_code == 201, draft.text
    vid = draft.json()["id"]
    res = _add_tier(client, headers, vid, range_end=None)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["resource_type"] == "messages"
    assert data["range_start"] == 1
    assert data["range_end"] is None
    assert Decimal(str(data["unit_price"])) == Decimal("0.30")
    assert _publish(client, headers, vid).status_code == 200

    listed = client.get("/api/admin/tariffs/addon-pricing-tiers", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
    assert listed.json()["items"][0].get("grid_version_id") == vid


def test_reject_gap_on_publish(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    assert _add_tier(client, headers, vid, range_end=999).status_code == 201
    assert (
        _add_tier(
            client, headers, vid, range_start=2000, range_end=3000, unit_price="0.22"
        ).status_code
        == 201
    )
    res = _publish(client, headers, vid)
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "pricing_gap"


def test_reject_overlap_on_publish(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    assert _add_tier(client, headers, vid, range_end=999).status_code == 201
    assert (
        _add_tier(
            client, headers, vid, range_start=500, range_end=1500, unit_price="0.22"
        ).status_code
        == 201
    )
    res = _publish(client, headers, vid)
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "pricing_overlap"


def test_reject_zero_unit_price(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    res = _add_tier(client, headers, vid, unit_price="0")
    assert res.status_code == 422


def test_edit_draft_tier_and_publish(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    created = _add_tier(client, headers, vid, range_end=None).json()
    tid = created["id"]
    patched = client.patch(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/tiers/{tid}",
        json={"unit_price": "0.31"},
        headers=headers,
    )
    assert patched.status_code == 200, patched.text
    assert Decimal(str(patched.json()["unit_price"])) == Decimal("0.31")
    assert _publish(client, headers, vid).status_code == 200


def test_delete_unused_draft_tier(client, db):
    headers, _ = _auth_owner(client, db)
    vid = _create_draft(client, headers).json()["id"]
    tid = _add_tier(client, headers, vid).json()["id"]
    res = client.delete(
        f"/api/admin/tariffs/addon-pricing-grids/{vid}/tiers/{tid}",
        headers=headers,
    )
    assert res.status_code == 204
    assert db.query(AddonPricingTier).filter(AddonPricingTier.id == tid).first() is None


def test_ai_credits_tier_allowed_in_admin_only(client, db):
    headers, _ = _auth_owner(client, db)
    draft = _create_draft(client, headers, resource_type="ai_credits")
    assert draft.status_code == 201, draft.text
    vid = draft.json()["id"]
    res = _add_tier(
        client,
        headers,
        vid,
        range_start=1,
        range_end=None,
        unit_price="0.01",
    )
    assert res.status_code == 201, res.text
    assert res.json()["resource_type"] == "ai_credits"
    assert _publish(client, headers, vid).status_code == 200


def test_flat_mutation_endpoints_gone(client, db):
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
