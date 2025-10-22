import logging
import re
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from backend.settings import settings

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.rate_limit_store: Dict[str, list] = defaultdict(list)
        self.max_requests = 1000  # Увеличиваем лимит для тестов
        self.window_seconds = 60

    async def dispatch(self, request: Request, call_next):
        # Отключаем rate limiting в тестовом режиме
        if settings.TESTING:
            response = await call_next(request)
            # Добавляем заголовки безопасности
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            return response

        client_ip = self._get_client_ip(request)

        if not self._check_rate_limit(client_ip):
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429, content={"detail": "Too many requests"}
            )

        self._log_request(request, client_ip)
        response = await call_next(request)

        # Добавляем заголовки безопасности
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        self._log_response(response, client_ip)
        return response

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _check_rate_limit(self, client_ip: str) -> bool:
        now = time.time()
        requests = self.rate_limit_store[client_ip]
        requests = [
            req_time for req_time in requests if now - req_time < self.window_seconds
        ]
        self.rate_limit_store[client_ip] = requests

        if len(requests) >= self.max_requests:
            return False

        requests.append(now)
        return True

    def _log_request(self, request: Request, client_ip: str):
        path = request.url.path
        method = request.method
        logger.info(f"Request: {method} {path} from {client_ip}")

    def _log_response(self, response: Response, client_ip: str):
        status_code = response.status_code
        if status_code >= 400:
            logger.warning(f"Response: {status_code} to {client_ip}")
        else:
            logger.info(f"Response: {status_code} to {client_ip}")


class InputValidationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # Проверяем заголовки на подозрительные паттерны
        if self._has_suspicious_headers(request):
            logger.warning(f"Suspicious headers from {request.client.host}")
            return JSONResponse(
                status_code=400, content={"detail": "Invalid request headers"}
            )

        # Проверяем body на SQL инъекции (если есть)
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if body and self._has_sql_injection(body.decode()):
                    logger.warning(
                        f"Potential SQL injection from {request.client.host}"
                    )
                    return JSONResponse(
                        status_code=400, content={"detail": "Invalid request data"}
                    )
            except Exception:
                # Silently continue if body parsing fails (e.g., not JSON)
                pass

        return await call_next(request)

    def _has_suspicious_headers(self, request: Request) -> bool:
        """Проверяем подозрительные заголовки"""
        suspicious_patterns = [
            r"<script",
            r"javascript:",
            r"on\w+\s*=",
            r"union\s+select",
            r"drop\s+table",
            r"delete\s+from",
        ]

        for header_name, header_value in request.headers.items():
            for pattern in suspicious_patterns:
                if re.search(pattern, header_value, re.IGNORECASE):
                    return True
        return False

    def _has_sql_injection(self, content: str) -> bool:
        """Проверяем на SQL инъекции"""
        sql_patterns = [
            r"(\b(union|select|insert|update|delete|drop|create|alter)\b)",
            r"(\b(and|or)\b\s+\d+\s*=\s*\d+)",
            r"(\b(and|or)\b\s+['\"]\w+['\"]\s*=\s*['\"]\w+['\"])",
            r"(--|\#|\/\*)",
            r"(\bxp_cmdshell\b)",
            r"(\bexec\b\s*\()",
        ]

        for pattern in sql_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True
        return False
