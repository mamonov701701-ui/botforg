from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from backend.settings import settings
from backend.services.custom_block_execution.contracts import RunnerRequest, RunnerResponse


class RunnerFailure(Exception):
    def __init__(self, category: str):
        self.category = category
        super().__init__(category)


class RunnerProvider(ABC):
    @abstractmethod
    def execute(self, request: RunnerRequest) -> RunnerResponse: ...


class HttpRunnerProvider(RunnerProvider):
    """HTTP-only provider: source never crosses into FastAPI execution."""

    def __init__(self, base_url: str, shared_token: str, timeout: float):
        self.base_url, self.shared_token, self.timeout = base_url.rstrip("/"), shared_token, timeout

    def execute(self, request: RunnerRequest) -> RunnerResponse:
        try:
            response = httpx.post(
                f"{self.base_url}/v1/execute",
                json=request.model_dump(mode="json"),
                headers={"X-BotForg-Runner-Token": self.shared_token},
                timeout=self.timeout,
            )
        except httpx.TimeoutException as exc:
            raise RunnerFailure("timeout") from exc
        except httpx.ConnectError as exc:
            raise RunnerFailure("runner_connection_refused") from exc
        except httpx.HTTPError as exc:
            raise RunnerFailure("runner_unavailable") from exc
        if response.status_code == 429:
            raise RunnerFailure("resource_limit")
        if response.status_code in {401, 403}:
            raise RunnerFailure("runner_authentication_failed")
        if response.status_code >= 500:
            raise RunnerFailure("runner_unavailable")
        if response.status_code >= 400:
            try:
                category = str(response.json().get("error", "runtime_error"))
            except ValueError:
                category = "runtime_error"
            safe_categories = {
                "timeout", "resource_limit", "policy_violation", "runtime_error", "invalid_output",
            }
            raise RunnerFailure(category if category in safe_categories else "runtime_error")
        try:
            return RunnerResponse.model_validate(response.json())
        except Exception as exc:
            raise RunnerFailure("invalid_output") from exc


def get_runner_provider() -> RunnerProvider:
    if not settings.CUSTOM_BLOCK_EXECUTION_ENABLED:
        raise RunnerFailure("runner_feature_disabled")
    if not settings.CUSTOM_BLOCK_RUNNER_URL:
        raise RunnerFailure("runner_url_missing")
    return HttpRunnerProvider(
        settings.CUSTOM_BLOCK_RUNNER_URL,
        settings.CUSTOM_BLOCK_RUNNER_SHARED_TOKEN,
        settings.CUSTOM_BLOCK_RUNNER_TIMEOUT_SECONDS,
    )
