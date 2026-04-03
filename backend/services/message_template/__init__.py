"""Шаблоны сообщений: диагностика плейсхолдеров и рендер для отправки."""

from backend.services.message_template.diagnostics import (
    USER_PROFILE_PLACEHOLDER_FIELDS,
    diagnose_message_template,
)
from backend.services.message_template.runtime_outbound import render_outbound_message_text

__all__ = [
    "USER_PROFILE_PLACEHOLDER_FIELDS",
    "diagnose_message_template",
    "render_outbound_message_text",
]
