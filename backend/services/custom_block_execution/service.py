from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.custom_block import (
    CUSTOM_BLOCK_ARCHIVED,
    CUSTOM_BLOCK_PUBLISHED,
    CustomBlockExecutionAudit,
    CustomBlockVersion,
)
from backend.services.custom_block_execution.contracts import (
    ExecutionEnvelope,
    ExecutionResult,
    ExecutionSpec,
    RunnerRequest,
    canonical_json,
    json_size,
)
from backend.services.custom_block_execution.provider import RunnerFailure, RunnerProvider, get_runner_provider


class ControlledExecutionFailure(Exception):
    """Safe category only; callers must not expose provider or engine details."""
    def __init__(self, category: str):
        self.category = category
        super().__init__(category)


def _audit(
    db: Session, *, execution_id: str, version: CustomBlockVersion, mode: str,
    status: str, category: str | None, input_size: int, output_size: int,
    duration_ms: int | None, runner_profile: str = "unavailable",
) -> None:
    db.add(CustomBlockExecutionAudit(
        execution_id=execution_id, custom_block_version_id=version.id,
        artifact_hash=version.execution_artifact_hash or "", execution_mode=mode,
        runner_profile=runner_profile, status=status, error_category=category,
        input_size_bytes=input_size, output_size_bytes=output_size, duration_ms=duration_ms,
        finished_at=datetime.now(timezone.utc),
    ))
    db.commit()


def resolve_authorized_version(
    db: Session, *, scenario_owner_id: int, version_id: int,
    stable_id: str, version_number: int, existing_reference: bool,
) -> CustomBlockVersion:
    version = db.query(CustomBlockVersion).filter(CustomBlockVersion.id == version_id).first()
    if not version:
        raise ControlledExecutionFailure("authorization_error")
    if version.block.stable_key != stable_id or version.version != version_number:
        raise ControlledExecutionFailure("authorization_error")
    if version.block.owner_user_id != scenario_owner_id:
        # Stage 7.9 will replace this ownership predicate with licence rights.
        raise ControlledExecutionFailure("authorization_error")
    if version.status not in {CUSTOM_BLOCK_PUBLISHED, CUSTOM_BLOCK_ARCHIVED}:
        raise ControlledExecutionFailure("authorization_error")
    if version.status == CUSTOM_BLOCK_ARCHIVED and not existing_reference:
        raise ControlledExecutionFailure("authorization_error")
    if version.execution_state != "enabled":
        raise ControlledExecutionFailure("authorization_error")
    return version


def _validated_spec(version: CustomBlockVersion) -> ExecutionSpec:
    try:
        spec = ExecutionSpec.model_validate(version.execution_spec)
    except Exception as exc:
        raise ControlledExecutionFailure("validation_error") from exc
    if version.runtime_kind != "javascript" or not version.execution_artifact_hash:
        raise ControlledExecutionFailure("validation_error")
    if spec.artifact_hash() != version.execution_artifact_hash:
        raise ControlledExecutionFailure("validation_error")
    return spec


def execute_version(
    db: Session, *, version: CustomBlockVersion, mode: str, input_data: dict[str, Any],
    settings_data: dict[str, Any], provider: RunnerProvider | None = None,
) -> ExecutionResult:
    spec = _validated_spec(version)
    try:
        envelope = ExecutionEnvelope.model_validate({
            "input": input_data, "settings": settings_data,
            "context": {"executionMode": mode, "blockVersionId": version.id},
        })
    except Exception as exc:
        raise ControlledExecutionFailure("validation_error") from exc
    input_size = json_size(envelope.model_dump(mode="json"))
    profile = spec.resource_profile
    if len(spec.source.encode("utf-8")) > profile["max_source_bytes"] or input_size > profile["max_input_bytes"]:
        raise ControlledExecutionFailure("resource_limit")

    execution_id = uuid.uuid4().hex
    started = time.monotonic()
    try:
        response = (provider or get_runner_provider()).execute(RunnerRequest(
            execution_id=execution_id, artifact_hash=version.execution_artifact_hash, spec=spec, envelope=envelope,
        ))
        result = response.result
        output_size = json_size(result.model_dump(mode="json"))
        allowed_routes = {port.name for port in spec.outputs}
        if not allowed_routes and result.route is not None:
            raise ControlledExecutionFailure("invalid_output")
        if len(allowed_routes) > 1 and result.route is None:
            raise ControlledExecutionFailure("invalid_output")
        # A single route has an ergonomic deterministic default; terminal blocks have no route.
        if len(allowed_routes) == 1 and result.route is None:
            result.route = next(iter(allowed_routes))
        if result.route is not None and result.route not in allowed_routes:
            raise ControlledExecutionFailure("invalid_output")
        allowed_outputs = {port.name: port for port in spec.outputs}
        if any(name not in allowed_outputs for name in result.outputs):
            raise ControlledExecutionFailure("invalid_output")
        for name, value in result.outputs.items():
            expected = allowed_outputs[name].type
            if (expected == "string" and not isinstance(value, str)) or \
               (expected == "number" and (not isinstance(value, (int, float)) or isinstance(value, bool))) or \
               (expected == "boolean" and not isinstance(value, bool)):
                raise ControlledExecutionFailure("invalid_output")
        if output_size > profile["max_output_bytes"]:
            raise ControlledExecutionFailure("resource_limit")
        if json_size([item.model_dump(mode="json") for item in result.logs]) > profile["max_log_bytes"]:
            raise ControlledExecutionFailure("resource_limit")
        _audit(db, execution_id=execution_id, version=version, mode=mode, status="succeeded", category=None,
               input_size=input_size, output_size=output_size, duration_ms=response.duration_ms,
               runner_profile=response.runner_profile)
        return result
    except ControlledExecutionFailure as exc:
        _audit(db, execution_id=execution_id, version=version, mode=mode, status="failed", category=exc.category,
               input_size=input_size, output_size=0, duration_ms=int((time.monotonic() - started) * 1000))
        raise
    except RunnerFailure as exc:
        _audit(db, execution_id=execution_id, version=version, mode=mode, status="failed", category=exc.category,
               input_size=input_size, output_size=0, duration_ms=int((time.monotonic() - started) * 1000))
        raise ControlledExecutionFailure(exc.category) from exc
    except Exception as exc:
        _audit(db, execution_id=execution_id, version=version, mode=mode, status="failed", category="runtime_error",
               input_size=input_size, output_size=0, duration_ms=int((time.monotonic() - started) * 1000))
        raise ControlledExecutionFailure("runtime_error") from exc
