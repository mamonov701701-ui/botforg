from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    import redis  # type: ignore

try:
    import redis  # type: ignore
except Exception:  # pragma: no cover - fallback when dependency is absent
    redis = None  # type: ignore[assignment]

from backend.settings import settings

logger = logging.getLogger(__name__)
_client_lock = threading.Lock()
_client: Optional[Any] = None
_redis_available = redis is not None
_redis_strict_mode = bool(getattr(settings, "STRICT_REDIS", False))

_local_lock = threading.Lock()
_local_cache: Dict[str, tuple[float, Any]] = {}
_local_locks: Dict[str, float] = {}
_breaker_lock = threading.Lock()
_breaker_state: Dict[str, dict[str, float | int]] = {}

_BREAKER_FAILURE_THRESHOLD = 3
_BREAKER_OPEN_SECONDS = 15
_SHADOW_SUFFIX = ":shadow"


def _disable_redis_runtime() -> None:
    global _client, _redis_available
    with _client_lock:
        _client = None
        _redis_available = False


def _allow_local_fallback() -> bool:
    return not _redis_strict_mode


def _shadow_key(key: str) -> str:
    return f"{key}{_SHADOW_SUFFIX}"


def _breaker_is_open(key: str) -> bool:
    with _breaker_lock:
        row = _breaker_state.get(key)
        if not row:
            return False
        return float(row.get("open_until", 0.0)) > time.time()


def _breaker_record_success(key: str) -> None:
    with _breaker_lock:
        row = _breaker_state.pop(key, None)
        if row:
            logger.info(
                "breaker_close key=%s failures=%s",
                key,
                int(row.get("failures", 0)),
            )


def _breaker_record_failure(key: str) -> None:
    now = time.time()
    with _breaker_lock:
        row = _breaker_state.get(key, {"failures": 0, "open_until": 0.0})
        failures = int(row.get("failures", 0)) + 1
        open_until = float(row.get("open_until", 0.0))
        if failures >= _BREAKER_FAILURE_THRESHOLD:
            open_until = now + _BREAKER_OPEN_SECONDS
            logger.warning(
                "breaker_open key=%s failures=%s open_for_seconds=%s",
                key,
                failures,
                _BREAKER_OPEN_SECONDS,
            )
        else:
            logger.warning(
                "breaker_failure key=%s failures=%s threshold=%s",
                key,
                failures,
                _BREAKER_FAILURE_THRESHOLD,
            )
        _breaker_state[key] = {"failures": failures, "open_until": open_until}


def _parse_computed_at(payload: dict) -> Optional[datetime]:
    raw = payload.get("computed_at")
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_safe_shadow_payload(key: str) -> Optional[dict]:
    payload = cache_get_json(_shadow_key(key))
    if not isinstance(payload, dict):
        return None
    ts = _parse_computed_at(payload)
    if ts is None:
        logger.warning("shadow_cache_ignored_missing_computed_at key=%s", key)
        return None
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    if age > max(1, int(getattr(settings, "SHADOW_MAX_STALE_SECONDS", 120))):
        logger.warning(
            "shadow_cache_ignored_stale key=%s age_seconds=%.2f max_stale_seconds=%s",
            key,
            age,
            max(1, int(getattr(settings, "SHADOW_MAX_STALE_SECONDS", 120))),
        )
        return None
    logger.warning("shadow_cache_used key=%s age_seconds=%.2f", key, age)
    if key.startswith("crm:overview:v2:"):
        logger.warning("crm_overview_build_path event=shadow_fallback cache_key=%s age_seconds=%.2f", key, age)
    return payload


def _get_client() -> Optional[Any]:
    global _client, _redis_available
    if not _redis_available:
        return None
    with _client_lock:
        if _client is not None:
            return _client
        try:
            if redis is None:
                _redis_available = False
                return None
            c = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            c.ping()
            _client = c
            return _client
        except Exception:
            _disable_redis_runtime()
            return None


def _local_get(key: str) -> Optional[Any]:
    with _local_lock:
        row = _local_cache.get(key)
        if not row:
            return None
        expire_at, value = row
        if expire_at <= time.time():
            _local_cache.pop(key, None)
            return None
        return value


def _local_set(key: str, value: Any, ttl_seconds: int) -> None:
    with _local_lock:
        _local_cache[key] = (time.time() + max(1, ttl_seconds), value)


def _local_try_lock(lock_key: str, lock_ttl_seconds: int) -> bool:
    now = time.time()
    with _local_lock:
        exp = _local_locks.get(lock_key, 0)
        if exp > now:
            return False
        _local_locks[lock_key] = now + max(1, lock_ttl_seconds)
        return True


def _local_unlock(lock_key: str) -> None:
    with _local_lock:
        _local_locks.pop(lock_key, None)


def cache_get_json(key: str) -> Optional[dict]:
    client = _get_client()
    if client is None:
        if _redis_strict_mode:
            return None
        val = _local_get(key)
        return val if isinstance(val, dict) else None
    try:
        raw = client.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        _disable_redis_runtime()
        return None


def cache_set_json(key: str, value: dict, ttl_seconds: int) -> None:
    client = _get_client()
    if client is None:
        if _redis_strict_mode:
            return
        _local_set(key, value, ttl_seconds)
        return
    try:
        payload = json.dumps(value, ensure_ascii=False)
        client.setex(key, max(1, ttl_seconds), payload)
        client.setex(_shadow_key(key), max(30, ttl_seconds * 10), payload)
    except Exception:
        _disable_redis_runtime()
        if _allow_local_fallback():
            _local_set(key, value, ttl_seconds)


def get_or_build_json(
    key: str,
    *,
    ttl_seconds: int,
    builder: Callable[[], dict],
    lock_ttl_seconds: int = 8,
    wait_ms: int = 1200,
) -> dict:
    cached = cache_get_json(key)
    if cached is not None:
        return cached
    if _breaker_is_open(key):
        fallback = _get_safe_shadow_payload(key)
        if fallback is not None:
            return fallback

    lock_key = f"{key}:lock"
    client = _get_client()
    got_lock = False
    if client is None:
        got_lock = _local_try_lock(lock_key, lock_ttl_seconds) if _allow_local_fallback() else False
    else:
        try:
            got_lock = bool(client.set(lock_key, "1", nx=True, ex=max(1, lock_ttl_seconds)))
        except Exception:
            _disable_redis_runtime()
            got_lock = _local_try_lock(lock_key, lock_ttl_seconds) if _allow_local_fallback() else False

    if got_lock:
        try:
            value = builder()
            cache_set_json(key, value, ttl_seconds)
            _breaker_record_success(key)
            return value
        except Exception:
            if key.startswith("crm:overview:v2:"):
                logger.exception("crm_overview_build_path event=builder_failure cache_key=%s", key)
            _breaker_record_failure(key)
            fallback = _get_safe_shadow_payload(key)
            if fallback is not None:
                return fallback
            raise
        finally:
            if client is None:
                if _allow_local_fallback():
                    _local_unlock(lock_key)
            else:
                try:
                    client.delete(lock_key)
                except Exception:
                    _disable_redis_runtime()

    deadline = time.time() + (max(0, wait_ms) / 1000.0)
    while time.time() < deadline:
        time.sleep(0.06)
        cached = cache_get_json(key)
        if cached is not None:
            return cached

    try:
        value = builder()
        cache_set_json(key, value, ttl_seconds)
        _breaker_record_success(key)
        return value
    except Exception:
        if key.startswith("crm:overview:v2:"):
            logger.exception("crm_overview_build_path event=builder_failure cache_key=%s", key)
        _breaker_record_failure(key)
        fallback = _get_safe_shadow_payload(key)
        if fallback is not None:
            return fallback
        raise


def add_dirty_aggregate(bot_id: int, environment: str) -> None:
    token = f"{int(bot_id)}:{environment}"
    client = _get_client()
    if client is None:
        if _redis_strict_mode:
            logger.error("Redis unavailable in strict mode: dirty aggregate token dropped: %s", token)
            return
        with _local_lock:
            dirty = _local_cache.get("crm:agg:dirty")
            if dirty and isinstance(dirty[1], set):
                s = dirty[1]
            else:
                s = set()
            s.add(token)
            _local_cache["crm:agg:dirty"] = (time.time() + 86400, s)
        return
    try:
        client.sadd("crm:agg:dirty", token)
    except Exception:
        _disable_redis_runtime()
        if _redis_strict_mode:
            logger.error("Redis write failed in strict mode: dirty token dropped: %s", token)
            return
        with _local_lock:
            dirty = _local_cache.get("crm:agg:dirty")
            if dirty and isinstance(dirty[1], set):
                s = dirty[1]
            else:
                s = set()
            s.add(token)
            _local_cache["crm:agg:dirty"] = (time.time() + 86400, s)


def pop_dirty_aggregates(limit: int = 200) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    if limit <= 0:
        return out
    client = _get_client()
    if client is None:
        if _redis_strict_mode:
            return out
        with _local_lock:
            dirty = _local_cache.get("crm:agg:dirty")
            if not dirty or not isinstance(dirty[1], set):
                return out
            s: set[str] = dirty[1]
            batch = []
            for _ in range(min(limit, len(s))):
                batch.append(s.pop())
            for token in batch:
                bid, env = token.split(":", 1)
                out.append((int(bid), env))
        return out
    try:
        vals = client.spop("crm:agg:dirty", limit)
        if vals is None:
            return out
        if isinstance(vals, str):
            vals = [vals]
        for token in vals:
            bid, env = str(token).split(":", 1)
            out.append((int(bid), env))
    except Exception:
        _disable_redis_runtime()
        if _redis_strict_mode:
            return out
        return []
    return out


def is_redis_configured() -> bool:
    return bool(getattr(settings, "REDIS_URL", "").strip())


def is_redis_runtime_available() -> bool:
    return _get_client() is not None


def check_redis_connection() -> tuple[bool, str]:
    client = _get_client()
    if client is None:
        return False, "redis unavailable"
    try:
        client.ping()
        return True, "ok"
    except Exception as exc:
        _disable_redis_runtime()
        return False, str(exc)
