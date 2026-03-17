"""Ручной запуск создания демо-контента для пользователя.
   Использование:
     python backend/scripts/seed_demo_content.py <email|user_id>
   Примеры:
     python backend/scripts/seed_demo_content.py mamonov701701@mail.ru
     python backend/scripts/seed_demo_content.py 12
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.services.demo_content import create_demo_content_for_user


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    identifier = sys.argv[1].strip()
    db = SessionLocal()

    try:
        if "@" in identifier:
            user = db.query(User).filter(User.email == identifier.strip().lower()).first()
        else:
            try:
                uid = int(identifier)
                user = db.query(User).filter(User.id == uid).first()
            except ValueError:
                user = db.query(User).filter(User.email == identifier.strip().lower()).first()

        if not user:
            print(f"Пользователь не найден: {identifier}")
            return 1

        created = create_demo_content_for_user(db, user.id)
        if created:
            print(f"[OK] Демо-контент создан для {user.email} (id={user.id})")
        else:
            print(f"[INFO] Демо-контент уже был создан для {user.email}")
        return 0
    except Exception as e:
        print(f"Ошибка: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
