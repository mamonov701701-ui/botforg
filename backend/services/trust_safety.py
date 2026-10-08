"""Small, auditable Trust & Safety restriction boundary (no payment processing)."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.custom_block_marketplace import TrustSafetyAuditEvent, TrustSafetyEnforcement


def now():
    return datetime.now(timezone.utc)


def bot_suspension_active(bot) -> bool:
    """Expired temporary restrictions cease to deny use without erasing history."""
    if not bot.is_suspended:
        return False
    if bot.suspension_type != "temporary" or bot.suspended_until is None:
        return True
    until = bot.suspended_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > now()


def record_enforcement(db: Session, *, actor_id: int, user_id: int, subject_type: str,
                       subject_id: int, action: str, reason: str,
                       expires_at: datetime | None = None) -> TrustSafetyEnforcement:
    row = TrustSafetyEnforcement(actor_user_id=actor_id, user_id=user_id,
                                 subject_type=subject_type, subject_id=subject_id,
                                 action=action, reason=reason, expires_at=expires_at)
    db.add(row)
    db.flush()
    record_audit(db, actor_id=actor_id, event_type="enforcement_created",
                 subject_type=subject_type, subject_id=subject_id,
                 metadata={"action_id": row.id, "action": action, "reason": reason})
    return row


def resolve_enforcements(db: Session, *, actor_id: int, subject_type: str,
                         subject_id: int, actions: tuple[str, ...]) -> None:
    resolved_at = now()
    rows = db.query(TrustSafetyEnforcement).filter(
        TrustSafetyEnforcement.subject_type == subject_type,
        TrustSafetyEnforcement.subject_id == subject_id,
        TrustSafetyEnforcement.action.in_(actions),
        TrustSafetyEnforcement.revoked_at.is_(None),
    ).all()
    for row in rows:
        row.revoked_at = resolved_at
        row.revoked_by_user_id = actor_id
        record_audit(db, actor_id=actor_id, event_type="enforcement_resolved",
                     subject_type=subject_type, subject_id=subject_id,
                     metadata={"action_id": row.id, "action": row.action})


def restore_bot_warning(db: Session, bot) -> None:
    row = db.query(TrustSafetyEnforcement).filter_by(
        subject_type="bot", subject_id=bot.id, action="warning", revoked_at=None,
    ).order_by(TrustSafetyEnforcement.id.desc()).first()
    if row:
        bot.suspension_type = "warning"
        bot.suspension_reason = row.reason
        bot.suspended_at = row.created_at
        bot.suspended_by_id = row.actor_user_id


def record_audit(db: Session, *, actor_id: int, event_type: str, subject_type: str,
                 subject_id: int, metadata: dict | None = None) -> None:
    db.add(TrustSafetyAuditEvent(actor_user_id=actor_id, event_type=event_type,
                                 subject_type=subject_type, subject_id=subject_id,
                                 metadata_json=metadata or {}))


def active_actions(db: Session, *, user_id: int | None = None,
                   subject_type: str | None = None, subject_id: int | None = None) -> set[str]:
    query = db.query(TrustSafetyEnforcement).filter(TrustSafetyEnforcement.revoked_at.is_(None))
    if user_id is not None:
        query = query.filter_by(user_id=user_id)
    if subject_type is not None:
        query = query.filter_by(subject_type=subject_type, subject_id=subject_id)
    current = now()
    return {row.action for row in query.all()
            if row.expires_at is None or row.expires_at.replace(tzinfo=timezone.utc) > current}


def market_restricted(db: Session, user_id: int, *, paid: bool = False) -> bool:
    actions = active_actions(db, user_id=user_id, subject_type="user", subject_id=user_id)
    return ("temporary_market_restriction" in actions
            or "prohibit_commercial_market_activity" in actions
            or (paid and "prohibit_paid_listings" in actions))


def listing_hidden(db: Session, listing_id: int) -> bool:
    actions = active_actions(db, subject_type="listing", subject_id=listing_id)
    return "hide_listing" in actions or "suspend_object" in actions
