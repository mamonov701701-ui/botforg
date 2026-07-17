"""Ошибки безопасного хранилища credentials (без plaintext в сообщениях)."""
from __future__ import annotations


class CredentialsCryptoError(Exception):
    """Fail-closed ошибка шифрования/расшифровки. message никогда не содержит plaintext."""

    def __init__(self, message: str, *, code: str = "credentials_crypto_error"):
        # Не передаём произвольные данные пользователя в args сверх безопасного message.
        self.code = code
        safe = str(message)[:200]
        super().__init__(safe)

    def __repr__(self) -> str:
        return f"CredentialsCryptoError(code={self.code!r})"
