"""Создание тестового пользователя напрямую в БД"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.auth.password import hash_password
from datetime import datetime

def create_user(email, password, name):
    db = SessionLocal()
    try:
        # Проверяем, существует ли пользователь
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"Пользователь {email} уже существует (ID: {existing.id})")
            return existing
        
        # Создаем нового пользователя
        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Пользователь {email} создан успешно (ID: {user.id})")
        return user
    except Exception as e:
        print(f"Ошибка при создании пользователя: {e}")
        db.rollback()
        return None
    finally:
        db.close()

if __name__ == "__main__":
    timestamp = datetime.now().strftime('%H%M%S')
    
    # Создаем первого пользователя (продавец)
    user1 = create_user(
        f"seller_{timestamp}@test.com",
        "Test123!",
        "Seller User"
    )
    
    # Создаем второго пользователя (покупатель)
    user2 = create_user(
        f"buyer_{timestamp}@test.com",
        "Test123!",
        "Buyer User"
    )
    
    print("\nПользователи созданы. Теперь можно запустить тест.")
