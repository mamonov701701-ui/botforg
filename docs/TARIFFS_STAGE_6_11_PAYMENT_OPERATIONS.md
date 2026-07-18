# Этап 6.11 — Payment operations (lifecycle, concurrency, cancel, safe errors)

**Ветка:** `chore/fresh-clean`  
**Подэтапы:** 6.11.1 (audit) → 6.11.2A (lifecycle) → 6.11.2B (concurrency) → 6.11.2C (errors + cancel) → 6.11.3 (admin journal API) → 6.11.4 (frontend payment status polling)

## Реализованный lifecycle

```text
pending → awaiting_payment → paid → fulfilled
                ↓                ↘
            cancelled / failed     (refunded — отдельно, не в 6.11.2C)
```

| Переход | Как |
|---------|-----|
| `pending` → `awaiting_payment` | `POST .../pay` создал PaymentAttempt |
| `awaiting_payment` → `paid` → `fulfilled` | webhook `payment.succeeded` + `fulfill_paid_intent` |
| `pending` / `awaiting_payment` → `cancelled` | `POST .../cancel` (владелец) или webhook `payment.canceled` |
| `awaiting_payment` → `failed` | webhook failed (intent синхронизируется) |

Один открытый/успешный attempt на intent: повторный `/pay` с другим idempotency key возвращает существующий (`already_started`), без второго charge.

## Idempotency и concurrency recovery (6.11.2B)

- Один и тот же `idempotency_key` на `/pay` — идемпотентный replay.
- `IntegrityError` на unique attempt → rollback → вернуть существующий attempt (без HTTP 500).
- Duplicate webhook (`provider_event_id`) → PROCESSED/IGNORED, без 500.
- Orphan: provider payment создан, attempt не сохранён → повтор с **тем же** key использует Idempotence-Key провайдера, без нового платежа.

## Пользовательские статусы `GET .../payment`

Поля: `normalized_status`, `is_final`, `can_retry`, `message` (безопасный русский текст).

| Состояние | normalized_status | is_final | can_retry |
|-----------|-------------------|----------|-----------|
| Ожидает оплаты / pending attempt | `pending` | false | false (уже начата) / true (ещё нет attempt) |
| Успех / paid / fulfilled | `succeeded` | true | false |
| Intent cancelled | `cancelled` | true | false (нужен новый заказ) |
| Attempt cancelled, intent ещё открыт | `cancelled` | true | true |
| Intent / attempt failed | `failed` | true | false / true |
| Refunded | `refunded` | true | false |

Секреты, ciphertext, raw provider payload в ответ **не** попадают.

## Правила отмены `POST .../cancel`

1. Только владелец intent (чужой → 404).
2. Только `pending` или `awaiting_payment`.
3. `paid` / `fulfilled` → 409 `intent_already_paid`.
4. Есть pending attempt с `provider_payment_id` → `provider.cancel_payment`.
5. Успех только если провайдер вернул `cancelled` → intent и attempt → `cancelled`.
6. Timeout / network / HTTP / неизвестный статус отмены → **локально не** помечаем cancelled (ошибка клиенту).
7. Повторная отмена уже `cancelled` → 200 `already_cancelled`.
8. Поздний `payment.succeeded` после confirmed cancel → ignored, **без entitlement**.

## Безопасные ошибки `/pay` и `/cancel`

Внутренние тексты провайдера и credentials **не** отдаются. Публичные коды:

| code | HTTP | Смысл |
|------|------|--------|
| `provider_timeout` | 504 | Таймаут |
| `provider_unavailable` | 502/503 | Сеть / registry |
| `provider_error` | 502 | 4xx/5xx провайдера (обобщённо) |
| `provider_misconfigured` | 409/503 | Нет/битые credentials, неверная настройка |
| `return_url_required` | 422 | Нет return URL |
| `cancel_not_confirmed` | 409 | Отмена у провайдера не подтверждена |
| `no_default_connection` | 409 | Нет основной системы |

## Endpoints

| Method | Path |
|--------|------|
| POST | `/me/checkout-intents/{id}/pay` |
| GET | `/me/checkout-intents/{id}/payment` |
| POST | `/me/checkout-intents/{id}/cancel` |
| POST | `/webhooks/payments/yookassa` |
| GET | `/api/admin/payments/operations` |
| GET | `/api/admin/payments/operations/{checkout_intent_id}` |

## Административная диагностика (6.11.3)

Доступ: `owner`, `admin` или активная платформенная роль «BF Администратор» (`require_tariff_admin`).
Обычный пользователь → **403**.

### Список `GET /api/admin/payments/operations`

Фильтры: `user_id`, `status`, `provider`, `checkout_intent_id`, `date_from`, `date_to`.
Пагинация: `limit` (1–100, default 20), `offset`.

В списке: intent id, пользователь (id/email), продукт, сумма, статус, провайдер, provider_payment_id, счётчики attempt/webhook, даты.

### Карточка `GET /api/admin/payments/operations/{id}`

Объединяет:

- CheckoutIntent (статус, сумма, продукт, idempotency_key, даты);
- PaymentAttempt[] (статус, provider_payment_id, confirmation_url, connection summary);
- webhook-события (тип, process_status, error_message — **без** `payload`);
- fulfillment (paid/fulfilled/failed/cancelled + id подписки/addon);
- выданная UserSubscription или UserAddon (кратко);
- provider connection: id, name, mode, verified, masked public id, `has_credentials` — **без** секретов.

### Запрещено возвращать

- credentials / plaintext secrets;
- `credentials_ciphertext`, `credentials_nonce`, `credentials_auth_tag`;
- Authorization headers;
- raw provider / webhook `payload`;
- внутренние исключения и stack traces.

### Как расследовать проблемный платёж (владелец)

1. Войти как owner/admin.
2. `GET /api/admin/payments/operations?user_id=…` или `?provider_payment_id` через `checkout_intent_id` / фильтр пользователя.
3. Открыть карточку по `checkout_intent_id`.
4. Сверить цепочку: intent.status → attempts[].status → webhook_events[].process_status → fulfillment.subscription/addon.
5. Если webhook `error` / `ignored` — смотреть `error_message` (код причины), не raw payload.
6. Если connection «не готов» — проверить админку подключений (verify/enabled/default), не запрашивая секреты из журнала.
7. Не проводить live-платежи для диагностики; используйте test-режим ЮKassa.

## Практические шаги владельца BotForg (без секретов и live)

1. Задать `PAYMENT_CREDENTIALS_MASTER_KEY` на сервере (см. гайд ЮKassa).
2. В админке: Финансы → подключить ЮKassa в **Test**, проверить, включить, сделать основной.
3. Указать webhook URL на staging/test-домен.
4. Создать checkout intent тестового пользователя → `/pay` → открыть confirmation URL тестовой картой ЮKassa.
5. Проверить `GET .../payment` и webhook `succeeded` → entitlement.
6. Отдельно: `/pay` → `/cancel` до оплаты → статус `cancelled`, повторный succeeded webhook не выдаёт доступ.
7. Live-платежи и боевой ключ — только после проверки на test.

## Frontend polling статуса оплаты (6.11.4)

Основа без полной страницы покупки (полный checkout UI — этап **8.2**).

| Артефакт | Путь |
|----------|------|
| API-клиент | `frontend/src/api/checkoutPay.ts` |
| Polling hook | `frontend/src/features/checkout/usePaymentStatusPolling.ts` |
| Карточка UI | `frontend/src/features/checkout/PaymentStatusCard.tsx` |
| Состояния | `frontend/src/features/checkout/paymentStatusDisplay.ts` |

### Как работает polling

1. `GET /me/checkout-intents/{id}/payment` сразу при монтировании.
2. Повтор каждые ~3 с (настраивается), пока `is_final !== true`.
3. При `is_final` интервал останавливается.
4. Cleanup при размонтировании (`clearInterval` + флаг mounted).
5. Пока запрос in-flight, новый не стартует (нет параллельных poll).
6. Кнопка «Проверить снова» вызывает ручной `refresh`.

### Пользовательские состояния (RU)

| Состояние | Смысл |
|-----------|--------|
| Ожидает оплаты | заказ ещё не в процессе подтверждения |
| Подтверждение обрабатывается | есть pending attempt |
| Оплачено и активировано | paid / fulfilled / succeeded |
| Платёж отменён | cancelled, повтор — новый заказ |
| Ошибка оплаты | failed без retry |
| Можно повторить оплату | `can_retry=true` |

В UI **не** показываются: intent/attempt id, provider codes, stack traces, raw API, детали webhook.

### Ошибки и отмена

- Network/API error → короткое русское сообщение; можно «Проверить снова».
- «Отменить оплату» только если `intent_status` ∈ {`pending`, `awaiting_payment`} и не `is_final`.
- Двойной клик отмены блокируется (lock + disabled).
- После отмены — toast + повторный fetch статуса.

## Что ещё не реализовано

- Refund / revoke entitlement
- Полный checkout UI / страница покупки (этап 8.2)
- Frontend UI журнала платежей (backend API 6.11.3 готов)
- Cancel API для уже succeeded (refund path)
- Фоновая reconciliation orphan-платежей с другим idempotency key
- Новые эквайринг-адаптеры

## Тесты

- `backend/tests/test_checkout_pay_hardening.py` (6.11.2A)
- `backend/tests/test_checkout_pay_concurrency.py` (6.11.2B)
- `backend/tests/test_checkout_pay_errors_cancel.py` (6.11.2C)
- `backend/tests/test_payment_operations_admin.py` (6.11.3)
- `frontend/tests/unit/paymentStatusDisplay.test.ts` (6.11.4)
- `frontend/tests/unit/usePaymentStatusPolling.test.ts` (6.11.4)
- `frontend/tests/unit/PaymentStatusCard.test.tsx` (6.11.4)
