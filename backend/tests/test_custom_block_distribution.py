"""Canonical Use Right vs exact-version Market Distribution Right."""
import pytest

from backend.models.custom_block_marketplace import (
    CustomBlockDistributionGrant, CustomBlockMarketDependency, CustomBlockMarketplaceListing,
)
from backend.models.market import MarketItem, MarketItemType, ModerationStatus
from backend.models.template import Template
from backend.models.scenario import Scenario
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, activate_test_subscription, create_test_bot, get_user_id, register_and_get_token
from backend.tests.test_custom_block_marketplace import _headers, _listing, _published_version


def _scenario(client, owner, version_id):
    with TestingSessionLocal() as db:
        scenario = Scenario(user_id=get_user_id(client, owner), name="Сценарий с блоком", status="published",
                            content={"nodes": [{"id": "cb", "data": {"customBlockVersionId": version_id}}], "edges": []})
        db.add(scenario)
        db.commit()
        return scenario.id


def _market_publish(client, seller, scenario_id):
    return client.post("/api/market/items", headers=_headers(seller), json={
        "item_type": "scenario", "source_scenario_id": scenario_id,
        "title": "Сценарий в Маркете", "price": 0, "is_published": True,
    })


def _listing_payload(**overrides):
    return {"commercial_mode": "free", "category": "other", "tags": [], **overrides}


def test_free_public_distribution_and_original_author_attribution_survive_archive(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-distribution-free")
    listing_id = _listing(client, author, version_id)
    installed = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(seller))
    assert installed.status_code == 200, installed.text
    scenario_id = _scenario(client, seller, version_id)
    published = _market_publish(client, seller, scenario_id)
    assert published.status_code == 201, published.text
    item_id = published.json()["id"]
    detail = client.get(f"/api/market/items/{item_id}", headers=_headers(seller))
    assert detail.status_code == 200, detail.text
    attribution = detail.json()["custom_block_attributions"]
    assert len(attribution) == 1
    assert attribution[0]["custom_block_version_id"] == version_id
    assert attribution[0]["title"] == "Блок Marketplace" and attribution[0]["version"] == 1
    assert attribution[0]["original_author_user_id"] == get_user_id(client, author)
    assert attribution[0]["original_author_name"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/archive", headers=_headers(author)).status_code == 200
    with TestingSessionLocal() as db:
        grant = db.query(CustomBlockDistributionGrant).filter_by(user_id=get_user_id(client, seller), custom_block_version_id=version_id).one()
        assert grant.source == "free_public" and grant.original_author_user_id == get_user_id(client, author)
        assert db.query(CustomBlockMarketDependency).filter_by(market_item_id=item_id).count() == 1
        assert db.query(MarketItem).filter_by(id=item_id).one().is_published is True
    # Archive ends new acquisition, not an already acquired distribution licence.
    assert _market_publish(client, seller, scenario_id).status_code == 201


def test_restricted_use_only_denied_then_author_distribution_passes_idempotently(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-distribution-restricted")
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing",
                          json=_listing_payload(commercial_mode="paid", price_amount="500.00", price_currency="RUB"),
                          headers=_headers(author))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    seller_id = get_user_id(client, seller)
    scenario_id = _scenario(client, seller, version_id)
    use = client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                      json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert use.status_code == 201, use.text
    denied = _market_publish(client, seller, scenario_id)
    assert denied.status_code == 403
    assert "распространение" in denied.json()["detail"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(seller)).status_code == 200
    assert _market_publish(client, seller, scenario_id).status_code == 403  # Library install is not a distribution licence.
    path = f"/custom-block-marketplace/versions/{version_id}/distribution-grants"
    first = client.post(path, json={"recipient_user_id": seller_id}, headers=_headers(author))
    again = client.post(path, json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["id"] == again.json()["id"]
    published = _market_publish(client, seller, scenario_id)
    assert published.status_code == 201, published.text
    assert client.post(f"/custom-block-marketplace/grants/{use.json()['id']}/revoke",
                       headers=_headers(author)).status_code == 200
    assert _market_publish(client, seller, scenario_id).status_code == 403
    with TestingSessionLocal() as db:
        assert db.query(MarketItem).filter_by(id=published.json()["id"]).one().is_published is True


def test_foreign_user_cannot_list_or_forge_author_and_source_is_private(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-ownership")
    listing_id = _listing(client, author, version_id)
    payload = _listing_payload(title="Подменённый автор")
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/listing", json=payload,
                       headers=_headers(consumer)).status_code == 403
    assert client.put(f"/custom-block-marketplace/listings/{listing_id}", json=payload,
                      headers=_headers(consumer)).status_code == 403
    detail = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer))
    assert detail.status_code == 200
    assert detail.json()["author"]["id"] == get_user_id(client, author)
    assert "execution_spec" not in detail.text and "private_hint" not in detail.text


@pytest.mark.parametrize("before,after,allowed", [
    ({"commercial_mode": "paid", "price_amount": "120.00", "price_currency": "RUB"}, {"commercial_mode": "free"}, True),
    ({"commercial_mode": "free"}, {"commercial_mode": "paid", "price_amount": "120.00", "price_currency": "RUB"}, False),
    ({"commercial_mode": "paid", "price_amount": "120.00", "price_currency": "RUB"}, {"commercial_mode": "paid", "price_amount": "150.00", "price_currency": "RUB"}, False),
])
def test_published_no_worsening_and_draft_is_flexible(client, before, after, allowed):
    author = register_and_get_token(client)
    version_id, _ = _published_version(client, author, f"-transition-{before}-{after}")
    original = _listing_payload(**before)
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing",
                          json=original, headers=_headers(author))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    changed = {**original, **after}
    if changed["commercial_mode"] == "free":
        changed.pop("price_amount", None)
        changed.pop("price_currency", None)
    assert client.put(f"/custom-block-marketplace/listings/{listing_id}", json=changed,
                      headers=_headers(author)).status_code == 200
    assert client.put(f"/custom-block-marketplace/listings/{listing_id}", json=original,
                      headers=_headers(author)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    updated = client.put(f"/custom-block-marketplace/listings/{listing_id}", json=changed, headers=_headers(author))
    assert updated.status_code == (200 if allowed else 409), updated.text
    with TestingSessionLocal() as db:
        row = db.query(CustomBlockMarketplaceListing).filter_by(id=listing_id).one()
        assert row.commercial_mode == (changed if allowed else original)["commercial_mode"]
        assert row.access_policy == ("self_install" if row.commercial_mode == "free" else "explicit_grant")


def test_distribution_requires_existing_use_right_and_cannot_be_issued_by_consumer(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-distribution-auth")
    _listing(client, author, version_id, access_policy="explicit_grant")
    path = f"/custom-block-marketplace/versions/{version_id}/distribution-grants"
    payload = {"recipient_user_id": get_user_id(client, seller)}
    assert client.post(path, json=payload, headers=_headers(author)).status_code == 409
    assert client.post(path, json=payload, headers=_headers(seller)).status_code == 403


def test_market_bot_template_validates_all_scenario_dependencies(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-market-template")
    listing_id = _listing(client, author, version_id, access_policy="explicit_grant")
    seller_id = get_user_id(client, seller)
    bot_id = create_test_bot(client, seller)
    with TestingSessionLocal() as db:
        activate_test_subscription(db, db.query(User).filter_by(id=seller_id).one(), "team")
        db.add(Scenario(user_id=seller_id, bot_id=bot_id, name="Внутренний сценарий",
                        content={"nodes": [{"data": {"customBlockVersionId": version_id}}], "edges": []}))
        db.commit()
    payload = {"item_type": "template", "source_bot_id": bot_id, "title": "Бот-шаблон", "price": 0, "is_published": True}
    use = client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                      json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert use.status_code == 201
    assert client.post("/api/market/items", json=payload, headers=_headers(seller)).status_code == 403
    dist = client.post(f"/custom-block-marketplace/versions/{version_id}/distribution-grants",
                       json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert dist.status_code == 201, dist.text
    published = client.post("/api/market/items", json=payload, headers=_headers(seller))
    assert published.status_code == 201, published.text
    assert client.get(f"/api/market/items/{published.json()['id']}", headers=_headers(seller)).json()["custom_block_attributions"][0]["original_author_user_id"] == get_user_id(client, author)


def test_legacy_template_publication_checks_foreign_dependency(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-legacy-template")
    listing_id = _listing(client, author, version_id, access_policy="explicit_grant")
    seller_id = get_user_id(client, seller)
    with TestingSessionLocal() as db:
        template = Template(user_id=seller_id, name="Шаблон", category="other", is_public=False,
                            content={"nodes": [{"data": {"customBlockVersionId": version_id}}], "edges": []})
        db.add(template)
        db.commit()
        template_id = template.id
    use = client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                      json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert use.status_code == 201
    assert client.patch(f"/templates/{template_id}/publish", json={"is_public": True}, headers=_headers(seller)).status_code == 403
    dist = client.post(f"/custom-block-marketplace/versions/{version_id}/distribution-grants",
                       json={"recipient_user_id": seller_id}, headers=_headers(author))
    assert dist.status_code == 201
    published = client.patch(f"/templates/{template_id}/publish", json={"is_public": True}, headers=_headers(seller))
    assert published.status_code == 200, published.text


def test_relaxation_to_free_public_preserves_existing_use_and_adds_distribution(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-relaxation")
    listing_id = _listing(client, author, version_id, access_policy="explicit_grant", visibility="public")
    seller_id = get_user_id(client, seller)
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                       json={"recipient_user_id": seller_id}, headers=_headers(author)).status_code == 201
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(seller)).status_code == 200
    scenario_id = _scenario(client, seller, version_id)
    assert _market_publish(client, seller, scenario_id).status_code == 403
    relaxed = client.put(f"/custom-block-marketplace/listings/{listing_id}",
                         json=_listing_payload(), headers=_headers(author))
    assert relaxed.status_code == 200, relaxed.text
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockDistributionGrant).filter_by(user_id=seller_id, custom_block_version_id=version_id).count() == 1
    assert _market_publish(client, seller, scenario_id).status_code == 201


def test_published_market_item_rejects_silent_new_source_dependency_at_install(client):
    author, seller = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-source-mutation")
    scenario_id = _scenario(client, seller, version_id)
    with TestingSessionLocal() as db:
        db.query(Scenario).filter_by(id=scenario_id).one().content = {"nodes": [], "edges": []}
        db.commit()
    published = _market_publish(client, seller, scenario_id)
    assert published.status_code == 201, published.text
    with TestingSessionLocal() as db:
        db.query(Scenario).filter_by(id=scenario_id).one().content = {
            "nodes": [{"data": {"customBlockVersionId": version_id}}], "edges": []}
        db.commit()
    installed = client.post(f"/api/market/items/{published.json()['id']}/install-scenario", headers=_headers(author))
    assert installed.status_code == 409


def test_moderation_approval_cannot_bypass_distribution_check(client):
    author, seller, moderator = (register_and_get_token(client) for _ in range(3))
    version_id, _ = _published_version(client, author, "-moderation")
    _listing(client, author, version_id, access_policy="explicit_grant")
    seller_id, moderator_id = get_user_id(client, seller), get_user_id(client, moderator)
    bot_id = create_test_bot(client, seller)
    with TestingSessionLocal() as db:
        activate_test_subscription(db, db.query(User).filter_by(id=seller_id).one(), "team")
        db.query(User).filter_by(id=moderator_id).one().role = "owner"
        db.add(Scenario(user_id=seller_id, bot_id=bot_id, name="Зависимость",
                        content={"nodes": [{"data": {"customBlockVersionId": version_id}}], "edges": []}))
        item = MarketItem(item_type=MarketItemType.TEMPLATE, source_bot_id=bot_id,
                          title="На модерации", price=0, seller_id=seller_id,
                          moderation_status=ModerationStatus.PENDING, is_published=False)
        db.add(item)
        db.commit()
        item_id = item.id
    path = f"/api/admin/market/templates/{item_id}/approve"
    denied = client.post(path, headers=_headers(moderator))
    assert denied.status_code == 403, denied.text
    with TestingSessionLocal() as db:
        assert db.query(MarketItem).filter_by(id=item_id).one().is_published is False
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                       json={"recipient_user_id": seller_id}, headers=_headers(author)).status_code == 201
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/distribution-grants",
                       json={"recipient_user_id": seller_id}, headers=_headers(author)).status_code == 201
    approved = client.post(path, headers=_headers(moderator))
    assert approved.status_code == 200, approved.text
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockMarketDependency).filter_by(market_item_id=item_id).count() == 1
