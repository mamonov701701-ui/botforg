"""
Тесты enforcement активных ботов и правила «1 бот = 1 канал» (Этап 5.1).
"""
import uuid
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest

from backend.auth.password import hash_password
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.bot_usage import (
    count_production_active_bots,
    is_bot_production_active,
)
from backend.services.tariff_enforcement import (
    MSG_ACTIVE_BOTS_EXCEEDED,
    MSG_ONE_BOT_ONE_CHANNEL,
    TariffLimitExceeded,
    ensure_can_activate_bot,
    ensure_can_connect_channel,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.tests.conftest import TestingSessionLocal, register_and_get_token
from backend.tests.tariff_time import (
    FIXED_TARIFF_NOW,
    freeze_tariff_now,  # noqa: F401 — used via pytestmark
    month_period,
    utc as _utc,
)

pytestmark = pytest.mark.usefixtures("freeze_tariff_now")


def _create_user(db, plan_code: str, suffix: str) -> User:
    user = User(
        email=f"enforce_{suffix}@example.com",
        name="Enforce",
        plan_code=plan_code,
        role="user",
        hashed_password=hash_password("TestPassword123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _active_bot(db, owner_id: int, suffix: str, *, placeholder: bool = False) -> Bot:
    uid = uuid.uuid4().hex[:8]
    bot = Bot(
        owner_id=owner_id,
        title=f"Bot {suffix}",
        username=f"bot_{suffix}_{uid}"[:32],
        token=f"placeholder_{uid}" if placeholder else f"123456789:AA{uid}",
        is_active=not placeholder,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


def _ensure_bot_addon(db, user_id: int, amount: int = 1) -> None:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "bot_1").first()
    if not pkg:
        pkg = AddonPackage(
            code="bot_1",
            name_ru="+1 бот",
            type=AddonPackageType.ACTIVE_BOT,
            amount=1,
            price=Decimal("0"),
            currency="RUB",
            duration_type="current_period",
            is_active=True,
            is_public=True,
            sort_order=0,
        )
        db.add(pkg)
        db.commit()
        db.refresh(pkg)
    start, end = month_period()
    db.add(
        UserAddon(
            user_id=user_id,
            addon_package_id=pkg.id,
            amount=amount,
            period_start=start,
            period_end=end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# --- Service-level ---


def test_start_plan_allows_one_active_bot(db, client):
    user = _create_user(db, "start", "one_ok")
    ensure_can_activate_bot(db, user.id)
    bot = _active_bot(db, user.id, "a1")
    ensure_can_activate_bot(db, user.id, bot_id=bot.id)


def test_start_plan_blocks_second_active_bot(db, client):
    user = _create_user(db, "start", "two_block")
    _active_bot(db, user.id, "b1")
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_activate_bot(db, user.id)
    assert exc.value.message == MSG_ACTIVE_BOTS_EXCEEDED


def test_unlimited_plan_allows_many_active_bots(db, client):
    corporate = db.query(Plan).filter(Plan.code == "corporate").first()
    assert corporate is not None
    corporate.limits = {
        **(corporate.limits or {}),
        "active_bots": None,
        "monthly_messages": None,
    }
    db.commit()
    user = _create_user(db, "corporate", "unlimited")
    _active_bot(db, user.id, "c1")
    _active_bot(db, user.id, "c2")
    ensure_can_activate_bot(db, user.id)


def test_active_bot_addon_increases_limit(db, client):
    user = _create_user(db, "start", "addon_ok")
    _active_bot(db, user.id, "d1")
    _ensure_bot_addon(db, user.id)
    ensure_can_activate_bot(db, user.id)


def test_expired_addon_does_not_increase_limit(db, client):
    user = _create_user(db, "start", "addon_exp")
    _active_bot(db, user.id, "e1")
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "bot_1").first()
    if not pkg:
        pkg = AddonPackage(
            code="bot_1",
            name_ru="+1",
            type=AddonPackageType.ACTIVE_BOT,
            amount=1,
            price=Decimal("0"),
            currency="RUB",
            duration_type="current_period",
            is_active=True,
            is_public=True,
            sort_order=0,
        )
        db.add(pkg)
        db.commit()
        db.refresh(pkg)
    db.add(
        UserAddon(
            user_id=user.id,
            addon_package_id=pkg.id,
            amount=1,
            period_start=_utc(2026, 4, 1),
            period_end=_utc(2026, 5, 1),
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    with pytest.raises(TariffLimitExceeded):
        ensure_can_activate_bot(db, user.id)


def test_summary_active_bots_used_matches_enforcement(db, client):
    user = _create_user(db, "start", "summary_match")
    _active_bot(db, user.id, "sm1")
    summary = get_user_tariff_limits(db, user.id, at=FIXED_TARIFF_NOW)
    assert summary.active_bots_used == count_production_active_bots(db, user.id)
    assert summary.active_bots_used == 1


def test_check_max_bots_legacy_delegates_to_active_bots(db, client):
    from backend.utils.plan_limits import check_max_bots
    from fastapi import HTTPException

    user = _create_user(db, "start", "legacy_wrap")
    _active_bot(db, user.id, "leg1")
    with pytest.raises(HTTPException) as exc:
        check_max_bots(db, user)
    assert exc.value.status_code == 403
    assert exc.value.detail == MSG_ACTIVE_BOTS_EXCEEDED


def test_draft_not_counted_as_active(db, client):
    user = _create_user(db, "start", "draft")
    _active_bot(db, user.id, "draft1", placeholder=True)
    assert count_production_active_bots(db, user.id) == 0
    ensure_can_activate_bot(db, user.id)


def test_one_channel_rule_blocks_second_channel(db, client):
    user = _create_user(db, "start", "one_ch")
    bot = _active_bot(db, user.id, "ch1")
    db.add(
        BotChannelConnection(
            bot_id=bot.id,
            channel="max",
            is_enabled=True,
            credentials_json="{}",
        )
    )
    db.commit()
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_connect_channel(
            db, user.id, bot.id, "whatsapp", updating_existing=False
        )
    assert exc.value.message == MSG_ONE_BOT_ONE_CHANNEL


def test_telegram_implicit_channel_blocks_second(db, client):
    user = _create_user(db, "start", "tg_ch")
    bot = _active_bot(db, user.id, "tg", placeholder=False)
    assert is_bot_production_active(bot, db)
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_connect_channel(
            db, user.id, bot.id, "max", updating_existing=False
        )
    assert MSG_ONE_BOT_ONE_CHANNEL in exc.value.message


# --- Router-level ---


@patch("requests.get")
def test_connect_second_bot_returns_russian_403(mock_get, client):
    unique = uuid.uuid4().hex[:8]

    def _telegram_me(url, *_args, **_kwargs):
        resp = Mock(status_code=200)
        uname = f"b2_{unique}" if "222222222" in url else f"b_{unique}"
        resp.json.return_value = {
            "ok": True,
            "result": {
                "id": 1,
                "is_bot": True,
                "first_name": "Bot",
                "username": uname,
            },
        }
        return resp

    mock_get.side_effect = _telegram_me
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "start"}, headers={"Authorization": auth})

    token1 = f"111111111:AAA{unique}a"
    token2 = f"222222222:BBB{unique}b"
    r1 = client.post(
        "/bots/connect",
        json={"token": token1, "username": f"b_{unique}"},
        headers={"Authorization": auth},
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/bots/connect",
        json={"token": token2, "username": f"b2_{unique}"},
        headers={"Authorization": auth},
    )
    assert r2.status_code == 403
    assert r2.json()["detail"] == MSG_ACTIVE_BOTS_EXCEEDED


def test_create_draft_bots_not_limited_on_start(client):
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "start"}, headers={"Authorization": auth})
    for i in range(3):
        res = client.post(
            "/bots/",
            json={"title": f"Draft {i}"},
            headers={"Authorization": auth},
        )
        assert res.status_code == 201
        assert res.json()["is_active"] is False


def test_channel_endpoint_one_bot_one_channel(client):
    """Черновик + два канала: правило 1:1 без неявного Telegram."""
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "start"}, headers={"Authorization": auth})
    bot_id = client.post(
        "/bots/",
        json={"title": "Draft channel test"},
        headers={"Authorization": auth},
    ).json()["id"]

    r1 = client.post(
        f"/bots/{bot_id}/channels",
        json={"channel": "max", "is_enabled": True, "credentials": {"token": "x"}},
        headers={"Authorization": auth},
    )
    assert r1.status_code == 201

    r2 = client.post(
        f"/bots/{bot_id}/channels",
        json={"channel": "whatsapp", "is_enabled": True, "credentials": {"provider": "meta"}},
        headers={"Authorization": auth},
    )
    assert r2.status_code == 403
    assert r2.json()["detail"] == MSG_ONE_BOT_ONE_CHANNEL


# --- Этап 5.6.3: channel re-enable + soft-delete lifecycle ---


def _auth_start(client) -> str:
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan", json={"plan_code": "start"}, headers={"Authorization": auth}
    )
    assert res.status_code == 200
    return auth


def _create_draft_with_enabled_channel(client, auth: str, *, channel: str = "max") -> int:
    bot_id = client.post(
        "/bots/",
        json={"title": "Lifecycle draft"},
        headers={"Authorization": auth},
    ).json()["id"]
    res = client.post(
        f"/bots/{bot_id}/channels",
        json={"channel": channel, "is_enabled": True, "credentials": {"token": "x"}},
        headers={"Authorization": auth},
    )
    assert res.status_code == 201
    assert res.json()["is_enabled"] is True
    return bot_id


def test_channel_reenable_allowed_when_limit_free(client, db):
    auth = _auth_start(client)
    bot_id = _create_draft_with_enabled_channel(client, auth)

    disabled = client.post(
        f"/bots/{bot_id}/channels",
        json={"channel": "max", "is_enabled": False},
        headers={"Authorization": auth},
    )
    assert disabled.status_code == 201
    assert disabled.json()["is_enabled"] is False

    me = client.get("/me", headers={"Authorization": auth}).json()
    assert count_production_active_bots(db, me["id"]) == 0

    reenabled = client.post(
        f"/bots/{bot_id}/channels",
        json={"channel": "max", "is_enabled": True},
        headers={"Authorization": auth},
    )
    assert reenabled.status_code == 201
    assert reenabled.json()["is_enabled"] is True
    assert count_production_active_bots(db, me["id"]) == 1


def test_channel_reenable_blocked_when_limit_exhausted(client, db):
    auth = _auth_start(client)
    bot_a = _create_draft_with_enabled_channel(client, auth, channel="max")

    # Free slot by disabling channel on bot A, then occupy it with bot B.
    assert (
        client.post(
            f"/bots/{bot_a}/channels",
            json={"channel": "max", "is_enabled": False},
            headers={"Authorization": auth},
        ).status_code
        == 201
    )
    bot_b = _create_draft_with_enabled_channel(client, auth, channel="whatsapp")
    me = client.get("/me", headers={"Authorization": auth}).json()
    assert count_production_active_bots(db, me["id"]) == 1

    blocked = client.post(
        f"/bots/{bot_a}/channels",
        json={"channel": "max", "is_enabled": True},
        headers={"Authorization": auth},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == MSG_ACTIVE_BOTS_EXCEEDED
    # bot_a stays disabled; slot still held by bot_b
    conn = (
        db.query(BotChannelConnection)
        .filter(
            BotChannelConnection.bot_id == bot_a,
            BotChannelConnection.channel == "max",
        )
        .one()
    )
    assert conn.is_enabled is False
    assert count_production_active_bots(db, me["id"]) == 1
    assert bot_b  # occupied by second bot


def test_channel_update_already_enabled_does_not_block(client, db):
    """Credential update of an already-enabled connection must not re-check the slot."""
    auth = _auth_start(client)
    bot_id = _create_draft_with_enabled_channel(client, auth)
    me = client.get("/me", headers={"Authorization": auth}).json()
    # start plan limit=1; bot already occupies the only slot.
    updated = client.post(
        f"/bots/{bot_id}/channels",
        json={
            "channel": "max",
            "is_enabled": True,
            "credentials": {"token": "rotated"},
        },
        headers={"Authorization": auth},
    )
    assert updated.status_code == 201
    assert updated.json()["is_enabled"] is True
    assert count_production_active_bots(db, me["id"]) == 1


def test_channel_reenable_respects_active_bot_addon(client, db):
    auth = _auth_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    bot_a = _create_draft_with_enabled_channel(client, auth, channel="max")
    assert (
        client.post(
            f"/bots/{bot_a}/channels",
            json={"channel": "max", "is_enabled": False},
            headers={"Authorization": auth},
        ).status_code
        == 201
    )
    _create_draft_with_enabled_channel(client, auth, channel="whatsapp")
    _ensure_bot_addon(db, me["id"])

    reenabled = client.post(
        f"/bots/{bot_a}/channels",
        json={"channel": "max", "is_enabled": True},
        headers={"Authorization": auth},
    )
    assert reenabled.status_code == 201
    assert count_production_active_bots(db, me["id"]) == 2


def test_soft_delete_disables_enabled_channel_and_frees_slot(client, db):
    auth = _auth_start(client)
    bot_id = _create_draft_with_enabled_channel(client, auth)
    me = client.get("/me", headers={"Authorization": auth}).json()
    assert count_production_active_bots(db, me["id"]) == 1

    deleted = client.delete(f"/bots/{bot_id}", headers={"Authorization": auth})
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deactivated"

    bot = db.query(Bot).filter(Bot.id == bot_id).one()
    db.refresh(bot)
    assert bot.is_active is False
    conn = (
        db.query(BotChannelConnection)
        .filter(BotChannelConnection.bot_id == bot_id, BotChannelConnection.channel == "max")
        .one()
    )
    assert conn.is_enabled is False
    assert is_bot_production_active(bot, db) is False
    assert count_production_active_bots(db, me["id"]) == 0


def test_soft_delete_frees_slot_for_another_bot(client, db):
    auth = _auth_start(client)
    bot_a = _create_draft_with_enabled_channel(client, auth, channel="max")
    me = client.get("/me", headers={"Authorization": auth}).json()

    assert (
        client.delete(f"/bots/{bot_a}", headers={"Authorization": auth}).status_code
        == 200
    )
    assert count_production_active_bots(db, me["id"]) == 0

    bot_b = _create_draft_with_enabled_channel(client, auth, channel="whatsapp")
    assert count_production_active_bots(db, me["id"]) == 1
    assert bot_b != bot_a


def test_soft_delete_already_inactive_is_safe(client, db):
    auth = _auth_start(client)
    bot_id = client.post(
        "/bots/",
        json={"title": "Already draft"},
        headers={"Authorization": auth},
    ).json()["id"]
    me = client.get("/me", headers={"Authorization": auth}).json()

    first = client.delete(f"/bots/{bot_id}", headers={"Authorization": auth})
    assert first.status_code == 200
    second = client.delete(f"/bots/{bot_id}", headers={"Authorization": auth})
    assert second.status_code == 200
    assert count_production_active_bots(db, me["id"]) == 0


def test_active_bot_gift_increases_limit(db, client):
    user = _create_user(db, "start", "gift_bot")
    admin = _create_user(db, "start", "gift_bot_admin")
    _active_bot(db, user.id, "g1")
    start, end = month_period()
    db.add(
        GiftGrant(
            target_user_id=user.id,
            gift_type=GiftType.ACTIVE_BOT,
            amount=1,
            starts_at=start,
            ends_at=end,
            granted_by_user_id=admin.id,
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()

    summary = get_user_tariff_limits(db, user.id, at=FIXED_TARIFF_NOW)
    assert summary.active_bots_limit == 2
    ensure_can_activate_bot(db, user.id)
