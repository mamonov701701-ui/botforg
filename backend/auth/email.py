from backend.settings import settings
import logging

logger = logging.getLogger(__name__)


def send_verification_email(email: str, token: str):
    """Send email verification link"""
    verify_url = f"{settings.FRONTEND_URL}/auth/verify?token={token}"
    
    if settings.ENVIRONMENT == "development":
        logger.info(f"📧 Email Verification Link: {verify_url}")
    else:
        # TODO: Implement SMTP sending
        # Example: send via SMTP using settings.SMTP_HOST, settings.SMTP_USER, etc.
        pass


def send_password_reset_email(email: str, token: str):
    """Send password reset link"""
    reset_url = f"{settings.FRONTEND_URL}/auth/reset?token={token}"
    
    if settings.ENVIRONMENT == "development":
        logger.info(f"🔑 Password Reset Link: {reset_url}")
    else:
        # TODO: Implement SMTP sending
        # Example: send via SMTP using settings.SMTP_HOST, settings.SMTP_USER, etc.
        pass

