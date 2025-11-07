"""
Простой скрипт для создания администратора через SQL
"""
import sqlite3
from datetime import datetime, timezone
from backend.security import get_password_hash

def create_admin_user():
    """Создаёт пользователя с ролью owner через прямой SQL"""
    
    # Подключаемся к БД
    conn = sqlite3.connect('./botforg.db')
    cursor = conn.cursor()
    
    try:
        email = "admin@example.com"
        
        # Проверяем, существует ли пользователь
        cursor.execute("SELECT id, role FROM users WHERE email = ?", (email,))
        existing = cursor.fetchone()
        
        if existing:
            user_id, role = existing
            print("❌ Пользователь admin@example.com уже существует!")
            print(f"   ID: {user_id}")
            print(f"   Роль: {role}")
            print("\nДля входа используйте:")
            print("   📧 Email:    admin@example.com")
            print("   🔑 Password: admin123456")
            
            # Обновляем роль, если нужно
            if role != 'owner':
                cursor.execute("UPDATE users SET role = 'owner' WHERE id = ?", (user_id,))
                conn.commit()
                print(f"\n✅ Роль обновлена с '{role}' на 'owner'")
            
            return
        
        # Хешируем пароль
        hashed_password = get_password_hash("admin123456")
        created_at = datetime.now(timezone.utc).isoformat()
        
        # Создаём пользователя
        cursor.execute("""
            INSERT INTO users (email, name, hashed_password, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (email, "Администратор", hashed_password, "owner", created_at))
        
        conn.commit()
        user_id = cursor.lastrowid
        
        print("✅ Пользователь успешно создан!")
        print("\n" + "="*60)
        print("📧 Email:    admin@example.com")
        print("🔑 Password: admin123456")
        print("👤 Роль:     owner (Владелец проекта)")
        print(f"🆔 ID:       {user_id}")
        print("="*60)
        print("\n🚀 Как войти в личный кабинет:")
        print("   1. Откройте: http://localhost:5173/account")
        print("   2. Войдите с указанными выше данными")
        print("   3. После входа перейдите: http://localhost:5173/dashboard")
        print("\n📋 Доступные разделы ЛК:")
        print("   • Главная (Dashboard)")
        print("   • Мои боты")
        print("   • Шаблоны")
        print("   • Баланс и платежи")
        print("   • Аналитика")
        print("   • Команда")
        print("   • Настройки")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при создании пользователя: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    create_admin_user()

