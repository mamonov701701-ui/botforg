"""
FIFO-журнал расхода сообщений по источникам лимита (этап 6.14.9A).

Порядок списания:
1. базовый лимит тарифа;
2. активные подарочные лимиты (GiftGrant + UserAddon source≠purchase) — старые → новые, id;
3. активные платные дополнения (UserAddon source=purchase) — старые → новые, id.

Истёкшие / отменённые / reserved не расходуются.
Legacy-unattributed помечает пул до cutover без атрибуции к addon.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AddonUsageLedgerEntry,
    AddonUsageOperation,
    AddonUsageSourceType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    TariffFifoCutover,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)


class AddonUsageLedgerError(Exception):
    def __init__(self, message: str, *, code: str = "ledger_error"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class FifoBucket:
    source_type: str
    grant_units: int
    remaining: int
    user_addon_id: int | None = None
    gift_grant_id: int | None = None
    sort_key: tuple = ()


@dataclass
class FifoDebitResult:
    entry: AddonUsageLedgerEntry
    already_applied: bool
    source_type: str
    user_addon_id: int | None
    gift_grant_id: int | None


@dataclass
class FifoCompensationResult:
    entry: AddonUsageLedgerEntry | None
    already_applied: bool
    compensated: bool


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _enum_value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _periods_overlap(
    a_start: datetime,
    a_end: datetime,
    b_start: datetime,
    b_end: datetime,
) -> bool:
    return a_start < b_end and b_start < a_end


def get_fifo_cutover_at(db: Session) -> datetime | None:
    row = db.query(TariffFifoCutover).order_by(TariffFifoCutover.id.asc()).first()
    if row is None:
        return None
    return _normalize_dt(row.cutover_at)


def net_units_for_filter(
    db: Session,
    *,
    user_id: int,
    source_type: str | None = None,
    user_addon_id: int | None = None,
    gift_grant_id: int | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> int:
    """Net debit units (debit − compensation) matching filters."""
    q = db.query(
        AddonUsageLedgerEntry.operation,
        func.coalesce(func.sum(AddonUsageLedgerEntry.units), 0),
    ).filter(AddonUsageLedgerEntry.user_id == int(user_id))
    if source_type is not None:
        q = q.filter(AddonUsageLedgerEntry.source_type == source_type)
    if user_addon_id is not None:
        q = q.filter(AddonUsageLedgerEntry.user_addon_id == int(user_addon_id))
    if gift_grant_id is not None:
        q = q.filter(AddonUsageLedgerEntry.gift_grant_id == int(gift_grant_id))
    if period_start is not None and period_end is not None:
        # Entries for this billing period (exact match preferred).
        ps = _normalize_dt(period_start).replace(tzinfo=None)
        pe = _normalize_dt(period_end).replace(tzinfo=None)
        q = q.filter(
            AddonUsageLedgerEntry.period_start == ps,
            AddonUsageLedgerEntry.period_end == pe,
        )
    q = q.group_by(AddonUsageLedgerEntry.operation)
    debit = 0
    comp = 0
    for op, total in q.all():
        op_v = _enum_value(op)
        if op_v == AddonUsageOperation.DEBIT.value:
            debit = int(total or 0)
        elif op_v == AddonUsageOperation.COMPENSATION.value:
            comp = int(total or 0)
    return max(0, debit - comp)


def fifo_ledger_used(db: Session, user_addon_id: int) -> int:
    """Точный расход конкретного UserAddon (net debit)."""
    addon = db.get(UserAddon, int(user_addon_id))
    if addon is None:
        return 0
    return net_units_for_filter(
        db,
        user_id=int(addon.user_id),
        source_type=AddonUsageSourceType.PAID_ADDON.value,
        user_addon_id=int(user_addon_id),
    )


def fifo_ledger_remaining(db: Session, user_addon_id: int) -> int:
    """Остаток к расходованию: grant − used − reserved (не ниже 0)."""
    addon = db.get(UserAddon, int(user_addon_id))
    if addon is None:
        return 0
    status = _enum_value(addon.status)
    if status in (
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    ):
        return 0
    used = fifo_ledger_used(db, int(user_addon_id))
    reserved = max(0, int(addon.reserved_units or 0))
    return max(0, int(addon.amount or 0) - used - reserved)


def has_legacy_unattributed(
    db: Session,
    *,
    user_id: int,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> bool:
    q = db.query(AddonUsageLedgerEntry.id).filter(
        AddonUsageLedgerEntry.user_id == int(user_id),
        AddonUsageLedgerEntry.source_type
        == AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
        AddonUsageLedgerEntry.operation == AddonUsageOperation.DEBIT.value,
    )
    if period_start is not None and period_end is not None:
        ps = _normalize_dt(period_start)
        pe = _normalize_dt(period_end)
        # Overlap check in Python after fetch is safer across dialects for DateTime.
        rows = q.all()
        if not rows:
            return False
        entries = (
            db.query(AddonUsageLedgerEntry)
            .filter(AddonUsageLedgerEntry.id.in_([r[0] for r in rows]))
            .all()
        )
        for e in entries:
            if _periods_overlap(
                _normalize_dt(e.period_start),
                _normalize_dt(e.period_end),
                ps,
                pe,
            ):
                return True
        return False
    return q.first() is not None


def addon_has_pre_cutover_uncertainty(
    db: Session,
    *,
    addon: UserAddon,
    paid_at: datetime | None,
) -> bool:
    """
    Старые дополнения с возможным расходом до cutover → manual review.

    Новые (created/paid после cutover) — точный FIFO, даже если в периоде есть legacy.
    """
    cutover = get_fifo_cutover_at(db)
    if cutover is None:
        return has_legacy_unattributed(
            db,
            user_id=int(addon.user_id),
            period_start=addon.period_start,
            period_end=addon.period_end,
        )
    created = _normalize_dt(addon.created_at)
    paid = _normalize_dt(paid_at) if paid_at is not None else None
    if created >= cutover and (paid is None or paid >= cutover):
        return False
    return has_legacy_unattributed(
        db,
        user_id=int(addon.user_id),
        period_start=addon.period_start,
        period_end=addon.period_end,
    ) or has_legacy_unattributed(db, user_id=int(addon.user_id))


def _gift_message_amount(db: Session, grant: GiftGrant) -> int:
    gift_type = _enum_value(grant.gift_type)
    if gift_type == GiftType.MESSAGES.value:
        return max(0, int(grant.amount or 0))
    if gift_type == GiftType.ADDON.value and grant.addon_package_id:
        pkg = db.get(AddonPackage, int(grant.addon_package_id))
        if pkg is None:
            return 0
        if _enum_value(pkg.type) != AddonPackageType.MESSAGES.value:
            return 0
        return max(0, int(grant.amount or pkg.amount or 0))
    return 0


def _build_fifo_buckets(
    db: Session,
    *,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
    plan_base_limit: int,
    pool_messages_used: int = 0,
) -> list[FifoBucket]:
    """Ordered buckets with remaining > 0 only omitted later."""
    at_n = _normalize_dt(at)
    ps = _normalize_dt(period_start)
    pe = _normalize_dt(period_end)
    buckets: list[FifoBucket] = []

    plan_used = net_units_for_filter(
        db,
        user_id=user_id,
        source_type=AddonUsageSourceType.PLAN_BASE.value,
        period_start=ps,
        period_end=pe,
    )
    attributed = (
        net_units_for_filter(
            db, user_id=user_id, period_start=ps, period_end=pe
        )
    )
    # Pool units without ledger rows (seeds / pre-ledger drift) consume plan_base first.
    unledgered = max(0, int(pool_messages_used) - int(attributed))
    plan_remaining = max(0, int(plan_base_limit) - plan_used - unledgered)
    buckets.append(
        FifoBucket(
            source_type=AddonUsageSourceType.PLAN_BASE.value,
            grant_units=int(plan_base_limit),
            remaining=plan_remaining,
            sort_key=(0, 0, 0),
        )
    )

    # Gifts: GiftGrant (sort by starts_at, id) + non-purchase UserAddon (created_at, id).
    gift_buckets: list[FifoBucket] = []
    grants = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.target_user_id == int(user_id),
            GiftGrant.status == GiftGrantStatus.ACTIVE,
        )
        .all()
    )
    for grant in grants:
        starts = _normalize_dt(grant.starts_at)
        ends = _normalize_dt(grant.ends_at)
        if not (starts <= at_n <= ends):
            continue
        if not _periods_overlap(starts, ends, ps, pe):
            continue
        amount = _gift_message_amount(db, grant)
        if amount <= 0:
            continue
        used = net_units_for_filter(
            db,
            user_id=user_id,
            source_type=AddonUsageSourceType.GIFT.value,
            gift_grant_id=int(grant.id),
        )
        remaining = max(0, amount - used)
        gift_buckets.append(
            FifoBucket(
                source_type=AddonUsageSourceType.GIFT.value,
                grant_units=amount,
                remaining=remaining,
                gift_grant_id=int(grant.id),
                sort_key=(1, starts.timestamp(), int(grant.id)),
            )
        )

    # Non-purchase message UserAddons act as gift-like grants.
    soft_addons = (
        db.query(UserAddon)
        .filter(
            UserAddon.user_id == int(user_id),
            UserAddon.status == UserAddonStatus.ACTIVE,
            UserAddon.source != UserAddonSource.PURCHASE,
        )
        .all()
    )
    for addon in soft_addons:
        a_start = _normalize_dt(addon.period_start)
        a_end = _normalize_dt(addon.period_end)
        if not (a_start <= at_n <= a_end):
            continue
        if not _periods_overlap(a_start, a_end, ps, pe):
            continue
        pkg = db.get(AddonPackage, int(addon.addon_package_id))
        if pkg is None or _enum_value(pkg.type) != AddonPackageType.MESSAGES.value:
            continue
        # Track under GIFT source_type but with user_addon_id for audit.
        used = net_units_for_filter(
            db,
            user_id=user_id,
            source_type=AddonUsageSourceType.GIFT.value,
            user_addon_id=int(addon.id),
        )
        reserved = max(0, int(addon.reserved_units or 0))
        remaining = max(0, int(addon.amount or 0) - used - reserved)
        created = _normalize_dt(addon.created_at)
        gift_buckets.append(
            FifoBucket(
                source_type=AddonUsageSourceType.GIFT.value,
                grant_units=int(addon.amount or 0),
                remaining=remaining,
                user_addon_id=int(addon.id),
                sort_key=(1, created.timestamp(), int(addon.id)),
            )
        )
    gift_buckets.sort(key=lambda b: b.sort_key)
    buckets.extend(gift_buckets)

    paid: list[FifoBucket] = []
    paid_addons = (
        db.query(UserAddon)
        .filter(
            UserAddon.user_id == int(user_id),
            UserAddon.status == UserAddonStatus.ACTIVE,
            UserAddon.source == UserAddonSource.PURCHASE,
        )
        .all()
    )
    for addon in paid_addons:
        a_start = _normalize_dt(addon.period_start)
        a_end = _normalize_dt(addon.period_end)
        if not (a_start <= at_n <= a_end):
            continue
        if not _periods_overlap(a_start, a_end, ps, pe):
            continue
        pkg = db.get(AddonPackage, int(addon.addon_package_id))
        if pkg is None or _enum_value(pkg.type) != AddonPackageType.MESSAGES.value:
            continue
        used = fifo_ledger_used(db, int(addon.id))
        reserved = max(0, int(addon.reserved_units or 0))
        remaining = max(0, int(addon.amount or 0) - used - reserved)
        created = _normalize_dt(addon.created_at)
        paid.append(
            FifoBucket(
                source_type=AddonUsageSourceType.PAID_ADDON.value,
                grant_units=int(addon.amount or 0),
                remaining=remaining,
                user_addon_id=int(addon.id),
                sort_key=(2, created.timestamp(), int(addon.id)),
            )
        )
    paid.sort(key=lambda b: b.sort_key)
    buckets.extend(paid)
    return buckets


def select_fifo_bucket(
    db: Session,
    *,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
    plan_base_limit: int,
    pool_messages_used: int = 0,
) -> FifoBucket | None:
    for bucket in _build_fifo_buckets(
        db,
        user_id=user_id,
        at=at,
        period_start=period_start,
        period_end=period_end,
        plan_base_limit=plan_base_limit,
        pool_messages_used=pool_messages_used,
    ):
        if bucket.remaining > 0:
            return bucket
    return None


def find_ledger_by_event_key(
    db: Session, source_event_key: str
) -> AddonUsageLedgerEntry | None:
    return (
        db.query(AddonUsageLedgerEntry)
        .filter(AddonUsageLedgerEntry.source_event_key == source_event_key)
        .first()
    )


def fifo_debit_message_unit(
    db: Session,
    *,
    user_id: int,
    source_event_key: str,
    period_start: datetime,
    period_end: datetime,
    plan_base_limit: int,
    usage_counter_id: int | None,
    at: datetime | None = None,
    pool_messages_used: int = 0,
) -> FifoDebitResult:
    """
    Записать FIFO-списание 1 единицы. Идемпотентно по source_event_key.
    Не коммитит — вызывающий держит транзакцию вместе с UsageCounter.
    """
    key = (source_event_key or "").strip()
    if not key:
        raise AddonUsageLedgerError(
            "source_event_key required",
            code="source_event_key_required",
        )
    existing = find_ledger_by_event_key(db, key)
    if existing is not None:
        if _enum_value(existing.operation) != AddonUsageOperation.DEBIT.value:
            raise AddonUsageLedgerError(
                "source_event_key already used for non-debit",
                code="source_event_key_conflict",
            )
        return FifoDebitResult(
            entry=existing,
            already_applied=True,
            source_type=_enum_value(existing.source_type),
            user_addon_id=existing.user_addon_id,
            gift_grant_id=existing.gift_grant_id,
        )

    at_n = _normalize_dt(at or _utcnow())
    ps = _normalize_dt(period_start)
    pe = _normalize_dt(period_end)

    # Lock paid addon candidates to reduce concurrent overspend.
    (
        db.query(UserAddon)
        .filter(
            UserAddon.user_id == int(user_id),
            UserAddon.status == UserAddonStatus.ACTIVE,
            UserAddon.source == UserAddonSource.PURCHASE,
        )
        .with_for_update()
        .all()
    )

    bucket = select_fifo_bucket(
        db,
        user_id=int(user_id),
        at=at_n,
        period_start=ps,
        period_end=pe,
        plan_base_limit=int(plan_base_limit),
        pool_messages_used=int(pool_messages_used),
    )
    if bucket is None or bucket.remaining < 1:
        raise AddonUsageLedgerError(
            "No FIFO bucket remaining for debit",
            code="fifo_exhausted",
        )

    if bucket.user_addon_id is not None:
        addon = (
            db.query(UserAddon)
            .filter(UserAddon.id == int(bucket.user_addon_id))
            .with_for_update()
            .first()
        )
        if addon is None or _enum_value(addon.status) != UserAddonStatus.ACTIVE.value:
            raise AddonUsageLedgerError(
                "Target addon not active",
                code="addon_not_active",
            )
        rem = fifo_ledger_remaining(db, int(addon.id))
        if rem < 1:
            raise AddonUsageLedgerError(
                "Addon remaining is zero (used or reserved)",
                code="addon_exhausted",
            )

    entry = AddonUsageLedgerEntry(
        user_id=int(user_id),
        source_type=bucket.source_type,
        user_addon_id=bucket.user_addon_id,
        gift_grant_id=bucket.gift_grant_id,
        units=1,
        operation=AddonUsageOperation.DEBIT.value,
        source_event_key=key,
        compensates_event_key=None,
        period_start=ps.replace(tzinfo=None) if ps.tzinfo else ps,
        period_end=pe.replace(tzinfo=None) if pe.tzinfo else pe,
        usage_counter_id=usage_counter_id,
        created_at=_utcnow().replace(tzinfo=None),
    )
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except IntegrityError as exc:
        again = find_ledger_by_event_key(db, key)
        if again is not None:
            return FifoDebitResult(
                entry=again,
                already_applied=True,
                source_type=_enum_value(again.source_type),
                user_addon_id=again.user_addon_id,
                gift_grant_id=again.gift_grant_id,
            )
        raise AddonUsageLedgerError(
            "Ledger insert conflict",
            code="ledger_integrity",
        ) from exc

    if bucket.user_addon_id is not None:
        used_after = fifo_ledger_used(db, int(bucket.user_addon_id))
        addon = db.get(UserAddon, int(bucket.user_addon_id))
        assert addon is not None
        reserved = max(0, int(addon.reserved_units or 0))
        if used_after + reserved > int(addon.amount or 0):
            raise AddonUsageLedgerError(
                "FIFO debit would exceed addon grant",
                code="negative_remaining",
            )

    return FifoDebitResult(
        entry=entry,
        already_applied=False,
        source_type=bucket.source_type,
        user_addon_id=bucket.user_addon_id,
        gift_grant_id=bucket.gift_grant_id,
    )


def compensation_event_key(debit_source_event_key: str) -> str:
    return f"{debit_source_event_key}:compensation"


def fifo_compensate_message_unit(
    db: Session,
    *,
    debit_source_event_key: str,
) -> FifoCompensationResult:
    """
    Компенсация ранее выполненного списания. Идемпотентна.
    Не коммитит — вызывающий атомарно уменьшает UsageCounter.
    """
    debit_key = (debit_source_event_key or "").strip()
    if not debit_key:
        return FifoCompensationResult(
            entry=None, already_applied=False, compensated=False
        )

    comp_key = compensation_event_key(debit_key)
    existing_comp = find_ledger_by_event_key(db, comp_key)
    if existing_comp is not None:
        return FifoCompensationResult(
            entry=existing_comp, already_applied=True, compensated=True
        )

    debit = find_ledger_by_event_key(db, debit_key)
    if debit is None:
        return FifoCompensationResult(
            entry=None, already_applied=False, compensated=False
        )
    if _enum_value(debit.operation) != AddonUsageOperation.DEBIT.value:
        return FifoCompensationResult(
            entry=None, already_applied=False, compensated=False
        )

    entry = AddonUsageLedgerEntry(
        user_id=int(debit.user_id),
        source_type=_enum_value(debit.source_type),
        user_addon_id=debit.user_addon_id,
        gift_grant_id=debit.gift_grant_id,
        units=int(debit.units or 1),
        operation=AddonUsageOperation.COMPENSATION.value,
        source_event_key=comp_key,
        compensates_event_key=debit_key,
        period_start=debit.period_start,
        period_end=debit.period_end,
        usage_counter_id=debit.usage_counter_id,
        created_at=_utcnow().replace(tzinfo=None),
    )
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except IntegrityError:
        again = find_ledger_by_event_key(db, comp_key)
        if again is not None:
            return FifoCompensationResult(
                entry=again, already_applied=True, compensated=True
            )
        raise
    return FifoCompensationResult(
        entry=entry, already_applied=False, compensated=True
    )


def reserve_user_addon_units(
    db: Session,
    *,
    user_addon_id: int,
    units: int,
    commit: bool = False,
) -> UserAddon:
    """Зарезервировать единицы под возврат (исключаются из FIFO spend)."""
    if int(units) < 0:
        raise AddonUsageLedgerError("units must be >= 0", code="invalid_reserve")
    addon = (
        db.query(UserAddon)
        .filter(UserAddon.id == int(user_addon_id))
        .with_for_update()
        .first()
    )
    if addon is None:
        raise AddonUsageLedgerError("addon not found", code="addon_not_found")
    used = fifo_ledger_used(db, int(addon.id))
    available = max(0, int(addon.amount or 0) - used - max(0, int(addon.reserved_units or 0)))
    if int(units) > available:
        raise AddonUsageLedgerError(
            "Cannot reserve more than available remaining",
            code="reserve_exceeds_remaining",
        )
    addon.reserved_units = int(addon.reserved_units or 0) + int(units)
    addon.updated_at = _utcnow().replace(tzinfo=None)
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon


def release_user_addon_units(
    db: Session,
    *,
    user_addon_id: int,
    units: int,
    commit: bool = False,
) -> UserAddon:
    """Освободить ранее зарезервированные единицы (не ниже 0)."""
    if int(units) < 0:
        raise AddonUsageLedgerError("units must be >= 0", code="invalid_release")
    addon = (
        db.query(UserAddon)
        .filter(UserAddon.id == int(user_addon_id))
        .with_for_update()
        .first()
    )
    if addon is None:
        raise AddonUsageLedgerError("addon not found", code="addon_not_found")
    release = min(int(units), max(0, int(addon.reserved_units or 0)))
    addon.reserved_units = max(0, int(addon.reserved_units or 0) - release)
    addon.updated_at = _utcnow().replace(tzinfo=None)
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon
