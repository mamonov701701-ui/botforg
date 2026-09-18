from dataclasses import dataclass, field
from typing import Any

@dataclass(frozen=True)
class AiProviderRequest:
    capability: str; model: str; input: str | None = None
    messages: list[dict[str, Any]] = field(default_factory=list)
    structured_output_schema: dict[str, Any] | None = None
    parameters: dict[str, Any] = field(default_factory=dict)
    max_output: int | None = None; correlation_id: str = ""; idempotency_key: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass(frozen=True)
class AiProviderResponse:
    provider: str; model: str; content: str | None; structured_result: dict[str, Any] | None
    usage: dict[str, int]; provider_request_id: str; latency_ms: int
    finish_reason: str; provider_cost: float | None = None; provider_currency: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
