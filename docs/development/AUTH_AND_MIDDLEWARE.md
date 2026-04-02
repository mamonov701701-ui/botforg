# Авторизация и порядок middleware

## Симптом (исправлено)

- Браузер: `POST /auth/email/login` → **500**, в логах **`anyio.EndOfStream`** в `starlette.middleware.base`.
- Тот же код через **`TestClient`** давал **401** — маршрут и БД в порядке.

## Причина

Под **uvicorn** несколько слоёв **`BaseHTTPMiddleware`** (например, **`SessionMiddleware`** + ещё один свой слой), при обработке **POST с телом**, ломают цепочку чтения ASGI — типичный баг цепочки Starlette, проявляется как `EndOfStream`.

## Правило проекта

1. После **`SessionMiddleware`** не добавлять второй **`BaseHTTPMiddleware`** (ни свой «Security», ни отдельный PD-log middleware).
2. Заголовки безопасности и лог ПДн — в **`SecurityASGIMiddleware`** (`backend/middleware/security.py`): это **чистый ASGI** (`__call__(scope, receive, send)`), без наследования от `BaseHTTPMiddleware`.
3. Если понадобится валидация тел запросов на уровне middleware — не добавлять второй **`BaseHTTPMiddleware`** подряд с Session; выносить на край (WAF) или в dependency/роуты.

## Регрессия

Тест с реальным TCP: `backend/tests/test_auth_uvicorn_tcp.py` — поднимает uvicorn на свободном порту и проверяет, что логин несуществующего пользователя возвращает **401**, а не 500.
