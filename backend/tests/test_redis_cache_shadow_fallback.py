from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.services.cache import redis_cache


def test_get_or_build_json_uses_shadow_when_breaker_open(monkeypatch):
    key = "crm:overview:v2:test:prod"
    now = datetime.now(timezone.utc).replace(microsecond=0)
    shadow_payload = {"computed_at": now.isoformat(), "total_contacts": 7}

    monkeypatch.setattr(redis_cache.settings, "SHADOW_MAX_STALE_SECONDS", 120)
    monkeypatch.setattr(redis_cache, "_breaker_is_open", lambda _key: True)
    monkeypatch.setattr(redis_cache, "cache_get_json", lambda cache_key: shadow_payload if cache_key.endswith(":shadow") else None)

    def _builder() -> dict:
        raise RuntimeError("builder should not run when fresh shadow exists")

    out = redis_cache.get_or_build_json(key, ttl_seconds=30, builder=_builder)
    assert out["total_contacts"] == 7


def test_get_or_build_json_ignores_stale_shadow_and_raises(monkeypatch):
    key = "crm:overview:v2:test:prod"
    stale = (datetime.now(timezone.utc) - timedelta(minutes=10)).replace(microsecond=0)
    shadow_payload = {"computed_at": stale.isoformat(), "total_contacts": 3}

    monkeypatch.setattr(redis_cache.settings, "SHADOW_MAX_STALE_SECONDS", 30)
    monkeypatch.setattr(redis_cache, "_breaker_is_open", lambda _key: True)
    monkeypatch.setattr(redis_cache, "cache_get_json", lambda cache_key: shadow_payload if cache_key.endswith(":shadow") else None)

    with pytest.raises(RuntimeError):
        redis_cache.get_or_build_json(
            key,
            ttl_seconds=30,
            builder=lambda: (_ for _ in ()).throw(RuntimeError("builder failed")),
        )
