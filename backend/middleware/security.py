"""
Безопасность и логирование доступа к ПДн (152-ФЗ).

ВАЖНО: не использовать второй слой BaseHTTPMiddleware поверх SessionMiddleware —
под uvicorn это даёт anyio.EndOfStream и ложный 500 на POST с телом (/auth/email/login).

Основной стек — класс SecurityASGIMiddleware (чистый ASGI, без BaseHTTPMiddleware).
"""

import json
import logging
import time
from collections import defaultdict
from http.cookies import SimpleCookie
from typing import Dict

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.core.security import verify_jwt_token
from backend.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
pd_logger = logging.getLogger("pd_access")

_PD_ACCESS_PREFIXES = ("/me", "/legal/consent", "/privacy")

_SECURITY_RESPONSE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-frame-options", b"DENY"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-xss-protection", b"1; mode=block"),
]


def _session_from_cookie(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    jar = SimpleCookie()
    jar.load(cookie_header)
    morsel = jar.get("session")
    return morsel.value if morsel else None


def _pd_user_id_from_headers(headers: Headers) -> int | None:
    auth = headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        user_id, _ = verify_jwt_token(token)
        return user_id
    ch = headers.get("cookie")
    sid = _session_from_cookie(ch)
    if sid:
        user_id, _ = verify_jwt_token(sid)
        return user_id
    return None


async def _send_json(send: Send, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    hdrs = [
        [b"content-type", b"application/json; charset=utf-8"],
        *_SECURITY_RESPONSE_HEADERS,
    ]
    await send({"type": "http.response.start", "status": status, "headers": hdrs})
    await send({"type": "http.response.body", "body": body})


class SecurityASGIMiddleware:
    """
    Чистый ASGI: не наследует BaseHTTPMiddleware.
    Совместим с SessionMiddleware (единственный BaseHTTPMiddleware в цепочке до приложения).
    """

    def __init__(self, app: ASGIApp):
        self.app = app
        self.rate_limit_store: Dict[str, list] = defaultdict(list)
        self.max_requests = 1000
        self.window_seconds = 60

    def _client_ip(self, scope: Scope, req_headers: Headers) -> str:
        xff = req_headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        client = scope.get("client")
        return client[0] if client else "unknown"

    def _check_rate_limit(self, client_ip: str) -> bool:
        now = time.time()
        window = self.rate_limit_store[client_ip]
        window = [t for t in window if now - t < self.window_seconds]
        self.rate_limit_store[client_ip] = window
        if len(window) >= self.max_requests:
            return False
        window.append(now)
        return True

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        req_headers = Headers(scope=scope)
        path = scope["path"] or ""
        method = scope["method"]
        client_ip = self._client_ip(scope, req_headers)

        if settings.TESTING:
            async def send_testing(message: dict) -> None:
                if message["type"] == "http.response.start":
                    mh = MutableHeaders(raw=message["headers"])
                    for k, v in _SECURITY_RESPONSE_HEADERS:
                        mh.append(k.decode(), v.decode())
                    self._log_after_start(method, path, message["status"], client_ip)
                    self._maybe_pd(method, path, req_headers, message["status"])
                await send(message)

            self._log_request(method, path, client_ip)
            await self.app(scope, receive, send_testing)
            return

        if getattr(settings, "ENVIRONMENT", "") != "development":
            if not self._check_rate_limit(client_ip):
                logger.warning("Rate limit exceeded for IP: %s", client_ip)
                await _send_json(send, 429, {"detail": "Too many requests"})
                return

        self._log_request(method, path, client_ip)

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                mh = MutableHeaders(raw=message["headers"])
                for k, v in _SECURITY_RESPONSE_HEADERS:
                    mh.append(k.decode(), v.decode())
                status = message["status"]
                self._log_after_start(method, path, status, client_ip)
                self._maybe_pd(method, path, req_headers, status)
            await send(message)

        await self.app(scope, receive, send_wrapper)

    def _log_request(self, method: str, path: str, client_ip: str) -> None:
        logger.info("Request: %s %s from %s", method, path, client_ip)

    def _log_after_start(self, method: str, path: str, status: int, client_ip: str) -> None:
        if status >= 400:
            logger.warning("Response: %s to %s (%s %s)", status, client_ip, method, path)
        else:
            logger.info("Response: %s to %s (%s %s)", status, client_ip, method, path)

    def _maybe_pd(self, method: str, path: str, headers: Headers, status: int) -> None:
        if not any(path == p or path.startswith(p + "/") for p in _PD_ACCESS_PREFIXES):
            return
        from datetime import datetime, timezone

        user_id = _pd_user_id_from_headers(headers)
        ts = datetime.now(timezone.utc).isoformat()
        pd_logger.info(
            "PD_ACCESS endpoint=%s method=%s user_id=%s timestamp=%s status=%s",
            path,
            method,
            user_id,
            ts,
            status,
        )


# Обратная совместимость импорта в main.py / тестах
SecurityMiddleware = SecurityASGIMiddleware
