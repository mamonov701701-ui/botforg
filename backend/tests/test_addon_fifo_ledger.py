"""Этап 6.14.9A: FIFO addon usage ledger."""
from __future__ import annotations

import inspect
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AddonUsageLedgerEntry,
    AddonUsageOperation,
    AddonUsageSourceType,
    GiftGrantStatus,
    GiftType,
    TariffFifoCutover,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.tariff_addon_usage_ledger import (
    addon_has_pre_cutover_uncertainty,
    fifo_compensate_message_unit,
    fifo_debit_message_unit,
    fifo_ledger_remaining,
    fifo_ledger_used,
    reserve_user_addon_units,
)
from backend.services.tariff_entitlements import (
    create_user_addon,
    grant_gift,
)
from backend.services.tariff_message_enforcement import (
    check_and_consume_message_unit,
    refund_consumed_message_unit,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_cutover(db, *, at: datetime | None = None):
    row = db.query(TariffFifoCutover).first()
    cut = (at or (_utc() - timedelta(days=1))).replace(tzinfo=None)
    if row is None:
        db.add(
            TariffFifoCutover(
                id=1,
                cutover_at=cut,
                note="test cutover",
                created_at=cut,
            )
        )
    else:
        row.cutover_at = cut
    db.commit()


def _user(client, db) -> User:
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    return db.query(User).filter(User.id == uid).one()


def _plan(db, user: User, *, messages: int = 2) -> Plan:
    code = f"fifo_p{messages}"
    plan = db.query(Plan).filter(Plan.code == code).first()
    if plan is None:
        plan = Plan(
            code=code,
            name=f"FIFO {messages}",
            name_ru=f"FIFO {messages}",
            price_month=Decimal("0.00"),
            currency="RUB",
            is_active=True,
            is_public=False,
            sort_order=99,
            limits={
                "monthly_messages": messages,
                "max_active_bots": 1,
                "max_team_members": 0,
            },
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
    user.plan_code = plan.code
    db.commit()
    return plan


def _msg_pkg(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "fifo_msg").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="fifo_msg",
        name_ru="FIFO msg",
        type=AddonPackageType.MESSAGES,
        amount=5,
        price=Decimal("100.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def test_fifo_order_plan_gift_paid_a_paid_b(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=1)
    pkg = _msg_pkg(db)
    now = _utc()
    period_end = now + timedelta(days=30)

    gift = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.MESSAGES,
        starts_at=now - timedelta(hours=2),
        ends_at=period_end,
        granted_by_user_id=user.id,
        amount=1,
        commit=True,
    )
    addon_a = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(hours=1),
        period_end=period_end,
        source=UserAddonSource.PURCHASE,
        amount=2,
        provider_ref="fake:a",
        commit=True,
    )
    addon_b = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now,
        period_end=period_end,
        source=UserAddonSource.PURCHASE,
        amount=2,
        provider_ref="fake:b",
        commit=True,
    )

    types = []
    for i in range(5):
        r = check_and_consume_message_unit(
            db, user.id, source_event_key=f"ord-{i}"
        )
        assert r.consumed, r
        entry = (
            db.query(AddonUsageLedgerEntry)
            .filter(AddonUsageLedgerEntry.source_event_key == f"ord-{i}")
            .one()
        )
        types.append(entry.source_type)

    assert types[0] == AddonUsageSourceType.PLAN_BASE.value
    assert types[1] == AddonUsageSourceType.GIFT.value
    assert types[1] and (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "ord-1")
        .one()
        .gift_grant_id
        == gift.id
    )
    assert types[2] == AddonUsageSourceType.PAID_ADDON.value
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "ord-2")
        .one()
        .user_addon_id
        == addon_a.id
    )
    assert types[3] == AddonUsageSourceType.PAID_ADDON.value
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "ord-3")
        .one()
        .user_addon_id
        == addon_a.id
    )
    assert types[4] == AddonUsageSourceType.PAID_ADDON.value
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "ord-4")
        .one()
        .user_addon_id
        == addon_b.id
    )
    assert fifo_ledger_used(db, addon_a.id) == 2
    assert fifo_ledger_used(db, addon_b.id) == 1


def test_fifo_two_paid_same_created_stable_id_order(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=0)
    pkg = _msg_pkg(db)
    now = _utc()
    same = now - timedelta(minutes=5)
    a = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=same,
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=1,
        provider_ref="fake:same-a",
        commit=True,
    )
    b = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=same,
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=1,
        provider_ref="fake:same-b",
        commit=True,
    )
    # Force identical created_at; id order decides FIFO.
    a.created_at = same.replace(tzinfo=None)
    b.created_at = same.replace(tzinfo=None)
    db.commit()
    first_id, second_id = sorted([a.id, b.id])

    r1 = check_and_consume_message_unit(db, user.id, source_event_key="same-1")
    r2 = check_and_consume_message_unit(db, user.id, source_event_key="same-2")
    assert r1.consumed and r2.consumed
    e1 = (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "same-1")
        .one()
    )
    e2 = (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "same-2")
        .one()
    )
    assert e1.user_addon_id == first_id
    assert e2.user_addon_id == second_id


def test_idempotent_source_event_key(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=5)
    r1 = check_and_consume_message_unit(db, user.id, source_event_key="idem-1")
    r2 = check_and_consume_message_unit(db, user.id, source_event_key="idem-1")
    assert r1.consumed and r2.consumed
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "idem-1")
        .count()
        == 1
    )
    summary = get_user_tariff_limits(db, user.id)
    assert summary.messages_used == 1


def test_compensation_and_repeat(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=5)
    r = check_and_consume_message_unit(db, user.id, source_event_key="comp-1")
    assert r.consumed
    refund_consumed_message_unit(db, user.id, r)
    assert get_user_tariff_limits(db, user.id).messages_used == 0
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(
            AddonUsageLedgerEntry.operation
            == AddonUsageOperation.COMPENSATION.value
        )
        .count()
        == 1
    )
    # Repeat compensation — idempotent.
    refund_consumed_message_unit(db, user.id, r)
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(
            AddonUsageLedgerEntry.operation
            == AddonUsageOperation.COMPENSATION.value
        )
        .count()
        == 1
    )
    assert get_user_tariff_limits(db, user.id).messages_used == 0


def test_cancelled_and_expired_addon_skipped(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=0)
    pkg = _msg_pkg(db)
    now = _utc()
    dead = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=10,
        provider_ref="fake:dead",
        commit=True,
    )
    dead.status = UserAddonStatus.CANCELLED
    live = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=2,
        provider_ref="fake:live",
        commit=True,
    )
    db.commit()
    r = check_and_consume_message_unit(db, user.id, source_event_key="skip-1")
    assert r.consumed
    entry = (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "skip-1")
        .one()
    )
    assert entry.user_addon_id == live.id
    assert fifo_ledger_used(db, dead.id) == 0


def test_reserved_units_not_spent(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=0)
    pkg = _msg_pkg(db)
    now = _utc()
    addon = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(hours=1),
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=2,
        provider_ref="fake:res",
        commit=True,
    )
    reserve_user_addon_units(db, user_addon_id=addon.id, units=1, commit=True)
    assert fifo_ledger_remaining(db, addon.id) == 1
    r1 = check_and_consume_message_unit(db, user.id, source_event_key="res-1")
    assert r1.consumed
    r2 = check_and_consume_message_unit(db, user.id, source_event_key="res-2")
    assert r2.blocked
    assert fifo_ledger_used(db, addon.id) == 1


def test_concurrent_last_unit(client, db):
    """Два consume с разными ключами на последнюю единицу — ровно одно списание."""
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=1)
    r1 = check_and_consume_message_unit(db, user.id, source_event_key="race-a")
    r2 = check_and_consume_message_unit(db, user.id, source_event_key="race-b")
    assert r1.consumed is True
    assert r2.blocked is True
    assert get_user_tariff_limits(db, user.id).messages_used == 1
    debits = (
        db.query(AddonUsageLedgerEntry)
        .filter(
            AddonUsageLedgerEntry.user_id == user.id,
            AddonUsageLedgerEntry.operation == AddonUsageOperation.DEBIT.value,
            AddonUsageLedgerEntry.source_type
            != AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
        )
        .count()
    )
    assert debits == 1


def test_legacy_uncertain_addon_stays_manual(client, db):
    user = _user(client, db)
    cut = _utc() - timedelta(days=10)
    _ensure_cutover(db, at=cut)
    pkg = _msg_pkg(db)
    now = _utc()
    old = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=cut - timedelta(days=5),
        period_end=now + timedelta(days=5),
        source=UserAddonSource.PURCHASE,
        amount=100,
        provider_ref="fake:old",
        commit=True,
    )
    old.created_at = (cut - timedelta(days=1)).replace(tzinfo=None)
    db.add(
        AddonUsageLedgerEntry(
            user_id=user.id,
            source_type=AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
            units=10,
            operation=AddonUsageOperation.DEBIT.value,
            source_event_key="legacy-test",
            period_start=old.period_start,
            period_end=old.period_end,
            created_at=cut.replace(tzinfo=None),
        )
    )
    db.commit()
    assert addon_has_pre_cutover_uncertainty(db, addon=old, paid_at=cut - timedelta(days=2))


def test_new_addon_fifo_precise(client, db):
    user = _user(client, db)
    cut = _utc() - timedelta(days=1)
    _ensure_cutover(db, at=cut)
    _plan(db, user, messages=0)
    pkg = _msg_pkg(db)
    now = _utc()
    addon = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(minutes=1),
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=3,
        provider_ref="fake:new",
        commit=True,
    )
    assert not addon_has_pre_cutover_uncertainty(
        db, addon=addon, paid_at=now
    )
    check_and_consume_message_unit(db, user.id, source_event_key="new-1")
    assert fifo_ledger_used(db, addon.id) == 1


def test_gifts_unchanged_by_paid_debit(client, db):
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=0)
    pkg = _msg_pkg(db)
    now = _utc()
    gift = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.MESSAGES,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(days=10),
        granted_by_user_id=user.id,
        amount=5,
        commit=True,
    )
    create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=now - timedelta(hours=1),
        period_end=now + timedelta(days=10),
        source=UserAddonSource.PURCHASE,
        amount=1,
        provider_ref="fake:pg",
        commit=True,
    )
    # Exhaust gift first (FIFO), then paid — gift row stays ACTIVE.
    for i in range(5):
        check_and_consume_message_unit(db, user.id, source_event_key=f"g-{i}")
    db.refresh(gift)
    assert gift.status == GiftGrantStatus.ACTIVE
    check_and_consume_message_unit(db, user.id, source_event_key="g-paid")
    db.refresh(gift)
    assert gift.status == GiftGrantStatus.ACTIVE


def test_gift_grant_fifo_order_by_starts_at(client, db):
    """GiftGrant: FIFO tie-break по starts_at, затем id (не created_at)."""
    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=0)
    now = _utc()
    older_start = now - timedelta(days=5)
    newer_start = now - timedelta(days=1)
    g_old = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.MESSAGES,
        starts_at=older_start,
        ends_at=now + timedelta(days=10),
        granted_by_user_id=user.id,
        amount=1,
        commit=True,
    )
    g_new = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.MESSAGES,
        starts_at=newer_start,
        ends_at=now + timedelta(days=10),
        granted_by_user_id=user.id,
        amount=1,
        commit=True,
    )
    # Same created_at; starts_at decides order.
    g_old.created_at = now.replace(tzinfo=None)
    g_new.created_at = now.replace(tzinfo=None)
    db.commit()
    r = check_and_consume_message_unit(db, user.id, source_event_key="gift-order-1")
    assert r.consumed
    entry = (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "gift-order-1")
        .one()
    )
    assert entry.gift_grant_id == g_old.id


def test_conditional_update_failure_rolls_back_ledger(client, db):
    from unittest.mock import patch

    from sqlalchemy.sql.dml import Update

    from backend.models.tariff import UsageCounter

    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=1)
    real_execute = db.execute

    def patched_execute(statement, *args, **kwargs):
        result = real_execute(statement, *args, **kwargs)
        if isinstance(statement, Update):
            table = getattr(statement, "table", None)
            if table is not None and getattr(table, "name", "") == "usage_counters":
                result.rowcount = 0
        return result

    with patch.object(db, "execute", side_effect=patched_execute):
        r = check_and_consume_message_unit(
            db, user.id, source_event_key="rollback-test"
        )
    assert not r.consumed
    assert (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == "rollback-test")
        .count()
        == 0
    )
    assert get_user_tariff_limits(db, user.id).messages_used == 0


def test_different_bots_different_event_keys(client, db):
    import json
    import uuid
    from unittest.mock import patch

    from backend.main import app
    from backend.models.bot import Bot
    from backend.models.bot_channel import BotChannelConnection
    from fastapi.testclient import TestClient

    user = _user(client, db)
    _ensure_cutover(db)
    _plan(db, user, messages=100)
    uid = uuid.uuid4().hex[:8]
    bot_a = Bot(
        owner_id=user.id,
        title="Bot A",
        username=f"bot_a_{uid}"[:32],
        token=f"123456789:AA{uid}",
        is_active=True,
    )
    bot_b = Bot(
        owner_id=user.id,
        title="Bot B",
        username=f"bot_b_{uid}"[:32],
        token=f"987654321:BB{uid}",
        is_active=True,
    )
    db.add(bot_a)
    db.add(bot_b)
    db.flush()
    for bot in (bot_a, bot_b):
        db.add(
            BotChannelConnection(
                bot_id=bot.id,
                channel="telegram",
                is_enabled=True,
                credentials_json=json.dumps({"bot_token": "test"}),
            )
        )
    db.commit()
    payload = {
        "update_id": 424242,
        "message": {
            "message_id": 1,
            "from": {"id": 1},
            "chat": {"id": 2},
            "text": "hi",
        },
    }
    keys = []

    def capture_consume(db_sess, user_id, source_event_key=None, **kwargs):
        keys.append(source_event_key)
        from backend.services.tariff_message_enforcement import (
            check_and_consume_message_unit as real,
        )

        return real(db_sess, user_id, source_event_key=source_event_key, **kwargs)

    with patch(
        "backend.routers.channel_webhooks.check_and_consume_message_unit",
        side_effect=capture_consume,
    ):
        with patch("backend.routers.channel_webhooks.process_channel_update"):
            c = TestClient(app)
            c.post(f"/webhooks/telegram/{bot_a.id}", json=payload)
            c.post(f"/webhooks/telegram/{bot_b.id}", json=payload)
    assert len(keys) == 2
    assert keys[0] != keys[1]
    assert f":{bot_a.id}:" in keys[0]
    assert f":{bot_b.id}:" in keys[1]


def test_migration_027_028_upgrade_downgrade_sqlite(tmp_path):
    import os
    import subprocess
    import sys

    root = Path(__file__).resolve().parents[2]
    db_path = tmp_path / "fifo_mig.db"
    url = "sqlite:///" + str(db_path.resolve()).replace("\\", "/")
    script = f"""
import os, sys
os.environ["DATABASE_URL"] = {url!r}
os.environ["TESTING"] = "true"
sys.path.insert(0, {str(root)!r})
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from backend.settings import settings
settings.DATABASE_URL = {url!r}
cfg = Config(os.path.join({str(root)!r}, "alembic.ini"))
cfg.set_main_option("sqlalchemy.url", {url!r})
cfg.set_main_option(
    "script_location",
    os.path.join({str(root)!r}, "backend", "migrations").replace("\\\\", "/"),
)
command.upgrade(cfg, "addon_fifo_ledger_027")
eng = create_engine({url!r})
insp = inspect(eng)
assert "addon_usage_ledger_entries" in insp.get_table_names()
assert "addon_refund_unit_reservations" not in insp.get_table_names()
eng.dispose()
command.upgrade(cfg, "addon_refund_reservation_028")
eng = create_engine({url!r})
assert "addon_refund_unit_reservations" in inspect(eng).get_table_names()
eng.dispose()
command.downgrade(cfg, "addon_fifo_ledger_027")
eng = create_engine({url!r})
assert "addon_refund_unit_reservations" not in inspect(eng).get_table_names()
eng.dispose()
command.upgrade(cfg, "head")
eng = create_engine({url!r})
assert "addon_refund_unit_reservations" in inspect(eng).get_table_names()
eng.dispose()
print("OK")
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(root),
        capture_output=True,
        text=True,
        env={**os.environ, "DATABASE_URL": url, "TESTING": "true"},
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "OK" in result.stdout


def test_legacy_webhook_and_messages_routes_untouched():
    root = Path(__file__).resolve().parents[1]
    webhook = (root / "routers" / "webhook.py").read_text(encoding="utf-8")
    message = (root / "routers" / "message.py").read_text(encoding="utf-8")
    assert "check_and_consume_message_unit" not in webhook
    assert "fifo_debit" not in webhook
    assert "check_and_consume_message_unit" not in message
    assert "tariff_addon_usage_ledger" not in message
    src = inspect.getsource(check_and_consume_message_unit)
    assert "fifo_debit_message_unit" in src
