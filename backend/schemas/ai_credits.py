from datetime import datetime
from pydantic import BaseModel, Field

class AiCreditClassOut(BaseModel):
    total: int = 0; used: int = 0; expired: int = 0; revoked: int = 0; remaining: int = 0; period_end: datetime | None = None

class AiCreditBalanceOut(BaseModel):
    included: AiCreditClassOut
    purchased: AiCreditClassOut
    total_spendable: int
    ledger_enabled: bool = True
    nearest_purchased_expiry: datetime | None = None

class AiCreditHistoryItemOut(BaseModel):
    id: int; created_at: datetime; direction: str; amount: int; category: str; capability: str | None = None; source: str

class AiCreditHistoryOut(BaseModel):
    items: list[AiCreditHistoryItemOut] = Field(default_factory=list)
    next_cursor: int | None = None

class AdminAiCreditLedgerItemOut(BaseModel):
    id: int; user_id: int; delta: int; operation_type: str; source_type: str; source_ref_type: str; source_ref_id: str; reason_code: str; capability: str | None = None; idempotency_key: str; actor_kind: str; actor_user_id: int | None = None; created_at: datetime

class AdminAiCreditLedgerOut(BaseModel):
    items: list[AdminAiCreditLedgerItemOut] = Field(default_factory=list)
