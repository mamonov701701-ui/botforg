# Этап 6.14.6 — Refund execution orchestration

**Ветка:** `chore/fresh-clean`  
**База:** `3958ed9`  
**Тип:** безопасный запуск provider refund для approved заявки.  
**Без** entitlement mutate, webhook, UI, live YooKassa.

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`
- `docs/TARIFFS_STAGE_6_14_5_PROVIDER_REFUND_ADAPTER.md`

## State machine

```text
approved
  → refund_processing
      → refunded              # полный (confirmed ≥ paid)
      → partially_refunded    # частичный
      → provider_unknown      # timeout / network / ambiguous response
      → refund_failed         # canceled / safe provider error

provider_unknown
  → (get_refund_status if provider_refund_id) → refunded | partially_refunded | refund_failed | refund_processing(pending)
  → без refund_id: ручное вмешательство (новый POST запрещён)

refund_failed
  → refund_processing         # новый ledger attempt / новый idempotency suffix
```

## Ledger reservation

1. Перед provider call создаётся `RefundLedgerEntry`:
   - `entry_type=reserved`
   - `provider_status=not_submitted`
   - стабильный `idempotency_key` = `bf-rf-{request_id}-r{revision_id}` (+ `-n{N}` на retry после failed)
2. После ответа:
   - pending → reserved
   - succeeded → succeeded + `provider_refund_id`
   - canceled → canceled
   - ambiguous → provider_unknown

## Idempotency / повтор execute

| Состояние | Поведение |
|-----------|-----------|
| `refunded` / `partially_refunded` | `already_completed`, без нового POST |
| `refund_processing` + reserved без refund_id | повтор POST **тем же** ключом |
| `provider_unknown` + refund_id | только `get_refund_status` |
| `provider_unknown` без refund_id | **409** `provider_unknown_no_refund_id`, без POST |
| повтор после succeeded | один ledger row |

## Recovery (`provider_unknown`)

- С известным `provider_refund_id`: poll GET, обновить ledger/status.
- Без id: не создавать новый refund автоматически (риск дубля у провайдера).

## API

```http
POST /api/admin/refunds/{id}/execute
Authorization: tariff admin (owner/admin/BF)
Body: { "expected_version": <int> }
Response: RefundAdminExecuteOut
  - outcome: succeeded|pending|canceled|failed|provider_unknown|already_completed
  - provider_refund_id, ledger_entry_id, already_completed
  - detail: RefundAdminDetailOut
```

RBAC: `require_tariff_admin`. Optimistic locking через `expected_version`.

## Provider / connection

Берётся из исходного `PaymentAttempt`:
- при `connection_id` → decrypt credentials → `get_payment_provider(attempt.provider, credentials=…)`
- иначе → `get_payment_provider(attempt.provider)`

Сумма — из approved current revision (`final_refund_amount` || `proposed_refund_amount`).  
Проверки: status, approved revision current, currency, available balance.

## Границы этапа

### Входит

- `backend/services/refund_execution.py`
- `POST …/execute` + schemas
- ledger writers + audit
- tests (`test_refund_execution.py`)
- этот документ

### Не входит (6.14.7–6.14.8)

- Webhook `refund.*`
- Entitlement mutate / revoke
- UI admin execute button (может быть позже)
- Live YooKassa payout в CI

## Тесты

Fake и mocked provider: full/partial, pending, canceled, error, timeout→unknown, repeat, get_status recovery, no second POST without id, wrong status, stale version, amount>available, connection from attempt, entitlement unchanged.
