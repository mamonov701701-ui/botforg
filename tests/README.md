# Тестирование BotForg

Эта папка содержит unit-тесты для backend части проекта BotForg.

## Структура тестов

```
tests/
├── conftest.py          # Конфигурация pytest и настройка путей
├── test_simple.py       # Простой тест для проверки настройки
├── test_imports.py      # Тесты импортов основных модулей
├── test_basic.py        # Базовые тесты API endpoints
├── test_templates.py    # Тесты для работы с шаблонами
├── debug_test.py        # Отладочные тесты
└── e2e/                 # End-to-end тесты
```

## Запуск тестов

### 1. Подготовка окружения
```powershell
# Активировать виртуальное окружение
.\venv\Scripts\Activate.ps1

# Установить зависимости (если не установлены)
.\scripts\install-deps.ps1
```

### 2. Запуск всех тестов
```bash
pytest -v tests/
```

### 3. Запуск конкретного теста
```bash
# Тест импортов
pytest -v tests/test_imports.py

# Базовые тесты
pytest -v tests/test_basic.py

# Тесты шаблонов
pytest -v tests/test_templates.py
```

### 4. Запуск с покрытием
```bash
pytest --cov=backend tests/ --cov-report=html
```

### 5. Через VS Code/Cursor
1. `Terminal → Run Task… → Tests: Pytest (venv)`
2. Или использовать встроенный тест-раннер

## Конфигурация

### conftest.py
Файл `conftest.py` настраивает пути импорта для корректной работы тестов:
- Добавляет корень проекта в `sys.path`
- Позволяет импортировать модули как `from backend.main import app`

### pytest.ini
Основная конфигурация pytest:
- `testpaths = tests` - папка с тестами
- `asyncio_mode = auto` - автоматический режим для асинхронных тестов
- `python_files = test_*.py` - паттерн для файлов тестов

## Типы тестов

### 1. Простой тест (`test_simple.py`)
Базовый тест для проверки корректности настройки pytest:
- Проверка импорта `backend.main`
- Проверка доступности FastAPI
- Проверка структуры backend приложения

### 2. Тесты импортов (`test_imports.py`)
Проверяют корректность импорта основных модулей:
- `backend.main`
- `fastapi`
- `sqlalchemy`
- `pydantic`

### 3. Базовые тесты (`test_basic.py`)
Тестируют основные API endpoints:
- `/health` - проверка работоспособности
- `/auth/register` и `/auth/login` - аутентификация
- CRUD операции с шаблонами
- Подключение ботов

### 4. Тесты шаблонов (`test_templates.py`)
Специализированные тесты для работы с шаблонами:
- Создание, чтение, обновление, удаление
- Проверка авторизации
- Обработка ошибок

## Устранение неполадок

### Ошибка "No module named 'backend'"
1. Убедиться, что `tests/conftest.py` существует
2. Проверить, что запускаете тесты из корня проекта
3. Установить переменную `PYTHONPATH=${workspaceFolder}`

### Ошибка "No module named 'fastapi'"
1. Активировать виртуальное окружение
2. Установить зависимости: `pip install -r backend/requirements.txt`
3. Проверить, что `uvicorn` и `fastapi` установлены

### Предупреждение про asyncio_mode
1. Установить `pytest-asyncio`: `pip install pytest-asyncio`
2. Убедиться, что в `pytest.ini` указано `asyncio_mode = auto`

### Ошибки импорта в тестах
1. Проверить, что `backend/__init__.py` существует
2. Убедиться, что все необходимые `__init__.py` файлы созданы
3. Проверить корректность путей в `conftest.py`

## Добавление новых тестов

### 1. Создать файл теста
```python
# tests/test_new_feature.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_new_feature():
    """Тест новой функциональности"""
    response = client.get("/new-endpoint")
    assert response.status_code == 200
```

### 2. Следовать соглашениям
- Имена файлов: `test_*.py`
- Имена функций: `test_*`
- Имена классов: `Test*`
- Использовать `pytest.fixture` для общих данных

### 3. Запустить тест
```bash
pytest -v tests/test_new_feature.py
```

## Интеграция с CI/CD

Тесты можно интегрировать в CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    python -m pip install --upgrade pip
    pip install -r backend/requirements.txt
    pip install -r backend/requirements-dev.txt
    pytest -v tests/ --cov=backend --cov-report=xml
```

## Полезные команды

```bash
# Запуск тестов с подробным выводом
pytest -v -s tests/

# Запуск тестов с остановкой при первой ошибке
pytest -x tests/

# Запуск тестов с параллельным выполнением
pytest -n auto tests/

# Генерация отчета о покрытии
pytest --cov=backend --cov-report=html tests/
```
