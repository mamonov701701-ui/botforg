# Этап 6.14.7 — Вебхуки и согласование состояний возвратов

**Ветка:** `chore/fresh-clean`  
**База:** `af330bf`  
**Тип:** безопасная обработка `refund.*` уведомлений провайдера и восстановление после `provider_unknown`.  
**Без** entitlement mutate, UI execute, live YooKassa payout, новых адаптеров.

Связанные документы:

- `docs/TARIFFS_STAGE_6_14_5_PROVIDER_REFUND_ADAPTER.md`
- `docs/TARIFFS_STAGE_6_14_6_REFUND_EXECUTION.md`
- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md` (§15)

## Архитектура

```text
POST /webhooks/payments/yookassa
  ├─ IP allowlist (без изменений)
  ├─ event.startswith("refund.")
  │    → lookup PaymentAttempt by object.payment_id
  │    → provider.verify_and_parse_webhook (credentials attempt.connection_id)
  │         → GET /refunds/{id}
  │         → ParsedRefundWebhookEvent (sanitized raw)
  │    → reconcile_refund_webhook(event, attempt)
  │         → ledger по provider_refund_id
  │         → проверка connection_id ledger.attempt ↔ webhook attempt
  │         → дедуп PaymentWebhookEvent
  │         → ledger + RefundRequest + audit
  │    → никогда не вызывает refund_payment
  └─ иначе payment.* — прежний путь fulfill_paid_intent
```

Контракт события: `ParsedRefundWebhookEvent` в `backend/payments/dto.py`.

## Переходы состояний

| Входящий статус | Ledger | Заявка |
|-----------------|--------|--------|
| `pending` | `reserved` | `refund_processing` |
| `succeeded` | `succeeded` | `refunded` или `partially_refunded` |
| `canceled` | `canceled` | `refund_failed` |

Восстановление:

```text
provider_unknown  +  webhook succeeded/canceled/pending
  →  refunded | partially_refunded | refund_failed | refund_processing
```

### Политика поздних событий

| Текущий ledger | Входящее | Результат |
|----------------|----------|-----------|
| `succeeded` | `pending` / `canceled` | ignore `no_downgrade` + audit |
| `succeeded` | `succeeded` (повтор) | `already_succeeded`, сумма не растёт |
| `canceled` | `pending` / `succeeded` / иное | ignore `ignored_after_canceled` + audit `no_transition_after_canceled`; **состояние не меняется**, без HTTP 500 |

## Классификация ошибок verify (GET /refunds/{id})

| Код ошибки | HTTP | Смысл |
|------------|------|--------|
| `provider_timeout`, `provider_network_error`, `provider_http_error`, `invalid_credentials` | **503** | временная недоступность или локальная ошибка credentials подключения; провайдер может повторить; финансы не трогаются |
| `invalid_webhook_payload`, `webhook_payment_id_mismatch`, `webhook_amount_mismatch`, `webhook_currency_mismatch`, … | **400** | постоянная ошибка запроса/уведомления |
| IP allowlist | **403** | без изменений |

`invalid_credentials` — ошибка конфигурации BotForg (shop credentials), не битый webhook; ответ **не** содержит секретов.

## Дедупликация и конфликты

1. Уникальный ключ `(provider, provider_event_id)` в `PaymentWebhookEvent` (защита БД от гонки).
2. `payload.fingerprint` = provider\|refund_id\|payment_id\|status\|amount\|currency.
3. Повтор с тем же id и fingerprint → `already_processed`.
4. Тот же id с другим fingerprint → `webhook_event_conflict` (soft-ack).
5. `connection_mismatch` / `payment_attempt_mismatch` — soft-ack, финансы без изменений.

## Безопасное отклонение

| Ситуация | Код / reason |
|----------|----------------|
| Нет ledger для refund id | `ignored` / `unknown_refund_id` (+ `PaymentWebhookEvent`) |
| Несовпадение payment / amount / currency | mismatch codes |
| Несовпадение provider / connection / attempt | mismatch codes |
| После `canceled` | `ignored_after_canceled` |

## Ограничения этапа

### Входит

- контракт + YooKassa/Fake `refund.*`
- `refund_webhook_reconciliation` + ветка webhook
- тесты и этот документ

### Не входит (6.14.8+)

- mutate entitlement, FIFO, UI execute, уведомления, live YooKassa в CI

## Тесты

- pending / succeeded / canceled; replay; recovery `provider_unknown`
- late pending/succeeded после `canceled`
- no-downgrade после succeeded; concurrent double succeeded
- GET timeout / network / invalid_credentials → 503 без смены ledger/заявки/audit
- notify≠API: payment_id / amount / currency → 400
- `connection_mismatch`; forbidden IP → 403
- payment webhook regression; без `refund_payment`; audit без секретов
