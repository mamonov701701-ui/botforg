"""Seed тестового пользователя для проверки логина.
   email: mamonov701701@mail.ru
   password: Test123456!
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.security import get_password_hash

EMAIL = "mamonov701701@mail.ru"
PASSWORD = "Test123456!"
NAME = "Test User"


def main():
    db = SessionLocal()
    try:
        email_norm = EMAIL.strip().lower()
        existing = db.query(User).filter(User.email == email_norm).first()
        if existing:
            # Обновляем пароль на нужный (если хеш был некорректный)
            new_hash = get_password_hash(PASSWORD)
            existing.hashed_password = new_hash
            existing.password_hash = new_hash
            db.commit()
            print(f"[OK] User exists, password updated: {EMAIL} (id={existing.id})")
            return 0

        user = User(
            email=email_norm,
            name=NAME,
            hashed_password=get_password_hash(PASSWORD),
        )
        user.password_hash = user.hashed_password
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[OK] User created: {EMAIL} (id={user.id})")
        return 0
    except Exception as e:
        print(f"[FAIL] {e}")
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
