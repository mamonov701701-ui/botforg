# Этап 6.14.1 — Data foundation: RefundRequest, revisions, ledger, audit

**Ветка:** `chore/fresh-clean`
**Контракт:** `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`
**Migration:** `refund_requests_025` ← `payment_provider_connections_024`

## Scope

Реализовано:

- модели `RefundRequest`, `RefundRevision`, `RefundLedgerEntry`, `RefundAuditEvent`;
- enums статусов/типов;
- Alembic migration (SQLite + PostgreSQL-ready);
- service invariants (`backend/services/refund_invariants.py`);
- unit/integration tests на SQLite test suite.

**Не реализовано (явно вне scope 6.14.1):**

- user/admin API и UI;
- автоматическая формула возврата (time-proration / addon rules);
- YooKassa `refund` и refund webhook;
- entitlement revoke / apply;
- per-addon FIFO usage ledger;
- уведомления;
- реальные provider ledger submissions (`provider_refund_id` остаётся nullable).

## Архитектурное решение: единый status

Сохранён **один** столбец `RefundRequest.status` со всеми значениями контракта 6.13 (workflow + terminal).

Отдельный `outcome` не введён: в контракте `refunded` / `partially_refunded` — промежуточные шаги перед `entitlement_processing` → `completed`, а не независимый outcome. Матрица допустимых переходов — в `ALLOWED_STATUS_TRANSITIONS` (`refund_invariants.py`). При необходимости outcome можно вычислять как view в API позже.

Финансовая «заморозка» revision: статусы из `REFUND_FINANCIAL_FROZEN_STATUSES` (с `refund_processing` включительно).

## Модели

| Таблица | Назначение |
|--------|------------|
| `refund_requests` | Заявка: user, intent, attempt, status, reason, `current_revision_number`, `approved_revision_id`, `version` (optimistic lock) |
| `refund_revisions` | Immutable расчёты (`automatic` / `admin`); snapshots JSON; уникальность `(refund_request_id, revision_number)` |
| `refund_ledger_entries` | Денежный ledger; unique `idempotency_key`; entry_type 6.14.1: `planned` / `reserved` |
| `refund_audit_events` | Audit без секретов/JWT/credentials/raw provider payload; колонка `metadata` → ORM `event_metadata` |

Деньги: `Numeric(10, 2)`. Валюта: `String(10)`. Статусы: `String` (как checkout).

## Инварианты (helpers)

- `validate_refund_amount_bounds` — `0 ≤ refund ≤ paid − prior`
- `validate_revision_ownership` / `validate_current_revision`
- `assert_financials_not_frozen` / `assert_revision_immutable_update_forbidden`
- `validate_status_transition`
- `validate_optimistic_version`
- `validate_ledger_total_within_paid`

## Следующие этапы

1. **6.14.2** — calc service (тариф time-формула, addon full / `manual_review_required`).
2. Admin/user API + revisions workflow + final confirmation.
3. Provider refund + webhook + entitlement.
4. **Обязательно:** per-addon usage ledger + FIFO (контракт 6.13).

Legal DRAFT (`REFUND_POLICY_*`, `OFFER_*`) не менялись — только технический foundation.
