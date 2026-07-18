# Этап 6.14.3 — API заявок на возврат

Документ фиксирует HTTP-контракт user/admin refund API поверх сервисов 6.14.1–6.14.2.

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md`
- `docs/TARIFFS_STAGE_6_14_1_REFUND_DATA_FOUNDATION.md`
- `docs/TARIFFS_STAGE_6_14_2_REFUND_CALCULATION_REVISIONS.md`

## Scope

Входит:

- пользовательское создание / список / карточка / отмена;
- admin read (список + карточка);
- admin write: recalculate, admin revision, needs-information, reject, confirm, approve;
- idempotency create, optimistic locking, audit, ownership/RBAC.

Не входит (следующие этапы):

- provider refund / YooKassa refund;
- переход в `refund_processing` и дальше;
- webhook refund;
- mutation `UserSubscription` / `UserAddon`;
- UI;
- FIFO per-addon ledger.

## Endpoints

### User (`get_current_user`)

| Method | Path | Назначение |
|--------|------|------------|
| `POST` | `/me/refund-requests` | создать заявку (+ initial automatic revision) |
| `GET` | `/me/refund-requests` | список своих заявок |
| `GET` | `/me/refund-requests/{id}` | своя карточка |
| `POST` | `/me/refund-requests/{id}/cancel` | отмена в допустимых статусах |

Тело create: `checkout_intent_id`, `reason_category`, `idempotency_key`, опционально `user_comment`, `payment_attempt_id`.  
Суммы клиент **не** передаёт.

Cancel: `expected_version`, опционально `reason`.

### Admin (`require_tariff_admin`: `owner` / `admin` / BF «BF Администратор»)

| Method | Path | Назначение |
|--------|------|------------|
| `GET` | `/api/admin/refunds` | список + фильтры/пагинация |
| `GET` | `/api/admin/refunds/{id}` | полная карточка |
| `POST` | `/api/admin/refunds/{id}/recalculate` | новая automatic revision |
| `POST` | `/api/admin/refunds/{id}/revisions` | новая admin revision |
| `POST` | `/api/admin/refunds/{id}/needs-information` | → `needs_information` |
| `POST` | `/api/admin/refunds/{id}/reject` | → `rejected` (reason обязателен) |
| `POST` | `/api/admin/refunds/{id}/confirm` | `admin_edited` → `awaiting_final_confirmation` |
| `POST` | `/api/admin/refunds/{id}/approve` | approve **current** revision → `approved` |

Список admin: `status`, `user_id`, `reason_category`, `manual_review`, `limit`, `offset`; сортировка от новых к старым.

## Workflow статусов (этап 6.14.3)

```text
submitted
  → calculating
  → awaiting_admin_review | manual_review_required | calculation_failed

awaiting_admin_review | manual_review_required | needs_information | …
  → admin_edited | needs_information | rejected | canceled
  → approved                    # прямой approve current revision (ok calc)
admin_edited
  → awaiting_final_confirmation # POST …/confirm
awaiting_final_confirmation
  → approved                    # POST …/approve

approved                        # terminal для 6.14.3 (нет refund_processing)
rejected | canceled | completed # terminal
```

`confirm` и `awaiting_final_confirmation` предусмотрены контрактом 6.13 (§8 / confirm gate) и сервисом 6.14.2 (`confirm_admin_revision`).

## RBAC / ownership

- User API: только свои заявки; чужая → `404 request_not_found`.
- Admin API: `require_tariff_admin`; обычный `user` → `403`.
- Create: только свой `CheckoutIntent` + succeeded `PaymentAttempt`.

## Idempotency (create)

- Ключ: `(user_id, idempotency_key)`.
- Тот же payload → replay той же заявки.
- Другой payload → `409 idempotency_conflict`.
- Один open request на `checkout_intent_id` (partial unique; terminal `completed|rejected|canceled` не блокируют новую).

## Optimistic locking

Все mutating admin/user cancel операции принимают `expected_version`.  
Несовпадение → `409 version_conflict`.

## Immutable revisions

- Правка на месте запрещена: только новая строка `RefundRevision`.
- Admin edit требует `based_on_revision_id` = current, `adjustment_reason_category`, `adjustment_comment`.
- Approve только current revision; иначе `409 stale_revision`.
- Stale fingerprint на approve → новая automatic revision, approve не выполняется (`409 revision_stale`).
- `approved_revision_id` фиксируется при успешном approve.

## Денежный контракт

Все суммы в API — строки с двумя знаками: `"190.00"`, `"0.00"`.  
Ввод admin edit: Pydantic `Decimal` (серверная валидация bounds).

## Manual review

Признак: status `manual_review_required` **или** current revision (`calculation_status=manual_required` / placeholder flags / nested `auto_snapshot`).

В ответах:

- `recommended_refund_amount: null` (не placeholder `0.00`);
- `proposed_amount_undefined: true` пока сумма не определена;
- после admin edit с явной суммой — строка суммы; фильтр `manual_review=true` может всё ещё находить заявку по calc flags.

Admin snapshots (usage/financial): только whitelist полей, без passthrough неизвестных ключей.

## Ошибки

Единый вид: `{"detail": {"code": "<code>", "message": "<safe text>"}}`.

Типичные коды: `404` not found / ownership-as-404; `403` RBAC; `409` conflict/stale/terminal; `422` validation (reason/adjustment/bounds).

## Audit

Каждое create / status change / revision create / approve пишет `RefundAuditEvent` без secrets / JWT / credentials / raw provider payload.

## Границы этапа

| Делает | Не делает |
|--------|-----------|
| HTTP API поверх `refund_submit` / `refund_revisions` | Provider refund |
| Фиксация `approved` | `refund_processing` / webhook refund |
| Audit + version + revisions | Entitlement mutate |
| Safe admin card | UI |

## Ключевые модули

- `backend/routers/refund.py`, `backend/routers/refund_admin.py`
- `backend/schemas/refund.py`, `backend/schemas/refund_admin.py`
- `backend/services/refund_submit.py`, `refund_revisions.py`, `refund_admin_read.py`, `refund_api_presenters.py`
- migration `refund_submit_026` (idempotency + one-open-per-intent)
- tests: `test_refund_user_api.py`, `test_refund_admin_read.py`, `test_refund_admin_write.py` (+ submit / calc / foundation)
