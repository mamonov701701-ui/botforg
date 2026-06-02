"""
Тесты сервиса расчёта тарифных лимитов (Этап 4).
"""
from datetime import datetime, timezone

import pytest

from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.plan import Plan
from decimal import Decimal

from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)
from backend.auth.password import hash_password
from backend.models.user import User
from backend.services.bot_usage import count_production_active_bots
from backend.services.tariff_limits import get_user_tariff_limits
from backend.tests.conftest import TestingSessionLocal


def _utc(*args, **kwargs) -> datetime:
    return datetime(*args, tzinfo=timezone.utc, **kwargs)


def _get_plan(db, code: str) -> Plan:
    plan = db.query(Plan).filter(Plan.code == code).first()
    assert plan is not None, f"Plan {code!r} missing — run migrations"
    return plan


def _ensure_addon(
    db,
    code: str,
    pkg_type: AddonPackageType,
    amount: int,
) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=code,
        type=pkg_type,
        amount=amount,
        price=Decimal("0.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=0,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def _create_user(db, *, plan_code: str = "free", email_suffix: str = "1") -> User:
    user = User(
        email=f"tariff_test_{email_suffix}@example.com",
        name="Tariff Test",
        plan_code=plan_code,
        role="user",
        hashed_password=hash_password("TestPassword123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _month_period(at: datetime | None = None) -> tuple[datetime, datetime]:
    at = at or _utc(2026, 6, 15, 12, 0, 0)
    start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if at.month == 12:
        end = start.replace(year=at.year + 1, month=1)
    else:
        end = start.replace(month=at.month + 1)
    return start, end


@pytest.fixture
def db(client):
    """Изолированная сессия БД (client очищает таблицы перед тестом)."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_no_subscription_unknown_plan_fallback_start(db, client):
    user = _create_user(db, plan_code="___no_such_plan___", email_suffix="fallback")
    at = _utc(2026, 6, 15)
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.plan_code == "start"
    assert summary.source == "fallback_start"
    assert summary.messages_limit == 500
    assert summary.active_bots_limit == 1
    assert summary.team_members_limit == 0


def test_legacy_plan_code_business(db, client):
    user = _create_user(db, plan_code="business", email_suffix="business")
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.plan_code == "business"
    assert summary.source == "legacy_plan_code"
    assert summary.messages_limit == 3000
    assert summary.active_bots_limit == 1


def test_active_subscription_overrides_plan_code(db, client):
    user = _create_user(db, plan_code="business", email_suffix="sub_override")
    team_plan = _get_plan(db, "team")
    period_start = _utc(2026, 6, 1)
    period_end = _utc(2026, 7, 1)
    db.add(
        UserSubscription(
            user_id=user.id,
            plan_id=team_plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=period_start,
            current_period_end=period_end,
        )
    )
    db.commit()
    at = _utc(2026, 6, 15)
    summary = get_user_tariff_limits(db, user.id, at=at)
    assert summary.plan_code == "team"
    assert summary.source == "subscription"
    assert summary.messages_limit == 20000
    assert summary.active_bots_limit == 5
    assert summary.team_members_limit == 5
    assert _normalize_cmp(summary.period_start) == period_start
    assert _normalize_cmp(summary.period_end) == period_end


def test_active_messages_addon(db, client):
    user = _create_user(db, plan_code="start", email_suffix="addon_msg")
    pkg = _ensure_addon(db, "msg_1000", AddonPackageType.MESSAGES, 1000)
    period_start, period_end = _month_period()
    db.add(
        UserAddon(
            user_id=user.id,
            addon_package_id=pkg.id,
            amount=pkg.amount,
            period_start=period_start,
            period_end=period_end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500 + 1000
    assert len(summary.active_addons) == 1
    assert summary.active_addons[0]["code"] == "msg_1000"


def test_active_bot_addon(db, client):
    user = _create_user(db, plan_code="business", email_suffix="addon_bot")
    pkg = _ensure_addon(db, "bot_1", AddonPackageType.ACTIVE_BOT, 1)
    period_start, period_end = _month_period()
    db.add(
        UserAddon(
            user_id=user.id,
            addon_package_id=pkg.id,
            amount=1,
            period_start=period_start,
            period_end=period_end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_limit == 1 + 1


def test_active_team_member_addon(db, client):
    user = _create_user(db, plan_code="team", email_suffix="addon_member")
    pkg = _ensure_addon(db, "member_1", AddonPackageType.TEAM_MEMBER, 1)
    period_start, period_end = _month_period()
    db.add(
        UserAddon(
            user_id=user.id,
            addon_package_id=pkg.id,
            amount=1,
            period_start=period_start,
            period_end=period_end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 5 + 1


def test_expired_addon_not_counted(db, client):
    user = _create_user(db, plan_code="start", email_suffix="addon_expired")
    pkg = _ensure_addon(db, "msg_1000", AddonPackageType.MESSAGES, 1000)
    db.add(
        UserAddon(
            user_id=user.id,
            addon_package_id=pkg.id,
            amount=1000,
            period_start=_utc(2026, 4, 1),
            period_end=_utc(2026, 5, 1),
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500
    assert summary.active_addons == []


def test_active_gift_messages(db, client):
    user = _create_user(db, plan_code="start", email_suffix="gift_msg")
    admin = _create_user(db, plan_code="free", email_suffix="gift_admin")
    period_start, period_end = _month_period()
    db.add(
        GiftGrant(
            target_user_id=user.id,
            gift_type=GiftType.MESSAGES,
            amount=250,
            starts_at=period_start,
            ends_at=period_end,
            granted_by_user_id=admin.id,
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500 + 250
    assert len(summary.active_gifts) == 1


def test_expired_gift_not_counted(db, client):
    user = _create_user(db, plan_code="start", email_suffix="gift_expired")
    admin = _create_user(db, plan_code="free", email_suffix="gift_admin2")
    db.add(
        GiftGrant(
            target_user_id=user.id,
            gift_type=GiftType.MESSAGES,
            amount=500,
            starts_at=_utc(2026, 4, 1),
            ends_at=_utc(2026, 5, 1),
            granted_by_user_id=admin.id,
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500
    assert summary.active_gifts == []


def test_usage_counter_reduces_remaining(db, client):
    user = _create_user(db, plan_code="business", email_suffix="usage")
    period_start, period_end = _month_period()
    db.add(
        Bot(
            owner_id=user.id,
            title="Active",
            username="active_usage_bot",
            token="123456789:UsageTestToken",
            is_active=True,
        )
    )
    db.add(
        UsageCounter(
            user_id=user.id,
            period_start=period_start,
            period_end=period_end,
            messages_used=1200,
            active_bots_used=99,
            team_members_used=0,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_used == 1200
    assert summary.messages_remaining == 3000 - 1200
    assert summary.active_bots_used == 1
    assert summary.active_bots_remaining == 0


def test_active_bots_used_from_production_count_not_stale_counter(db, client):
    user = _create_user(db, plan_code="start", email_suffix="stale_counter")
    period_start, period_end = _month_period()
    db.add(
        UsageCounter(
            user_id=user.id,
            period_start=period_start,
            period_end=period_end,
            messages_used=0,
            active_bots_used=5,
            team_members_used=0,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_used == 0


def test_draft_does_not_increase_active_bots_used(db, client):
    user = _create_user(db, plan_code="start", email_suffix="draft_used")
    db.add(
        Bot(
            owner_id=user.id,
            title="Draft",
            username="draft_bot_x",
            token="placeholder_abc",
            is_active=False,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_used == 0


def test_channel_connection_increases_active_bots_used(db, client):
    user = _create_user(db, plan_code="start", email_suffix="ch_used")
    bot = Bot(
        owner_id=user.id,
        title="Ch",
        username="ch_bot_x",
        token="placeholder_ch",
        is_active=False,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    db.add(
        BotChannelConnection(
            bot_id=bot.id,
            channel="max",
            is_enabled=True,
            credentials_json="{}",
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_used == 1


def test_telegram_token_increases_active_bots_used(db, client):
    user = _create_user(db, plan_code="start", email_suffix="tg_used")
    db.add(
        Bot(
            owner_id=user.id,
            title="TG",
            username="tg_bot_x",
            token="123456789:TelegramReal",
            is_active=True,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_used == 1


def test_summary_matches_enforcement_count_helper(db, client):
    user = _create_user(db, plan_code="business", email_suffix="match")
    db.add(
        Bot(
            owner_id=user.id,
            title="A",
            username="match_bot_a",
            token="123456789:MatchA",
            is_active=True,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.active_bots_used == count_production_active_bots(db, user.id)


def test_corporate_unlimited_limits(db, client):
    corporate = _get_plan(db, "corporate")
    corporate.limits = {
        **(corporate.limits or {}),
        "active_bots": None,
        "monthly_messages": None,
        "team_members": None,
    }
    db.commit()
    user = _create_user(db, plan_code="corporate", email_suffix="corp")
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit is None
    assert summary.messages_remaining is None
    assert summary.active_bots_limit is None
    assert summary.active_bots_remaining is None
    assert summary.warnings == []


def test_message_warnings_thresholds(db, client):
    user = _create_user(db, plan_code="start", email_suffix="warnings")
    period_start, period_end = _month_period()
    # 85% of 500 = 425
    db.add(
        UsageCounter(
            user_id=user.id,
            period_start=period_start,
            period_end=period_end,
            messages_used=425,
            active_bots_used=0,
            team_members_used=0,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    thresholds = [w.threshold for w in summary.warnings]
    assert thresholds == [70, 85]
    assert all(w.type == "messages_usage" for w in summary.warnings)

    db.query(UsageCounter).filter(UsageCounter.user_id == user.id).update(
        {"messages_used": 500}
    )
    db.commit()
    summary_full = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert [w.threshold for w in summary_full.warnings] == [70, 85, 95, 100]


def test_incomplete_plan_limits_use_defaults(db, client):
    plan = Plan(
        code="test_incomplete_limits_xyz",
        name="Incomplete",
        limits={"can_publish": True},
    )
    db.add(plan)
    db.commit()
    user = _create_user(db, plan_code="test_incomplete_limits_xyz", email_suffix="incomplete")
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500
    assert summary.active_bots_limit == 1
    assert summary.team_members_limit == 0


def _normalize_cmp(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
