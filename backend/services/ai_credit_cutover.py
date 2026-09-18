"""Idempotent 7.3 -> 7.4 opening-grant command. It is deliberately not an Alembic migration."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.models.plan import Plan
from backend.models.tariff import AddonPackage, AddonPackageType, GiftGrant, GiftGrantStatus, GiftType, SubscriptionStatus, UserAddon, UserAddonStatus, UserSubscription
from backend.models.user import User
from backend.services.ai_credits import grant_credits
from backend.models.ai_credit import AiCreditLedgerEntry
from backend.services.tariff_limits import _parse_plan_limits, _resolve_effective_plan

@dataclass
class CutoverReport:
    created: int = 0; already_existed: int = 0; skipped_zero: int = 0; legacy_manual: list[int] = field(default_factory=list); errors: list[str] = field(default_factory=list)

def run_ai_credit_cutover(db: Session, *, now: datetime | None = None) -> CutoverReport:
    at = now or datetime.now(timezone.utc); report = CutoverReport()
    for user in db.query(User).all():
        try:
            sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id, UserSubscription.status == SubscriptionStatus.ACTIVE, UserSubscription.current_period_start <= at, UserSubscription.current_period_end > at).first()
            if sub:
                amount = int(_parse_plan_limits(sub.plan).get("ai_credits") or 0)
                if amount:
                    key = f"ai-credit:cutover:subscription:{sub.id}:{sub.current_period_start.isoformat()}"
                    existed = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.idempotency_key == key).first() is not None
                    grant_credits(db, user_id=user.id, amount=amount, credit_class="included", source_type="subscription", source_ref_type="user_subscription", source_ref_id=sub.id, idempotency_key=f"ai-credit:cutover:subscription:{sub.id}:{sub.current_period_start.isoformat()}", expires_at=sub.current_period_end, reason_code="cutover_opening")
                    report.already_existed += int(existed); report.created += int(not existed)
                else: report.skipped_zero += 1
            elif (user.plan_code or "").strip():
                # Legacy plan_code has no durable expiry/source and must never become an invented grant.
                report.legacy_manual.append(int(user.id))
            addons = db.query(UserAddon).join(AddonPackage).filter(UserAddon.user_id == user.id, UserAddon.status == UserAddonStatus.ACTIVE, UserAddon.period_start <= at, UserAddon.period_end > at, AddonPackage.type == AddonPackageType.AI_CREDITS).all()
            for addon in addons:
                amount = int(addon.amount or 0)
                if amount:
                    key = f"ai-credit:cutover:addon:{addon.id}"
                    existed = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.idempotency_key == key).first() is not None
                    grant_credits(db, user_id=user.id, amount=amount, credit_class="purchased", source_type="addon", source_ref_type="user_addon", source_ref_id=addon.id, idempotency_key=key, expires_at=addon.period_end, reason_code="cutover_opening")
                    report.already_existed += int(existed); report.created += int(not existed)
                else: report.skipped_zero += 1
        except Exception as exc:
            report.errors.append(f"user {user.id}: {exc}")
    db.flush(); return report
