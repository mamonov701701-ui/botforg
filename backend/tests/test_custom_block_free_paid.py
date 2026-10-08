"""Free/Paid marketplace and Trust & Safety contract tests on the isolated test DB."""
from backend.models.custom_block_marketplace import (
    CustomBlockAccessGrant, CustomBlockDistributionGrant, CustomBlockLibraryInstall,
    CustomBlockMarketplaceListing, MarketplaceDispute, TrustSafetyAuditEvent, TrustSafetyEnforcement,
    TrustSafetyReport,
)
from backend.models.custom_block import CustomBlockVersion
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token
from backend.tests.test_custom_block_marketplace import _consumer_catalog_ids, _headers, _published_version
from backend.tests.test_custom_block_distribution import _market_publish, _scenario


def _create(client, author, version_id, mode, **extra):
    payload = {"commercial_mode": mode, "category": "other", "tags": [], **extra}
    return client.post(f"/custom-block-marketplace/versions/{version_id}/listing", json=payload,
                       headers=_headers(author))


def test_free_install_acquires_use_distribution_and_library_idempotently(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-free-contract")
    created = _create(client, author, version_id, "free")
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    assert version_id not in _consumer_catalog_ids(client, consumer)
    first = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    again = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    assert first.status_code == again.status_code == 200
    assert first.json()["grant_id"] == again.json()["grant_id"]
    assert version_id in _consumer_catalog_ids(client, consumer)
    with TestingSessionLocal() as db:
        user_id = get_user_id(client, consumer)
        assert db.query(CustomBlockAccessGrant).filter_by(recipient_user_id=user_id, custom_block_version_id=version_id).count() == 1
        assert db.query(CustomBlockLibraryInstall).filter_by(user_id=user_id, custom_block_version_id=version_id).count() == 1
        assert db.query(CustomBlockDistributionGrant).filter_by(user_id=user_id, custom_block_version_id=version_id, source="free_public").count() == 1


def test_paid_requires_fixed_price_and_never_auto_grants(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-paid-contract")
    assert _create(client, author, version_id, "paid").status_code == 422
    created = _create(client, author, version_id, "paid", price_amount="120.00", price_currency="RUB")
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    detail = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer))
    assert detail.status_code == 200 and detail.json()["commercial_mode"] == "paid"
    assert detail.json()["price_amount"] == 120.0
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 403
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockAccessGrant).count() == 0
        assert db.query(CustomBlockLibraryInstall).count() == 0


def test_direct_use_and_distribution_are_independent_without_listing(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-direct-contract")
    recipient = get_user_id(client, consumer)
    path = f"/custom-block-marketplace/versions/{version_id}"
    first = client.post(f"{path}/direct-grants", json={"recipient_user_id": recipient}, headers=_headers(author))
    repeat = client.post(f"{path}/direct-grants", json={"recipient_user_id": recipient}, headers=_headers(author))
    assert first.status_code == 201 and repeat.status_code == 200
    assert first.json()["id"] == repeat.json()["id"]
    assert version_id not in _consumer_catalog_ids(client, consumer)
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockMarketplaceListing).count() == 0
        assert db.query(CustomBlockDistributionGrant).count() == 0
    scenario_id = _scenario(client, consumer, version_id)
    assert _market_publish(client, consumer, scenario_id).status_code == 403
    install = client.post(f"{path}/install", headers=_headers(consumer))
    assert install.status_code == 200, install.text
    assert version_id in _consumer_catalog_ids(client, consumer)
    dist = client.post(f"{path}/distribution-grants", json={"recipient_user_id": recipient}, headers=_headers(author))
    assert dist.status_code == 201, dist.text
    assert _market_publish(client, consumer, scenario_id).status_code == 201


def test_paid_dispute_snapshots_offer_and_preserves_original_price(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-dispute-contract")
    created = _create(client, author, version_id, "paid", price_amount="125.00", price_currency="USD", title="Оригинал")
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    filed = client.post("/api/trust-safety/disputes", json={"listing_id": listing_id,
        "reason_code": "paid_no_access", "description": "Оплатил напрямую, но доступ не получен"}, headers=_headers(consumer))
    assert filed.status_code == 201, filed.text
    changed = client.put(f"/custom-block-marketplace/listings/{listing_id}", json={"commercial_mode": "free", "title": "Новое имя"}, headers=_headers(author))
    assert changed.status_code == 200, changed.text
    detail = client.get(f"/api/trust-safety/disputes/{filed.json()['id']}", headers=_headers(consumer))
    assert detail.status_code == 200
    assert detail.json()["price_amount"] == 125.0 and detail.json()["price_currency"] == "USD"
    assert detail.json()["listing_snapshot"]["title"] == "Оригинал"
    with TestingSessionLocal() as db:
        assert db.query(MarketplaceDispute).count() == 1


def test_enforcement_is_owner_only_and_audited(client):
    owner, target = register_and_get_token(client), register_and_get_token(client)
    owner_id, target_id = get_user_id(client, owner), get_user_id(client, target)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=owner_id).one().role = "owner"
        db.commit()
    payload = {"subject_type": "user", "subject_id": target_id, "action": "temporary_market_restriction",
               "reason": "Подтверждённое нарушение условий", "duration_days": 7}
    assert client.post("/api/trust-safety/admin/enforcements", json=payload, headers=_headers(target)).status_code == 403
    applied = client.post("/api/trust-safety/admin/enforcements", json=payload, headers=_headers(owner))
    assert applied.status_code == 201, applied.text
    with TestingSessionLocal() as db:
        assert db.query(TrustSafetyEnforcement).filter_by(actor_user_id=owner_id, user_id=target_id).count() == 1
        assert db.query(TrustSafetyAuditEvent).filter_by(actor_user_id=owner_id, event_type="enforcement_created").count() == 1
    version_id, _ = _published_version(client, target, "-restricted-user")
    assert _create(client, target, version_id, "free").status_code == 403
    overview = client.get(f"/api/trust-safety/admin/users/{target_id}/overview", headers=_headers(owner))
    assert overview.status_code == 200 and overview.json()["enforcements"][0]["actor_user_id"] == owner_id
    with TestingSessionLocal() as db:
        assert db.query(TrustSafetyAuditEvent).filter_by(actor_user_id=owner_id, event_type="user_overview_viewed").count() == 1


def test_market_restriction_blocks_publish_and_restore_without_erasing_acquired_rights(client):
    admin, author, consumer, recipient = (register_and_get_token(client) for _ in range(4))
    admin_id, author_id = get_user_id(client, admin), get_user_id(client, author)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    archived_version, _ = _published_version(client, author, "-restricted-restore")
    archived = _create(client, author, archived_version, "free")
    assert archived.status_code == 201, archived.text
    archived_id = archived.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/publish", headers=_headers(author)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/install", headers=_headers(consumer)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/archive", headers=_headers(author)).status_code == 200
    # Normal restore remains available before a Marketplace restriction.
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/restore", headers=_headers(author)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/archive", headers=_headers(author)).status_code == 200

    draft_version, _ = _published_version(client, author, "-restricted-draft")
    draft = _create(client, author, draft_version, "free")
    assert draft.status_code == 201, draft.text
    draft_id = draft.json()["id"]
    restriction = client.post("/api/trust-safety/admin/enforcements", json={
        "subject_type": "user", "subject_id": author_id, "action": "temporary_market_restriction",
        "reason": "Проверка размещений", "duration_days": 7,
    }, headers=_headers(admin))
    assert restriction.status_code == 201, restriction.text
    publish = client.post(f"/custom-block-marketplace/listings/{draft_id}/publish", headers=_headers(author))
    restore = client.post(f"/custom-block-marketplace/listings/{archived_id}/restore", headers=_headers(author))
    assert publish.status_code == restore.status_code == 403
    assert "ограничен" in restore.json()["detail"]
    # This is a Marketplace restriction, not a restriction on private Direct Grant.
    direct = client.post(f"/custom-block-marketplace/versions/{archived_version}/direct-grants",
                         json={"recipient_user_id": get_user_id(client, recipient)}, headers=_headers(author))
    assert direct.status_code == 201, direct.text
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockMarketplaceListing).filter_by(id=archived_id).one().lifecycle == "archived"
        assert db.query(CustomBlockMarketplaceListing).filter_by(id=draft_id).one().lifecycle == "draft"
        assert db.query(CustomBlockAccessGrant).filter_by(
            custom_block_version_id=archived_version, recipient_user_id=get_user_id(client, consumer)).count() == 1
        assert db.query(CustomBlockLibraryInstall).filter_by(
            custom_block_version_id=archived_version, user_id=get_user_id(client, consumer)).count() == 1
    assert client.post(f"/api/trust-safety/admin/enforcements/{restriction.json()['id']}/resolve",
                       headers=_headers(admin)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/restore", headers=_headers(author)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{draft_id}/publish", headers=_headers(author)).status_code == 200


def test_paid_listing_restore_respects_prohibit_paid_listings(client):
    admin, author = register_and_get_token(client), register_and_get_token(client)
    admin_id, author_id = get_user_id(client, admin), get_user_id(client, author)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    version_id, _ = _published_version(client, author, "-restricted-paid-restore")
    created = _create(client, author, version_id, "paid", price_amount="120.00", price_currency="RUB")
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/archive", headers=_headers(author)).status_code == 200
    restricted = client.post("/api/trust-safety/admin/enforcements", json={
        "subject_type": "user", "subject_id": author_id, "action": "prohibit_paid_listings",
        "reason": "Временный запрет платных размещений",
    }, headers=_headers(admin))
    assert restricted.status_code == 201, restricted.text
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/restore", headers=_headers(author)).status_code == 403
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockMarketplaceListing).filter_by(id=listing_id).one().lifecycle == "archived"
    assert client.post(f"/api/trust-safety/admin/enforcements/{restricted.json()['id']}/resolve",
                       headers=_headers(admin)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/restore", headers=_headers(author)).status_code == 200


def test_admin_user_detail_includes_real_marketplace_entities_and_is_audited(client):
    admin, author, buyer = register_and_get_token(client), register_and_get_token(client), register_and_get_token(client)
    admin_id, author_id, buyer_id = (get_user_id(client, token) for token in (admin, author, buyer))
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    version_id, _ = _published_version(client, author, "-admin-detail")
    created = _create(client, author, version_id, "paid", title="Проверяемый блок",
                      price_amount="120.00", price_currency="RUB")
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    disputed = client.post("/api/trust-safety/disputes", json={"listing_id": listing_id,
        "reason_code": "paid_no_access", "description": "Оплатил напрямую, доступ не получил"}, headers=_headers(buyer))
    assert disputed.status_code == 201, disputed.text
    warning = client.post("/api/trust-safety/admin/enforcements", json={"subject_type": "user",
        "subject_id": author_id, "action": "warning", "reason": "Проверка жалобы покупателя"}, headers=_headers(admin))
    assert warning.status_code == 201, warning.text
    with TestingSessionLocal() as db:
        db.add(TrustSafetyReport(reporter_user_id=buyer_id, subject_type="user", subject_id=author_id,
                                 reason_code="other", description="Проверка обращения", status="open"))
        db.query(CustomBlockVersion).filter_by(id=version_id).one().execution_spec = {
            "source": "SECRET_MARKER_DO_NOT_EXPOSE"
        }
        db.commit()
    route = f"/api/platform-admin/users/{author_id}/detailed"
    assert client.get(route, headers=_headers(buyer)).status_code == 403
    response = client.get(route, headers=_headers(admin))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["id"] == author_id and data["user"]["email"]
    assert data["custom_blocks"][0]["versions"][0]["id"] == version_id
    assert data["custom_blocks"][0]["versions"][0]["marketplace_lifecycle"] == "published"
    assert data["marketplace_listings"][0]["price_amount"] == 120.0
    assert data["disputes"][0]["id"] == disputed.json()["id"]
    assert data["enforcements"][0]["id"] == warning.json()["id"]
    assert len(data["reports"]) == 1
    assert "SECRET_MARKER_DO_NOT_EXPOSE" not in response.text
    with TestingSessionLocal() as db:
        assert db.query(TrustSafetyAuditEvent).filter_by(actor_user_id=admin_id,
            event_type="user_detail_viewed", subject_type="user", subject_id=author_id).count() == 1


def test_admin_user_detail_empty_and_legacy_listing_are_safe(client):
    admin, author = register_and_get_token(client), register_and_get_token(client)
    admin_id, author_id = get_user_id(client, admin), get_user_id(client, author)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    route = f"/api/platform-admin/users/{author_id}/detailed"
    assert client.get(route, headers=_headers(author)).status_code == 403
    empty = client.get(route, headers=_headers(admin))
    assert empty.status_code == 200, empty.text
    assert all(empty.json()[key] == [] for key in (
        "custom_blocks", "marketplace_listings", "reports", "disputes", "enforcements"
    ))
    assert client.get(f"/api/platform-admin/users/{author_id}/suspension", headers=_headers(admin)).status_code == 200
    assert client.get("/api/platform-admin/users", headers=_headers(admin)).status_code == 200

    version_id, _ = _published_version(client, author, "-legacy-admin-detail")
    created = _create(client, author, version_id, "free", title="Legacy QA listing")
    assert created.status_code == 201, created.text
    with TestingSessionLocal() as db:
        listing = db.query(CustomBlockMarketplaceListing).filter_by(id=created.json()["id"]).one()
        listing.commercial_mode = "external_terms"
        listing.access_policy = "explicit_grant"
        db.commit()
    legacy = client.get(route, headers=_headers(admin))
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["marketplace_listings"][0]["commercial_mode"] == "external_terms"
    assert legacy.json()["custom_blocks"][0]["versions"][0]["id"] == version_id
