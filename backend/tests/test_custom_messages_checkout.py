"""Custom messages pack: quote, checkout snapshot, paid-plan gate (Этап 7.2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import CheckoutIntent
from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AddonPricingTier,
    SubscriptionStatus,
    UserAddon,
    UserSubscription,
)
from backend.services.addon_custom_pack import CUSTOM_MESSAGES_CODE, ensure_custom_messages_package
from backend.services.payment_fulfillment import fulfill_paid_intent
from backend.tests.addon_pricing_grid_seed import seed_active_message_grid
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _auth(client) -> tuple[str, int]:
    token = register_and_get_token(client)
    return token, get_user_id(client, token)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": token}


def _activate(db, user_id: int, plan_code: str = "business") -> UserSubscription:
    plan = db.query(Plan).filter(Plan.code == plan_code).one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    sub = UserSubscription(
        user_id=user_id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=start,
        current_period_end=start + timedelta(days=30),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _seed_message_tiers(db) -> None:
    seed_active_message_grid(db)


def test_custom_messages_not_in_public_catalog(client, db):
    ensure_custom_messages_package(db)
    db.commit()
    pkg = db.query(AddonPackage).filter(AddonPackage.code == CUSTOM_MESSAGES_CODE).one()
    pkg.is_public = True
    db.commit()
    res = client.get("/addons")
    assert res.status_code == 200
    codes = {item["code"] for item in res.json()}
    assert CUSTOM_MESSAGES_CODE not in codes


def test_quote_requires_paid_plan(client, db):
    token, _uid = _auth(client)
    _seed_message_tiers(db)
    res = client.post(
        "/me/addons/custom-quote",
        json={"resource_type": "messages", "quantity": 3450},
        headers=_headers(token),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "addon_not_available_for_current_tariff"


def test_quote_graduated_for_business(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    res = client.post(
        "/me/addons/custom-quote",
        json={"resource_type": "messages", "quantity": 3450},
        headers=_headers(token),
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["quantity"] == 3450
    assert Decimal(str(data["total"])) == Decimal("838.92")
    assert data["checkout_code"] == CUSTOM_MESSAGES_CODE
    assert data["bands"][0]["units"] == 999
    assert data["bands"][1]["units"] == 2451


def test_ai_credits_custom_quote_not_public(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    res = client.post(
        "/me/addons/custom-quote",
        json={"resource_type": "ai_credits", "quantity": 10},
        headers=_headers(token),
    )
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "custom_pack_not_available"


def test_checkout_recalculates_and_ignores_client_amount(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "custom-3450",
            "quantity": 3450,
            "amount": "1.00",
        },
        headers=_headers(token),
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert Decimal(str(data["amount"])) == Decimal("838.92")
    row = db.query(CheckoutIntent).filter(CheckoutIntent.id == data["id"]).one()
    assert Decimal(str(row.amount)) == Decimal("838.92")
    assert row.product_units == 3450
    snap = row.price_grid_snapshot
    assert snap["kind"] == "graduated_addon"
    assert snap["quantity"] == 3450
    assert snap["total"] == "838.92"
    assert len(snap["bands"]) == 2


def test_free_plan_cannot_checkout_custom_or_fixed(client, db):
    token, uid = _auth(client)
    _seed_message_tiers(db)
    custom = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "free-custom",
            "quantity": 100,
        },
        headers=_headers(token),
    )
    assert custom.status_code == 403
    pkg = AddonPackage(
        code="fixed_msg_gate",
        name_ru="1000",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("199.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    fixed = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": "fixed_msg_gate",
            "idempotency_key": "free-fixed",
        },
        headers=_headers(token),
    )
    assert fixed.status_code == 403


def test_paid_plan_can_checkout_fixed_addon(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    pkg = AddonPackage(
        code="fixed_msg_ok",
        name_ru="1000",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("199.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": "fixed_msg_ok",
            "idempotency_key": "paid-fixed",
        },
        headers=_headers(token),
    )
    assert res.status_code == 201, res.text
    assert Decimal(str(res.json()["amount"])) == Decimal("199.00")


def test_quantity_not_allowed_on_fixed_addon(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    pkg = AddonPackage(
        code="fixed_no_qty",
        name_ru="1000",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("199.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": "fixed_no_qty",
            "idempotency_key": "qty-fixed",
            "quantity": 50,
        },
        headers=_headers(token),
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "quantity_not_allowed"


def test_fulfill_custom_pack_uses_quantity_and_validity_days(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "ful-custom-1",
            "quantity": 3450,
        },
        headers=_headers(token),
    )
    assert created.status_code == 201, created.text
    intent_id = created.json()["id"]
    result = fulfill_paid_intent(
        db,
        checkout_intent_id=intent_id,
        user_id=uid,
        provider="testpay",
        provider_payment_id="pay-custom-1",
        provider_event_id="evt-custom-1",
        event_type="payment.succeeded",
        amount=Decimal("838.92"),
        currency="RUB",
        payload={},
    )
    addon = db.query(UserAddon).filter(UserAddon.id == result.intent.fulfilled_addon_id).one()
    assert addon.amount == 3450
    delta = addon.period_end - addon.period_start
    assert abs(delta.total_seconds() - 30 * 24 * 3600) < 2


def test_multiple_custom_packs_keep_separate_expiry(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    ids = []
    for i, qty in enumerate((100, 200), start=1):
        created = client.post(
            "/me/checkout-intents",
            json={
                "product_type": "addon",
                "code": CUSTOM_MESSAGES_CODE,
                "idempotency_key": f"multi-custom-{i}",
                "quantity": qty,
            },
            headers=_headers(token),
        )
        assert created.status_code == 201, created.text
        result = fulfill_paid_intent(
            db,
            checkout_intent_id=created.json()["id"],
            user_id=uid,
            provider="testpay",
            provider_payment_id=f"pay-multi-{i}",
            provider_event_id=f"evt-multi-{i}",
            event_type="payment.succeeded",
            amount=Decimal(str(created.json()["amount"])),
            currency="RUB",
            payload={},
        )
        ids.append(result.intent.fulfilled_addon_id)
    addons = (
        db.query(UserAddon)
        .filter(UserAddon.user_id == uid, UserAddon.id.in_(ids))
        .all()
    )
    assert len(addons) == 2
    assert {a.amount for a in addons} == {100, 200}
    assert addons[0].id != addons[1].id


def test_confirm_terms_required_before_pay(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "confirm-req-1",
            "quantity": 3450,
        },
        headers=_headers(token),
    )
    assert created.status_code == 201, created.text
    intent_id = created.json()["id"]
    assert created.json().get("terms_confirmed") is False

    pay = client.post(
        f"/me/checkout-intents/{intent_id}/pay",
        json={"idempotency_key": "pay-no-confirm", "return_url": "http://localhost/return"},
        headers=_headers(token),
    )
    assert pay.status_code == 422, pay.text
    assert pay.json()["detail"]["code"] == "terms_confirmation_required"


def test_confirm_terms_then_price_changed_requires_reconfirm(client, db):
    from backend.services.checkout_intents import is_custom_terms_confirmed

    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "confirm-ok-1",
            "quantity": 3450,
        },
        headers=_headers(token),
    )
    assert created.status_code == 201, created.text
    intent_id = created.json()["id"]
    amount = created.json()["amount"]

    conf = client.post(
        f"/me/checkout-intents/{intent_id}/confirm-addon-terms",
        json={
            "confirmed_amount": amount,
            "confirmed_currency": "RUB",
            "confirmed_quantity": 3450,
        },
        headers=_headers(token),
    )
    assert conf.status_code == 200, conf.text
    assert conf.json()["terms_confirmed"] is True
    row = db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).one()
    assert is_custom_terms_confirmed(row)
    assert Decimal(str(row.price_grid_snapshot["terms_confirmation"]["total"])) == Decimal(
        str(amount)
    )

    # Simulate admin price change: bump unit rates then clear confirmation via assert.
    for tier in db.query(AddonPricingTier).filter(AddonPricingTier.resource_type == "messages"):
        tier.unit_price = Decimal(str(tier.unit_price)) + Decimal("0.05")
        db.add(tier)
    db.commit()

    pay = client.post(
        f"/me/checkout-intents/{intent_id}/pay",
        json={"idempotency_key": "pay-after-change", "return_url": "http://localhost/return"},
        headers=_headers(token),
    )
    assert pay.status_code == 409, pay.text
    assert pay.json()["detail"]["code"] == "price_changed"
    db.refresh(row)
    assert is_custom_terms_confirmed(row) is False


def test_custom_pack_partial_refund_uses_purchase_snapshot(client, db):
    from backend.services.refund_addon_partial import money_from_revoke_units

    # 838.92 × 2000 / 3450 → project round_money
    assert money_from_revoke_units(
        paid_amount="838.92", total_units=3450, revoke_units=2000
    ) == Decimal("486.33")

    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "refund-snap-1",
            "quantity": 3450,
        },
        headers=_headers(token),
    )
    assert created.status_code == 201
    intent = db.query(CheckoutIntent).filter(CheckoutIntent.id == created.json()["id"]).one()
    # Changing live tiers must not alter stored purchase snapshot.
    for tier in db.query(AddonPricingTier).filter(AddonPricingTier.resource_type == "messages"):
        tier.unit_price = Decimal("9.99")
        db.add(tier)
    db.commit()
    db.refresh(intent)
    assert intent.price_grid_snapshot["total"] == "838.92"
    assert Decimal(str(intent.amount)) == Decimal("838.92")
    # Re-quote would differ, but purchased snapshot stays.
    from backend.services.addon_pricing import quote_custom_messages

    fresh = quote_custom_messages(db, quantity=3450)
    assert fresh.total != Decimal("838.92")
    assert money_from_revoke_units(
        paid_amount=intent.amount,
        total_units=int(intent.product_units),
        revoke_units=2000,
    ) == Decimal("486.33")


def test_confirm_mismatch_rejected(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "confirm-mismatch",
            "quantity": 1000,
        },
        headers=_headers(token),
    )
    assert created.status_code == 201
    intent_id = created.json()["id"]
    bad = client.post(
        f"/me/checkout-intents/{intent_id}/confirm-addon-terms",
        json={
            "confirmed_amount": "1.00",
            "confirmed_currency": "RUB",
            "confirmed_quantity": 1000,
        },
        headers=_headers(token),
    )
    assert bad.status_code == 422
    assert bad.json()["detail"]["code"] == "confirmation_mismatch"


def test_fixed_addon_requires_terms_confirmation(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    pkg = AddonPackage(
        code="fixed_terms_pack",
        name_ru="Фикс 500",
        type=AddonPackageType.MESSAGES,
        amount=500,
        price=Decimal("149.00"),
        currency="RUB",
        duration_type="current_period",
        validity_days=30,
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": "fixed_terms_pack",
            "idempotency_key": "fixed-terms-1",
        },
        headers=_headers(token),
    )
    assert created.status_code == 201, created.text
    intent_id = created.json()["id"]
    snap = created.json().get("price_grid_snapshot") or {}
    assert snap.get("kind") == "fixed_addon"
    assert created.json().get("terms_confirmed") is False

    pay = client.post(
        f"/me/checkout-intents/{intent_id}/pay",
        json={"idempotency_key": "pay-fixed-no-confirm", "return_url": "http://localhost/r"},
        headers=_headers(token),
    )
    assert pay.status_code == 422
    assert pay.json()["detail"]["code"] == "terms_confirmation_required"

    conf = client.post(
        f"/me/checkout-intents/{intent_id}/confirm-addon-terms",
        json={
            "confirmed_amount": "149.00",
            "confirmed_currency": "RUB",
            "confirmed_quantity": 500,
        },
        headers=_headers(token),
    )
    assert conf.status_code == 200, conf.text
    assert conf.json()["terms_confirmed"] is True
    row = db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).one()
    assert row.price_grid_snapshot["terms_confirmation"]["quantity"] == 500
    assert row.price_grid_snapshot["terms_confirmation"]["product_code"] == "fixed_terms_pack"
    conf_snap = row.price_grid_snapshot["terms_confirmation"]
    for key in (
        "package_code",
        "title",
        "resource_type",
        "quantity",
        "total",
        "currency",
        "validity_days",
        "user_id",
        "checkout_intent_id",
        "confirmed_at",
        "refund_formula_version",
    ):
        assert key in conf_snap, key
    assert conf_snap["package_code"] == "fixed_terms_pack"
    assert conf_snap["title"]
    assert conf_snap["user_id"] == uid
    assert conf_snap["checkout_intent_id"] == intent_id
    base_snap = row.price_grid_snapshot
    for key in (
        "package_code",
        "title",
        "resource_type",
        "quantity",
        "total",
        "currency",
        "validity_days",
        "user_id",
        "checkout_intent_id",
        "refund_formula_version",
    ):
        assert key in base_snap, key
    assert base_snap["package_code"] == "fixed_terms_pack"
    assert base_snap["checkout_intent_id"] == intent_id


def test_fixed_addon_price_changed_clears_confirmation(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    pkg = AddonPackage(
        code="fixed_price_chg",
        name_ru="Фикс",
        type=AddonPackageType.MESSAGES,
        amount=100,
        price=Decimal("50.00"),
        currency="RUB",
        duration_type="current_period",
        validity_days=30,
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    created = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": "fixed_price_chg",
            "idempotency_key": "fixed-pch-1",
        },
        headers=_headers(token),
    )
    assert created.status_code == 201
    intent_id = created.json()["id"]
    conf = client.post(
        f"/me/checkout-intents/{intent_id}/confirm-addon-terms",
        json={
            "confirmed_amount": "50.00",
            "confirmed_currency": "RUB",
            "confirmed_quantity": 100,
        },
        headers=_headers(token),
    )
    assert conf.status_code == 200
    pkg.price = Decimal("77.00")
    db.add(pkg)
    db.commit()
    pay = client.post(
        f"/me/checkout-intents/{intent_id}/pay",
        json={"idempotency_key": "pay-fixed-pch", "return_url": "http://localhost/r"},
        headers=_headers(token),
    )
    assert pay.status_code == 409, pay.text
    assert pay.json()["detail"]["code"] == "price_changed"
    row = db.query(CheckoutIntent).filter(CheckoutIntent.id == intent_id).one()
    assert "terms_confirmation" not in (row.price_grid_snapshot or {})


def test_custom_messages_checkout_requires_quantity(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    _seed_message_tiers(db)
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "addon",
            "code": CUSTOM_MESSAGES_CODE,
            "idempotency_key": "no-qty-custom",
        },
        headers=_headers(token),
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "quantity_required"


def test_custom_quote_without_active_grid_fails(client, db):
    from backend.tests.addon_pricing_grid_seed import clear_pricing_grids

    token, uid = _auth(client)
    _activate(db, uid, "business")
    clear_pricing_grids(db, resource_type="messages")
    res = client.post(
        "/me/addons/custom-quote",
        json={"resource_type": "messages", "quantity": 100},
        headers=_headers(token),
    )
    assert res.status_code == 404
    detail = res.json().get("detail") or {}
    assert isinstance(detail, dict)
    assert detail.get("code") == "pricing_unavailable"


def test_archived_hidden_inactive_fixed_addon_blocked(client, db):
    token, uid = _auth(client)
    _activate(db, uid, "business")
    cases = [
        ("fix_arch", False, True),
        ("fix_hid", True, False),
        ("fix_both", False, False),
    ]
    for code, is_active, is_public in cases:
        db.add(
            AddonPackage(
                code=code,
                name_ru=code,
                type=AddonPackageType.MESSAGES,
                amount=100,
                price=Decimal("10.00"),
                currency="RUB",
                duration_type="current_period",
                is_active=is_active,
                is_public=is_public,
                sort_order=1,
            )
        )
    db.commit()
    for code, _a, _p in cases:
        res = client.post(
            "/me/checkout-intents",
            json={
                "product_type": "addon",
                "code": code,
                "idempotency_key": f"block-{code}",
            },
            headers=_headers(token),
        )
        assert res.status_code == 404, code
        assert res.json()["detail"]["code"] == "product_unavailable"


def test_ensure_custom_messages_package_idempotent(db):
    a = ensure_custom_messages_package(db)
    db.commit()
    b = ensure_custom_messages_package(db)
    db.commit()
    assert a.id == b.id
    assert a.code == CUSTOM_MESSAGES_CODE
    rows = db.query(AddonPackage).filter(AddonPackage.code == CUSTOM_MESSAGES_CODE).all()
    assert len(rows) == 1
