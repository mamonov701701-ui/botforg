"""
Тесты enforcement участников команды (Этап 5.4.2).
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from backend.auth.password import hash_password
from backend.models.bf_team_member import BFTeamMember
from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.team import TeamMember
from backend.models.user import User
from backend.services.tariff_enforcement import (
    MSG_TEAM_MEMBERS_EXCEEDED,
    MSG_TEAM_NOT_AVAILABLE,
    TariffLimitExceeded,
    ensure_can_add_team_member,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.tests.conftest import TestingSessionLocal
from backend.utils.plan_limits import check_max_team_members, get_user_plan_limits


def _utc(*args, **kwargs) -> datetime:
    return datetime(*args, tzinfo=timezone.utc, **kwargs)


def _month_period():
    at = _utc(2026, 6, 15)
    start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(month=at.month + 1)
    return start, end


def _create_user(db, plan_code: str, suffix: str, *, role: str = "user") -> User:
    user = User(
        email=f"team_enf_{suffix}@example.com",
        name="Team Enforce",
        plan_code=plan_code,
        role=role,
        hashed_password=hash_password("TestPassword123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_plan(db, code: str) -> Plan:
    plan = db.query(Plan).filter(Plan.code == code).first()
    assert plan is not None
    return plan


def _ensure_team_member_addon(db, amount: int = 1) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "member_1").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="member_1",
        name_ru="+1 участник",
        type=AddonPackageType.TEAM_MEMBER,
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


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_enforcement_uses_team_members_limit_not_legacy_max_team_members(db, client):
    """Лимит 5 (team_members), не legacy max_team_members=10 из plans.limits."""
    owner = _create_user(db, plan_code="team", suffix="owner_team")
    for i in range(5):
        m = _create_user(db, plan_code="free", suffix=f"legacy_m_{i}")
        db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="observer"))
    db.commit()
    limits_legacy = get_user_plan_limits(db, owner)
    assert limits_legacy.get("max_team_members", 0) >= 5
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 5
    with pytest.raises(TariffLimitExceeded):
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_limit_zero_blocks(db, client):
    owner = _create_user(db, plan_code="start", suffix="start_zero")
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))
    assert exc.value.code == "team_members_unavailable"
    assert MSG_TEAM_NOT_AVAILABLE in exc.value.message


def test_business_team_members_zero_blocks(db, client):
    owner = _create_user(db, plan_code="business", suffix="biz_zero")
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 0
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))
    assert exc.value.code == "team_members_unavailable"


def test_business_pro_team_members_is_three(db, client):
    owner = _create_user(db, plan_code="business_pro", suffix="bpro")
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 3
    for i in range(2):
        m = _create_user(db, plan_code="free", suffix=f"bpro_m_{i}")
        db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="observer"))
    db.commit()
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))
    m3 = _create_user(db, plan_code="free", suffix="bpro_m_2")
    db.add(TeamMember(owner_id=owner.id, user_id=m3.id, role="observer"))
    db.commit()
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))
    assert exc.value.code == "team_members_limit_exceeded"


def test_team_plan_team_members_is_five(db, client):
    owner = _create_user(db, plan_code="team", suffix="team_five")
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 5


def test_used_below_limit_allows(db, client):
    owner = _create_user(db, plan_code="team", suffix="below_limit")
    member = _create_user(db, plan_code="free", suffix="member_one")
    db.add(TeamMember(owner_id=owner.id, user_id=member.id, role="observer"))
    db.commit()
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_used_at_limit_blocks(db, client):
    owner = _create_user(db, plan_code="team", suffix="at_limit")
    for i in range(5):
        m = _create_user(db, plan_code="free", suffix=f"member_{i}")
        db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="observer"))
    db.commit()
    with pytest.raises(TariffLimitExceeded) as exc:
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))
    assert exc.value.code == "team_members_limit_exceeded"
    assert MSG_TEAM_MEMBERS_EXCEEDED in exc.value.message


def test_addon_increases_limit_allows_add(db, client):
    owner = _create_user(db, plan_code="team", suffix="addon_team")
    for i in range(5):
        m = _create_user(db, plan_code="free", suffix=f"addon_m_{i}")
        db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="observer"))
    pkg = _ensure_team_member_addon(db)
    period_start, period_end = _month_period()
    db.add(
        UserAddon(
            user_id=owner.id,
            addon_package_id=pkg.id,
            amount=1,
            period_start=period_start,
            period_end=period_end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_limit == 6
    assert summary.team_members_used == 5
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_plan_gift_raises_team_limit(db, client):
    owner = _create_user(db, plan_code="start", suffix="plan_gift_owner")
    admin = _create_user(db, plan_code="free", suffix="plan_gift_admin")
    team_plan = _get_plan(db, "team")
    period_start, period_end = _month_period()
    db.add(
        GiftGrant(
            target_user_id=owner.id,
            gift_type=GiftType.PLAN,
            plan_id=team_plan.id,
            starts_at=period_start,
            ends_at=period_end,
            granted_by_user_id=admin.id,
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.plan_code == "team"
    assert summary.team_members_limit == 5
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_used_from_team_member_not_usage_counter(db, client):
    owner = _create_user(db, plan_code="team", suffix="real_count")
    m = _create_user(db, plan_code="free", suffix="real_m")
    db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="editor"))
    period_start, period_end = _month_period()
    db.add(
        UsageCounter(
            user_id=owner.id,
            period_start=period_start,
            period_end=period_end,
            messages_used=0,
            active_bots_used=0,
            team_members_used=99,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_used == 1
    for _ in range(4):
        extra = _create_user(db, plan_code="free", suffix=f"extra_{_}")
        db.add(TeamMember(owner_id=owner.id, user_id=extra.id, role="observer"))
    db.commit()
    with pytest.raises(TariffLimitExceeded):
        ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_bf_team_member_does_not_affect_client_team_limit(db, client):
    owner = _create_user(db, plan_code="team", suffix="bf_sep")
    db.add(
        BFTeamMember(
            user_id=owner.id,
            added_by=owner.id,
            is_active=True,
        )
    )
    db.commit()
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_used == 0
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_owner_not_counted_as_team_member(db, client):
    owner = _create_user(db, plan_code="team", suffix="owner_only")
    summary = get_user_tariff_limits(db, owner.id, at=_utc(2026, 6, 15))
    assert summary.team_members_used == 0
    ensure_can_add_team_member(db, owner.id, at=_utc(2026, 6, 15))


def test_check_max_team_members_wrapper_delegates(db, client):
    owner = _create_user(db, plan_code="start", suffix="wrapper")
    other = _create_user(db, plan_code="team", suffix="wrapper_other")
    with pytest.raises(HTTPException) as exc:
        check_max_team_members(db, other, owner.id)
    assert exc.value.status_code == 403
    assert MSG_TEAM_NOT_AVAILABLE in exc.value.detail


def test_summary_and_enforcement_agree(db, client):
    owner = _create_user(db, plan_code="team", suffix="agree")
    for i in range(3):
        m = _create_user(db, plan_code="free", suffix=f"agree_m_{i}")
        db.add(TeamMember(owner_id=owner.id, user_id=m.id, role="observer"))
    db.commit()
    at = _utc(2026, 6, 15)
    summary = get_user_tariff_limits(db, owner.id, at=at)
    assert summary.team_members_used == 3
    assert summary.team_members_remaining == 2
    ensure_can_add_team_member(db, owner.id, at=at)
    m4 = _create_user(db, plan_code="free", suffix="agree_m4")
    db.add(TeamMember(owner_id=owner.id, user_id=m4.id, role="observer"))
    m5 = _create_user(db, plan_code="free", suffix="agree_m5")
    db.add(TeamMember(owner_id=owner.id, user_id=m5.id, role="observer"))
    db.commit()
    summary2 = get_user_tariff_limits(db, owner.id, at=at)
    assert summary2.team_members_used == 5
    with pytest.raises(TariffLimitExceeded):
        ensure_can_add_team_member(db, owner.id, at=at)
