"""Feature boundary for advisory AI Security Agent analysis.

This deliberately does not call ``backend.ai.orchestration``: that layer owns
AI Credits reservations and pricing. Review must remain usable without billing
or a user-funded model route. A production adapter can implement this contract
without changing review-state or publication logic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from backend.settings import settings


@dataclass(frozen=True)
class SecurityAgentFinding:
    finding: str
    location: str
    why: str
    severity: str
    recommendation: str


@dataclass(frozen=True)
class SecurityAgentReport:
    provider_code: str
    summary: str
    findings: list[SecurityAgentFinding] = field(default_factory=list)


class SecurityAgentUnavailable(Exception):
    code = "security_agent_unavailable"


class CustomBlockSecurityAgent(Protocol):
    provider_code: str

    def analyze(self, *, version_id: int, artifact_hash: str | None, source: str) -> SecurityAgentReport: ...


class DevelopmentSecurityAgent:
    """Deterministic non-production adapter for local development and tests.

    It intentionally does not perform static source scanning and does not claim
    model intelligence. Production must replace it with a reviewed adapter.
    """

    provider_code = "development_stub"

    def analyze(self, *, version_id: int, artifact_hash: str | None, source: str) -> SecurityAgentReport:
        return SecurityAgentReport(
            provider_code=self.provider_code,
            summary="Development AI Security Agent provider completed; Manual Admin Review is still required.",
            findings=[],
        )


class UnavailableSecurityAgent:
    provider_code = "unavailable"

    def analyze(self, *, version_id: int, artifact_hash: str | None, source: str) -> SecurityAgentReport:
        raise SecurityAgentUnavailable()


def get_custom_block_security_agent() -> CustomBlockSecurityAgent:
    configured = (settings.CUSTOM_BLOCK_SECURITY_AGENT_PROVIDER or "").strip().lower()
    if configured == "development" and settings.ENVIRONMENT != "production":
        return DevelopmentSecurityAgent()
    return UnavailableSecurityAgent()
