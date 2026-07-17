"""
PaymentProviderConnection — зашифрованные подключения к провайдерам (Этап 6.10A).

Несколько connection на один provider_code разрешены.
Plaintext credentials в модель не попадают и через API не возвращаются.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    LargeBinary,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PaymentProviderConnection(Base):
    __tablename__ = "payment_provider_connections"
    __table_args__ = (
        Index("ix_ppc_provider_code", "provider_code"),
        Index("ix_ppc_enabled", "enabled"),
        Index("ix_ppc_is_default", "is_default"),
        Index("ix_ppc_mode", "mode"),
        UniqueConstraint(
            "provider_code",
            "connection_name",
            name="uq_ppc_provider_connection_name",
        ),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    provider_code = Column(String(64), nullable=False)
    connection_name = Column(String(128), nullable=False)
    mode = Column(String(32), nullable=False, default="test")
    enabled = Column(Boolean, nullable=False, default=False)
    verified = Column(Boolean, nullable=False, default=False)
    is_default = Column(Boolean, nullable=False, default=False)
    currency = Column(String(10), nullable=False, default="RUB")
    priority = Column(Integer, nullable=False, default=100)
    public_identifier_masked = Column(String(255), nullable=True)

    # Encryption envelope (no plaintext)
    credentials_version = Column(Integer, nullable=False, default=0)
    credentials_key_id = Column(String(64), nullable=True)
    credentials_encryption_version = Column(Integer, nullable=True)
    credentials_nonce = Column(LargeBinary, nullable=True)
    credentials_ciphertext = Column(LargeBinary, nullable=True)
    credentials_auth_tag = Column(LargeBinary, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    verified_at = Column(DateTime, nullable=True)
    last_health_check_at = Column(DateTime, nullable=True)
    last_health_check_status = Column(String(64), nullable=True)

    # Optional link to legacy payment_provider_settings.code (audit/migration)
    legacy_settings_code = Column(String(64), nullable=True)

    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def has_credentials(self) -> bool:
        return bool(
            self.credentials_ciphertext
            and self.credentials_nonce
            and self.credentials_auth_tag
            and (self.credentials_version or 0) > 0
        )

    def __repr__(self) -> str:
        return (
            f"<PaymentProviderConnection id={self.id} provider={self.provider_code!r} "
            f"name={self.connection_name!r} mode={self.mode!r} "
            f"enabled={self.enabled} verified={self.verified} "
            f"creds_v={self.credentials_version}>"
        )
