"""
Простой тест для проверки корректности настройки pytest
"""
import pytest

def test_imports_work():
    """Проверяем, что основные импорты работают"""
    try:
        from backend.main import app
        assert app is not None
        print("✅ backend.main импортируется успешно")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта backend.main: {e}")

def test_fastapi_available():
    """Проверяем, что FastAPI доступен"""
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        print("✅ FastAPI модули доступны")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта FastAPI: {e}")

def test_pytest_works():
    """Проверяем, что pytest работает"""
    assert True, "pytest работает корректно"
    print("✅ pytest работает")

def test_backend_app_structure():
    """Проверяем структуру backend приложения"""
    from backend.main import app
    
    # Проверяем основные атрибуты
    assert hasattr(app, 'routes'), "Приложение должно иметь routes"
    assert hasattr(app, 'middleware'), "Приложение должно иметь middleware"
    
    # Проверяем наличие health endpoint
    route_paths = [route.path for route in app.routes]
    assert "/health" in route_paths, "Должен быть /health endpoint"
    
    print("✅ Структура backend приложения корректна")


