"""Internal-only AI execution service. There is intentionally no generic API route."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.ai.contracts import AiProviderRequest
from backend.ai.errors import AiProviderError, AiProviderTimeout
from backend.ai.pricing import AiPricingError, calculate_charge
from backend.ai.registry import get_provider
from backend.ai.reservations import AiReservationError, mark_provider_unknown, release_reservation, reserve_for_invocation, settle_reservation
from backend.ai.router import AiRouteError, select_route
from backend.models.ai_provider import AiInvocation
from backend.utils.bot_access import check_bot_access

logger = logging.getLogger(__name__)


class AiInvocationConflict(Exception):
    code = "idempotency_conflict"


def _fingerprint(*, user_id: int, feature: str, capability: str, bot_id: int | None, input_text: str | None, parameters: dict) -> str:
    meaningful = {"user_id": user_id, "feature": feature, "capability": capability, "bot_id": bot_id, "input": input_text or "", "parameters": parameters or {}}
    return hashlib.sha256(json.dumps(meaningful, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def execute_text_generation(db: Session, *, user_id: int, feature: str, idempotency_key: str, input_text: str | None, parameters: dict | None = None, bot_id: int | None = None, structured_output_schema: dict | None = None, correlation_id: str = "") -> AiInvocation:
    """Run exactly one logical invocation, safely replaying an idempotent request."""
    parameters = parameters or {}
    if bot_id is not None:
        check_bot_access(bot_id, user_id, db)
    fingerprint = _fingerprint(user_id=user_id, feature=feature, capability="text_generation", bot_id=bot_id, input_text=input_text, parameters=parameters)
    existing = db.query(AiInvocation).filter_by(user_id=user_id, idempotency_key=idempotency_key).one_or_none()
    if existing:
        if existing.request_fingerprint != fingerprint:
            raise AiInvocationConflict("Idempotency key was reused with a different payload")
        return existing
    invocation = AiInvocation(user_id=user_id, bot_id=bot_id, feature=feature, capability="text_generation", idempotency_key=idempotency_key, request_fingerprint=fingerprint, status="created")
    db.add(invocation)
    try:
        db.flush([invocation])
    except IntegrityError:
        db.rollback()
        existing = db.query(AiInvocation).filter_by(user_id=user_id, idempotency_key=idempotency_key).one()
        if existing.request_fingerprint != fingerprint:
            raise AiInvocationConflict("Idempotency key was reused with a different payload")
        return existing
    try:
        model, provider_config = select_route(db, capability="text_generation", feature=feature, require_structured=bool(structured_output_schema))
        provider = get_provider(provider_config.adapter_code)
        if provider is None:
            raise AiRouteError("unknown_provider_adapter")
        invocation.provider_code, invocation.model_code, invocation.pricing_version = provider_config.code, model.model_code, model.pricing_version
        reservation = reserve_for_invocation(db, invocation, model.pricing_rule)
        invocation.status = "reserved"
        db.commit()  # Boundary: provider call never runs in this transaction.
    except (AiRouteError, AiPricingError, AiReservationError) as exc:
        invocation.status, invocation.error_code = "failed", getattr(exc, "code", str(exc))
        db.commit()
        return invocation

    request = AiProviderRequest(capability="text_generation", model=model.model_code, input=input_text, structured_output_schema=structured_output_schema, parameters=parameters, max_output=model.max_output_units, correlation_id=correlation_id, idempotency_key=idempotency_key, metadata={"feature": feature})
    try:
        response = provider.execute(request)
    except AiProviderTimeout as exc:
        mark_provider_unknown(db, reservation)
        invocation.status, invocation.error_code, invocation.completed_at = "provider_unknown", exc.code, datetime.now(timezone.utc)
        db.commit()
        return invocation
    except AiProviderError as exc:
        release_reservation(db, reservation)
        invocation.status, invocation.error_code, invocation.completed_at = "failed", exc.code, datetime.now(timezone.utc)
        db.commit()
        return invocation

    try:
        charge = calculate_charge(model.pricing_rule, response.usage)
        if charge > reservation.reserved_amount:
            raise AiPricingError("provider_charge_exceeds_reservation")
        entry = settle_reservation(db, reservation, invocation, charge)
        invocation.status = "succeeded"
        invocation.provider_request_id = response.provider_request_id
        invocation.input_units = {k: int(v) for k, v in response.usage.items() if k.startswith("input_")}
        invocation.output_units = {k: int(v) for k, v in response.usage.items() if not k.startswith("input_")}
        invocation.provider_cost = response.provider_cost
        invocation.provider_currency = response.provider_currency
        invocation.ai_credits_charged = charge
        invocation.latency_ms = response.latency_ms
        invocation.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("ai_invocation_succeeded", extra={"invocation_id": invocation.id, "user_id": user_id, "provider": invocation.provider_code, "model": invocation.model_code, "feature": feature, "latency_ms": response.latency_ms, "ai_credits_charged": charge})
    except (AiPricingError, AiReservationError) as exc:
        # A response was received but not safely settled: retain the hold.
        mark_provider_unknown(db, reservation)
        invocation.status, invocation.error_code, invocation.completed_at = "provider_unknown", str(exc), datetime.now(timezone.utc)
        db.commit()
    return invocation
