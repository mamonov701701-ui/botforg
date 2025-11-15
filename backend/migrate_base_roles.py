"""
Скрипт для миграции существующих базовых ролей пользователей в таблицу base_roles
Создает записи base_roles для всех пользователей на основе их текущей роли в таблице users
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.database import engine, Base
from backend.models.user import User
from backend.models.base_role import BaseRole

def migrate_base_roles():
    """Мигрирует существующие роли пользователей в таблицу base_roles"""
    Base.metadata.create_all(bind=engine)
    
    with Session(engine) as db:
        # Получаем всех пользователей
        users = db.query(User).all()
        
        migrated_count = 0
        skipped_count = 0
        
        for user in users:
            # Проверяем, есть ли уже записи base_roles для этого пользователя
            existing_roles = db.query(BaseRole).filter(
                BaseRole.user_id == user.id
            ).all()
            
            if existing_roles:
                print(f"Пользователь {user.email} (ID: {user.id}) уже имеет записи base_roles. Пропускаем.")
                skipped_count += 1
                continue
            
            # Создаем запись base_roles для текущей роли пользователя
            # Используем ID пользователя как granted_by (или можно использовать ID владельца платформы)
            # Ищем владельца платформы для granted_by
            owner = db.query(User).filter(User.role == "owner").first()
            granted_by_id = owner.id if owner else user.id
            
            base_role = BaseRole(
                user_id=user.id,
                role_name=user.role,
                granted_by=granted_by_id,
                granted_at=user.created_at or datetime.now(timezone.utc),
                expires_at=None,  # Бессрочно для существующих ролей
                is_active=True,
                notes="Миграция из таблицы users"
            )
            
            db.add(base_role)
            migrated_count += 1
            print(f"Создана базовая роль для пользователя {user.email} (ID: {user.id}): {user.role}")
        
        db.commit()
        
        print(f"\nМиграция завершена:")
        print(f"  - Мигрировано пользователей: {migrated_count}")
        print(f"  - Пропущено (уже есть записи): {skipped_count}")
        print(f"  - Всего пользователей: {len(users)}")

if __name__ == "__main__":
    print("Начинаем миграцию базовых ролей...")
    migrate_base_roles()
    print("Готово!")

