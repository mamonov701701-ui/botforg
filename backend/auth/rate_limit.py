from collections import defaultdict
import hashlib
import hmac
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from backend.settings import settings

# In-memory rate limiting (production: use Redis)
rate_limit_store = defaultdict(list)

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 10


def check_rate_limit(
    request: Request,
    action: str,
    *,
    subject: str | None = None,
    max_attempts: int = MAX_ATTEMPTS,
):
    """
    Check rate limit for subject + action (default subject = client IP).
    Raises HTTPException 429 if limit exceeded.
    """
    ip = request.client.host if request.client else "127.0.0.1"
    key = f"{subject or ip}:{action}"

    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=WINDOW_MINUTES)

    # Clean old attempts
    rate_limit_store[key] = [ts for ts in rate_limit_store[key] if ts > cutoff]

    # Check limit
    if len(rate_limit_store[key]) >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток. Попробуйте через {WINDOW_MINUTES} минут.",
        )

    # Record attempt
    rate_limit_store[key].append(now)


def check_account_rate_limit(request: Request, action: str, *, subject: str | None = None, max_attempts: int = MAX_ATTEMPTS):
    """Distributed auth throttle in production, isolated in-memory gate in tests.

    Both client and subject are limited; Redis outage fails closed for account actions.
    Keys are HMAC digests, so email addresses and IPs are not stored in Redis keys.
    """
    ip = request.client.host if request.client else "unknown"
    identities = [f"ip:{ip}"]
    if subject:
        identities.append(f"subject:{subject}")
    if settings.TESTING or settings.ENVIRONMENT != "production":
        for identity in identities:
            check_rate_limit(request, action, subject=identity, max_attempts=max_attempts)
        return
    try:
        import redis
    except ImportError:
        raise HTTPException(503, "Проверка безопасности временно недоступна")
    script = """
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
    """
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
        for identity in identities:
            digest = hmac.new(settings.JWT_SECRET.encode("utf-8"), f"{action}:{identity}".encode("utf-8"), hashlib.sha256).hexdigest()
            count = client.eval(script, 1, f"account_rate:{digest}", WINDOW_MINUTES * 60)
            if int(count) > max_attempts:
                raise HTTPException(429, f"Слишком много попыток. Попробуйте через {WINDOW_MINUTES} минут.")
    except HTTPException:
        raise
    except redis.RedisError:
        raise HTTPException(503, "Проверка безопасности временно недоступна")
