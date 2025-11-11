"""
Скрипт для создания владельца платформы BotForg
Создает пользователя с ролью 'owner' и максимальными правами
"""
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.security import get_password_hash


def create_platform_owner(email: str, password: str, name: str = "Владелец платформы"):
    """
    Создает владельца платформы с максимальными правами
    
    Args:
        email: Email владельца
        password: Пароль владельца
        name: Имя владельца
    """
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("🚀 СОЗДАНИЕ ВЛАДЕЛЬЦА ПЛАТФОРМЫ BOTFORG")
        print("=" * 70)
        
        # Проверяем, существует ли пользователь
        existing_user = db.query(User).filter(User.email == email).first()
        
        if existing_user:
            print(f"\n⚠️  Пользователь с email {email} уже существует!")
            print(f"   ID: {existing_user.id}")
            print(f"   Имя: {existing_user.name}")
            print(f"   Роль: {existing_user.role}")
            
            # Обновляем роль на owner если она другая
            if existing_user.role != 'owner':
                existing_user.role = 'owner'
                db.commit()
                print(f"\n✅ Роль обновлена на 'owner'")
            else:
                print(f"\n✅ Пользователь уже имеет роль 'owner'")
            
            print("\n" + "=" * 70)
            print("📧 Email:   ", email)
            print("🆔 User ID: ", existing_user.id)
            print("👤 Имя:     ", existing_user.name)
            print("🔑 Пароль:  ", "(используйте существующий)")
            print("=" * 70)
            return existing_user
        
        # Создаем нового владельца
        print(f"\n📝 Создаем владельца платформы...")
        owner = User(
            email=email,
            name=name,
            hashed_password=get_password_hash(password),
            role="owner",
            email_verified_at=datetime.now(timezone.utc)
        )
        
        db.add(owner)
        db.commit()
        db.refresh(owner)
        
        print(f"   ✅ Владелец создан успешно!")
        print("\n" + "=" * 70)
        print("✨ УЧЕТНЫЕ ДАННЫЕ ВЛАДЕЛЬЦА ПЛАТФОРМЫ")
        print("=" * 70)
        print("📧 Email:   ", email)
        print("🆔 User ID: ", owner.id)
        print("👤 Имя:     ", owner.name)
        print("🔑 Пароль:  ", password)
        print("🔐 Роль:    ", owner.role, "(максимальные права)")
        print("=" * 70)
        print("\n⚡ Вы можете войти на платформу используя эти данные")
        print("💡 ВАЖНО: Сохраните эти данные в безопасном месте!\n")
        
        return owner
        
    except Exception as e:
        print(f"\n❌ Ошибка при создании владельца: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    # Запрашиваем данные у пользователя
    print("\n🔧 Введите данные для создания владельца платформы:\n")
    
    email = input("📧 Email: ").strip()
    if not email:
        print("❌ Email обязателен!")
        sys.exit(1)
    
    password = input("🔑 Пароль: ").strip()
    if not password:
        print("❌ Пароль обязателен!")
        sys.exit(1)
    
    if len(password) < 8:
        print("⚠️  Рекомендуется использовать пароль длиной минимум 8 символов")
        confirm = input("Продолжить? (y/n): ").strip().lower()
        if confirm != 'y':
            sys.exit(0)
    
    name = input("👤 Имя (Enter для 'Владелец платформы'): ").strip()
    if not name:
        name = "Владелец платформы"
    
    print()
    create_platform_owner(email, password, name)

