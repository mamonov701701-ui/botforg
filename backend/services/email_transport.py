"""
Общий email transport (Этап 6.14.10Б).

Не содержит refund-логики. Auth stubs могут позже делегировать сюда.
В тестах / без SMTP — LoggingEmailTransport (не реальное письмо).
"""
from __future__ import annotations

import logging
import smtplib
import socket
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from backend.settings import settings

logger = logging.getLogger(__name__)


class EmailTransportError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "email_error",
        temporary: bool = True,
    ) -> None:
        self.message = message
        self.code = code
        self.temporary = temporary
        super().__init__(message)


@dataclass(frozen=True)
class EmailMessagePayload:
    to_email: str
    subject: str
    body_text: str
    body_html: str | None = None


class EmailTransport(Protocol):
    def send(self, message: EmailMessagePayload) -> None: ...


class LoggingEmailTransport:
    """Dev/test: только лог без SMTP и без тела письма целиком."""

    def send(self, message: EmailMessagePayload) -> None:
        logger.info(
            "email_transport_log_only to=%s subject_len=%s body_len=%s",
            _mask_email(message.to_email),
            len(message.subject or ""),
            len(message.body_text or ""),
        )


class SmtpEmailTransport:
    def send(self, message: EmailMessagePayload) -> None:
        host = (settings.SMTP_HOST or "").strip()
        if not host:
            raise EmailTransportError(
                "SMTP_HOST not configured",
                code="smtp_not_configured",
                temporary=False,
            )
        to_email = (message.to_email or "").strip()
        if not to_email or "@" not in to_email:
            raise EmailTransportError(
                "Invalid recipient email",
                code="invalid_email",
                temporary=False,
            )

        msg = EmailMessage()
        msg["Subject"] = message.subject
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = to_email
        msg.set_content(message.body_text or "")
        if message.body_html:
            msg.add_alternative(message.body_html, subtype="html")

        timeout = float(settings.SMTP_TIMEOUT_SECONDS or 15.0)
        port = int(settings.SMTP_PORT or 587)
        try:
            if settings.SMTP_USE_TLS:
                with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.ehlo()
                    user = (settings.SMTP_USER or "").strip()
                    if user:
                        smtp.login(user, settings.SMTP_PASS or "")
                    smtp.send_message(msg)
            else:
                with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                    user = (settings.SMTP_USER or "").strip()
                    if user:
                        smtp.login(user, settings.SMTP_PASS or "")
                    smtp.send_message(msg)
        except smtplib.SMTPRecipientsRefused as exc:
            raise EmailTransportError(
                "Recipient refused",
                code="recipient_refused",
                temporary=False,
            ) from exc
        except smtplib.SMTPAuthenticationError as exc:
            raise EmailTransportError(
                "SMTP authentication failed",
                code="smtp_auth_failed",
                temporary=False,
            ) from exc
        except smtplib.SMTPResponseException as exc:
            code = int(getattr(exc, "smtp_code", 0) or 0)
            temporary = code >= 400 and code < 500 and code not in {550, 551, 553}
            # 4xx often temporary; 5xx often permanent
            if code >= 500:
                temporary = False
            elif 400 <= code < 500:
                temporary = True
            raise EmailTransportError(
                "SMTP response error",
                code=f"smtp_{code}" if code else "smtp_response",
                temporary=temporary,
            ) from exc
        except (TimeoutError, socket.timeout, ConnectionError, OSError, smtplib.SMTPServerDisconnected) as exc:
            raise EmailTransportError(
                "SMTP connection error",
                code="smtp_connection",
                temporary=True,
            ) from exc
        except smtplib.SMTPException as exc:
            raise EmailTransportError(
                "SMTP failure",
                code="smtp_error",
                temporary=True,
            ) from exc


def _mask_email(email: str) -> str:
    parts = (email or "").split("@", 1)
    if len(parts) != 2:
        return "***"
    local, domain = parts
    if len(local) <= 2:
        masked = "*" * len(local)
    else:
        masked = local[0] + "***" + local[-1]
    return f"{masked}@{domain}"


def get_email_transport() -> EmailTransport:
    """
    Production/dev: SMTP if SMTP_HOST set; otherwise logging transport.
    TESTING=true или pytest — всегда logging (не реальное письмо).
    """
    import os

    testing = (
        os.getenv("TESTING", "").lower() in {"1", "true", "yes"}
        or (settings.ENVIRONMENT or "").lower() in {"test", "testing"}
    )
    if testing or not (settings.SMTP_HOST or "").strip():
        return LoggingEmailTransport()
    return SmtpEmailTransport()


def classify_email_error(exc: BaseException) -> tuple[str, bool]:
    if isinstance(exc, EmailTransportError):
        return exc.code, bool(exc.temporary)
    msg = str(exc).lower()
    if "invalid" in msg and "email" in msg:
        return "invalid_email", False
    if "timeout" in msg or "timed out" in msg:
        return "timeout", True
    if "connection" in msg:
        return "connection_error", True
    return "email_error", True
