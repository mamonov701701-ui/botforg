from datetime import datetime, timezone

import pytest

from backend.models.custom_block import CUSTOM_BLOCK_PUBLISHED, CUSTOM_BLOCK_REVIEW_APPROVED, CustomBlock, CustomBlockVersion
from backend.models.chat import ChatMessage, ChatParticipant, ChatRoom, ChatRoomType
from backend.models.custom_block_marketplace import CustomBlockAccessGrant, CustomBlockLibraryInstall, CustomBlockMarketplaceListing
from backend.services.chat_room_service import get_or_create_private_room
from backend.services.custom_block_execution.service import ControlledExecutionFailure, resolve_authorized_version
from backend.services.custom_block_marketplace import resolve_custom_block_effective_rights
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _headers(token):
    return {"Authorization": token}


def _consumer_catalog_ids(client, token):
    response = client.get("/blocks?role=owner&plan=enterprise", headers=_headers(token))
    assert response.status_code == 200, response.text
    return {row.get("blockVersionId") for row in response.json()}


def _published_version(client, owner_token, suffix=""):
    owner_id = get_user_id(client, owner_token)
    db = TestingSessionLocal()
    try:
        block = CustomBlock(stable_key=f"marketplace-test-{owner_id}{suffix}", owner_user_id=owner_id, created_by_user_id=owner_id)
        db.add(block)
        db.flush()
        version = CustomBlockVersion(
            custom_block_id=block.id, version=1, status=CUSTOM_BLOCK_PUBLISHED,
            title="Блок Marketplace", description="Безопасное описание", category="custom",
            passport={"inputs": [], "outputs": [], "internal_code": "private_hint"}, user_guide={"content": "Инструкция"},
            runtime_kind="javascript", runtime_definition={"kind": "javascript"},
            execution_spec={"source": "function run(envelope) { return { outputs: {}, logs: [] }; }"},
            execution_artifact_hash="a" * 64, execution_state="enabled",
            review_state=CUSTOM_BLOCK_REVIEW_APPROVED, published_at=datetime.now(timezone.utc),
        )
        db.add(version)
        db.commit()
        return version.id, block.stable_key
    finally:
        db.close()


def _listing(client, owner_token, version_id, access_policy="self_install", commercial_mode="free", visibility="public"):
    if (access_policy, commercial_mode, visibility) != ("self_install", "free", "public"):
        # Historical QA records remain readable, but the new API cannot create legacy policies.
        with TestingSessionLocal() as db:
            listing = CustomBlockMarketplaceListing(
                custom_block_version_id=version_id, lifecycle="published", visibility=visibility,
                access_policy=access_policy, commercial_mode=commercial_mode,
                category="other", tags=["test"], published_at=datetime.now(timezone.utc),
            )
            db.add(listing)
            db.commit()
            return listing.id
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing", json={"commercial_mode": "free", "tags": ["test"]}, headers=_headers(owner_token))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    published = client.post(f"/custom-block-marketplace/listings/{listing_id}/publish", headers=_headers(owner_token))
    assert published.status_code == 200, published.text
    return listing_id


def test_discovery_shows_current_free_paid_and_hides_incompatible_legacy_private_or_archived(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    free_version, _ = _published_version(client, owner, "-discovery-free")
    free_id = _listing(client, owner, free_version)
    paid_version, _ = _published_version(client, owner, "-discovery-paid")
    paid = client.post(f"/custom-block-marketplace/versions/{paid_version}/listing",
                       json={"commercial_mode": "paid", "price_amount": "120.00", "price_currency": "RUB"},
                       headers=_headers(owner))
    assert paid.status_code == 201, paid.text
    paid_id = paid.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{paid_id}/publish", headers=_headers(owner)).status_code == 200
    legacy_ids = []
    for policy in ("author_approval", "explicit_grant"):
        version_id, _ = _published_version(client, owner, f"-legacy-{policy}")
        legacy_ids.append(_listing(client, owner, version_id, policy))
    private_version, _ = _published_version(client, owner, "-private")
    private_id = _listing(client, owner, private_version, visibility="private")
    archived_version, _ = _published_version(client, owner, "-archived")
    archived_id = _listing(client, owner, archived_version)
    assert client.post(f"/custom-block-marketplace/listings/{archived_id}/archive", headers=_headers(owner)).status_code == 200

    with TestingSessionLocal() as db:
        rows = db.query(CustomBlockMarketplaceListing).filter(
            CustomBlockMarketplaceListing.id.in_([free_id, paid_id, *legacy_ids, private_id, archived_id])
        ).all()
        by_id = {row.id: row for row in rows}
        assert all(by_id[listing_id].lifecycle == "published" and by_id[listing_id].visibility == "public" for listing_id in [free_id, paid_id, *legacy_ids])
        assert by_id[private_id].lifecycle == "published" and by_id[private_id].visibility == "private"
        assert by_id[archived_id].lifecycle == "archived" and by_id[archived_id].visibility == "public"
        assert db.query(CustomBlockAccessGrant).count() == 0

    response = client.get("/custom-block-marketplace/listings", headers=_headers(consumer))
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert response.json()["total"] == 2
    assert {item["id"] for item in items} == {free_id, paid_id}
    assert {item["commercial_mode"] for item in items} == {"free", "paid"}
    assert all(item["author"]["name"] for item in items)
    assert all(item["block_title"] == "Блок Marketplace" for item in items)
    assert all(item["access"]["has_active_grant"] is False for item in items)
    assert all(item["access"]["can_view_listing"] is True for item in items)
    assert all("execution_spec" not in item for item in items)
    category_response = client.get(
        "/custom-block-marketplace/listings?category=other",
        headers=_headers(consumer),
    )
    assert category_response.status_code == 200
    assert {item["id"] for item in category_response.json()["items"]} == {free_id, paid_id}
    mine = client.get("/custom-block-marketplace/mine/listings", headers=_headers(owner))
    assert mine.status_code == 200
    assert set(legacy_ids).issubset({item["id"] for item in mine.json()})


def test_eligible_version_picker_excludes_other_owners_unapproved_and_already_listed(client):
    owner = register_and_get_token(client)
    other = register_and_get_token(client)
    eligible_id, _ = _published_version(client, owner, "-eligible")
    listed_id, _ = _published_version(client, owner, "-listed")
    unapproved_id, _ = _published_version(client, owner, "-unapproved")
    other_id, _ = _published_version(client, other, "-other")
    _listing(client, owner, listed_id)
    with TestingSessionLocal() as db:
        db.query(CustomBlockVersion).filter_by(id=unapproved_id).one().review_state = "pending"
        db.commit()
    response = client.get("/custom-block-marketplace/mine/eligible-versions", headers=_headers(owner))
    assert response.status_code == 200
    assert {item["id"] for item in response.json()} == {eligible_id}
    assert listed_id not in {item["id"] for item in response.json()}
    assert unapproved_id not in {item["id"] for item in response.json()}
    assert other_id not in {item["id"] for item in response.json()}


@pytest.mark.parametrize('mode,expected_policy', [('free', 'self_install'), ('paid', 'explicit_grant')])
def test_update_listing_mode_survives_commit_and_fresh_get(client, mode, expected_policy):
    owner = register_and_get_token(client)
    version_id, _ = _published_version(client, owner)
    payload = {
        'title': 'Тест Marketplace — ручной доступ', 'description': 'Сохранить описание',
        'commercial_mode': 'paid', 'price_amount': '1200.00', 'price_currency': 'RUB',
        'category': 'automation', 'tags': ['test'],
    }
    created = client.post(f'/custom-block-marketplace/versions/{version_id}/listing', json=payload, headers=_headers(owner))
    assert created.status_code == 201, created.text
    listing_id = created.json()['id']
    payload['commercial_mode'] = mode
    if mode == 'free':
        payload.pop('price_amount')
        payload.pop('price_currency')
    updated = client.put(f'/custom-block-marketplace/listings/{listing_id}', json=payload, headers=_headers(owner))
    assert updated.status_code == 200, updated.text
    with TestingSessionLocal() as db:
        persisted = db.query(CustomBlockMarketplaceListing).filter_by(id=listing_id).one()
        assert persisted.commercial_mode == mode
        assert persisted.access_policy == expected_policy
        assert persisted.visibility == 'public'
        assert persisted.custom_block_version_id == version_id
    detail = client.get(f'/custom-block-marketplace/listings/{listing_id}', headers=_headers(owner))
    mine = client.get('/custom-block-marketplace/mine/listings', headers=_headers(owner))
    assert detail.status_code == mine.status_code == 200
    row = next(item for item in mine.json() if item['id'] == listing_id)
    for response in (updated.json(), detail.json(), row):
        assert response['commercial_mode'] == mode
        assert response['access_policy'] == expected_policy
        assert response['visibility'] == 'public'


def test_published_listing_metadata_update_keeps_existing_grant_and_version_immutable(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner, "-published-edit")
    listing_id = _listing(client, owner, version_id, access_policy="self_install")

    installed = client.post(
        f"/custom-block-marketplace/listings/{listing_id}/install",
        headers=_headers(consumer),
    )
    assert installed.status_code == 200, installed.text

    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=version_id).one()
        immutable_before = (
            version.execution_artifact_hash,
            version.execution_spec,
            version.runtime_definition,
            version.passport,
        )

    payload = {
        "title": "Новое название карточки",
        "description": "Изменены только данные размещения",
        "visibility": "public",
        "access_policy": "self_install",
        "commercial_mode": "free",
        "category": "other",
        "tags": ["updated"],
    }
    updated = client.put(
        f"/custom-block-marketplace/listings/{listing_id}",
        json=payload,
        headers=_headers(owner),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["lifecycle"] == "published"
    assert updated.json()["access_policy"] == "self_install"

    with TestingSessionLocal() as db:
        grant = db.query(CustomBlockAccessGrant).filter_by(
            id=installed.json()["grant_id"]
        ).one()
        assert grant.status == "active"
        version = db.query(CustomBlockVersion).filter_by(id=version_id).one()
        assert (
            version.execution_artifact_hash,
            version.execution_spec,
            version.runtime_definition,
            version.passport,
        ) == immutable_before


def test_marketplace_listing_is_source_safe_and_self_install_is_exact_version(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id)

    detail = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer))
    assert detail.status_code == 200
    assert "execution_spec" not in detail.json()
    assert "source" not in str(detail.json())
    assert "internal_code" not in detail.json()["passport"]

    installed = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    assert installed.status_code == 200
    repeated = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    assert repeated.status_code == 200
    assert repeated.json()["already_exists"] is True

    catalog = client.get("/blocks?role=owner&plan=enterprise", headers=_headers(consumer))
    assert catalog.status_code == 200
    item = next(row for row in catalog.json() if row.get("blockVersionId") == version_id)
    assert item["stableBlockId"]
    assert item["category"] == "custom"
    assert item["accessSource"] == "marketplace"
    assert item["authorName"]
    assert item["blockVersionId"] == version_id
    assert "internal_code" not in item.get("passport", {})


def test_private_legacy_listing_cannot_be_acquired_by_guessing_its_id(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner, "-private-guess")
    listing_id = _listing(client, owner, version_id, visibility="private")

    assert client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer)).status_code == 404
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 403
    approval_version, _ = _published_version(client, owner, "-private-approval")
    approval_id = _listing(client, owner, approval_version, access_policy="author_approval", visibility="private")
    assert client.post(f"/custom-block-marketplace/listings/{approval_id}/access-requests",
                       json={"message": "Хочу доступ"}, headers=_headers(consumer)).status_code == 403
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version_id).count() == 0


def test_legacy_passport_extra_implementation_fields_never_reach_consumer(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner, "-legacy-source")
    listing_id = _listing(client, owner, version_id)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=version_id).one()
        version.passport = {**version.passport, "source": "PRIVATE_SOURCE_MARKER", "execution_spec": {"source": "PRIVATE_SOURCE_MARKER"}}
        db.commit()

    detail = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer))
    assert detail.status_code == 200
    assert "PRIVATE_SOURCE_MARKER" not in detail.text
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 200
    catalog = client.get("/blocks?role=owner&plan=enterprise", headers=_headers(consumer))
    assert catalog.status_code == 200
    assert "PRIVATE_SOURCE_MARKER" not in str(next(row for row in catalog.json() if row.get("blockVersionId") == version_id))


def test_self_install_persists_separate_idempotent_library_choice(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id)
    assert version_id not in _consumer_catalog_ids(client, consumer)
    before = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer)).json()
    assert before["access"]["has_active_grant"] is False
    assert before["access"]["is_installed"] is False

    first = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    second = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    assert first.status_code == second.status_code == 200
    assert first.json()["already_exists"] is False
    assert second.json()["already_exists"] is True
    assert first.json()["grant_id"] == second.json()["grant_id"]
    with TestingSessionLocal() as db:
        consumer_id = get_user_id(client, consumer)
        assert db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version_id, recipient_user_id=consumer_id).count() == 1
        assert db.query(CustomBlockLibraryInstall).filter_by(custom_block_version_id=version_id, user_id=consumer_id).count() == 1
    assert version_id in _consumer_catalog_ids(client, consumer)
    after = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer)).json()
    assert after["access"]["is_installed"] is True
    assert after["access"]["can_add_new_node"] is True


def test_approval_grant_does_not_install_until_consumer_acts(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, stable_key = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id, "author_approval")
    requested = client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={"message": "Нужен доступ"}, headers=_headers(consumer))
    assert requested.status_code == 201
    pending = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer)).json()
    assert pending["access"]["request_state"] == "pending"
    assert pending["access"]["chat_room_id"] == requested.json()["chat_room_id"]
    approved = client.post(f"/custom-block-marketplace/access-requests/{requested.json()['id']}/approve", json={}, headers=_headers(owner))
    assert approved.status_code == 200
    granted = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer)).json()
    assert granted["access"]["has_active_grant"] is True
    assert granted["access"]["is_installed"] is False
    assert granted["access"]["can_add_new_node"] is False
    assert version_id not in _consumer_catalog_ids(client, consumer)
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockLibraryInstall).count() == 0
        consumer_id = get_user_id(client, consumer)
        version = db.query(CustomBlockVersion).filter_by(id=version_id).one()
        from backend.models.user import User
        actor = db.query(User).filter_by(id=consumer_id).one()
        assert resolve_custom_block_effective_rights(db, user=actor, version=version).can_add_new_node is False
        with pytest.raises(ControlledExecutionFailure) as denied:
            resolve_authorized_version(db, scenario_owner_id=consumer_id, version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=False)
        assert denied.value.category == "authorization_error"
    installed = client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer))
    assert installed.status_code == 200
    assert installed.json()["grant_id"] == approved.json()["grant_id"]
    assert version_id in _consumer_catalog_ids(client, consumer)
    with TestingSessionLocal() as db:
        assert resolve_authorized_version(db, scenario_owner_id=get_user_id(client, consumer), version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=False).id == version_id


def test_explicit_grant_contact_reuses_chat_and_requires_separate_install(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id, "explicit_grant")
    first = client.post(f"/custom-block-marketplace/listings/{listing_id}/contact", json={"message": "Обсудим доступ"}, headers=_headers(consumer))
    second = client.post(f"/custom-block-marketplace/listings/{listing_id}/contact", json={}, headers=_headers(consumer))
    assert first.status_code == second.status_code == 200
    assert first.json()["chat_room_id"] == second.json()["chat_room_id"]
    with TestingSessionLocal() as db:
        assert db.query(ChatRoom).filter_by(id=first.json()["chat_room_id"]).count() == 1
        assert db.query(ChatMessage).filter_by(room_id=first.json()["chat_room_id"], content="Обсудим доступ").count() == 1
        assert db.query(CustomBlockAccessGrant).count() == 0
        assert db.query(CustomBlockLibraryInstall).count() == 0
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 403
    with TestingSessionLocal() as db:
        from backend.models.user import User
        consumer_id = get_user_id(client, consumer)
        public_id = db.query(User).filter_by(id=consumer_id).one().public_id
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/grants", json={"recipient_public_id": 999999999}, headers=_headers(owner)).status_code == 404
    granted = client.post(f"/custom-block-marketplace/versions/{version_id}/grants", json={"recipient_public_id": public_id}, headers=_headers(owner))
    assert granted.status_code == 201
    repeated = client.post(f"/custom-block-marketplace/versions/{version_id}/grants", json={"recipient_user_id": consumer_id}, headers=_headers(owner))
    assert repeated.status_code == 200 and repeated.json()["id"] == granted.json()["id"]
    assert version_id not in _consumer_catalog_ids(client, consumer)
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 200
    assert version_id in _consumer_catalog_ids(client, consumer)
    revoked = client.post(f"/custom-block-marketplace/grants/{granted.json()['id']}/revoke", headers=_headers(owner))
    assert revoked.status_code == 200
    assert version_id not in _consumer_catalog_ids(client, consumer)
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 403


def test_archive_keeps_grant_and_existing_runtime_but_denies_new_install(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    newcomer = register_and_get_token(client)
    version_id, stable_key = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id)
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(consumer)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/archive", headers=_headers(owner)).status_code == 200
    assert version_id in _consumer_catalog_ids(client, consumer)
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/install", headers=_headers(newcomer)).status_code == 403
    with TestingSessionLocal() as db:
        consumer_id = get_user_id(client, consumer)
        assert resolve_authorized_version(db, scenario_owner_id=consumer_id, version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=True).id == version_id


def test_catalog_custom_author_source_and_exact_direct_version_are_safe(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner, "-direct-catalog")
    own_item = next(row for row in client.get("/blocks", headers=_headers(owner)).json()
                    if row.get("blockVersionId") == version_id)
    assert own_item["accessSource"] == "owner"
    assert own_item["authorName"]
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/direct-grants",
                       json={"recipient_user_id": get_user_id(client, consumer)},
                       headers=_headers(owner)).status_code == 201
    assert version_id not in _consumer_catalog_ids(client, consumer)
    assert client.post(f"/custom-block-marketplace/versions/{version_id}/install",
                       headers=_headers(consumer)).status_code == 200
    item = next(row for row in client.get("/blocks", headers=_headers(consumer)).json()
                if row.get("blockVersionId") == version_id)
    assert item["accessSource"] == "direct_grant"
    assert item["authorName"] == own_item["authorName"]
    assert item["category"] == "custom" and item["version"] == 1
    assert "execution_spec" not in item and "source" not in item.get("passport", {})
    with TestingSessionLocal() as db:
        db.query(CustomBlockAccessGrant).filter_by(
            custom_block_version_id=version_id,
            recipient_user_id=get_user_id(client, consumer),
        ).one().grant_source = "direct"
        db.commit()
    legacy_item = next(row for row in client.get("/blocks", headers=_headers(consumer)).json()
                       if row.get("blockVersionId") == version_id)
    assert legacy_item["accessSource"] == "direct_grant"


def test_marketplace_approval_archive_and_revocation_enforce_server_rights(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    intruder = register_and_get_token(client)
    version_id, stable_key = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id, "author_approval")

    request = client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={"message": "Нужен доступ"}, headers=_headers(consumer))
    assert request.status_code == 201
    room_id = request.json()["chat_room_id"]
    assert room_id
    repeated_request = client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={"message": "Повтор"}, headers=_headers(consumer))
    assert repeated_request.status_code == 200
    assert repeated_request.json()["chat_room_id"] == room_id
    db = TestingSessionLocal()
    try:
        room = db.query(ChatRoom).filter_by(id=room_id).one()
        assert room.room_type == ChatRoomType.PRIVATE
        assert {row.user_id for row in db.query(ChatParticipant).filter_by(room_id=room_id)} == {get_user_id(client, owner), get_user_id(client, consumer)}
        assert any(row.content == "Нужен доступ" for row in db.query(ChatMessage).filter_by(room_id=room_id))
    finally:
        db.close()
    assert client.post(f"/custom-block-marketplace/access-requests/{request.json()['id']}/approve", json={}, headers=_headers(intruder)).status_code == 403
    assert client.post(f"/custom-block-marketplace/access-requests/{request.json()['id']}/approve", json={}, headers=_headers(owner)).status_code == 200

    db = TestingSessionLocal()
    try:
        consumer_id = get_user_id(client, consumer)
        assert resolve_authorized_version(db, scenario_owner_id=consumer_id, version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=True).id == version_id
    finally:
        db.close()

    grants = client.get(f"/custom-block-marketplace/versions/{version_id}/grants", headers=_headers(owner))
    revoke = client.post(f"/custom-block-marketplace/grants/{grants.json()[0]['id']}/revoke", headers=_headers(owner))
    assert revoke.status_code == 200
    db = TestingSessionLocal()
    try:
        consumer_id = get_user_id(client, consumer)
        try:
            resolve_authorized_version(db, scenario_owner_id=consumer_id, version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=True)
        except ControlledExecutionFailure as exc:
            assert exc.category == "authorization_error"
        else:
            raise AssertionError("revoked grant must deny runtime")
    finally:
        db.close()

    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/archive", headers=_headers(owner)).status_code == 200
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={}, headers=_headers(consumer)).status_code == 403


def test_external_terms_uses_chat_and_author_approval_for_exact_version(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, _ = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id, access_policy="explicit_grant", commercial_mode="external_terms")

    detail = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=_headers(consumer))
    assert detail.json()["access"]["can_request_access"] is True
    request = client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={"message": "Хочу обсудить условия"}, headers=_headers(consumer))
    assert request.status_code == 201
    assert request.json()["chat_room_id"]
    approved = client.post(f"/custom-block-marketplace/access-requests/{request.json()['id']}/approve", json={}, headers=_headers(owner))
    assert approved.status_code == 200
    assert approved.json()["grant_id"]


def test_existing_private_chat_is_reused_and_reject_never_grants_access(client):
    owner = register_and_get_token(client)
    consumer = register_and_get_token(client)
    version_id, stable_key = _published_version(client, owner)
    listing_id = _listing(client, owner, version_id, access_policy="author_approval")
    owner_id, consumer_id = get_user_id(client, owner), get_user_id(client, consumer)

    db = TestingSessionLocal()
    try:
        room, created = get_or_create_private_room(db, consumer_id, owner_id, consumer_id)
        assert created is True
        db.commit()
        room_id = room.id
        try:
            resolve_authorized_version(db, scenario_owner_id=consumer_id, version_id=version_id, stable_id=stable_key, version_number=1, existing_reference=True)
        except ControlledExecutionFailure as exc:
            assert exc.category == "authorization_error"
        else:
            raise AssertionError("chat membership must not authorize a Custom Block")
    finally:
        db.close()

    request = client.post(f"/custom-block-marketplace/listings/{listing_id}/access-requests", json={"message": "Обсудим условия"}, headers=_headers(consumer))
    assert request.status_code == 201
    assert request.json()["chat_room_id"] == room_id
    rejected = client.post(f"/custom-block-marketplace/access-requests/{request.json()['id']}/reject", json={}, headers=_headers(owner))
    assert rejected.status_code == 200

    db = TestingSessionLocal()
    try:
        assert db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version_id, recipient_user_id=consumer_id).count() == 0
    finally:
        db.close()
