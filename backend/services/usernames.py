"""Canonical public username policy. Ownership and authorization always use User.id."""

from __future__ import annotations

import unicodedata


RESERVED = frozenset({
    "2fa", "account", "accounts", "admin", "administrator", "api", "app", "assets", "auth",
    "billing", "botforg", "callback", "chat", "dashboard", "dev", "docs", "editor",
    "files", "healthz", "help", "legal", "login", "logout", "market", "marketplace",
    "me", "messages", "moderator", "notifications", "oauth", "owner", "password",
    "privacy", "profile", "register", "reset", "robots", "root", "security",
    "settings", "signin", "signup", "sitemap", "static", "support", "system",
    "terms", "totp", "uploads", "user", "users", "verify", "www", "админ",
    "администратор", "ботфорг", "поддержка", "система",
})


class UsernameError(ValueError):
    pass


def normalize_username(value: str) -> tuple[str, str]:
    """Return NFC display form and NFKC-casefold uniqueness key.

    A nickname may contain Latin or Cyrillic letters, never both. Compatibility
    glyphs are rejected rather than silently changing the visible nickname.
    """
    if not isinstance(value, str):
        raise UsernameError("Ник должен быть строкой")
    visible = unicodedata.normalize("NFC", value)
    if visible != value or unicodedata.normalize("NFKC", visible) != visible:
        raise UsernameError("Используйте обычные символы без скрытых вариантов")
    if not 3 <= len(visible) <= 30:
        raise UsernameError("Ник должен содержать от 3 до 30 символов")
    scripts: set[str] = set()
    for char in visible:
        if char in "_.-" or ("0" <= char <= "9"):
            continue
        name = unicodedata.name(char, "")
        if unicodedata.category(char) != "Ll" and unicodedata.category(char) != "Lu":
            raise UsernameError("Ник может содержать только буквы, цифры, _, - и точку")
        if name.startswith("LATIN "):
            scripts.add("latin")
        elif name.startswith("CYRILLIC "):
            scripts.add("cyrillic")
        else:
            raise UsernameError("Используйте только латиницу или кириллицу")
    if len(scripts) > 1:
        raise UsernameError("Не смешивайте кириллицу и латиницу в одном нике")
    if not visible[0].isalnum() or not visible[-1].isalnum():
        raise UsernameError("Ник должен начинаться и заканчиваться буквой или цифрой")
    if ".." in visible:
        raise UsernameError("Две точки подряд недопустимы")
    key = unicodedata.normalize("NFKC", visible).casefold()
    if key in RESERVED:
        raise UsernameError("Этот ник зарезервирован")
    return visible, key
