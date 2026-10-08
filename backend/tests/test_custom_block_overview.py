"""Owned and received Custom Block overview remains source-safe and user-scoped."""

from backend.models.custom_block import CustomBlockVersion
from backend.models.custom_block_marketplace import CustomBlockAccessGrant, CustomBlockMarketplaceListing
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token
from backend.tests.test_custom_block_marketplace import _headers, _published_version


def test_admin_and_user_overviews_separate_blocks_versions_and_rights(client):
    admin, author, marketplace_user, direct_user, stranger, direct_author, legacy_user, listed_direct_user = [register_and_get_token(client) for _ in range(8)]
    admin_id, author_id = get_user_id(client, admin), get_user_id(client, author)
    market_id, direct_id = get_user_id(client, marketplace_user), get_user_id(client, direct_user)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    version_id, _ = _published_version(client, author, "-overview")
    direct_version_id, _ = _published_version(client, direct_author, "-direct-overview")
    draft = client.post(f"/blocks/custom/{version_id}/versions", headers=_headers(author))
    assert draft.status_code == 201, draft.text
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing",
                          json={"commercial_mode": "paid", "price_amount": "120", "price_currency": "RUB"},
                          headers=_headers(author))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author)).status_code == 200
    market_grant = client.post(f"/custom-block-marketplace/versions/{version_id}/grants",
                               json={"recipient_user_id": market_id}, headers=_headers(author))
    direct_grant = client.post(f"/custom-block-marketplace/versions/{direct_version_id}/direct-grants",
                               json={"recipient_user_id": direct_id}, headers=_headers(direct_author))
    assert market_grant.status_code == direct_grant.status_code == 201
    repeated_market_right = client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                                        json={"recipient_user_id": market_id}, headers=_headers(author))
    assert repeated_market_right.status_code == 200
    assert repeated_market_right.json()["id"] == market_grant.json()["id"]
    listed_direct_id = get_user_id(client, listed_direct_user)
    listed_direct = client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                                json={"recipient_user_id": listed_direct_id}, headers=_headers(author))
    assert listed_direct.status_code == 201, listed_direct.text
    repeated_direct = client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                                  json={"recipient_user_id": listed_direct_id}, headers=_headers(author))
    assert repeated_direct.status_code == 200 and repeated_direct.json()["id"] == listed_direct.json()["id"]
    legacy_grant = client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                               json={"recipient_user_id": get_user_id(client, legacy_user)},
                               headers=_headers(author))
    assert legacy_grant.status_code == 201
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/install", headers=_headers(marketplace_user)).status_code == 200
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/distribution-grants",
                       json={"recipient_user_id": market_id}, headers=_headers(author)).status_code == 201
    assert client.post(f"/custom-block-marketplace/grants/{direct_grant.json()['id']}/revoke",
                       headers=_headers(direct_author)).status_code == 200
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockAccessGrant).filter_by(id=direct_grant.json()["id"]).one().grant_source == "direct_grant"
        assert db.query(CustomBlockAccessGrant).filter_by(id=listed_direct.json()["id"]).one().grant_source == "direct_grant"
        assert db.query(CustomBlockAccessGrant).filter_by(id=market_grant.json()["id"]).one().grant_source == "explicit_grant"
        db.query(CustomBlockAccessGrant).filter_by(id=legacy_grant.json()["id"]).one().grant_source = "legacy_unknown"
        db.query(CustomBlockMarketplaceListing).filter_by(id=listing_id).one().title = "Safe listing"
        db.query(CustomBlockVersion).filter_by(id=version_id).one().execution_spec = {
            "source": "OVERVIEW_PRIVATE_SOURCE_MARKER"
        }
        db.commit()

    author_detail = client.get(f"/api/platform-admin/users/{author_id}/detailed", headers=_headers(admin))
    assert author_detail.status_code == 200, author_detail.text
    summary = author_detail.json()["custom_block_summary"]
    assert summary["created_blocks"] == 1
    assert summary["published_versions"] == 1 and summary["draft_versions"] == 1
    assert summary["marketplace_listings"] == summary["paid_listings"] == 1
    assert next(row for row in author_detail.json()["custom_blocks"][0]["versions"] if row["id"] == version_id)["active_grants_count"] == 3
    assert author_detail.json()["marketplace_listings"][0]["active_grants_count"] == 3
    assert "execution_spec" not in author_detail.text and "OVERVIEW_PRIVATE_SOURCE_MARKER" not in author_detail.text

    for token, expected_channel, expected_status, installed, distribution, owner_id, commercial in (
        (marketplace_user, "marketplace", "active", True, True, author_id, "paid"),
        (direct_user, "direct", "revoked", False, False, get_user_id(client, direct_author), None),
        (listed_direct_user, "direct", "active", False, False, author_id, "paid"),
    ):
        user_id = get_user_id(client, token)
        assert client.get(f"/api/platform-admin/users/{user_id}/detailed", headers=_headers(token)).status_code == 403
        overview = client.get("/custom-block-marketplace/mine/rights-overview", headers=_headers(token))
        assert overview.status_code == 200, overview.text
        rows = overview.json()["items"]
        assert len(rows) == 1
        assert rows[0]["source_channel"] == expected_channel
        assert rows[0]["grant_status"] == expected_status
        assert rows[0]["is_installed"] is installed
        assert rows[0]["has_distribution_right"] is distribution
        assert rows[0]["original_author_user_id"] == owner_id
        assert rows[0]["current_commercial_mode"] == commercial
        assert "execution_spec" not in overview.text and "OVERVIEW_PRIVATE_SOURCE_MARKER" not in overview.text
        admin_received = client.get(f"/api/platform-admin/users/{user_id}/detailed", headers=_headers(admin))
        assert admin_received.status_code == 200, admin_received.text
        received_summary = admin_received.json()["custom_block_summary"]
        assert received_summary["received_marketplace" if expected_channel == "marketplace" else "received_direct"] == 1
        assert received_summary["active_rights" if expected_status == "active" else "revoked_rights"] == 1
        assert received_summary["library_installs"] == int(installed)
    assert client.get("/custom-block-marketplace/mine/rights-overview", headers=_headers(stranger)).json()["items"] == []
    ambiguous = client.get("/custom-block-marketplace/mine/rights-overview", headers=_headers(legacy_user))
    assert ambiguous.json()["items"][0]["source_channel"] == "unknown"
    admin_ambiguous = client.get(f"/api/platform-admin/users/{get_user_id(client, legacy_user)}/detailed",
                                 headers=_headers(admin))
    assert admin_ambiguous.json()["custom_block_summary"]["received_unverified"] == 1
    with TestingSessionLocal() as db:
        db.query(CustomBlockAccessGrant).filter_by(id=legacy_grant.json()["id"]).one().grant_source = "direct"
        db.commit()
    assert client.get("/custom-block-marketplace/mine/rights-overview",
                      headers=_headers(legacy_user)).json()["items"][0]["source_channel"] == "direct"
    renewed = client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                          json={"recipient_user_id": get_user_id(client, legacy_user)}, headers=_headers(author))
    assert renewed.status_code == 200 and renewed.json()["id"] == legacy_grant.json()["id"]
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockAccessGrant).filter_by(id=legacy_grant.json()["id"]).one().grant_source == "direct_grant"


def test_free_listing_is_draft_until_explicit_publication(client):
    author, consumer = register_and_get_token(client), register_and_get_token(client)
    version_id, _ = _published_version(client, author, "-draft-flow")
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing",
                          json={"commercial_mode": "free", "category": "other"}, headers=_headers(author))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert created.json()["lifecycle"] == "draft"
    mine = client.get("/custom-block-marketplace/mine/listings", headers=_headers(author))
    assert mine.status_code == 200
    assert next(row for row in mine.json() if row["id"] == listing_id)["lifecycle"] == "draft"
    discovery = client.get("/custom-block-marketplace/listings", headers=_headers(consumer))
    assert listing_id not in {row["id"] for row in discovery.json()["items"]}
    published = client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(author))
    assert published.status_code == 200 and published.json()["lifecycle"] == "published"
    mine_after = client.get("/custom-block-marketplace/mine/listings", headers=_headers(author))
    assert next(row for row in mine_after.json() if row["id"] == listing_id)["lifecycle"] == "published"
    discovery_after = client.get("/custom-block-marketplace/listings", headers=_headers(consumer))
    assert listing_id in {row["id"] for row in discovery_after.json()["items"]}
