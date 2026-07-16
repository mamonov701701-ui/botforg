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
    auth, _ = _auth(client)
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
