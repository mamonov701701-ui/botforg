"""Скрипт для изменения роли пользователя вручную.
   Использование:
     python backend/scripts/set_user_role.py <email|user_id> <role>
   Примеры:
     python backend/scripts/set_user_role.py mamonov701701@mail.ru owner
     python backend/scripts/set_user_role.py 12 developer
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.database import SessionLocal
from backend.models.user import User

ROLES = ["owner", "admin", "developer", "templates_manager", "support", "viewer", "user"]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        print(f"Доступные роли: {', '.join(ROLES)}")
        return 1

    identifier = sys.argv[1].strip()
    new_role = sys.argv[2].strip().lower()

    if new_role not in ROLES:
        print(f"Ошибка: роль '{new_role}' недопустима. Доступные: {', '.join(ROLES)}")
        return 1

    db = SessionLocal()
    try:
        # Поиск по email или id
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

        old_role = user.role
        user.role = new_role
        db.commit()

        print(f"Роль обновлена: {user.email} (id={user.id})")
        print(f"  Было: {old_role}")
        print(f"  Стало: {new_role}")
        return 0
    except Exception as e:
        print(f"Ошибка: {e}")
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
