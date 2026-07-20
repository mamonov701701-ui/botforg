# Этап 6.14.9A — Точный FIFO-учёт дополнений

**Ветка:** `chore/fresh-clean`  
**База:** `e82eb57`  
**Тип:** ledger списания сообщений по источникам лимита + точный refund calc для новых addon.  
**Без** защиты пакетных скидок, UI, уведомлений, gift revoke, money refund mutate, Editor.

Связанные документы:

- `docs/TARIFFS_STAGE_6_13_REFUND_CONTRACT.md` (§7, FIFO)
- `docs/TARIFFS_STAGE_6_14_8_REFUND_ENTITLEMENT.md`
- `docs/TARIFFS_STAGE_5_3_MESSAGE_ENFORCEMENT.md`

## Порядок списания (FIFO)

1. Базовый лимит тарифа (`messages_plan_base`).
2. Активные подарочные лимиты:
   - `GiftGrant` (messages / addon→messages) — по `starts_at`, затем `id`;
   - `UserAddon` с `source ≠ purchase` — по `created_at`, затем `id`.
3. Активные платные дополнения (`UserAddon.source = purchase`, type messages) — по `created_at`, затем `id`.

Не расходуются: `CANCELLED` / `EXPIRED`, а также `reserved_units` на `UserAddon`.

## Модели

| Таблица / поле | Назначение |
|---------------|------------|
| `addon_usage_ledger_entries` | Журнал: user, source_type, user_addon_id / gift_grant_id, units, operation (debit/compensation), unique `source_event_key`, period, timestamps |
| `tariff_fifo_cutover` | Singleton `cutover_at` |
| `user_addons.reserved_units` | Резерв под возврат (не тратится FIFO); lifecycle через `addon_refund_unit_reservations` |
| `addon_refund_unit_reservations` | Привязка резерва к `refund_request_id` (идемпотентность approve/execute) |

`source_type`: `plan_base` | `gift` | `paid_addon` | `legacy_unattributed`.

Секреты и provider payload **не** хранятся.

## Атомарность consume / compensation

```text
check_and_consume_message_unit:
  lock UsageCounter
  → fifo_debit_message_unit (flush в savepoint)
  → UPDATE messages_used + 1  (только если debit новый)
  → один commit

refund_consumed_message_unit:
  → fifo_compensate (idempotent key ":compensation")
  → UPDATE messages_used - 1
  → один commit
```

При ошибке ledger — rollback, пул не увеличивается (fail closed).

Caller: `channel_webhooks._dispatch_channel_update` передаёт  
`source_event_key = wh:{channel}:{bot_id}:{external_id}`.

**Не тронуты:** legacy `POST /webhook/{bot_id}`, `POST /messages/`, Editor.

## Cutover и backfill

- Миграция `addon_fifo_ledger_027` пишет `tariff_fifo_cutover` и для каждого `UsageCounter` с `messages_used > 0` — одну запись `legacy_unattributed` (агрегат пула, **без** привязки к addon).
- Фиктивные исторические списания по конкретным дополнениям **не** создаются.

## Legacy / manual review

| Случай | Поведение |
|--------|-----------|
| Addon создан/оплачен **до** cutover + есть legacy или pool heuristic | `manual_review_required` |
| Addon **после** cutover | `fifo_ledger_used(fulfilled_addon_id)` → точный unused / revoke |
| Entitlement | Нельзя revoke used или reserved; gifts не меняются |

## Компенсация

- Ключ: `{debit_source_event_key}:compensation`.
- Повтор компенсации идемпотентен.
- После ошибки runtime webhook: pool и ledger откатываются согласованно.

## Конкурентность

- `WITH FOR UPDATE` на counter и paid addons.
- Unique `source_event_key`.
- Conditional `UPDATE … messages_used < limit`.

## Резервирование под возврат (6.14.9A)

| Событие | Действие |
|---------|----------|
| `approve_revision` (fifo_precise, revoke > 0) | `ensure_addon_refund_reservation` |
| `execute_approved_refund` (retry) | idempotent ensure |
| `reject` / `cancel` (до frozen) | `release_addon_refund_reservation` |
| `refund_failed` / provider canceled | release |
| `provider_unknown` / `refund_processing` | **резерв сохраняется** |
| `apply_refund_entitlement` success | `consume` (погашение) |
| admin revision supersede | release |

Manual review / legacy — резерв **не** создаётся.

## Ограничения этапа

- Нет защиты пакетной скидки / price grid snapshot (это 6.14.9B).
- Нет UI / уведомлений / auto-apply entitlement из webhook.
- Legacy dual economy (`UserQuota` / `/messages/`) без изменений.
- Bots/team limits не ведутся в FIFO-журнале (только messages).

## Файлы

- `backend/models/tariff.py`
- `backend/migrations/versions/addon_fifo_ledger_027.py`
- `backend/services/tariff_addon_usage_ledger.py`
- `backend/services/tariff_message_enforcement.py`
- `backend/services/tariff_limits.py` (`messages_plan_base`)
- `backend/routers/channel_webhooks.py`
- `backend/services/refund_calculation.py`, `refund_entitlement.py`
- `backend/tests/test_addon_fifo_ledger.py`
- этот документ
