# BotForg

BotForg - это платформа для создания и управления чат-ботами с визуальным редактором потоков.

---

## 🎉 ОБНОВЛЕНИЕ 2026-02-02

**✅ Модерация шаблонов маркетплейса**

- Жизненный цикл: draft → pending → approved/rejected
- Кабинет разработчика `/developer/templates`: статусы, кнопка «На модерацию»
- Админ-эндпоинты approve/reject (только owner)
- В публичном маркетплейсе только одобренные шаблоны

**✅ Новый flow создания ботов (2025-01-09)**

- Многошаговый процесс создания бота
- Выбор типа: "Подключить к каналу" или "Создать для маркетплейса"
- Поддержка нескольких каналов: Telegram, WhatsApp, Max
- Создание шаблонов ботов без токена для продажи на маркетплейсе

**🚀 Быстрый вход:**
- Откройте: http://localhost:5173
- Email: mamonov701701@mail.ru
- Password: Test123456!

**📚 Подробности:** см. `docs/user/QUICK_START.md`

---

## Технологии

- **Backend**: FastAPI + SQLAlchemy + SQLite + Alembic
- **Frontend**: React + Vite + Tailwind CSS + React Flow
- **База данных**: SQLite с Alembic для миграций

## Быстрый старт (Windows)

### 1. Открыть проект в Cursor/VS Code

### 2. Запуск через задачи:

- `Terminal → Run Task… → Dev: All (Backend + Frontend)`
- Backend: http://127.0.0.1:8001 (Swagger: /docs)
- Frontend: http://localhost:5173

### 3. Полный запуск одним скриптом (рекомендуется):

Скрипт освобождает порты 8001 и 5173, применяет миграции БД и запускает backend и frontend:

- **PowerShell** (из корня проекта):
  ```powershell
  .\scripts\start-dev.ps1
  ```
  Откроются два окна: backend (8001) и frontend (5173). Закройте их для остановки.

- Только применить миграции (например, после клонирования репозитория):
  ```powershell
  .\scripts\prepare-dev.ps1
  ```

## API URL

Frontend использует переменную окружения `VITE_API_URL` для подключения к backend:

- **Development**: `VITE_API_URL=http://localhost:8001` (файл `frontend/.env.development`)
- **Production**: `VITE_API_URL=https://your-production-api.com` (файл `frontend/env.production`)

## Миграции

База данных управляется через Alembic. После изменений в моделях:

```bash
# Активировать виртуальное окружение
.\venv\Scripts\Activate.ps1

# Применить миграции
alembic upgrade head

# Создать новую миграцию (если изменили модели)
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head
```

## Структура проекта

```
botforg/
├── backend/           # FastAPI backend
│   ├── main.py       # Основное приложение
│   ├── models/       # SQLAlchemy модели
│   ├── routers/      # API роутеры
│   ├── schemas/      # Pydantic схемы
│   ├── settings.py   # Конфигурация (Pydantic Settings)
│   └── requirements.txt
├── frontend/          # React frontend
│   ├── src/          # Исходный код
│   ├── components/    # React компоненты
│   ├── env.development # Development environment
│   ├── env.production  # Production environment
│   └── package.json
├── scripts/           # Скрипты запуска
│   ├── start-dev.ps1 # PowerShell скрипт для запуска
│   └── start-dev.bat # Batch файл для запуска
├── .vscode/          # Конфигурация VS Code
│   └── tasks.json    # Задачи для запуска
├── env.example       # Пример переменных окружения
└── alembic.ini       # Конфигурация Alembic
```

## Разработка

### Backend

- Swagger документация: http://127.0.0.1:8001/docs
- База данных: SQLite (botforg.db) с Alembic миграциями
- Конфигурация через переменные окружения (файл `.env`)
- **Личный кабинет — Настройки**: API `GET/PUT /me/settings`, `PATCH /me`; данные хранятся в таблице `user_settings` (профиль, интерфейс, уведомления, BF Agent)

### Frontend

- Hot Module Replacement (Vite)
- Tailwind CSS для стилизации
- React Flow для визуального редактора
- API URL настраивается через переменные окружения

## Каналы (Channel Connectors)

Поддержка нескольких каналов одновременно: MAX, WhatsApp, Telegram и др.

- **Архитектура**: в `backend/channels/` — единый интерфейс `ChannelAdapter` (нормализация входящих в `NormalizedUpdate`, отправка через `send_text` / `send_media`), реестр адаптеров по имени канала.
- **Подключение к боту**: таблица `bot_channel_connections` (bot_id, channel, is_enabled, credentials_json). Секреты в API не возвращаются (write-only при POST).
- **API**: `GET /bots/{bot_id}/channels` — список подключений без секретов; `POST /bots/{bot_id}/channels` — создать/обновить (channel, is_enabled, credentials); `DELETE /bots/{bot_id}/channels/{channel}` — отключить.
- **Входящие события**: `POST /webhooks/{channel}/{bot_id}` — принимает сырой payload, нормализует через адаптер, далее — движок сценариев или логирование без PII.
- **Добавление канала**: реализовать класс-наследник `ChannelAdapter` в `backend/channels/`, зарегистрировать в `backend/channels/__init__.py` через `register_adapter("name", adapter)`.

Подробнее: `docs/channels.md`.

### MAX: подключение

Интеграция с мессенджером MAX (platform-api.max.ru). Ограничения доступа к MAX для бизнеса: для работы с API требуются юрлицо/ИП и верификация в MAX.

**Что нужно:**

- **Токен бота MAX** — выдаётся в личном кабинете MAX после создания бота.
- **Публичный HTTPS-домен** — для приёма webhook (в prod обязателен `MAX_WEBHOOK_BASE_URL`, иначе канал MAX включить нельзя).
- **Включение канала**: сначала создать подключение с токеном, затем вызвать enable для регистрации webhook.

**Шаги:**

1. В env (prod) задать `MAX_WEBHOOK_BASE_URL=https://YOUR_DOMAIN` (тот же домен, что и API BotForg).
2. Создать подключение канала: `POST /bots/{bot_id}/channels` с телом `{"channel": "max", "credentials": {"token": "<MAX_BOT_TOKEN>"}, "is_enabled": false}`. Токен в ответе не возвращается.
3. Включить канал и подписаться на webhook: `POST /bots/{bot_id}/channels/max/enable`. При отсутствии `webhook_secret` он генерируется и сохраняется; в MAX регистрируется URL `{MAX_WEBHOOK_BASE_URL}/webhooks/max/{bot_id}`.
4. Входящие события приходят на `POST /webhooks/max/{bot_id}`; MAX присылает заголовок `X-Max-Bot-Api-Secret` (значение совпадает с сохранённым secret). Без верного секрета запрос отклоняется (401).

**Эндпоинты управления MAX:**

- `POST /bots/{bot_id}/channels/max/enable` — включить канал и зарегистрировать webhook в MAX.
- `POST /bots/{bot_id}/channels/max/disable` — отписать webhook и выключить канал.
- `GET /bots/{bot_id}/channels/max/status` — статус (is_enabled, список подписок из MAX, без секретов).

**Пример включения канала (токен передавать только в теле при создании подключения, не в логах):**

```bash
# 1) Создать подключение (токен — только здесь, в ответе не возвращается)
curl -X POST "https://YOUR_DOMAIN/bots/BOT_ID/channels" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"channel":"max","credentials":{"token":"YOUR_MAX_BOT_TOKEN"},"is_enabled":false}'

# 2) Включить канал и подписаться на webhook
curl -X POST "https://YOUR_DOMAIN/bots/BOT_ID/channels/max/enable" \
  -H "Authorization: Bearer YOUR_JWT"
```

### WhatsApp: архитектура

Канал WhatsApp построен с **provider-abstraction**: один API BotForg и одни сценарии работают с разными провайдерами (Meta Cloud API, Twilio, 360dialog). Провайдер можно менять без изменения сценариев; секреты провайдера хранятся в `credentials_json` и не отдаются наружу.

**Структура:**

- `backend/channels/whatsapp/` — пакет канала WhatsApp.
- `backend/channels/whatsapp/providers/base.py` — базовый интерфейс провайдера (`normalize_incoming`, `send_text`, `send_media`, `validate_webhook`).
- Провайдеры (stubs): `meta_cloud.py`, `twilio.py`, `dialog360.py` в `backend/channels/whatsapp/providers/`.
- Адаптер `whatsapp_adapter.py` выбирает провайдера по `credentials_json["provider"]` и делегирует ему вызовы.

**Credentials (channel=whatsapp):** в `credentials_json` обязательно поле `provider` (`meta_cloud`, `twilio`, `dialog360`); остальные поля (token, phone_number_id, verify_token, webhook_secret и т.д.) зависят от провайдера. GET `/bots/{id}/channels` секреты не возвращает.

**Эндпоинты:**

- `POST /bots/{bot_id}/channels/whatsapp/enable` — включить канал (проверка `credentials.provider`).
- `POST /bots/{bot_id}/channels/whatsapp/disable` — выключить.
- `GET /bots/{bot_id}/channels/whatsapp/status` — provider, is_enabled (без секретов).

**Входящие события:** `POST /webhooks/whatsapp/{bot_id}` — по провайдеру вызывается `validate_webhook`, затем нормализация в `NormalizedUpdate`, запись в аналитику без PII (или передача в движок сценариев).

Подробнее: `docs/channels/whatsapp.md`.

## Правовые документы и согласия (152-ФЗ)

Для публичного запуска в РФ добавлен минимальный контур соответствия 152-ФЗ.

- **Документы**: в каталоге `docs/legal/` — заготовки «Политика ПДн» (`privacy_policy_ru.md`), «Пользовательское соглашение» (`terms_ru.md`), «Текст согласия» (`consent_text_ru.md`). Перед продакшеном их нужно доработать с юристом.
- **Согласия**: при регистрации и первом входе пользователь принимает политику и условия; факт принятия (версия документа, IP, User-Agent) сохраняется в таблице `consents`.
- **API**: `GET /legal/docs` — версии и тексты документов; `GET /legal/doc/{doc_type}` — один документ (markdown); `GET /legal/consent/status` — принятые пользователем документы; `POST /legal/consent` — принять документ.
- **Запросы субъекта ПДн**: `POST /privacy/export` — выгрузка данных пользователя (JSON); `POST /privacy/delete` — анонимизация аккаунта и связанных данных (где возможно).
- **Логирование доступа к ПДн**: middleware логирует обращение к эндпоинтам `/me`, `/legal/consent`, `/privacy` (endpoint, user_id, timestamp).

### Режим минимального хранения ПДн

- **По умолчанию** тексты сообщений и ПДн **не сохраняются**. Обработка сообщений и вызовы AI выполняются только в памяти.
- Хранятся только **агрегированные события**: `event_type`, `channel`, `chat_hash`, `node_id`, `timestamp` (таблица `events`, поля без payload/user_id при минимальном режиме).
- **Флаг «Хранить сообщения»** (поле бота `store_messages`, **OFF** по умолчанию): при включении в БД сохраняются тексты сообщений и привязка к пользователю; при выключении при создании сообщения в БД пишется пустой `content` и `user_id=null`.
- **Срок хранения** (`message_retention_days`, по умолчанию 30): применяется к сообщениям и событиям; автоочистка по сроку выполняется ежедневно (см. ниже).
- **Включение/выключение**: при редактировании бота через API (`PATCH /bots/{id}`) можно передать `store_messages` и `message_retention_days`. В ответе бота (`GET /bots/{id}`, список ботов) возвращаются `store_messages` и `message_retention_days`.
- Перед любыми вызовами LLM применяется **PII-scrubber** (маскирование телефонов, email, username, ID).

### Retention (автоочистка по сроку)

- Срок хранения задаётся **на уровне бота**: `message_retention_days` (по умолчанию 30 дней).
- Ежедневная задача очистки запускается при старте backend (задержка 60 с, затем раз в 24 ч). Удаляются сообщения и события старше срока для каждого бота. В среде `TESTING=true` задача не запускается.

### AI и отправка текста в LLM

- **Флаг «Разрешить отправку текста в AI»** (по умолчанию **выключен**): в настройках личного кабинета → вкладка «BF Agent». Без включения эндпоинты `/ai/chat`, `/ai/image`, `/ai/tts` возвращают 403.
- **Включение/выключение**: Настройки → BF Agent → чекбокс «Разрешить отправку текста в AI». Значение хранится в `user_settings.agent_settings.allow_send_text_to_ai`.
- Перед отправкой в LLM текст маскируется модулем **PII scrubber** (телефоны, email, username, числовые ID заменяются на плейсхолдеры).

### Production в РФ

- Для запуска с `ENVIRONMENT=production` **обязательны** переменные: `JWT_SECRET` (не dev-значение), `CHAT_HASH_SALT`, `DATA_REGION=RU`, `STORAGE_REGION=RU`, `DEBUG=false`. Иначе приложение не стартует. Пример: `env.production.example`.

## Продакшен-деплой (РФ)

Инфраструктурная готовность к выкладке в сеть (без Docker). Только конфиги и инструкции; установку выполняет администратор.

### 1) Сервер (Ubuntu)

- Python 3.10+, Nginx, при необходимости Certbot. Проект в `/opt/botforg` (корень репозитория), venv в `/opt/botforg/venv`.

### 2) Переменные окружения

- Скопировать `env.production.example` в `/opt/botforg/.env`.
- Заполнить **обязательные для РФ**: `JWT_SECRET`, `CHAT_HASH_SALT`, `DATA_REGION=RU`, `STORAGE_REGION=RU`, `DEBUG=false`, `DATABASE_URL`, `FRONTEND_ORIGIN` / `FRONTEND_URL` (ваш домен).
- Секреты генерировать: `openssl rand -hex 32`.

### 3) Backend (systemd)

- Пример unit: `deploy/systemd/botforg-backend.service`. Пути: `WorkingDirectory=/opt/botforg`, `EnvironmentFile=/opt/botforg/.env`, `ExecStart=.../venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8001`.
- Установка: `sudo cp deploy/systemd/botforg-backend.service /etc/systemd/system/`, `sudo systemctl daemon-reload`, `sudo systemctl enable botforg-backend`, `sudo systemctl start botforg-backend`.
- Логи: `journalctl -u botforg-backend -f`.
- Перед первым запуском: `alembic upgrade head` (из `/opt/botforg` с активированным venv).

### 4) Nginx + HTTPS

- Пример конфига: `deploy/nginx/botforg.conf`. Подставить свой домен вместо `YOUR_DOMAIN`. Backend — `127.0.0.1:8001`.
- Размещение: `/etc/nginx/sites-available/botforg.conf`, симлинк в `sites-enabled`, `nginx -t && systemctl reload nginx`.
- HTTPS: см. `deploy/README.md` — Certbot (Let's Encrypt). После получения сертификата включить HTTPS-блок в конфиге и редирект HTTP→HTTPS.

### 5) Frontend (prod)

- Сборка: в каталоге `frontend` задать `VITE_API_URL=https://YOUR_DOMAIN` (или пусто, если запросы идут на тот же домен) и выполнить `npm run build`.
- Результат в `frontend/dist`. Содержимое скопировать в `/var/www/botforg` (или путь из `root` в Nginx). Nginx отдаёт статику и проксирует API на backend (см. `deploy/nginx/botforg.conf`).

### Безопасность и ПДн (прод-минимум)

- **Логи**: логирование доступа к ПДн (152-ФЗ) в **`SecurityASGIMiddleware`** (`backend/middleware/security.py`, чистый ASGI) — в лог пишутся только **endpoint, method, user_id, timestamp**. Подробности: `docs/development/AUTH_AND_MIDDLEWARE.md`. Тела запросов (body), текст сообщений и chat_id в лог **не попадают**. В прод-логах не должны появляться полные payload и PII.
- **Бэкапы**: При использовании SQLite — регулярное копирование файла БД (например, ежедневно) в хранилище на территории РФ. Рекомендуется скрипт или cron + копирование в защищённый каталог/облако с ограничением доступа.
- **DEBUG**: В production обязательно `DEBUG=false`; при `DEBUG=true` приложение не стартует.
- **Документация API (/docs)**: В текущей конфигурации Swagger UI доступен по тому же URL, что и API. Для продакшена допустимы варианты: отключить раздачу `/docs` и `/openapi.json` через Nginx (location return 404) или ограничить доступ по IP/авторизации. Рекомендуется не открывать автодокументацию публично.

## Соответствие 152-ФЗ в проде

- Обработка ПДн на территории РФ: `DATA_REGION=RU`, `STORAGE_REGION=RU`.
- Согласия пользователей фиксируются; экспорт и удаление данных через `/privacy/export` и `/privacy/delete`; после удаления токены отзываются (`token_version`).
- Минимальное хранение по умолчанию (без текстов сообщений и без chat_id в БД); chat_hash — HMAC с секретом (`CHAT_HASH_SALT`). Логи без PII и без тел запросов.

### Чек-лист «Готово к выкладке в сеть»

- [ ] Сервер: Ubuntu, Python, Nginx, venv в `/opt/botforg`.
- [ ] Файл `.env` из `env.production.example`: заданы `JWT_SECRET`, `CHAT_HASH_SALT`, `DATA_REGION=RU`, `STORAGE_REGION=RU`, `DEBUG=false`, `DATABASE_URL`, `FRONTEND_ORIGIN`/`FRONTEND_URL`.
- [ ] Миграции: `alembic upgrade head` выполнены.
- [ ] Backend: systemd unit включён и запущен, логи без ошибок.
- [ ] Nginx: конфиг подключён, proxy на 127.0.0.1:8001, статика frontend из `/var/www/botforg`.
- [ ] HTTPS: сертификат (Certbot) установлен, редирект HTTP→HTTPS включён.
- [ ] Frontend: собран с `VITE_API_URL` под ваш домен, содержимое `dist` скопировано в каталог для Nginx.
- [ ] Бэкапы БД: настроено регулярное копирование в хранилище в РФ.
- [ ] `/docs`: при необходимости закрыт или ограничен в Nginx.

## Тестирование

✅ **Все тесты проходят успешно** (88/88 passed)
✅ **Rate limiting отключается при TESTING=true**
✅ **Совместимость bcrypt → pbkdf2**

### Запуск тестов

```bash
# Активировать виртуальное окружение
.\venv\Scripts\Activate.ps1

# Установить dev зависимости
pip install -r backend/requirements-dev.txt

# Запустить все тесты
python -m pytest -v tests

# Запустить конкретный тест
python -m pytest -v tests/test_basic.py

# Smoke-тесты 152-ФЗ (согласия, экспорт/удаление ПДн, retention)
python -m pytest -v tests/test_legal_152.py

# Запустить тесты с покрытием
python -m pytest --cov=backend tests/
```

### Через VS Code/Cursor

1. `Terminal → Run Task… → Tests: Pytest (venv)`
2. Или использовать встроенный тест-раннер

### Отчеты тестирования

Результаты тестов автоматически записываются в `LOGS/TEST_FIX_REPORT.txt`

## Требования

- Python 3.8+
- Node.js 16+
- PowerShell (Windows)

## Установка зависимостей

### Backend

```bash
# Активировать виртуальное окружение
.\venv\Scripts\Activate.ps1

# Установить runtime зависимости
pip install -r backend/requirements.txt

# Установить зависимости для разработки и тестов
pip install -r backend/requirements-dev.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Переменные окружения

Создайте файл `.env` в корне проекта на основе `env.example`:

```bash
# JWT settings
SECRET_KEY=your_secret_key_here_change_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS settings
FRONTEND_ORIGIN=http://localhost:5173

# Database
DATABASE_URL=sqlite:///./botforg.db

# Payment providers (optional)
TELEGRAM_PAYMENT_PROVIDER_TOKEN=your_telegram_token_here
YOOKASSA_SHOP_ID=your_yookassa_shop_id
YOOKASSA_SECRET_KEY=your_yookassa_secret_key
# ... остальные настройки
```

## Безопасность

- JWT токены с проверкой blacklist
- CORS настроен для разрешенных origins
- Пароли хешируются с bcrypt
- Секреты хранятся в переменных окружения
