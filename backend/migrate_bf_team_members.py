"""
Скрипт для создания таблицы bf_team_members и миграции существующих участников команды
Запустить один раз после создания модели BFTeamMember
"""
import sqlite3
from pathlib import Path

# Путь к базе данных
db_path = Path(__file__).parent / "botforg.db"

if not db_path.exists():
    print(f"База данных не найдена: {db_path}")
    exit(1)

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

try:
    # Создаем таблицу bf_team_members
    print("Создание таблицы bf_team_members...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bf_team_members (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            added_by INTEGER NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(added_by) REFERENCES users (id)
        )
    """)
    
    # Создаем индекс
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_bf_team_members_user_id ON bf_team_members (user_id)")
    
    # Находим всех пользователей, у которых когда-либо были BF-роли
    print("Поиск существующих участников команды...")
    cursor.execute("""
        SELECT DISTINCT user_id, granted_by 
        FROM platform_roles
        ORDER BY granted_at ASC
    """)
    
    existing_members = cursor.fetchall()
    
    if existing_members:
        print(f"Найдено {len(existing_members)} участников команды")
        
        # Добавляем их в таблицу bf_team_members
        # Используем первого, кто выдал роль, как added_by
        for user_id, granted_by in existing_members:
            # Проверяем, нет ли уже записи
            cursor.execute("SELECT id FROM bf_team_members WHERE user_id = ?", (user_id,))
            if cursor.fetchone() is None:
                cursor.execute("""
                    INSERT INTO bf_team_members (user_id, added_by, is_active)
                    VALUES (?, ?, 1)
                """, (user_id, granted_by))
                print(f"  Добавлен участник: user_id={user_id}, added_by={granted_by}")
    else:
        print("Участников команды не найдено")
    
    conn.commit()
    print("\n✅ Миграция завершена успешно!")
    
    # Показываем статистику
    cursor.execute("SELECT COUNT(*) FROM bf_team_members")
    count = cursor.fetchone()[0]
    print(f"Всего участников в таблице bf_team_members: {count}")
    
except Exception as e:
    conn.rollback()
    print(f"❌ Ошибка при миграции: {e}")
    raise
finally:
    conn.close()

