"""
Тест для проверки корректности импортов основных модулей
"""
import pytest

def test_backend_imports():
    """Проверяем, что основные модули backend импортируются корректно"""
    try:
        from backend.main import app
        assert app is not None
        print("✅ backend.main импортируется корректно")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта backend.main: {e}")

def test_fastapi_imports():
    """Проверяем, что FastAPI и связанные модули импортируются"""
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from fastapi.middleware.cors import CORSMiddleware
        print("✅ FastAPI модули импортируются корректно")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта FastAPI: {e}")

def test_sqlalchemy_imports():
    """Проверяем, что SQLAlchemy импортируется"""
    try:
        from sqlalchemy import create_engine, Column, Integer, String
        from sqlalchemy.ext.declarative import declarative_base
        print("✅ SQLAlchemy импортируется корректно")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта SQLAlchemy: {e}")

def test_pydantic_imports():
    """Проверяем, что Pydantic импортируется"""
    try:
        from pydantic import BaseModel
        print("✅ Pydantic импортируется корректно")
    except ImportError as e:
        pytest.fail(f"Ошибка импорта Pydantic: {e}")

def test_app_structure():
    """Проверяем структуру FastAPI приложения"""
    from backend.main import app
    
    # Проверяем, что это FastAPI приложение
    assert hasattr(app, 'routes'), "Приложение должно иметь атрибут routes"
    assert hasattr(app, 'middleware'), "Приложение должно иметь атрибут middleware"
    
    # Проверяем наличие основных роутов
    route_paths = [route.path for route in app.routes]
    assert "/health" in route_paths, "Должен быть роут /health"
    
    print("✅ Структура приложения корректна")










































