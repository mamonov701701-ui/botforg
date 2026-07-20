"""
Резервирование единиц paid addon под возврат (этап 6.14.9A).

Создаётся при approve (до денежного execute), освобождается при cancel/reject/
окончательном refund_failed, погашается после успешного entitlement apply.

Не создаётся при manual review / отсутствии fifo_precise.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent
from backend.models.refund import (
    RefundCalculationStatus,
    RefundEntitlementAction,
    RefundRequest,
    RefundRevision,
)
from backend.models.tariff import (
    AddonRefundReservationStatus,
    AddonRefundUnitReservation,
    UserAddon,
    UserAddonSource,
)
from backend.services.tariff_addon_usage_ledger import (
    AddonUsageLedgerError,
    release_user_addon_units,
    reserve_user_addon_units,
)


@dataclass(frozen=True)
class AddonRefundReservationResult:
    reservation: AddonRefundUnitReservation | None
    created: bool
    skipped: bool
    reason: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _revision_entitlement_snapshot(revision: RefundRevision) -> dict[str, Any]:
    snap = revision.entitlement_snapshot
    return snap if isinstance(snap, dict) else {}


def _revision_eligible_for_reserve(
    db: Session,
    request: RefundRequest,
    revision: RefundRevision,
) -> tuple[UserAddon | None, int, str | None]:
    """Return (addon, units, skip_reason)."""
    if revision.calculation_status != RefundCalculationStatus.OK.value:
        return None, 0, "calculation_not_ok"

    ent_snap = _revision_entitlement_snapshot(revision)
    if not ent_snap.get("fifo_precise"):
        return None, 0, "not_fifo_precise"

    usage_snap = revision.usage_snapshot if isinstance(revision.usage_snapshot, dict) else {}
    if usage_snap.get("legacy_unattributed"):
        return None, 0, "legacy_unattributed"

    action = revision.entitlement_action or RefundEntitlementAction.NONE.value
    if action not in {
        RefundEntitlementAction.CANCEL_ADDON.value,
        RefundEntitlementAction.REDUCE_AMOUNT.value,
    }:
        return None, 0, "no_revoke_action"

    revoke = int(revision.addon_revoke_units or 0)
    if revoke <= 0:
        return None, 0, "no_revoke_units"

    intent = db.get(CheckoutIntent, int(request.checkout_intent_id))
    if intent is None or intent.fulfilled_addon_id is None:
        return None, 0, "no_fulfilled_addon"

    addon = db.get(UserAddon, int(intent.fulfilled_addon_id))
    if addon is None:
        return None, 0, "addon_not_found"

    source = addon.source.value if hasattr(addon.source, "value") else str(addon.source)
    if source != UserAddonSource.PURCHASE.value:
        return None, 0, "not_paid_addon"

    return addon, revoke, None


def _get_active_reservation(
    db: Session, refund_request_id: int
) -> AddonRefundUnitReservation | None:
    return (
        db.query(AddonRefundUnitReservation)
        .filter(
            AddonRefundUnitReservation.refund_request_id == int(refund_request_id),
            AddonRefundUnitReservation.status
            == AddonRefundReservationStatus.ACTIVE.value,
        )
        .first()
    )


def ensure_addon_refund_reservation(
    db: Session,
    request: RefundRequest,
    revision: RefundRevision,
    *,
    commit: bool = False,
) -> AddonRefundReservationResult:
    """
    Идемпотентно зарезервировать addon_revoke_units для approved revision.
  """
    addon, units, skip_reason = _revision_eligible_for_reserve(db, request, revision)
    if addon is None or units <= 0:
        return AddonRefundReservationResult(
            reservation=None, created=False, skipped=True, reason=skip_reason
        )

    existing = _get_active_reservation(db, int(request.id))
    if existing is not None:
        if (
            int(existing.refund_revision_id or 0) == int(revision.id)
            and int(existing.units) == int(units)
            and int(existing.user_addon_id) == int(addon.id)
        ):
            return AddonRefundReservationResult(
                reservation=existing, created=False, skipped=False
            )
        release_addon_refund_reservation(db, int(request.id), commit=False)

    reserve_user_addon_units(
        db,
        user_addon_id=int(addon.id),
        units=int(units),
        commit=False,
    )
    row = AddonRefundUnitReservation(
        refund_request_id=int(request.id),
        refund_revision_id=int(revision.id),
        user_addon_id=int(addon.id),
        units=int(units),
        status=AddonRefundReservationStatus.ACTIVE.value,
        created_at=_utcnow().replace(tzinfo=None),
        updated_at=_utcnow().replace(tzinfo=None),
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return AddonRefundReservationResult(
        reservation=row, created=True, skipped=False
    )


def release_addon_refund_reservation(
    db: Session,
    refund_request_id: int,
    *,
    commit: bool = False,
) -> bool:
    """Освободить активный резерв (идемпотентно)."""
    row = _get_active_reservation(db, int(refund_request_id))
    if row is None:
        return False
    try:
        release_user_addon_units(
            db,
            user_addon_id=int(row.user_addon_id),
            units=int(row.units),
            commit=False,
        )
    except AddonUsageLedgerError:
        # Best-effort: mark released even if counter drifted.
        pass
    row.status = AddonRefundReservationStatus.RELEASED.value
    row.updated_at = _utcnow().replace(tzinfo=None)
    if commit:
        db.commit()
    else:
        db.flush()
    return True


def consume_addon_refund_reservation(
    db: Session,
    refund_request_id: int,
    *,
    commit: bool = False,
) -> bool:
    """Погасить резерв после успешного entitlement (идемпотентно)."""
    row = (
        db.query(AddonRefundUnitReservation)
        .filter(
            AddonRefundUnitReservation.refund_request_id == int(refund_request_id),
        )
        .first()
    )
    if row is None:
        return False
    if row.status == AddonRefundReservationStatus.CONSUMED.value:
        return False
    if row.status == AddonRefundReservationStatus.RELEASED.value:
        return False
    try:
        release_user_addon_units(
            db,
            user_addon_id=int(row.user_addon_id),
            units=int(row.units),
            commit=False,
        )
    except AddonUsageLedgerError:
        pass
    row.status = AddonRefundReservationStatus.CONSUMED.value
    row.updated_at = _utcnow().replace(tzinfo=None)
    if commit:
        db.commit()
    else:
        db.flush()
    return True
