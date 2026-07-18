# Этап 6.11 — Payment operations (lifecycle, concurrency, cancel, safe errors)

**Ветка:** `chore/fresh-clean`  
**Подэтапы:** 6.11.1 (audit) → 6.11.2A (lifecycle) → 6.11.2B (concurrency) → 6.11.2C (errors + cancel)

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

## Практические шаги владельца BotForg (без секретов и live)

1. Задать `PAYMENT_CREDENTIALS_MASTER_KEY` на сервере (см. гайд ЮKassa).
2. В админке: Финансы → подключить ЮKassa в **Test**, проверить, включить, сделать основной.
3. Указать webhook URL на staging/test-домен.
4. Создать checkout intent тестового пользователя → `/pay` → открыть confirmation URL тестовой картой ЮKassa.
5. Проверить `GET .../payment` и webhook `succeeded` → entitlement.
6. Отдельно: `/pay` → `/cancel` до оплаты → статус `cancelled`, повторный succeeded webhook не выдаёт доступ.
7. Live-платежи и боевой ключ — только после проверки на test.

## Что ещё не реализовано

- Refund / revoke entitlement
- Frontend checkout UI для cancel/статусов
- Admin payment journal UI
- Cancel API для уже succeeded (refund path)
- Фоновая reconciliation orphan-платежей с другим idempotency key
- Новые эквайринг-адаптеры

## Тесты

- `backend/tests/test_checkout_pay_hardening.py` (6.11.2A)
- `backend/tests/test_checkout_pay_concurrency.py` (6.11.2B)
- `backend/tests/test_checkout_pay_errors_cancel.py` (6.11.2C)
