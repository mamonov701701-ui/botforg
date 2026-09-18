from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, UniqueConstraint

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class AiProviderConfig(Base):
    __tablename__ = "ai_provider_configs"
    __table_args__ = (UniqueConstraint("code", name="uq_ai_provider_config_code"),)
    id = Column(Integer, primary_key=True)
    code = Column(String(64), nullable=False)
    display_name = Column(String(128), nullable=False)
    adapter_code = Column(String(64), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    status = Column(String(32), nullable=False, default="unknown")
    routing_priority = Column(Integer, nullable=False, default=100)
    secret_ref = Column(String(255), nullable=True)  # reference only; never a plaintext credential
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class AiModelCatalog(Base):
    __tablename__ = "ai_model_catalog"
    __table_args__ = (
        UniqueConstraint("provider_id", "model_code", name="uq_ai_model_provider_code"),
        Index("ix_ai_model_route", "enabled", "deprecated", "routing_priority"),
    )
    id = Column(Integer, primary_key=True)
    provider_id = Column(Integer, ForeignKey("ai_provider_configs.id", ondelete="RESTRICT"), nullable=False)
    model_code = Column(String(128), nullable=False)
    display_name = Column(String(128), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    deprecated = Column(Boolean, nullable=False, default=False)
    capabilities = Column(JSON, nullable=False, default=list)
    structured_output_supported = Column(Boolean, nullable=False, default=False)
    max_context_units = Column(Integer, nullable=True)
    max_output_units = Column(Integer, nullable=True)
    feature_allow_list = Column(JSON, nullable=True)
    routing_priority = Column(Integer, nullable=False, default=100)
    pricing_version = Column(String(64), nullable=False, default="unpriced")
    pricing_rule = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class AiInvocation(Base):
    __tablename__ = "ai_invocations"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_ai_invocation_user_idempotency"),
        Index("ix_ai_invocation_status_created", "status", "started_at"),
        Index("ix_ai_invocation_provider_model", "provider_code", "model_code"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bot_id = Column(Integer, ForeignKey("bots.id", ondelete="SET NULL"), nullable=True)
    feature = Column(String(96), nullable=False)
    capability = Column(String(64), nullable=False)
    provider_code = Column(String(64), nullable=True)
    model_code = Column(String(128), nullable=True)
    idempotency_key = Column(String(191), nullable=False)
    request_fingerprint = Column(String(64), nullable=False)
    provider_request_id = Column(String(191), nullable=True)
    status = Column(String(32), nullable=False, default="created")
    input_units = Column(JSON, nullable=False, default=dict)
    output_units = Column(JSON, nullable=False, default=dict)
    provider_cost = Column(Numeric(18, 8), nullable=True)
    provider_currency = Column(String(12), nullable=True)
    ai_credits_charged = Column(Integer, nullable=False, default=0)
    pricing_version = Column(String(64), nullable=True)
    started_at = Column(DateTime, nullable=False, default=_utcnow)
    completed_at = Column(DateTime, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    error_code = Column(String(64), nullable=True)
    metadata_json = Column("metadata", JSON, nullable=True)


class AiCreditReservation(Base):
    __tablename__ = "ai_credit_reservations"
    __table_args__ = (
        UniqueConstraint("invocation_id", name="uq_ai_credit_reservation_invocation"),
        Index("ix_ai_credit_reservation_user_status", "user_id", "status"),
    )
    id = Column(Integer, primary_key=True)
    invocation_id = Column(Integer, ForeignKey("ai_invocations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reserved_amount = Column(Integer, nullable=False)
    settled_amount = Column(Integer, nullable=False, default=0)
    released_amount = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="reserved")
    expires_at = Column(DateTime, nullable=True)
    settled_at = Column(DateTime, nullable=True)
    debit_ledger_entry_id = Column(Integer, ForeignKey("ai_credit_ledger_entries.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
