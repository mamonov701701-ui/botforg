import logging

from backend.settings import settings

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


def send_chat_message_notification(recipient_email: str, sender_name: str, message_preview: str, room_id: int):
    """Send notification about new chat message"""
    chat_url = f"{settings.FRONTEND_URL}/dashboard/messages"

    if settings.ENVIRONMENT == "development":
        logger.info(
            f"💬 New Chat Message Notification:\n"
            f"   To: {recipient_email}\n"
            f"   From: {sender_name}\n"
            f"   Message: {message_preview}\n"
            f"   Open chat: {chat_url}"
        )
    else:
        # TODO: Implement SMTP sending with HTML template
        # Subject: f"Новое сообщение от {sender_name}"
        # Body: HTML template with message preview and link to chat
        pass
