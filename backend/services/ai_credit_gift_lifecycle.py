"""Grant/revoke AI included allowance for the canonical effective plan gift only."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.models.ai_credit import AiCreditBucket
from backend.models.tariff import GiftGrant, GiftGrantStatus, GiftType, SubscriptionStatus, UserSubscription
from backend.services.ai_credits import grant_credits, revoke_bucket
from backend.services.tariff_limits import _parse_plan_limits

def sync_effective_plan_gift_ai_credits(db: Session, *, user_id: int, now: datetime | None = None) -> None:
    at = now or datetime.now(timezone.utc)
    # Subscription is canonical precedence over a plan gift.
    # This function is invoked by entitlement/payment flows.  Its reads must
    # not flush unrelated caller-owned ORM state.
    with db.no_autoflush:
        has_subscription = db.query(UserSubscription).filter(UserSubscription.user_id == user_id, UserSubscription.status == SubscriptionStatus.ACTIVE, UserSubscription.current_period_start <= at, UserSubscription.current_period_end > at).first() is not None
        gifts = db.query(GiftGrant).filter(GiftGrant.target_user_id == user_id, GiftGrant.gift_type == GiftType.PLAN, GiftGrant.status == GiftGrantStatus.ACTIVE, GiftGrant.starts_at <= at, GiftGrant.ends_at > at).all()
    active_gift_id = None if has_subscription else (max(gifts, key=lambda gift: (getattr(gift.plan, "sort_order", 0), gift.id)).id if gifts else None)
    with db.no_autoflush:
        active_buckets = db.query(AiCreditBucket).filter(AiCreditBucket.user_id == user_id, AiCreditBucket.source_ref_type == "gift_grant", AiCreditBucket.status == "active").all()
    for bucket in active_buckets:
        if str(bucket.source_ref_id) != str(active_gift_id):
            revoke_bucket(db, bucket_id=bucket.id, idempotency_key=f"ai-credit:gift:{bucket.source_ref_id}:effective-revoke", reason_code="gift_not_effective", now=at)
    if active_gift_id is None: return
    gift = next(g for g in gifts if g.id == active_gift_id)
    amount = int(_parse_plan_limits(gift.plan).get("ai_credits") or 0)
    if amount:
        grant_credits(db, user_id=user_id, amount=amount, credit_class="included", source_type="gift_plan", source_ref_type="gift_grant", source_ref_id=gift.id, idempotency_key=f"ai-credit:gift:{gift.id}:period:{gift.starts_at.isoformat()}", expires_at=gift.ends_at, reason_code="gift_plan_period", now=at)
