# WhatsApp: канал с provider-abstraction

WhatsApp в BotForg реализован как канал с абстракцией провайдеров: один и тот же API и сценарии работают с разными провайдерами (Meta Cloud API, Twilio, 360dialog). Смена провайдера не ломает ботов и сценарии.

## Архитектура

```
whatsapp_channel
 ├── providers/base.py     — WhatsAppProvider (normalize_incoming, send_text, send_media, validate_webhook)
 ├── providers/meta_cloud.py   — Meta Cloud API (MVP: verify GET, X-Hub-Signature-256, send_text)
 ├── providers/twilio.py       — Twilio API (stub)
 ├── providers/dialog360.py    — 360dialog (stub)
 └── registry                 — get_whatsapp_provider(name)
```

- **Адаптер канала** (`backend/channels/whatsapp_adapter.py`): выбирает провайдера по `credentials_json["provider"]`, делегирует ему normalize/send.
- **Webhook**: для Meta Cloud — **GET** `/webhooks/whatsapp/{bot_id}` (верификация: `hub.mode`, `hub.verify_token`, `hub.challenge`). **POST** `/webhooks/whatsapp/{bot_id}` — проверка подписи `X-Hub-Signature-256`, затем `provider.normalize_incoming(payload)`, `chat_hash`, движок сценариев или `track_event` без PII.

## Credentials (bot_channel_connections, channel=whatsapp)

В `credentials_json` хранятся (write-only, GET /bots/{id}/channels не возвращает секреты):

| Поле | Описание |
|------|----------|
| **provider** | Обязательное. Имя провайдера: `meta_cloud`, `twilio`, `dialog360`. |
| token | Токен доступа провайдера. |
| phone_number_id | ID номера (Meta Cloud). |
| verify_token | Токен верификации webhook (Meta): GET с `hub.verify_token` возвращает `hub.challenge`. |
| app_secret | Секрет приложения Meta для проверки подписи POST: `X-Hub-Signature-256` = HMAC-SHA256(raw_body, app_secret). |

Пример для **Meta Cloud** (без реальных значений):

```json
{
  "provider": "meta_cloud",
  "token": "****",
  "phone_number_id": "...",
  "verify_token": "...",
  "app_secret": "..."
}
```

Для Twilio/360dialog поля могут отличаться (см. документацию провайдера); обязательным остаётся только `provider`.

## Flow: webhook → normalize → engine

1. **Входящий запрос** на `POST /webhooks/whatsapp/{bot_id}`.
2. Находится подключение `channel=whatsapp`, `is_enabled=true`.
3. Из `credentials_json` читается `provider`; по нему выбирается провайдер.
4. **Валидация**: для Meta Cloud — проверка заголовка `X-Hub-Signature-256` (HMAC-SHA256 сырого тела и `app_secret`). При `False` ответ 401.
5. **Нормализация**: `provider.normalize_incoming(payload)` → `NormalizedUpdate` (channel, chat_id, text, raw, …).
6. Вычисляется **chat_hash** (HMAC по chat_id, без хранения chat_id в БД).
7. Дальше — вызов движка сценариев (если реализован) или запись события `whatsapp_update_received` в аналитику в режиме minimal_storage (без PII).

## API управления каналом WhatsApp

- **POST /bots/{bot_id}/channels/whatsapp/enable** — включить канал. Требует заданный и известный `credentials.provider`.
- **POST /bots/{bot_id}/channels/whatsapp/disable** — выключить канал.
- **GET /bots/{bot_id}/channels/whatsapp/status** — вернуть `provider`, `is_enabled` (без секретов).

## Планируемые провайдеры

- **Meta Cloud API** (WhatsApp Business Platform) — реализован MVP: GET verification, проверка подписи POST, нормализация входящих текстовых сообщений, `send_text` через Graph API.
- **Twilio** — API Twilio для WhatsApp (stub).
- **360dialog** — API 360dialog для WhatsApp (stub).
