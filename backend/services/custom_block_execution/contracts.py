from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


DEFAULT_RESOURCE_PROFILE = {
    "wall_clock_ms": 750,
    "cpu_ms": 500,
    "memory_mb": 32,
    "max_source_bytes": 32_768,
    "max_input_bytes": 16_384,
    "max_output_bytes": 16_384,
    "max_log_entries": 20,
    "max_log_entry_bytes": 512,
    "max_log_bytes": 4_096,
}
DENIED_CAPABILITIES = {
    "network": False, "filesystem": False, "secrets": False, "database": False,
    "persistence": False, "dependencies": False, "subprocess": False, "platform_api": False,
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def json_size(value: Any) -> int:
    return len(canonical_json(value).encode("utf-8"))


class PortSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    type: str = Field(default="json", pattern=r"^(json|string|number|boolean)$")
    required: bool = False
    display_name: str | None = Field(default=None, min_length=1, max_length=96)


class ExecutionSpec(BaseModel):
    """Canonical, persisted executable artifact; published rows are immutable."""

    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    language: Literal["javascript"]
    runtime_profile: Literal["quickjs-wasm-v1"]
    source: str = Field(min_length=1)
    inputs: list[PortSpec] = Field(default_factory=list)
    outputs: list[PortSpec] = Field(default_factory=list, max_length=32)
    settings_schema: list[dict[str, Any]] = Field(default_factory=list)
    capabilities: dict[str, bool] = Field(default_factory=lambda: dict(DENIED_CAPABILITIES))
    resource_profile: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_RESOURCE_PROFILE))

    @field_validator("capabilities")
    @classmethod
    def deny_by_default(cls, value: dict[str, bool]) -> dict[str, bool]:
        if set(value) != set(DENIED_CAPABILITIES) or any(value.values()):
            raise ValueError("Stage 7.7 permits no capabilities")
        return value

    @field_validator("resource_profile")
    @classmethod
    def fixed_safe_profile(cls, value: dict[str, int]) -> dict[str, int]:
        if value != DEFAULT_RESOURCE_PROFILE:
            raise ValueError("Only the platform default resource profile is supported")
        return value

    def artifact_hash(self) -> str:
        return hashlib.sha256(canonical_json(self.model_dump(mode="json")).encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_bounded_artifact(self) -> "ExecutionSpec":
        if len(self.source.encode("utf-8")) > DEFAULT_RESOURCE_PROFILE["max_source_bytes"]:
            raise ValueError("Source exceeds the platform resource profile")
        names = [port.name for port in self.inputs + self.outputs]
        if len(names) != len(set(names)):
            raise ValueError("Input and output names must be unique")
        if len(self.outputs) > 32:
            raise ValueError("At most 32 output routes are supported")
        return self


class ExecutionContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    executionMode: Literal["runtime", "simulator"]
    blockVersionId: int = Field(gt=0)


class ExecutionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)
    context: ExecutionContext


class ExecutionLog(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: Literal["debug", "info", "warn", "error"] = "info"
    message: str = Field(max_length=DEFAULT_RESOURCE_PROFILE["max_log_entry_bytes"])


class ExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outputs: dict[str, Any] = Field(default_factory=dict)
    route: str | None = Field(default=None, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    logs: list[ExecutionLog] = Field(default_factory=list, max_length=DEFAULT_RESOURCE_PROFILE["max_log_entries"])


class RunnerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: str
    artifact_hash: str
    spec: ExecutionSpec
    envelope: ExecutionEnvelope


class RunnerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    result: ExecutionResult
    duration_ms: int = Field(ge=0)
    runner_profile: str = Field(max_length=64)
