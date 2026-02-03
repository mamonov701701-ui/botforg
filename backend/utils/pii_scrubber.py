"""
Маскирование персональных данных перед отправкой в LLM (152-ФЗ, AI safety).
Маскирует: phone, email, username, id (числовые идентификаторы).
"""
import re
from typing import Optional

# Паттерны для маскирования
_RE_EMAIL = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)
_RE_PHONE_RU = re.compile(
    r"(\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b"
)
_RE_PHONE_GENERIC = re.compile(
    r"\+\d{1,4}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{2,4}[\s\-]?\d{2,4}[\s\-]?\d{2,4}\b"
)
# Username: @username или telegram/username
_RE_USERNAME = re.compile(
    r"(?<![a-zA-Z0-9_])(@[a-zA-Z0-9_]{3,32})\b"
)
# Числовые ID (8–12 цифр подряд, не в середине длинного числа)
_RE_NUMERIC_ID = re.compile(
    r"\b(\d{8,12})\b"
)

PLACEHOLDER_EMAIL = "[EMAIL]"
PLACEHOLDER_PHONE = "[PHONE]"
PLACEHOLDER_USERNAME = "[USERNAME]"
PLACEHOLDER_ID = "[ID]"


def scrub_text(text: Optional[str]) -> str:
    """
    Заменяет PII в тексте на плейсхолдеры.
    Если text is None, возвращает пустую строку.
    """
    if text is None or not isinstance(text, str):
        return ""
    s = text
    s = _RE_EMAIL.sub(PLACEHOLDER_EMAIL, s)
    s = _RE_PHONE_RU.sub(PLACEHOLDER_PHONE, s)
    s = _RE_PHONE_GENERIC.sub(PLACEHOLDER_PHONE, s)
    s = _RE_USERNAME.sub(PLACEHOLDER_USERNAME, s)
    s = _RE_NUMERIC_ID.sub(PLACEHOLDER_ID, s)
    return s


def scrub_for_llm(content: str) -> str:
    """Алиас для совместимости."""
    return scrub_text(content)
