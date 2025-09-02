# BotForg

BotForg - это платформа для создания и управления чат-ботами с визуальным редактором потоков.

## Технологии

- **Backend**: FastAPI + SQLAlchemy + SQLite + Alembic
- **Frontend**: React + Vite + Tailwind CSS + React Flow
- **База данных**: SQLite с Alembic для миграций

## Быстрый старт (Windows)

### 1. Открыть проект в Cursor/VS Code

### 2. Запуск через задачи:
- `Terminal → Run Task… → Dev: All (Backend + Frontend)`
- Backend: http://127.0.0.1:8000 (Swagger: /docs)
- Frontend: http://localhost:5173

### 3. Альтернативный запуск скриптом:
- **PowerShell**: Открыть PowerShell в корне проекта и выполнить:
  ```powershell
  .\scripts\start-dev.ps1
  ```
- **CMD**: Или использовать batch-файл:
  ```cmd
  .\scripts\start-dev.bat
  ```

## API URL

Frontend использует переменную окружения `VITE_API_URL` для подключения к backend:

- **Development**: `VITE_API_URL=http://localhost:8000` (файл `frontend/env.development`)
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
- Авто-перезагрузка при изменениях (uvicorn --reload)
- Swagger документация: http://127.0.0.1:8000/docs
- База данных: SQLite (botforg.db) с Alembic миграциями
- Конфигурация через переменные окружения (файл `.env`)

### Frontend
- Hot Module Replacement (Vite)
- Tailwind CSS для стилизации
- React Flow для визуального редактора
- API URL настраивается через переменные окружения

## Тестирование

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

# Запустить тесты с покрытием
python -m pytest --cov=backend tests/
```

### Через VS Code/Cursor
1. `Terminal → Run Task… → Tests: Pytest (venv)`
2. Или использовать встроенный тест-раннер

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
