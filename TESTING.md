# Тестирование BotForg

## Быстрый старт

### 1. Установка зависимостей
```powershell
# В корне проекта
.\scripts\install-test-deps.ps1
```

### 2. Запуск тестов
```powershell
# Активировать venv
.\venv\Scripts\Activate.ps1

# Запустить все тесты
python -m pytest -v tests

# Запустить простой тест
python -m pytest -v tests/test_simple.py
```

### 3. Через VS Code/Cursor
- `Terminal → Run Task… → Tests: Pytest (venv)`

## Структура тестов

- `tests/conftest.py` - настройка путей импорта
- `tests/test_simple.py` - базовый тест настройки
- `tests/test_imports.py` - тесты импортов
- `tests/test_basic.py` - базовые API тесты
- `tests/test_templates.py` - тесты шаблонов

## Устранение неполадок

### Ошибка "No module named 'backend'"
1. Убедиться, что `tests/conftest.py` существует
2. Проверить, что запускаете из корня проекта
3. Установить `PYTHONPATH=${workspaceFolder}`

### Ошибка "No module named 'fastapi'"
1. Активировать виртуальное окружение
2. Установить зависимости: `.\scripts\install-test-deps.ps1`

### Предупреждение про asyncio_mode
1. Установить `pytest-asyncio`: `pip install pytest-asyncio`
2. Проверить `pytest.ini`: `asyncio_mode = auto`

## Конфигурация

- `pytest.ini` - основная конфигурация pytest
- `.vscode/settings.json` - настройки VS Code
- `.vscode/tasks.json` - задачи для запуска тестов

