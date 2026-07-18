# Этап 6.12 — YooKassa sandbox (тестовая проверка)

**Ветка:** `chore/fresh-clean`  
**Подэтапы:** 6.12.1 (audit) → 6.12.2 (safe stand prep) → 6.12.3 (sandbox smoke) → **6.12.4 (фиксация результата)**

## 6.12.2 — что сделано

1. **Trusted proxy IP** для webhook: по умолчанию `request.client.host`; `X-Forwarded-For` / `X-Real-IP` только при `YOOKASSA_WEBHOOK_TRUST_PROXY=true` и peer ∈ `YOOKASSA_WEBHOOK_TRUSTED_PROXIES`.
2. **Production fail-closed:** `YOOKASSA_WEBHOOK_SKIP_IP_CHECK=true` → процесс не стартует; skip IP в runtime в production никогда не включается; trust proxy без allowlist в production → отказ старта.
3. **Diagnostics:** `GET /api/admin/payments/yookassa/diagnostics` (tariff admin) — без shopId/secret/ciphertext.

## Proxy headers

| Условие | IP для allowlist |
|---------|------------------|
| `TRUST_PROXY=false` (default) | TCP peer |
| `TRUST_PROXY=true`, peer не в allowlist | TCP peer (заголовки игнор) |
| `TRUST_PROXY=true`, peer в allowlist | `X-Real-IP` или первый IP из `X-Forwarded-For` |
| `TRUST_PROXY=true`, allowlist пуст | TCP peer (fail-closed) |

## Diagnostics (безопасные поля)

`provider`, `has_connection`, `connection_id`, `connection_name`, `enabled`, `verified`, `is_default`, `mode`, `return_url_configured`, `webhook_ip_check_enabled`, `webhook_trust_proxy_enabled`, `webhook_trusted_proxies_configured`, `webhook_route`, `webhook_route_ready`, `readiness` (`missing`/`partial`/`ready`), `issues` (коды без секретов).

Webhook path: `/webhooks/payments/yookassa`.

## Env (локально / staging)

| Переменная | Production | Local sandbox |
|------------|------------|---------------|
| `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` | **false** (обязательно) | временно true только если туннель ломает IP и нет proxy trust |
| `YOOKASSA_WEBHOOK_TRUST_PROXY` | true только с allowlist | true + peer туннеля/nginx |
| `YOOKASSA_WEBHOOK_TRUSTED_PROXIES` | CIDR peer reverse proxy | например `127.0.0.1` |
| `YOOKASSA_REDIRECT_URL` | публичный HTTPS return | HTTPS или локальный фронт |

## Инструкция владельцу (Виктор) — перед 6.12.3

См. раздел sandbox в `docs/guides/PAYMENTS_SETUP_YOOKASSA.md`.

Кратко:

1. Тестовый магазин в ЛК ЮKassa → shopId + secret (`test_…`).
2. Публичный HTTPS URL (туннель) → `https://<host>/webhooks/payments/yookassa`.
3. В ЛК: события `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture` (+ `refund.succeeded` по желанию).
4. Connection: mode **test**, verified, enabled, default.
5. `GET .../yookassa/diagnostics` → `readiness=ready`.
6. **Не** вводить live-ключ; **не** платить настоящей картой.

## Запрещено до отдельного разрешения

- Внешние вызовы API ЮKassa / verify реальных credentials в рамках автоматизации агента без запроса
- Повторный live-платёж / боевые ключи без отдельного разрешения
- Live credentials в любом стенде «для пробы»
- `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` в production
- Commit/push без явной просьбы

## Артефакты после smoke (6.12.3)

Сохранить (без секретов): intent id, attempt id, статус `GET .../payment`, результат diagnostics, факт webhook HTTP 200 / intent → `fulfilled`, запись админ-журнала operations.
**Не сохранять:** временные tunnel URL, shopId, secret key, provider payment ID, confirmation URL с идентификаторами заказа, JWT.

## 6.12.4 — Журнал первой тестовой проверки (sandbox smoke)

| Поле | Значение |
|------|----------|
| Дата | 2026-07-18 |
| Магазин | тестовый магазин ЮKassa (mode=`test` в BotForg; shopId/secret не фиксируются) |
| Продукт | addon `msg_1000` — «+1 000 сообщений» |
| Сумма | `190.00 RUB` |
| CheckoutIntent | `fulfilled` |
| PaymentAttempt | `succeeded`, provider `yookassa` |
| Webhook | `payment.succeeded` → `process_status=processed` (без дублей) |
| Fulfillment | ровно один `UserAddon`, объём **+1000** сообщений |
| `GET .../payment` | `normalized_status=succeeded`, `is_final=true`, `can_retry=false` |
| Admin journal | полная цепочка intent → attempt → webhook → fulfillment (без credentials/payload) |
| Итог | **sandbox smoke: passed** |

### Ограничения этой проверки

- Проводилась **локально** через **временный** Cloudflare quick tunnel к backend `:8001`.
- В env процесса было `TESTING=true` → **IP allowlist webhook был отключён** (ожидаемо для pytest/dev-флага).
- **Production IP allowlist этим тестом не проверена.**
- **Production / live-платёж не выполнялся**; live-ключи и реальные карты не использовались.
- Секреты, shopId, payment ID, временные публичные URL и ключи **в документацию не вносились**.
