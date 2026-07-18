# Подключение ЮKassa к BotForg

## 1. Регистрация

1. Зарегистрируйтесь в [ЮKassa](https://yookassa.ru/).
2. Создайте магазин.
3. В личном кабинете получите **shopId** и **секретный ключ** (тест и/или боевой).

## 2. Мастер-ключ сервера BotForg

На сервере BotForg задайте постоянный ключ шифрования платёжных данных:

```bash
python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
```

В `backend/.env`:

```env
PAYMENT_CREDENTIALS_MASTER_KEY=<сгенерированное_значение>
PAYMENT_CREDENTIALS_KEY_ID=default
```

Без этого ключа создание подключения вернёт ошибку настройки серверного хранилища (503).  
**Не коммитьте** реальный ключ и секрет ЮKassa.

## 3. Ввод в админке

1. Войдите как владелец платформы.
2. Режим «Платформа» → «Финансы» → «Платёжные провайдеры».
3. «Подключить платёжную систему» → **ЮKassa**.
4. Укажите название, режим (Test/Production), валюту.
5. Введите Shop ID и секретный ключ.
6. Сохраните и дождитесь проверки.
7. Включите подключение.
8. Назначьте основным.

Секрет после сохранения **не отображается**.

## 4. Webhook

В кабинете ЮKassa укажите URL уведомлений:

```text
https://<ваш-домен>/webhooks/payments/yookassa
```

Точный path BotForg: **`/webhooks/payments/yookassa`** (HTTPS, порт **443** или **8443** по требованиям ЮKassa).

События в ЛК: `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`, при необходимости `refund.succeeded`.

BotForg проверяет IP ЮKassa и сверяет платёж через API. HMAC secret не требуется (его нет в официальном API).

### IP за reverse proxy / туннелем

По умолчанию учитывается только TCP-peer (`request.client.host`).
Заголовки `X-Forwarded-For` / `X-Real-IP` **не** принимаются от произвольного клиента.

Явный opt-in (staging / туннель):

```env
YOOKASSA_WEBHOOK_TRUST_PROXY=true
YOOKASSA_WEBHOOK_TRUSTED_PROXIES=127.0.0.1
```

Peer должен быть IP вашего nginx/туннеля; только тогда берётся клиентский IP из заголовков.

`YOOKASSA_WEBHOOK_SKIP_IP_CHECK=true` — **только локально**, никогда в `ENVIRONMENT=production` (приложение не стартует).

## 5. Тестовый режим и подготовка sandbox (для владельца)

Официально: [тестовый магазин](https://yookassa.ru/docs/support/merchant/payments/implement/test-store), [тестирование API](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing).

### Как получить test shopId и test secret

1. Войдите в личный кабинет ЮKassa.
2. Создайте / откройте **тестовый** магазин (не боевой).
3. **shopId** — в настройках магазина.
4. **Секретный ключ** тестового магазина — в «Интеграция → Ключи API» (обычно префикс `test_…`, доступен в ЛК без SMS-активации боевого ключа).
5. В BotForg: режим подключения **Test**, вставьте эти значения, сохраните, дождитесь проверки, включите, сделайте основным.

### Публичный HTTPS URL для webhook

1. Поднимите backend так, чтобы с интернета был доступен HTTPS.
2. Для локальной разработки — туннель (ngrok / cloudflared / аналог) на порт backend (**8001** в dev).
3. В ЛК ЮKassa URL уведомлений: `https://<публичный-хост>/webhooks/payments/yookassa`.
4. Если туннель подставляет свой peer — настройте `TRUST_PROXY` + `TRUSTED_PROXIES` (см. выше), **не** отключайте IP-check в production.

### Return URL

- Задайте `YOOKASSA_REDIRECT_URL` (предпочтительно) на HTTPS-страницу после оплаты, либо убедитесь, что `FRONTEND_URL` указывает на ваш фронт.
- При `/pay` можно передать `return_url` в теле; иначе используется env.
- Проверка: после тестовой оплаты браузер уходит на этот URL (страница должна открываться).

### Env только для локального стенда

| Допустимо локально | Запрещено в production |
|--------------------|------------------------|
| `YOOKASSA_WEBHOOK_SKIP_IP_CHECK=true` (временно) | то же значение |
| `YOOKASSA_WEBHOOK_TRUST_PROXY` + локальный peer | trust без `TRUSTED_PROXIES` |
| test shopId / `test_…` secret | live secret «на пробу» |

### Чего никогда нельзя делать с live credentials

- Вставлять боевой ключ в test/staging «чтобы проверить».
- Платить настоящей картой на тестовом магазине / наоборот — тестовой картой на боевом.
- Коммитить ключи, класть их в тикеты/чаты, писать в логи.
- Включать `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` на боевом сервере.

### Диагностика без секретов

```http
GET /api/admin/payments/yookassa/diagnostics
```

(роль tariff admin / owner). Ответ: флаги connection / mode / return URL / IP-check / readiness.
**Нет** shopId, secret, ciphertext.

Ожидание перед smoke: `readiness: "ready"`, `mode: "test"`.

### Чек-лист перед первым тестовым платежом (6.12.3)

1. [ ] Тестовый магазин, ключ `test_…`, mode=test в BotForg.
2. [ ] Connection: verified + enabled + default.
3. [ ] `YOOKASSA_REDIRECT_URL` или `FRONTEND_URL` заданы; return URL открывается в браузере.
4. [ ] Публичный HTTPS webhook URL прописан в ЛК; события `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`.
5. [ ] `GET .../yookassa/diagnostics` → `ready`; `webhook_ip_check_enabled=true` (предпочтительно).
6. [ ] Proxy trust настроен осознанно **или** peer видит IP ЮKassa напрямую.
7. [ ] Live-ключ нигде не используется; `ENVIRONMENT` не production для первого smoke (если smoke на staging).
8. [ ] Готовы тестовые карты из документации ЮKassa (не реальные).

### Что сохранить после smoke

Без секретов и скринов с ключами:

- `checkout_intent_id`, `attempt_id` (без shopId / secret / payment ID в тикетах)
- ответ `GET /me/checkout-intents/{id}/payment` (`normalized_status`, `is_final`, `can_retry`)
- JSON diagnostics (safe)
- факт: webhook принят, intent → `fulfilled`, один entitlement
- запись в админ-журнале `/api/admin/payments/operations/{id}` (без credentials)

Не сохранять: временные tunnel URL, shopId, secret key, provider payment ID, confirmation URL с orderId.

### Журнал проверок (sandbox)

| Дата | Результат | Продукт | Примечание |
|------|-----------|---------|------------|
| 2026-07-18 | **passed** | addon `msg_1000`, 190.00 RUB | Локальный smoke через временный Cloudflare tunnel; `TESTING=true` (IP-check webhook off); live не выполнялся. Подробности: `docs/TARIFFS_STAGE_6_12_YOOKASSA_SANDBOX.md` §6.12.4 |

### Ошибки оплаты (безопасно для UI)

Клиент получает код и короткое русское сообщение **без** секретов и raw-ответа ЮKassa, например:

- таймаут → `provider_timeout` (504);
- сеть / сбой API → `provider_unavailable` / `provider_error`;
- неверная настройка подключения → `provider_misconfigured`.

Подробности lifecycle: `docs/TARIFFS_STAGE_6_11_PAYMENT_OPERATIONS.md`.
Sandbox этап: `docs/TARIFFS_STAGE_6_12_YOOKASSA_SANDBOX.md`.

## 6. Production

- Боевой секретный ключ.
- Режим Production.
- `ENVIRONMENT=production`.
- `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` должен быть **false** (иначе процесс не стартует).
- `YOOKASSA_WEBHOOK_TRUST_PROXY=true` только вместе с непустым `YOOKASSA_WEBHOOK_TRUSTED_PROXIES`.
- Fake-провайдер недоступен.

## 7. Проверка

Кнопка «Проверить» / verify connection делает безопасный запрос к API ЮKassa без списания денег.

Чеклист владельца (test, без live):

1. Основное подключение ЮKassa: verified + enabled + default; diagnostics `ready`.
2. Webhook URL доступен с IP ЮKassa (или trust proxy с allowlist).
3. Тестовый `/pay` → confirmation URL → тестовая оплата → `fulfilled`.
4. Тестовый `/pay` → `/cancel` → `GET .../payment` показывает `cancelled`, `can_retry=false` для этого intent.
5. Убедиться, что в ответах API нет `secret_key` / ciphertext.

## 8. Аварийное отключение

1. Назначьте другую готовую систему основной.
2. Выключите ЮKassa.
3. При необходимости удалите подключение (если нет незавершённых платежей).

## 9. Смена основной системы

«Сделать основным» влияет только на **новые** платежи. Уже созданные PaymentAttempt сохраняют прежний provider/connection.

## 10. Что нельзя коммитить

- `PAYMENT_CREDENTIALS_MASTER_KEY`
- `YOOKASSA_SECRET_KEY` / секрет из формы
- Реальные `.env` файлы
- Дампы БД с ciphertext без отдельной политики ключей
