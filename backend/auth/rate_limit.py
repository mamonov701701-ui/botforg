from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import HTTPException, Request

# In-memory rate limiting (production: use Redis)
rate_limit_store = defaultdict(list)

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 10


def check_rate_limit(request: Request, action: str):
    """
    Check rate limit for IP + action
    Raises HTTPException 429 if limit exceeded
    """
    ip = request.client.host if request.client else "127.0.0.1"
    key = f"{ip}:{action}"

    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=WINDOW_MINUTES)

    # Clean old attempts
    rate_limit_store[key] = [ts for ts in rate_limit_store[key] if ts > cutoff]

    # Check limit
    if len(rate_limit_store[key]) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток. Попробуйте через {WINDOW_MINUTES} минут.",
        )

    # Record attempt
    rate_limit_store[key].append(now)
