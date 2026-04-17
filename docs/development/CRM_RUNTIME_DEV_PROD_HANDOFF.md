# CRM Runtime dev/prod Handoff (2026-04-16)

Короткий handoff по состоянию CRM/runtime, чтобы быстро продолжить работу в следующей сессии.

## Что внедрено
- Разделение пользователей CRM по среде через `ctor_bot_users.environment` (`dev|prod`).
- Уникальность пользователя: `(bot_id, environment, channel, external_user_id)`.
- `channel_webhooks` подключён к единому runtime (`backend/services/channel_runtime.py`):
  - resolve user
  - run scenario
  - persist CRM (`last_input`, переменные, теги, статус)
- Preview синхронизируется в CRM через `POST /bots/{bot_id}/crm/preview-sync` (среда `dev`).
- CRM UI поддерживает фильтр среды:
  - `prod` (по умолчанию),
  - `dev`,
  - `all`.

## Где смотреть при диагностике
- Runtime каналы: `backend/services/channel_runtime.py`
- Входящие webhooks: `backend/routers/channel_webhooks.py`, `backend/routers/webhook.py`
- CRM API: `backend/routers/bot_crm.py`, `backend/services/bot_crm/crm_service.py`
- Ctor link: `backend/utils/ctor_bot_resolve.py`
- Front CRM UI: `frontend/src/features/dashboard/crm/BotCrmUsersPage.tsx`

## Критичные проверки после перезапуска
1. `alembic upgrade head` применён к активной БД.
2. Бот привязан к ctor (`ensure_ctor_bot_id` поднимает связь автоматически).
3. Preview данные появляются в CRM при фильтре `dev`.
4. Реальные канал-данные появляются в CRM при фильтре `prod`.

## Точка продолжения
- Добавить интеграционные e2e тесты для `channel_webhooks` runtime по каналам (`max`, `whatsapp`) на сценарий:
  - input -> action(field/tag/status) -> message.
