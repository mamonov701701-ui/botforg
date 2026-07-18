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

События: `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`, `refund.succeeded`.

BotForg проверяет IP ЮKassa и сверяет платёж через API. HMAC secret не требуется (его нет в официальном API).

## 5. Тестовый режим

- Используйте тестовый секретный ключ ЮKassa.
- Режим подключения: Test.
- Проведите тестовую оплату через confirmation URL из `/me/checkout-intents/{id}/pay`.
- Статус заказа: `GET /me/checkout-intents/{id}/payment` (`normalized_status`, `message`).
- Отмена до оплаты: `POST /me/checkout-intents/{id}/cancel` (только владелец; `pending` / `awaiting_payment`).
- Не используйте боевой ключ и live-карты на этом шаге.

### Ошибки оплаты (безопасно для UI)

Клиент получает код и короткое русское сообщение **без** секретов и raw-ответа ЮKassa, например:

- таймаут → `provider_timeout` (504);
- сеть / сбой API → `provider_unavailable` / `provider_error`;
- неверная настройка подключения → `provider_misconfigured`.

Подробности lifecycle и concurrency: `docs/TARIFFS_STAGE_6_11_PAYMENT_OPERATIONS.md`.

## 6. Production

- Боевой секретный ключ.
- Режим Production.
- `ENVIRONMENT=production`.
- `YOOKASSA_WEBHOOK_SKIP_IP_CHECK` должен быть **false**.
- Fake-провайдер недоступен.

## 7. Проверка

Кнопка «Проверить» делает безопасный запрос к API ЮKassa без списания денег.

Чеклист владельца (test, без live):

1. Основное подключение ЮKassa: verified + enabled + default.
2. Webhook URL доступен с IP ЮKassa (или временно только на staging с осознанным IP-check).
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
