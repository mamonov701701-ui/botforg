"""
Тесты checkout intent foundation (Этап 6.5).
"""
from decimal import Decimal

import pytest

from backend.models.checkout import CheckoutIntent
from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    UserAddon,
    UserSubscription,
)
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)


def _ensure_addon(
    db,
    *,
    code: str = "msg_1000",
    amount: int = 1000,
    price: str = "190.00",
    is_active: bool = True,
    is_public: bool = True,
) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        pkg.amount = amount
        pkg.price = Decimal(price)
        pkg.is_active = is_active
        pkg.is_public = is_public
        db.commit()
        db.refresh(pkg)
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=f"+{amount} сообщений",
        type=AddonPackageType.MESSAGES,
        amount=amount,
        price=Decimal(price),
        currency="RUB",
        duration_type="current_period",
        is_active=is_active,
        is_public=is_public,
        sort_order=10,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _auth(client) -> tuple[str, int]:
    auth = register_and_get_token(client)
    return auth, get_user_id(client, auth)


def _create(client, auth, **body):
    payload = {
        "product_type": "tariff",
        "code": "business",
        "idempotency_key": "key-1",
    }
    payload.update(body)
    return client.post(
        "/me/checkout-intents",
        json=payload,
        headers={"Authorization": auth},
    )


def test_create_tariff_intent_uses_server_price(client, db):
    auth, uid = _auth(client)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    expected = Decimal(str(plan.price_month))

    res = _create(
        client,
        auth,
        product_type="tariff",
        code="business",
        idempotency_key="tariff-biz-1",
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["product_type"] == "tariff"
    assert data["product_code"] == "business"
    assert data["status"] == "pending"
    assert Decimal(str(data["amount"])) == expected
    assert data["currency"] == (plan.currency or "RUB")
    assert data["product_name"]
    assert data["idempotency_key"] == "tariff-biz-1"

    row = db.query(CheckoutIntent).filter(CheckoutIntent.id == data["id"]).one()
    assert row.user_id == uid
    assert Decimal(str(row.amount)) == expected


def test_create_addon_intent_uses_server_price(client, db):
    auth, uid = _auth(client)
    _activate_subscription(db, uid, "business")
    pkg = _ensure_addon(db, code="msg_1000", price="190.00")

    res = _create(
        client,
        auth,
        product_type="addon",
        code="msg_1000",
        idempotency_key="addon-msg-1",
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["product_type"] == "addon"
    assert data["product_code"] == "msg_1000"
    assert Decimal(str(data["amount"])) == Decimal(str(pkg.price))
    assert data["currency"] == pkg.currency
    assert data["status"] == "pending"


def test_client_cannot_override_price(client, db):
    auth, _ = _auth(client)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "tariff",
            "code": "business",
            "idempotency_key": "no-price-override",
            "amount": "1.00",
            "price": "1.00",
            "currency": "USD",
        },
        headers={"Authorization": auth},
    )
    assert res.status_code == 201
    data = res.json()
    assert Decimal(str(data["amount"])) == Decimal(str(plan.price_month))
    assert data["currency"] != "USD" or plan.currency == "USD"
    assert data["currency"] == (plan.currency or "RUB")


def test_hidden_or_inactive_product_rejected(client, db):
    auth, _ = _auth(client)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    plan.is_public = False
    db.commit()

    res = _create(
        client,
        auth,
        code="business",
        idempotency_key="hidden-plan",
    )
    assert res.status_code == 404
    plan.is_public = True
    db.commit()

    pkg = _ensure_addon(db, code="chk_inactive", is_active=False, is_public=True)
    res = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key="inactive-addon",
    )
    assert res.status_code == 404


def test_unknown_code_and_invalid_type(client, db):
    auth, _ = _auth(client)
    res = _create(
        client,
        auth,
        code="no_such_plan",
        idempotency_key="bad-code",
    )
    assert res.status_code == 404

    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "gift",
            "code": "business",
            "idempotency_key": "bad-type",
        },
        headers={"Authorization": auth},
    )
    assert res.status_code == 422


def test_idempotency_returns_same_intent(client, db):
    auth, _ = _auth(client)
    r1 = _create(client, auth, idempotency_key="same-key")
    r2 = _create(client, auth, idempotency_key="same-key")
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    assert (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.idempotency_key == "same-key")
        .count()
        == 1
    )


def test_create_intent_does_not_grant_entitlements(client, db):
    auth, uid = _auth(client)
    res = _create(client, auth, idempotency_key="no-entitle")
    assert res.status_code == 201

    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == uid).count()
        == 0
    )
    assert db.query(UserAddon).filter(UserAddon.user_id == uid).count() == 0
    assert (
        db.query(GiftGrant).filter(GiftGrant.target_user_id == uid).count() == 0
    )


def test_user_can_read_own_intent_only(client, db):
    auth_a, _ = _auth(client)
    auth_b, _ = _auth(client)

    created = _create(client, auth_a, idempotency_key="own-only")
    intent_id = created.json()["id"]

    own = client.get(
        f"/me/checkout-intents/{intent_id}",
        headers={"Authorization": auth_a},
    )
    assert own.status_code == 200
    assert own.json()["id"] == intent_id

    foreign = client.get(
        f"/me/checkout-intents/{intent_id}",
        headers={"Authorization": auth_b},
    )
    assert foreign.status_code == 404


def test_unauthenticated_forbidden(client):
    res = client.post(
        "/me/checkout-intents",
        json={
            "product_type": "tariff",
            "code": "business",
            "idempotency_key": "anon",
        },
    )
    assert res.status_code in (401, 403)


def _activate_subscription(db, user_id: int, plan_code: str) -> UserSubscription:
    from datetime import datetime, timedelta, timezone

    from backend.models.tariff import SubscriptionStatus

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


def test_create_blocks_current_effective_tariff(client, db):
    auth, uid = _auth(client)
    _activate_subscription(db, uid, "business")

    before = db.query(CheckoutIntent).filter(CheckoutIntent.user_id == uid).count()
    res = _create(
        client,
        auth,
        product_type="tariff",
        code="business",
        idempotency_key="block-current-biz",
    )
    assert res.status_code == 409, res.text
    body = res.json()
    detail = body.get("detail") or body
    assert detail.get("code") == "current_tariff_already_active"
    assert (
        db.query(CheckoutIntent).filter(CheckoutIntent.user_id == uid).count() == before
    )


def test_create_allows_other_tariff_when_business_active(client, db):
    auth, uid = _auth(client)
    _activate_subscription(db, uid, "business")
    plan = db.query(Plan).filter(Plan.code == "business_pro").one()
    assert plan.price_month is not None

    res = _create(
        client,
        auth,
        product_type="tariff",
        code="business_pro",
        idempotency_key="allow-upgrade-pro",
    )
    assert res.status_code == 201, res.text
    assert res.json()["product_code"] == "business_pro"


def test_create_blocks_by_effective_sub_not_legacy_plan_code(client, db):
    from backend.models.user import User

    auth, uid = _auth(client)
    user = db.query(User).filter(User.id == uid).one()
    user.plan_code = "pro"
    db.commit()
    _activate_subscription(db, uid, "business")

    res = _create(
        client,
        auth,
        product_type="tariff",
        code="business",
        idempotency_key="legacy-pro-effective-biz",
    )
    assert res.status_code == 409, res.text
    detail = res.json().get("detail") or res.json()
    assert detail.get("code") == "current_tariff_already_active"

    # Legacy plan_code alone must not block a different catalog code.
    res_pro = _create(
        client,
        auth,
        product_type="tariff",
        code="business_pro",
        idempotency_key="legacy-pro-allow-pro-upgrade",
    )
    assert res_pro.status_code == 201, res_pro.text


def test_addon_create_not_blocked_by_current_tariff_guard(client, db):
    auth, uid = _auth(client)
    _activate_subscription(db, uid, "business")
    pkg = _ensure_addon(db, code="msg_1000", price="190.00")

    res = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key="addon-ok-with-biz",
    )
    assert res.status_code == 201, res.text
    assert res.json()["product_type"] == "addon"


def test_addon_create_blocked_for_effective_start(client, db):
    auth, uid = _auth(client)
    # No paid subscription → effective start / fallback → addon_purchase=false
    before = db.query(CheckoutIntent).filter(CheckoutIntent.user_id == uid).count()
    pkg = _ensure_addon(db, code="msg_1000", price="190.00")
    res = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key="addon-block-start",
    )
    assert res.status_code == 403, res.text
    detail = res.json().get("detail") or res.json()
    assert detail.get("code") == "addon_not_available_for_current_tariff"
    assert (
        db.query(CheckoutIntent).filter(CheckoutIntent.user_id == uid).count() == before
    )


@pytest.mark.parametrize("plan_code", ["business", "business_pro", "team", "corporate"])
def test_addon_create_allowed_for_paid_plans(client, db, plan_code):
    auth, uid = _auth(client)
    _activate_subscription(db, uid, plan_code)
    pkg = _ensure_addon(db, code="msg_1000", price="190.00")
    res = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key=f"addon-ok-{plan_code}",
    )
    assert res.status_code == 201, res.text


def test_addon_create_uses_effective_plan_not_legacy_plan_code(client, db):
    from backend.models.user import User

    auth, uid = _auth(client)
    user = db.query(User).filter(User.id == uid).one()
    pkg = _ensure_addon(db, code="msg_1000", price="190.00")

    # Stale plan_code=business, but effective subscription=start → blocked.
    user.plan_code = "business"
    db.commit()
    _activate_subscription(db, uid, "start")
    res = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key="addon-legacy-biz-effective-start",
    )
    assert res.status_code == 403, res.text
    detail = res.json().get("detail") or res.json()
    assert detail.get("code") == "addon_not_available_for_current_tariff"

    # Stale plan_code=start, effective subscription=business → allowed.
    user.plan_code = "start"
    db.commit()
    from backend.models.tariff import SubscriptionStatus

    db.query(UserSubscription).filter(UserSubscription.user_id == uid).update(
        {"status": SubscriptionStatus.CANCELLED}
    )
    db.commit()
    _activate_subscription(db, uid, "business")
    res_ok = _create(
        client,
        auth,
        product_type="addon",
        code=pkg.code,
        idempotency_key="addon-legacy-start-effective-biz",
    )
    assert res_ok.status_code == 201, res_ok.text
