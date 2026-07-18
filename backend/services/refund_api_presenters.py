"""
Общие presenters для user/admin refund API.

Whitelist snapshots, единый money contract, признаки manual review.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from backend.models.refund import (
    RefundCalculationStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)


def format_money(value: Any) -> str:
    return f"{Decimal(str(value)).quantize(Decimal('0.01'))}"


def _snap_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def snapshot_has_manual_placeholder_flags(snap: Any) -> bool:
    data = _snap_dict(snap)
    if data.get("proposed_amount_undefined") is True:
        return True
    if data.get("proposed_refund_amount_is_placeholder") is True:
        return True
    if data.get("proposed_refund_semantic") == "undefined_not_denial":
        return True
    if data.get("auto_proposed_deferred") is True:
        return True
    return False


def revision_has_manual_review_signal(revision: RefundRevision | None) -> bool:
    """Фактический признак manual review в текущей revision/расчёте."""
    if revision is None:
        return False
    if revision.calculation_status == RefundCalculationStatus.MANUAL_REQUIRED.value:
        return True
    snap = _snap_dict(revision.calculation_snapshot)
    if snapshot_has_manual_placeholder_flags(snap):
        return True
    if snapshot_has_manual_placeholder_flags(snap.get("auto_snapshot")):
        return True
    return False


def request_has_manual_review_signal(
    request: RefundRequest, revision: RefundRevision | None
) -> bool:
    if request.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value:
        return True
    return revision_has_manual_review_signal(revision)


def is_proposed_amount_undefined(
    revision: RefundRevision | None, request: RefundRequest
) -> bool:
    """
    Placeholder 0.00 не отдаём как рекомендацию.
    После admin edit (явная сумма) — сумма определена.
    """
    if revision is not None:
        snap = _snap_dict(revision.calculation_snapshot)
        if snap.get("admin_edit") is True:
            return False
    if request.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value:
        return True
    if revision is None:
        return False
    if revision.calculation_status == RefundCalculationStatus.MANUAL_REQUIRED.value:
        return True
    snap = _snap_dict(revision.calculation_snapshot)
    return snapshot_has_manual_placeholder_flags(snap)


def recommended_refund_amount_str(
    revision: RefundRevision | None, request: RefundRequest
) -> str | None:
    if revision is None or is_proposed_amount_undefined(revision, request):
        return None
    return format_money(revision.proposed_refund_amount)


_USAGE_COUNTER_KEYS = (
    "period_start",
    "period_end",
    "messages_used",
    "active_bots_used",
    "team_members_used",
    "updated_at",
    "post_purchase_activity_heuristic",
)

_USAGE_ROOT_KEYS = (
    "counters",
    "messages_used_total",
    "active_bots_used_total",
    "team_members_used_total",
    "detectable_pool_usage_after_purchase",
    "usage_updated_at_max",
    "note",
)

_LEDGER_BALANCE_KEYS = (
    "confirmed_refunded_amount",
    "active_reserved_amount",
    "provider_unknown_amount",
    "failed_or_canceled_amount",
    "refundable_available_amount",
    "paid_amount",
    "note",
)

_FINANCIAL_ROOT_KEYS = (
    "formula",
    "basis",
    "ok",
    "reason",
    "grace_hours",
    "grace_skipped",
    "grace_window",
    "grace_blocked_by_usage",
    "grace_blocked_by_confirmed_refunds",
    "grace_blocked_by_entitlement",
    "paid_at",
    "calculation_at",
    "elapsed_ratio",
    "used_amount",
    "product_type",
    "auto_proposed_deferred",
    "proposed_amount_undefined",
    "proposed_refund_amount_is_placeholder",
    "proposed_refund_semantic",
    "note",
    "extra_note",
    "ledger_balance",
    "input_fingerprint",
    "admin_edit",
    "based_on_revision_id",
    "based_on_revision_number",
    "admin_proposed_refund_amount",
    "changed_fields",
    "auto_snapshot",
)

_CHANGED_FIELD_KEYS = (
    "proposed_refund_amount",
    "refund_type",
    "entitlement_action",
    "addon_revoke_units",
)

_ENTITLEMENT_KEYS = (
    "kind",
    "exists",
    "status",
    "subscription_id",
    "user_addon_id",
    "plan_id",
    "amount_units",
    "period_start",
    "period_end",
    "revoked",
    "revoked_or_inactive",
    "source",
)


def _pick(data: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in keys:
        if key in data:
            out[key] = data[key]
    return out


def project_usage_snapshot(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    data = _snap_dict(raw)
    out = _pick(data, _USAGE_ROOT_KEYS)
    counters = out.get("counters")
    if isinstance(counters, list):
        projected: list[dict[str, Any]] = []
        for item in counters:
            if isinstance(item, dict):
                projected.append(_pick(item, _USAGE_COUNTER_KEYS))
        out["counters"] = projected
    elif "counters" in out:
        out["counters"] = []
    return out


def project_financial_snapshot(raw: Any, *, allow_auto_snapshot: bool = True) -> dict[str, Any] | None:
    if raw is None:
        return None
    data = _snap_dict(raw)
    out = _pick(data, _FINANCIAL_ROOT_KEYS)

    ledger = out.get("ledger_balance")
    if isinstance(ledger, dict):
        out["ledger_balance"] = _pick(ledger, _LEDGER_BALANCE_KEYS)
    elif "ledger_balance" in out:
        out.pop("ledger_balance", None)

    changed = out.get("changed_fields")
    if isinstance(changed, dict):
        projected_changed: dict[str, Any] = {}
        for key in _CHANGED_FIELD_KEYS:
            if key not in changed:
                continue
            value = changed[key]
            if isinstance(value, dict):
                projected_changed[key] = _pick(value, ("from", "to"))
            else:
                projected_changed[key] = value
        out["changed_fields"] = projected_changed
    elif "changed_fields" in out:
        out.pop("changed_fields", None)

    if allow_auto_snapshot and "auto_snapshot" in out:
        nested = project_financial_snapshot(
            out.get("auto_snapshot"), allow_auto_snapshot=False
        )
        if nested is None:
            out.pop("auto_snapshot", None)
        else:
            out["auto_snapshot"] = nested
    elif "auto_snapshot" in out:
        out.pop("auto_snapshot", None)

    return out


def project_entitlement_snapshot(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    return _pick(_snap_dict(raw), _ENTITLEMENT_KEYS)
