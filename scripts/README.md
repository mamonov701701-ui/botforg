# Скрипты запуска BotForg

Эта папка содержит скрипты для быстрого запуска проекта BotForg в режиме разработки.

## Доступные скрипты

### Custom Block Development Runner (раннер разработки кастомных блоков)

Для Preview (предпросмотра) JavaScript Custom Block запустите отдельный изолированный Runner перед Backend:

```powershell
.\scripts\dev-custom-runner.ps1
.\scripts\dev-backend.ps1
# Frontend запускается отдельно из каталога frontend:
Set-Location .\frontend
npm.cmd run dev
Set-Location ..
.\scripts\check-custom-runner.ps1
```

Канонический локальный адрес Runner — `http://127.0.0.1:8090`. При каждом запуске Runner создаёт новый случайный development token (токен разработки) в локальном gitignored-файле `scripts/.dev-custom-runner-token`; значение не хранится в репозитории и не выводится в консоль. Production (боевое окружение) обязано задавать отдельный секрет и Production-grade Isolation Provider (провайдер промышленной изоляции). Docker сам по себе не считается достаточной Production Security Boundary (границей промышленной безопасности).

`dev-backend.ps1` запускает Backend (бэкенд) через `dev-backend-runtime-env.cmd`. Wrapper (обёртка) передаёт Feature Flag (флаг включения), Runner URL (адрес раннера) и development token (токен разработки) фактическому Uvicorn reload child process (дочернему процессу автоперезагрузки), не выводя токен в консоль.

Если `http://127.0.0.1:8090/healthz` отвечает успешно, но Preview (предпросмотр) не выполняется, перезапустите Backend каноническим скриптом и ориентируйтесь на конкретную безопасную ошибку Preview: функция выключена, адрес не настроен, соединение отклонено, ошибка авторизации или таймаут. Успешный `/healthz` подтверждает готовность Runner, но сам по себе не подтверждает конфигурацию Backend ↔ Runner.

`check-custom-runner.ps1` проверяет четыре факта: Runner health, Backend health, конфигурацию фактического Backend worker (воркера бэкенда) и реальное аутентифицированное выполнение минимального JavaScript через QuickJS/WASM. Service Token (сервисный токен) не выводится; показывается только короткий fingerprint (отпечаток).

| Симптом | Diagnostic code (код диагностики) | Действие |
| --- | --- | --- |
| Runner не отвечает | `runner_not_running` | Запустить `dev-custom-runner.ps1` |
| Backend не отвечает | `backend_not_running` | Запустить `dev-backend.ps1` |
| Ответил старый или конкурирующий worker | `backend_process_conflict` | Повторно запустить исправленный `dev-backend.ps1` |
| Feature Flag выключен | `feature_disabled` | Использовать канонический Backend launcher |
| Runner URL отсутствует | `runner_url_missing` | Использовать канонический Backend launcher |
| Токены не совпадают | `auth_mismatch` | Перезапустить Runner, затем Backend канонически |
| Соединение отклонено | `connection_refused` | Проверить Runner на `127.0.0.1:8090` |
| Превышен таймаут | `timeout` | Проверить нагрузку Runner и код блока |
| Некорректный ответ | `invalid_runner_response` | Проверить Runner profile/version |
| Прочая ошибка handshake | `backend_runner_handshake_failed` | Проверить Backend log и Runner log без публикации токенов |

### 1. `install-deps.ps1` - Установка зависимостей

**Первоначальная настройка проекта**

Устанавливает все необходимые зависимости для backend и frontend.

### 2. `install-test-deps.ps1` - Установка зависимостей тестов

**Настройка окружения для тестирования**

Устанавливает зависимости для разработки и тестирования backend.

**Использование:**

```powershell
# В корне проекта
.\scripts\install-test-deps.ps1
```

**Что происходит:**

- Активируется виртуальное окружение
- Обновляется pip
- Устанавливаются runtime зависимости
- Устанавливаются зависимости для разработки и тестов

**Использование:**

```powershell
# В корне проекта
.\scripts\install-deps.ps1
```

**Что происходит:**

- Активируется виртуальное окружение
- Обновляется pip
- Устанавливаются runtime зависимости
- Устанавливаются зависимости для разработки и тестов
- Устанавливаются frontend зависимости

### 3. `start-dev.ps1` - Полный запуск проекта (рекомендуется)

**Рекомендуется для Windows 10/11**

Освобождает порты 8001 и 5173, применяет миграции БД и запускает backend и frontend в отдельных окнах CMD.

**Использование:**

```powershell
# В корне проекта
.\scripts\start-dev.ps1
```

**Что происходит:**

- Освобождаются порты 8001 (backend) и 5173 (frontend), если они заняты
- Применяются миграции Alembic (в т.ч. таблица `user_settings` для раздела «Настройки»)
- Открывается окно CMD с backend (uvicorn на http://localhost:8001)
- Открывается окно CMD с frontend (Vite на http://localhost:5173)
- Закройте оба окна для остановки серверов

См. также **`stop-dev.ps1`** — останавливает процессы на портах `8001`, `5173`, `5174` (удобно, если окна CMD закрыты некорректно).

### 4. `prepare-dev.ps1` - Только миграции БД

Применяет миграции без запуска серверов. Удобно после клонирования репозитория или обновления кода.

```powershell
.\scripts\prepare-dev.ps1
```

### 5. `start-dev.bat` - Batch файл

**Альтернатива для пользователей CMD**

Вызывает `start-dev.ps1` (полный запуск: миграции, backend, frontend).

**Использование:**

```cmd
# В корне проекта
.\scripts\start-dev.bat
```

## Что запускается

### Backend (FastAPI)

- **URL**: http://127.0.0.1:8001
- **Swagger**: http://127.0.0.1:8001/docs
- **Виртуальное окружение**: рекомендуется активировать перед первым запуском
- **Зависимости**: из backend/requirements.txt

### Frontend (Vite)

- **URL**: http://localhost:5173
- **Hot Module Replacement**: Да
- **Авто-перезагрузка**: Да
- **Зависимости**: Автоматически устанавливаются (npm ci или npm install)

## Требования

- Python 3.8+ с установленным venv
- Node.js 16+
- PowerShell (для .ps1) или cmd (для .bat)
- Виртуальное окружение должно быть в `./venv/`

## Устранение неполадок

### Если backend не запускается:

1. Проверить, что виртуальное окружение существует в `./venv/`
2. Убедиться, что Python установлен и доступен в PATH
3. Проверить содержимое `backend/requirements.txt`

### Если frontend не запускается:

1. Проверить, что Node.js установлен и доступен в PATH
2. Убедиться, что в `frontend/` есть `package.json`
3. Проверить, что все npm зависимости корректны

### Если скрипты не работают:

1. Запустить PowerShell/cmd от имени администратора
2. Проверить политики выполнения PowerShell (если используете .ps1)
3. Убедиться, что находитесь в корневой папке проекта

## Альтернативный запуск через VS Code

Вместо скриптов можно использовать встроенные задачи VS Code:

1. Открыть Command Palette (`Ctrl+Shift+P`)
2. Выбрать "Tasks: Run Task"
3. Выбрать "Dev: All (Backend + Frontend)"

Это запустит оба сервера параллельно в терминале VS Code.
