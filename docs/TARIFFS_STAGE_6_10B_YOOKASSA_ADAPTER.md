# Этап 6.10B — YooKassa adapter and usable provider connection flow

**Дата:** 2026-07-17  
**Ветка:** `chore/fresh-clean`  
**HEAD до этапа:** `a2f3fbd`

## Причина 503 на create connection

`POST /api/admin/payment-provider-connections` шифрует credentials через AES-256-GCM.
Без `PAYMENT_CREDENTIALS_MASTER_KEY` в development/production `load_master_key()`
бросает `CredentialsCryptoError(code=master_key_missing)` → HTTP **503**.

Правило: ключ **обязателен** в development и production (fail-closed).  
Случайная генерация при старте **запрещена**.  
`TESTING=true` использует детерминированный test-only ключ.

Генерация постоянного ключа:

```bash
python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
```

Вставить в `backend/.env` (не коммитить).

## Официальная проверка webhook ЮKassa

По [документации ЮKassa](https://yookassa.ru/developers/using-api/webhooks):

1. **IP allowlist** официальных сетей (185.71.76.0/27, 185.71.77.0/27, …).
2. **Проверка статуса объекта** — повторный GET `/v3/payments/{id}` своими ключами.

**HMAC webhook secret в официальном API отсутствует** — не используется.

Реализация BotForg: IP-проверка в роутере + API re-fetch в `YooKassaPaymentProvider.verify_and_parse_webhook`.

## Адаптер

`backend/payments/providers/yookassa.py` — `YooKassaPaymentProvider`:

- `create_payment` — POST `/payments` + `Idempotence-Key`
- `get_payment_status` — GET `/payments/{id}`
- `verify_and_parse_webhook` — parse + API re-fetch
- `cancel_payment` / `refund_payment`
- `verify_credentials` — GET `/payments?limit=1` (без списания)

SSRF: только `https://api.yookassa.ru/v3`.

## Endpoints

| Method | Path |
|--------|------|
| POST | `/me/checkout-intents/{id}/pay` |
| GET | `/me/checkout-intents/{id}/payment` |
| POST | `/webhooks/payments/yookassa` |

Admin lifecycle без изменений путей 6.10A; `yookassa` definition → `available`.

## Сценарий админки

1. Подключить платёжную систему → ЮKassa  
2. Ввести Shop ID + секретный ключ  
3. Сохранить и проверить  
4. Включить  
5. Сделать основной  

Default нельзя выключить, пока не назначен другой.

## Предлагаемые commits

- `backend: add YooKassa adapter and checkout pay webhook flow`
- `frontend: humanize finance providers UX and map master-key 503`
