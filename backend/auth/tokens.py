import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.auth import EmailVerification, PasswordReset

TOKEN_EXPIRATION_HOURS = 24


def generate_verification_token(db: Session, user_id: int) -> str:
    """Generate email verification token"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRATION_HOURS)

    verification = EmailVerification(
        user_id=user_id, token=token, expires_at=expires_at
    )
    db.add(verification)
    db.commit()
    return token


def generate_reset_token(db: Session, user_id: int) -> str:
    """Generate password reset token"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRATION_HOURS)

    reset = PasswordReset(user_id=user_id, token=token, expires_at=expires_at)
    db.add(reset)
    db.commit()
    return token


def verify_email_token(db: Session, token: str) -> int | None:
    """
    Verify email token and return user_id if valid
    Deletes token after verification
    """
    verification = (
        db.query(EmailVerification)
        .filter(
            EmailVerification.token == token,
            EmailVerification.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if verification:
        user_id = verification.user_id
        db.delete(verification)
        db.commit()
        return user_id
    return None


def verify_reset_token(db: Session, token: str) -> int | None:
    """
    Verify reset token and return user_id if valid
    Deletes token after verification
    """
    reset = (
        db.query(PasswordReset)
        .filter(
            PasswordReset.token == token, PasswordReset.expires_at > datetime.utcnow()
        )
        .first()
    )

    if reset:
        user_id = reset.user_id
        db.delete(reset)
        db.commit()
        return user_id
    return None
