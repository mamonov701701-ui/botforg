"""Проверка пользователя в БД и формата хеша пароля"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.security import verify_password, get_password_hash

EMAIL = "mamonov701701@mail.ru"
PASSWORD = "Test123456!"


def main():
    db = SessionLocal()
    try:
        email_norm = EMAIL.strip().lower()
        user = db.query(User).filter(User.email == email_norm).first()
        if not user:
            print(f"[FAIL] Пользователь {EMAIL} не найден в БД")
            print(f"  Поиск по: {email_norm!r}")
            return 1

        print(f"[OK] Пользователь найден: id={user.id}, email={user.email!r}")
        hp = user.hashed_password
        if not hp:
            print(f"[FAIL] hashed_password пустой (NULL)")
            return 1

        print(f"  hashed_password: {hp[:50]}... (длина {len(hp)})")
        if hp.startswith("$2b$") or hp.startswith("$2a$"):
            print("  Формат: bcrypt")
        elif hp.startswith("$pbkdf2-sha256$"):
            print("  Формат: pbkdf2_sha256")
        else:
            print("  Формат: неизвестный")

        ok = verify_password(PASSWORD, hp)
        print(f"  verify_password({PASSWORD!r}): {'OK' if ok else 'FAIL'}")
        return 0 if ok else 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
