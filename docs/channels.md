# Каналы (Channel Connectors)

Архитектурный каркас для подключения нескольких каналов к боту: MAX, WhatsApp, Telegram и др.

## Интерфейс адаптера

- **`backend/channels/base.py`**
  - `NormalizedUpdate` — общий формат входящего обновления: channel, chat_id/chat_hash, user_id, text, buttons, media_url, raw.
  - `ChannelAdapter` (абстрактный): `normalize_incoming(payload) -> NormalizedUpdate`, `send_text(chat_id, text, credentials, buttons?)`, `send_media(chat_id, media_url, credentials, caption?)`.

## Реестр

- **`backend/channels/registry.py`**: `register_adapter(name, adapter)`, `get_adapter(name)`.
- Адаптеры регистрируются при импорте `backend.channels` (см. `__init__.py`).

## Подключение канала к боту

- Модель **`BotChannelConnection`**: bot_id, channel (max/whatsapp/telegram/...), is_enabled, credentials_json (в API не отдаётся).
- **API** (только владелец/редактор бота):
  - `GET /bots/{bot_id}/channels` — список подключений (без credentials).
  - `POST /bots/{bot_id}/channels` — создать или обновить: body `{ "channel": "max", "is_enabled": true, "credentials": { ... } }`.
  - `DELETE /bots/{bot_id}/channels/{channel}` — отключить.

## Входящие события (webhook)

- **`POST /webhooks/{channel}/{bot_id}`** — общий endpoint для всех каналов.
- Принимает сырой JSON от канала, вызывает `adapter.normalize_incoming(payload)`, далее — передача в движок сценариев (когда подключён) или только лог без PII (channel, bot_id, флаги has_chat_hash/has_text).

## Как добавить новый канал

1. Создать файл `backend/channels/<name>_adapter.py`.
2. Реализовать класс, наследующий `ChannelAdapter`: `normalize_incoming`, `send_text`, `send_media` (заглушки с `NotImplementedError` допустимы).
3. В `backend/channels/__init__.py` добавить `register_adapter("name", YourAdapter())`.

Секреты канала хранятся в `credentials_json` (JSON-строка) в таблице `bot_channel_connections` и не возвращаются в ответах API.
