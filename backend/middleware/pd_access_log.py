"""Устарело: логирование ПДн перенесено в SecurityASGIMiddleware (см. backend/middleware/security.py).

Файл сохранён для справки по формату логов модуля pd_access.
"""
import logging
from datetime import datetime, timezone

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from backend.core.security import verify_jwt_token

logger = logging.getLogger("pd_access")

# Префиксы путей, при обращении к которым логируем доступ к ПДн
PD_ACCESS_PATH_PREFIXES = ("/me", "/legal/consent", "/privacy")


def _get_user_id_from_request(request: Request) -> int | None:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.startswith("Bearer "):
        user_id, _ = verify_jwt_token(auth[7:].strip())
        return user_id
    cookie = request.cookies.get("session")
    if cookie:
        user_id, _ = verify_jwt_token(cookie)
        return user_id
    return None


class PDAccessLogMiddleware(BaseHTTPMiddleware):
    """Пишет в лог обращение к эндпоинтам персональных данных: endpoint, user_id, timestamp."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if not any(path == p or path.startswith(p + "/") for p in PD_ACCESS_PATH_PREFIXES):
            return response
        user_id = _get_user_id_from_request(request)
        ts = datetime.now(timezone.utc).isoformat()
        logger.info("PD_ACCESS endpoint=%s method=%s user_id=%s timestamp=%s", path, request.method, user_id, ts)
        return response
