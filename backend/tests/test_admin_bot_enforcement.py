"""Stage 7.9 Admin suspension actions use the auditable enforcement record."""
from datetime import datetime, timedelta, timezone

from backend.models.bot import Bot
from backend.models.custom_block_marketplace import TrustSafetyAuditEvent, TrustSafetyEnforcement
from backend.models.template import Template
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, create_test_bot, get_user_id, register_and_get_token
from backend.tests.test_custom_block_marketplace import _published_version


def headers(token):
    return {"Authorization": token}


def setup_admin_bot(client):
    admin, consumer = register_and_get_token(client), register_and_get_token(client)
    admin_id, consumer_id = get_user_id(client, admin), get_user_id(client, consumer)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    bot_id = create_test_bot(client, consumer)
    return admin, consumer, admin_id, consumer_id, bot_id


def test_warning_temporary_permanent_and_resolution_are_distinct(client):
    admin, consumer, admin_id, consumer_id, bot_id = setup_admin_bot(client)
    route = f"/api/platform-admin/bots/{bot_id}"
    detail_route = f"/api/platform-admin/users/{consumer_id}/detailed"
    warning = {"suspension_type": "warning", "reason": "Пожалуйста, исправьте описание"}
    assert client.post(f"{route}/suspend", json=warning, headers=headers(consumer)).status_code == 403
    response = client.post(f"{route}/suspend", json=warning, headers=headers(admin))
    assert response.status_code == 200 and response.json()["detail"] == "Предупреждение вынесено"
    with TestingSessionLocal() as db:
        bot = db.query(Bot).filter_by(id=bot_id).one()
        assert not bot.is_suspended and bot.suspension_type == "warning" and bot.is_active
        row = db.query(TrustSafetyEnforcement).filter_by(subject_type="bot", subject_id=bot_id).one()
        assert row.action == "warning" and row.actor_user_id == admin_id and row.reason == warning["reason"]
        assert db.query(TrustSafetyAuditEvent).filter_by(event_type="enforcement_created", subject_id=bot_id).count() == 1
    user_bot = client.get("/bots/", headers=headers(consumer)).json()["items"][0]
    assert user_bot["is_suspended"] is False and user_bot["suspension_type"] == "warning"
    assert user_bot["suspension_reason"] == warning["reason"]
    assert client.get(detail_route, headers=headers(admin)).json()["enforcements"][0]["action"] == "warning"

    temporary = {"suspension_type": "temporary", "reason": "Временная проверка", "duration_days": 7}
    response = client.post(f"{route}/suspend", json=temporary, headers=headers(admin))
    assert response.status_code == 200 and response.json()["suspended_until"]
    admin_detail = client.get(detail_route, headers=headers(admin)).json()
    assert admin_detail["bots"][0]["is_suspended"] is True
    assert admin_detail["bots"][0]["suspended_until"]
    assert len(admin_detail["enforcements"]) == 2
    assert admin_detail["enforcements"][-1]["expires_at"]
    user_bot = client.get("/bots/", headers=headers(consumer)).json()["items"][0]
    assert user_bot["is_suspended"] and user_bot["suspended_until"] and user_bot["suspension_reason"] == "Временная проверка"
    assert client.patch(f"/bots/{bot_id}", json={"title": "Blocked edit"}, headers=headers(consumer)).status_code == 403

    # Time expiration changes effective rights, without deleting the historical row.
    with TestingSessionLocal() as db:
        past = datetime.now(timezone.utc) - timedelta(days=1)
        db.query(Bot).filter_by(id=bot_id).one().suspended_until = past
        db.query(TrustSafetyEnforcement).filter_by(subject_type="bot", subject_id=bot_id, action="suspend_object").one().expires_at = past
        db.commit()
    assert client.get("/bots/", headers=headers(consumer)).json()["items"][0]["is_suspended"] is False
    assert client.patch(f"/bots/{bot_id}", json={"title": "After expiry"}, headers=headers(consumer)).status_code == 200

    permanent = {"suspension_type": "permanent", "reason": "Повторное нарушение"}
    response = client.post(f"{route}/suspend", json=permanent, headers=headers(admin))
    assert response.status_code == 200 and response.json()["suspended_until"] is None
    user_bot = client.get("/bots/", headers=headers(consumer)).json()["items"][0]
    assert user_bot["is_suspended"] and user_bot["suspension_type"] == "permanent"
    assert user_bot["suspended_until"] is None and user_bot["suspension_reason"] == "Повторное нарушение"
    assert client.post(f"{route}/unsuspend", headers=headers(consumer)).status_code == 403
    assert client.post(f"{route}/unsuspend", headers=headers(admin)).status_code == 200
    admin_detail = client.get(detail_route, headers=headers(admin)).json()
    assert not admin_detail["bots"][0]["is_suspended"]
    assert len(admin_detail["enforcements"]) == 3
    assert admin_detail["enforcements"][-1]["revoked_at"]
    with TestingSessionLocal() as db:
        assert db.query(TrustSafetyAuditEvent).filter_by(event_type="enforcement_resolved", subject_id=bot_id).count() >= 1


def test_user_warning_and_all_bots_warning_do_not_block(client):
    admin, consumer, admin_id, consumer_id, bot_id = setup_admin_bot(client)
    warning = {"suspension_type": "warning", "reason": "Исправьте информацию"}
    assert client.post(f"/api/platform-admin/users/{consumer_id}/suspend", json=warning,
                       headers=headers(admin)).status_code == 200
    assert client.post(f"/api/platform-admin/users/{consumer_id}/suspend-all-bots", json=warning,
                       headers=headers(admin)).status_code == 200
    with TestingSessionLocal() as db:
        assert not db.query(User).filter_by(id=consumer_id).one().is_suspended
        assert not db.query(Bot).filter_by(id=bot_id).one().is_suspended
        assert db.query(TrustSafetyEnforcement).filter_by(user_id=consumer_id, action="warning").count() == 2
    assert client.get(f"/api/platform-admin/users/{consumer_id}/suspension", headers=headers(admin)).json()["is_suspended"] is False
    temporary = {"suspension_type": "temporary", "reason": "Проверка аккаунта", "duration_days": 7}
    assert client.post(f"/api/platform-admin/users/{consumer_id}/suspend", json=temporary,
                       headers=headers(admin)).status_code == 200
    assert client.get(f"/api/platform-admin/users/{consumer_id}/suspension", headers=headers(admin)).json()["is_suspended"] is True
    assert client.post(f"/api/platform-admin/users/{consumer_id}/unsuspend", headers=headers(admin)).status_code == 200
    assert client.get(f"/api/platform-admin/users/{consumer_id}/suspension", headers=headers(admin)).json()["is_suspended"] is False
    assert client.post(f"/api/platform-admin/users/{consumer_id}/suspend-all-bots", json=temporary,
                       headers=headers(admin)).status_code == 200
    assert client.get("/bots/", headers=headers(consumer)).json()["items"][0]["is_suspended"] is True
    assert client.post(f"/api/platform-admin/users/{consumer_id}/unsuspend-all-bots",
                       headers=headers(admin)).status_code == 200
    assert client.get("/bots/", headers=headers(consumer)).json()["items"][0]["is_suspended"] is False
    with TestingSessionLocal() as db:
        assert db.query(TrustSafetyEnforcement).filter_by(user_id=consumer_id).count() == 4
        assert db.query(TrustSafetyEnforcement).filter_by(user_id=consumer_id, action="suspend_object").one().revoked_at


def test_trust_safety_bot_warning_and_resolution_remain_audited(client):
    admin, consumer, admin_id, consumer_id, bot_id = setup_admin_bot(client)
    response = client.post("/api/trust-safety/admin/enforcements", json={
        "subject_type": "bot", "subject_id": bot_id, "action": "warning", "reason": "Проверьте контент",
    }, headers=headers(admin))
    assert response.status_code == 201, response.text
    assert client.get("/bots/", headers=headers(consumer)).json()["items"][0]["suspension_type"] == "warning"
    path = f"/api/trust-safety/admin/enforcements/{response.json()['id']}/resolve"
    assert client.post(path, headers=headers(consumer)).status_code == 403
    assert client.post(path, headers=headers(admin)).status_code == 200
    assert client.get("/bots/", headers=headers(consumer)).json()["items"][0]["suspension_type"] is None
    with TestingSessionLocal() as db:
        row = db.query(TrustSafetyEnforcement).filter_by(id=response.json()["id"]).one()
        assert row.revoked_at and row.revoked_by_user_id == admin_id
        assert db.query(TrustSafetyAuditEvent).filter_by(event_type="enforcement_resolved", subject_id=bot_id).count() == 1


def test_listing_restriction_has_working_admin_path_and_preserved_history(client):
    admin, author, consumer = (register_and_get_token(client) for _ in range(3))
    admin_id = get_user_id(client, admin)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        db.commit()
    version_id, _ = _published_version(client, author, "-enforcement-listing")
    created = client.post(f"/custom-block-marketplace/versions/{version_id}/listing",
                          json={"commercial_mode": "free", "category": "other", "tags": []},
                          headers=headers(author))
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert client.post(f"/custom-block-marketplace/listings/{listing_id}/publish",
                       headers=headers(author)).status_code == 200
    catalog = "/custom-block-marketplace/listings"
    assert listing_id in [row["id"] for row in client.get(catalog, headers=headers(consumer)).json()["items"]]
    payload = {"subject_type": "listing", "subject_id": listing_id, "action": "suspend_object",
               "reason": "Проверка карточки", "duration_days": 7}
    assert client.post("/api/trust-safety/admin/enforcements", json=payload,
                       headers=headers(consumer)).status_code == 403
    applied = client.post("/api/trust-safety/admin/enforcements", json=payload, headers=headers(admin))
    assert applied.status_code == 201, applied.text
    assert listing_id not in [row["id"] for row in client.get(catalog, headers=headers(consumer)).json()["items"]]
    resolved = client.post(f"/api/trust-safety/admin/enforcements/{applied.json()['id']}/resolve",
                           headers=headers(admin))
    assert resolved.status_code == 200
    assert listing_id in [row["id"] for row in client.get(catalog, headers=headers(consumer)).json()["items"]]
    with TestingSessionLocal() as db:
        row = db.query(TrustSafetyEnforcement).filter_by(id=applied.json()["id"]).one()
        assert row.actor_user_id == admin_id and row.expires_at and row.revoked_at
        assert db.query(TrustSafetyAuditEvent).filter_by(event_type="enforcement_resolved",
                                                         subject_type="listing", subject_id=listing_id).count() == 1


def test_legacy_template_accepts_warning_but_rejects_ineffective_suspension(client):
    admin, author = register_and_get_token(client), register_and_get_token(client)
    admin_id, author_id = get_user_id(client, admin), get_user_id(client, author)
    with TestingSessionLocal() as db:
        db.query(User).filter_by(id=admin_id).one().role = "owner"
        template = Template(name="Legacy Template", category="other", is_public=False, user_id=author_id)
        db.add(template)
        db.commit()
        template_id = template.id
    endpoint = "/api/trust-safety/admin/enforcements"
    base = {"subject_type": "template", "subject_id": template_id, "reason": "Проверка шаблона"}
    assert client.post(endpoint, json={**base, "action": "warning"}, headers=headers(author)).status_code == 403
    warning = client.post(endpoint, json={**base, "action": "warning"}, headers=headers(admin))
    assert warning.status_code == 201, warning.text
    # Warning does not prevent the existing public transition.
    published = client.patch(f"/templates/{template_id}/publish", json={"is_public": True}, headers=headers(author))
    assert published.status_code == 200, published.text
    for duration in (7, None):
        payload = {**base, "action": "suspend_object"}
        if duration:
            payload["duration_days"] = duration
        denied = client.post(endpoint, json=payload, headers=headers(admin))
        assert denied.status_code == 422
        assert denied.json()["detail"]["code"] == "unsupported_action"
    with TestingSessionLocal() as db:
        rows = db.query(TrustSafetyEnforcement).filter_by(subject_type="template", subject_id=template_id).all()
        assert len(rows) == 1 and rows[0].action == "warning" and rows[0].actor_user_id == admin_id
        assert db.query(TrustSafetyAuditEvent).filter_by(
            event_type="enforcement_created", subject_type="template", subject_id=template_id).count() == 1
    assert client.post(f"/api/trust-safety/admin/enforcements/{warning.json()['id']}/resolve",
                       headers=headers(author)).status_code == 403
    assert client.post(f"/api/trust-safety/admin/enforcements/{warning.json()['id']}/resolve",
                       headers=headers(admin)).status_code == 200
    with TestingSessionLocal() as db:
        row = db.query(TrustSafetyEnforcement).filter_by(id=warning.json()["id"]).one()
        assert row.revoked_at and row.revoked_by_user_id == admin_id
        assert db.query(TrustSafetyAuditEvent).filter_by(
            event_type="enforcement_resolved", subject_type="template", subject_id=template_id).count() == 1
