"""
AES-256-GCM хранилище credentials платёжных подключений (Этап 6.10A).

Envelope (колонки БД):
- credentials_encryption_version
- credentials_key_id
- credentials_nonce (12 bytes, unique per encrypt)
- credentials_ciphertext
- credentials_auth_tag (16 bytes GCM tag)

Мастер-ключ только из env (PAYMENT_CREDENTIALS_MASTER_KEY), никогда не в БД.
Plaintext не логируется и не включается в exception.
"""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.payments.credentials.errors import CredentialsCryptoError
from backend.settings import settings

ALG = "AES-256-GCM"
NONCE_SIZE = 12
TAG_SIZE = 16
KEY_SIZE = 32

# Только для pytest (TESTING=true). В production запрещён.
_TEST_ONLY_KEY_MATERIAL = b"botforg-pytest-payment-credentials-v1"


@dataclass(frozen=True)
class CredentialEnvelope:
    encryption_version: int
    key_id: str
    nonce: bytes
    ciphertext: bytes
    auth_tag: bytes

    def __repr__(self) -> str:
        return (
            f"CredentialEnvelope(v={self.encryption_version}, key_id={self.key_id!r}, "
            f"nonce_len={len(self.nonce)}, ct_len={len(self.ciphertext)}, "
            f"tag_len={len(self.auth_tag)})"
        )


def _is_production() -> bool:
    return (getattr(settings, "ENVIRONMENT", "") or "").strip().lower() == "production"


def _is_testing() -> bool:
    return bool(getattr(settings, "TESTING", False))


def resolve_key_id() -> str:
    key_id = (getattr(settings, "PAYMENT_CREDENTIALS_KEY_ID", None) or "").strip()
    return key_id or "default"


def resolve_encryption_version() -> int:
    raw = getattr(settings, "PAYMENT_CREDENTIALS_ENCRYPTION_VERSION", 1)
    try:
        version = int(raw)
    except (TypeError, ValueError) as exc:
        raise CredentialsCryptoError(
            "Invalid PAYMENT_CREDENTIALS_ENCRYPTION_VERSION",
            code="invalid_encryption_version",
        ) from exc
    if version < 1:
        raise CredentialsCryptoError(
            "PAYMENT_CREDENTIALS_ENCRYPTION_VERSION must be >= 1",
            code="invalid_encryption_version",
        )
    return version


def _decode_master_key(raw: str) -> bytes:
    text = (raw or "").strip()
    if not text:
        raise CredentialsCryptoError(
            "PAYMENT_CREDENTIALS_MASTER_KEY is missing",
            code="master_key_missing",
        )
    # Accept urlsafe or std base64, or hex (64 chars).
    try:
        if len(text) == 64 and all(c in "0123456789abcdefABCDEF" for c in text):
            key = bytes.fromhex(text)
        else:
            pad = "=" * (-len(text) % 4)
            try:
                key = base64.urlsafe_b64decode(text + pad)
            except Exception:
                key = base64.b64decode(text + pad)
    except Exception as exc:
        raise CredentialsCryptoError(
            "PAYMENT_CREDENTIALS_MASTER_KEY is malformed",
            code="master_key_invalid",
        ) from exc
    if len(key) != KEY_SIZE:
        raise CredentialsCryptoError(
            "PAYMENT_CREDENTIALS_MASTER_KEY must decode to 32 bytes",
            code="master_key_invalid",
        )
    return key


def load_master_key() -> bytes:
    """
    Загрузить мастер-ключ.
    Production: обязателен валидный env-ключ (fail-closed).
    TESTING=true: при отсутствии env — детерминированный test-only ключ.
    Иначе (dev без ключа): fail-closed.
    """
    raw = getattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", None) or ""
    if raw.strip():
        return _decode_master_key(raw)

    if _is_production():
        raise CredentialsCryptoError(
            "PAYMENT_CREDENTIALS_MASTER_KEY is required in production",
            code="master_key_missing",
        )
    if _is_testing():
        return hashlib.sha256(_TEST_ONLY_KEY_MATERIAL).digest()

    raise CredentialsCryptoError(
        "PAYMENT_CREDENTIALS_MASTER_KEY is missing",
        code="master_key_missing",
    )


def encrypt_credentials_blob(plaintext: bytes) -> CredentialEnvelope:
    if not isinstance(plaintext, (bytes, bytearray)):
        raise CredentialsCryptoError(
            "plaintext must be bytes",
            code="invalid_plaintext",
        )
    key = load_master_key()
    nonce = secrets.token_bytes(NONCE_SIZE)
    aesgcm = AESGCM(key)
    # cryptography AESGCM.encrypt returns ciphertext||tag
    packed = aesgcm.encrypt(nonce, bytes(plaintext), associated_data=None)
    ciphertext, tag = packed[:-TAG_SIZE], packed[-TAG_SIZE:]
    return CredentialEnvelope(
        encryption_version=resolve_encryption_version(),
        key_id=resolve_key_id(),
        nonce=nonce,
        ciphertext=ciphertext,
        auth_tag=tag,
    )


def decrypt_credentials_blob(envelope: CredentialEnvelope) -> bytes:
    key = load_master_key()
    # If key_id mismatches configured id — still try current key (rotation later).
    # Fail closed on decrypt errors without echoing payload.
    try:
        aesgcm = AESGCM(key)
        packed = envelope.ciphertext + envelope.auth_tag
        return aesgcm.decrypt(envelope.nonce, packed, associated_data=None)
    except CredentialsCryptoError:
        raise
    except Exception as exc:
        raise CredentialsCryptoError(
            "Credential decrypt failed (tampered or wrong key)",
            code="decrypt_failed",
        ) from exc


def wipe_bytes(buf: bytearray | memoryview | None) -> None:
    """Best-effort overwrite of mutable buffer."""
    if buf is None:
        return
    try:
        for i in range(len(buf)):
            buf[i] = 0
    except Exception:
        pass


def generate_master_key_b64() -> str:
    """Утилита для ops: сгенерировать новый ключ (не для runtime)."""
    return base64.urlsafe_b64encode(os.urandom(KEY_SIZE)).decode("ascii").rstrip("=")
