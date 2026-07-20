# Этап 6.14.8 — Изменение доступа после возврата

**Ветка:** `chore/fresh-clean`  
**База:** `6cef0d7`  
**Тип:** идемпотентное изменение entitlement после money-confirmed возврата.  
**Без** FIFO ledger, usage counter mutate, gift revoke, auto-call из webhook/execute, UI, уведомлений.

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md` (§10, §14–16)
- `docs/TARIFFS_STAGE_6_14_6_REFUND_EXECUTION.md`
- `docs/TARIFFS_STAGE_6_14_7_REFUND_WEBHOOK_RECONCILIATION.md`

## Разделение операций

```text
execute / webhook  →  деньги (ledger, refunded|partially_refunded)
apply-entitlement  →  доступ (отдельная команда админа)
```

Провайдер и money ledger в entitlement-пути **не** вызываются / не меняются.

## Денежное завершение vs полное завершение заявки

| Этап | Статусы | Смысл |
|------|---------|--------|
| Денежный | `refunded`, `partially_refunded` | Деньги подтверждены (ledger / webhook). Доступ ещё может быть не изменён. |
| Полный итог | `completed` | Деньги + entitlement-команда завершена (`applied` / `already_applied` / `not_required`). |

`completed_at` **исторически** может быть заполнен уже после денежного возврата (execute/webhook). Это **не** означает полный итог заявки: итоговым состоянием считается **статус `completed`**, а не наличие `completed_at`.

## Переходы состояний

```text
refunded | partially_refunded | entitlement_failed
  → entitlement_processing
      → completed
      → entitlement_failed   # безопасная ошибка / ручная проверка
```

`action=none` → `completed` без изменения доступа (`not_required`).

## Поддерживаемые действия (approved revision)

| Action | Цель | Поведение |
|--------|------|-----------|
| `cancel_immediate` | `fulfilled_subscription_id` | CANCELLED сейчас |
| `cancel_at` / `expire_at` | подписка | усечь `period_end` / immediate если дата ≤ now |
| `cancel_addon` | `fulfilled_addon_id` | CANCELLED |
| `expire_addon` | addon | EXPIRED |
| `reduce_amount` | addon | уменьшить `amount` на `addon_revoke_units` |
| `none` | — | completed без mutate |

Только объекты checkout intent этой покупки. Другие ACTIVE подписки, другие addon и `GiftGrant` не трогаются.

## Идемпотентность `already_applied`

- Ключ: `bf-ent-{request_id}-r{revision_id}` (audit metadata).
- Повтор после статуса `completed` → `already_applied`.
- Optimistic lock: `expected_version`.

### `cancel_immediate`

Целевая подписка уже `CANCELLED` / `EXPIRED` → `already_applied` → `completed`.

### `cancel_at` / `expire_at` (строгая проверка даты)

Нельзя считать любой `CANCELLED`/`EXPIRED` успехом. Проверяется именно `fulfilled_subscription_id` относительно approved revision:

1. Фактическая дата завершения (`current_period_end`) должна соответствовать утверждённой `entitlement_effective_at` (допуск ~2 с), при `ACTIVE` и `auto_renew=false`.
2. Если подписка уже терминальна, а утверждённая дата ещё в будущем — доступ прекращён раньше → `entitlement_failed` (`incompatible_entitlement_state`), **не** `already_applied`.
3. Если `ACTIVE`, но `period_end` раньше утверждённой даты — несовместимо → `entitlement_failed` (дату задним числом **не** исправляем молча).
4. Если `ACTIVE` с другой (более поздней) датой — применяется усечение; чужие подписки не трогаются.
5. Терминальное состояние допустимо как `already_applied` только когда `entitlement_effective_at <= now` (отложенное действие уже должно было стать немедленным).

## Правила безопасности

- Только после `refunded` / `partially_refunded` (или retry из `entitlement_failed`).
- Revoke ≤ grant (`addon_total_units` / текущий amount).
- Нет отрицательного `amount`.
- Нельзя снизить effective limit ниже already used (`limit_below_usage`).
- Usage counters не уменьшаются.
- Pool usage без атрибуции (`detectable_pool_usage_after_purchase`) → `entitlement_failed` + audit `entitlement_manual_required` (не auto-revoke), в т.ч. для `reduce_amount`.
- Неоднозначный / отсутствующий target → failed, без изменения чужих объектов.
- Неожиданное исключение → `entitlement_failed` (`unexpected_error`), заявка **не** остаётся в `entitlement_processing`.

## API

```http
POST /api/admin/refunds/{id}/apply-entitlement
Authorization: tariff admin
Body: { "expected_version": <int> }
```

Ответ: `outcome`, `applied_action`, `target_type`, `target_id`, `already_applied`, `error_code`, `error_message`, `detail`.

## Audit

`entitlement_apply_started`, `entitlement_applied`, `entitlement_already_applied`, `entitlement_not_required`, `entitlement_failed`, `entitlement_manual_required` (+ `status_changed`).

## Файлы

- `backend/services/refund_entitlement.py`
- `backend/services/tariff_entitlements.py` (примитивы)
- `backend/routers/refund_admin.py`, `backend/schemas/refund_admin.py`
- `backend/models/refund.py` (audit actions)
- `backend/tests/test_refund_entitlement.py`
- этот документ

## Вне scope

FIFO per-addon ledger, usage rollback, gift revoke, auto apply из webhook/execute, UI, notifications, Editor.
