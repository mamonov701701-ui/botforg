"""Account email through the existing BotForg transport; links are never logged."""

from urllib.parse import quote

from backend.services.email_transport import EmailMessagePayload, LoggingEmailTransport, get_email_transport
from backend.settings import settings


def _send(recipient: str, subject: str, text: str) -> str:
    transport = get_email_transport()
    if settings.ENVIRONMENT == "production" and isinstance(transport, LoggingEmailTransport):
        raise RuntimeError("Email delivery is not configured")
    transport.send(EmailMessagePayload(to_email=recipient, subject=subject, body_text=text))
    return "test_capture" if isinstance(transport, LoggingEmailTransport) else "smtp_accepted"


def send_verification_email(email: str, token: str, *, purpose: str = "verify_email") -> str:
    url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/verify#token={quote(token, safe='')}"
    subject = "Подтверждение адреса BotForg" if purpose == "verify_email" else "Подтверждение нового адреса BotForg"
    return _send(email, subject, f"Откройте ссылку и нажмите кнопку подтверждения: {url}\nСсылка действует 24 часа. Если запрос сделали не вы, проигнорируйте письмо.")


def send_password_reset_email(email: str, token: str) -> str:
    url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/reset#token={quote(token, safe='')}"
    return _send(email, "Восстановление доступа BotForg", f"Чтобы установить новый пароль, откройте ссылку: {url}\nСсылка действует 24 часа. Если запрос сделали не вы, проигнорируйте письмо.")


def send_security_notice(email: str, event: str) -> str:
    return _send(email, "Безопасность аккаунта BotForg", f"Событие в вашем аккаунте: {event}. Если это были не вы, обратитесь в поддержку BotForg.")


def send_chat_message_notification(recipient_email: str, sender_name: str, message_preview: str, room_id: int):
    """Legacy chat notification hook; chat delivery is outside Stage 8."""
    if settings.ENVIRONMENT == "development":
        import logging
        logging.getLogger(__name__).info("Chat notification requested for room %s", room_id)
