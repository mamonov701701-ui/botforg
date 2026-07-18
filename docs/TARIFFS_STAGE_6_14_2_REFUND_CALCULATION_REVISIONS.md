# Этап 6.14.2 — Автоматический расчёт refund и revisions

**Ветка:** `chore/fresh-clean`
**Зависит от:** `docs/TARIFFS_STAGE_6_14_1_REFUND_DATA_FOUNDATION.md` (models / migration `refund_requests_025`)
**Контракт:** `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`

## Scope

Реализовано (service layer only):

- `backend/services/refund_calculation.py` — server-side calc (tariff time-proration, grace 24h, addon fallback)
- `backend/services/refund_revisions.py` — immutable revisions, approve/stale protection, audit
- tests: `backend/tests/test_refund_calculation_revisions.py`

**Не реализовано:**

- user/admin API и UI
- YooKassa refund / provider_refund_id / refund webhook
- entitlement mutation
- notifications
- per-addon FIFO usage ledger
- legal DRAFT changes
- переход в `refund_processing` и далее (`approved` — терминал этапа 6.14.2)

## Формулы

### Тариф (time-proration)

```text
total_seconds = period_end - period_start
elapsed_seconds = clamp(calculation_at - period_start, 0, total_seconds)
used_amount = round_money(paid_amount * elapsed_seconds / total_seconds)
economic = paid_amount - used_amount - confirmed_refunded_amount
proposed = clamp(economic, 0, refundable_available_amount)
```

где:

```text
refundable_available_amount =
  paid_amount − confirmed_refunded_amount − active_reserved_amount − provider_unknown_amount
```

- `calculation_at` до `period_start` → usage time = 0
- после `period_end` → elapsed = total → time-proration economic → 0 (далее clamp по available)
- отсутствует / некорректный период → `calculation_failed` или `manual_review_required` (без догадок)

`paid_amount` — из `CheckoutIntent.amount` (должен совпадать с succeeded `PaymentAttempt`).
`period_*` — из `UserSubscription.current_period_*`.

### Rounding

Единая функция `refund_invariants.round_money`: `Decimal`, 2 знака, `ROUND_HALF_UP`.
Промежуточный ratio — через `Decimal` без float.

### Ledger balance semantics

| Bucket | Entry types | Effect |
|--------|-------------|--------|
| `confirmed_refunded_amount` | `succeeded` | Уменьшает paid balance; пишется в `RefundRevision.prior_refunded_amount` |
| `active_reserved_amount` | `planned`, `reserved` | Блокирует повторное резервирование; **не** считается возвратом |
| `provider_unknown_amount` | `provider_unknown` | Консервативно уменьшает available; отдельно от confirmed |
| `failed_or_canceled_amount` | `failed`, `canceled` | Информативно; **не** уменьшает available |

Writers 6.14.2 создают только `planned`/`reserved`. Типы `succeeded`/`failed`/`canceled`/`provider_unknown` зарезервированы для provider stage; calc уже умеет их бакетить.

Параллельные active reservations суммируются в `active_reserved_amount`. Несколько частичных confirmed (`succeeded`) суммируются в `confirmed_refunded_amount`. Превышение paid невозможно: available clamp к `≥ 0`, bounds validators на admin/calc.

### Льгота 24 часа

Условия (все обязательны):

1. `calculation_at - paid_at ≤ 24h` (`CheckoutIntent.paid_at`)
2. нет detectable pool usage после покупки
3. `confirmed_refunded_amount = 0` (не reserved)
4. entitlement существует и не отозван

Тогда `proposed = refundable_available_amount`, snapshot `basis = grace_period_full_refund`.
24 часа — льгота, не запрет подачи позже.

### Addon (до FIFO ledger)

| Условие | Результат |
|---------|-----------|
| нет detectable pool usage после покупки | `proposed = refundable_available`, `addon_revoke_units = UserAddon.amount` |
| есть pool usage | `manual_review_required`; `proposed_refund_amount = 0.00` **placeholder** |

Колонка `proposed_refund_amount` — `NOT NULL`, поэтому для manual path пишется `0.00` с явными флагами в snapshot:

- `proposed_amount_undefined: true`
- `proposed_refund_amount_is_placeholder: true`
- `proposed_refund_semantic: undefined_not_denial`
- `auto_proposed_deferred: true`

Это **не** юридический/продуктовый вывод «возврат = 0» и не рекомендация отказать.

Heuristic pool usage: `UsageCounter` с `messages_used|active_bots_used > 0` и `updated_at >= paid_at`.

## Revision lifecycle

Публичные функции `refund_revisions.py`:

- `create_initial_automatic_revision`
- `recalculate_automatic_revision`
- `create_admin_revision` (обязательны `based_on_revision_id`, reason, comment)
- `confirm_admin_revision` (`admin_edited` → `awaiting_final_confirmation`)
- `approve_revision` (stale → новая auto revision, без approve)
- `mark_needs_information` / `reject_request` / `cancel_request`

Правила:

- revision immutable (новая строка на каждое изменение)
- `revision_number` +1 транзакционно; collision → savepoint retry
- `current_revision_number` + optimistic `version`
- admin не может предложить больше `refundable_available_amount`
- `approved_revision_id` только на **текущую** revision
- после financial freeze / `approved` — edit/recalc запрещены

## Status flow (6.14.2)

```text
submitted → calculating → awaiting_admin_review | manual_review_required | calculation_failed
awaiting_admin_review → admin_edited | approved | needs_information | rejected | canceled
admin_edited → awaiting_final_confirmation
awaiting_final_confirmation → approved
approved  # terminal for this stage (no refund_processing)
```

Transitions enforced через `refund_invariants.validate_status_transition` в service layer.

## Stale protection

Перед approve пересчитывается `input_fingerprint` (SHA-256 канонического JSON входов без секретов).
При расхождении: approve отклоняется, создаётся новая automatic revision, audit `validation_rejected` / `revision_stale`.

## Audit

Каждое действие пишет `RefundAuditEvent` (без secret/JWT/credentials/raw provider payload).

## Риски

| Уровень | Риск |
|---------|------|
| MEDIUM | Pool usage heuristic по `updated_at` грубый до FIFO ledger |
| MEDIUM | confirmed (`succeeded`) writers ещё нет — до provider stage confirmed обычно 0 |
| LOW | SQLite `FOR UPDATE` слабее PostgreSQL |

## Следующий этап

Admin/user API + (позже) provider refund + entitlement apply + FIFO ledger.
