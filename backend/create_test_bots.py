"""
Скрипт для создания тестовых ботов
Создает ботов для разных пользователей для проверки группировки по проектам
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.bot import Bot
from backend.models.user import User
from backend.models.team import TeamMember

def create_test_bots():
    """Создает тестовых ботов для проверки функциональности"""
    db: Session = SessionLocal()
    
    try:
        # Получаем всех пользователей
        users = db.query(User).all()
        
        if len(users) < 2:
            print("❌ Нужно минимум 2 пользователя для создания тестовых ботов")
            print("   Создайте пользователей через регистрацию или скрипт")
            return
        
        # Находим владельца платформы
        owner = db.query(User).filter(User.role == "owner").first()
        if not owner:
            print("❌ Не найден владелец платформы (owner)")
            return
        
        print(f"✅ Найден владелец: {owner.email} (ID: {owner.id})")
        
        # Создаем ботов для владельца
        owner_bots = [
            {
                "title": "Бот поддержки клиентов",
                "username": f"support_bot_{owner.id}",
                "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{owner.id}_1",
                "is_active": True,
            },
            {
                "title": "Бот продаж",
                "username": f"sales_bot_{owner.id}",
                "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{owner.id}_2",
                "is_active": True,
            },
            {
                "title": "Бот маркетинга",
                "username": f"marketing_bot_{owner.id}",
                "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{owner.id}_3",
                "is_active": False,
            },
        ]
        
        created_count = 0
        
        # Создаем ботов для владельца
        for bot_data in owner_bots:
            existing = db.query(Bot).filter(Bot.username == bot_data["username"]).first()
            if existing:
                print(f"⏭️  Бот '{bot_data['title']}' уже существует, пропускаем")
                continue
            
            bot = Bot(
                owner_id=owner.id,
                title=bot_data["title"],
                username=bot_data["username"],
                token=bot_data["token"],
                is_active=bot_data["is_active"],
            )
            db.add(bot)
            created_count += 1
            print(f"✅ Создан бот: {bot_data['title']} для владельца {owner.email}")
        
        # Добавляем еще несколько ботов для владельца для лучшей демонстрации
        additional_owner_bots = [
            {
                "title": "Бот аналитики",
                "username": f"analytics_bot_{owner.id}",
                "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{owner.id}_4",
                "is_active": True,
            },
            {
                "title": "Бот HR",
                "username": f"hr_bot_{owner.id}",
                "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{owner.id}_5",
                "is_active": False,
            },
        ]
        
        for bot_data in additional_owner_bots:
            existing = db.query(Bot).filter(Bot.username == bot_data["username"]).first()
            if existing:
                continue
            
            bot = Bot(
                owner_id=owner.id,
                title=bot_data["title"],
                username=bot_data["username"],
                token=bot_data["token"],
                is_active=bot_data["is_active"],
            )
            db.add(bot)
            created_count += 1
            print(f"✅ Создан бот: {bot_data['title']} для владельца {owner.email}")
        
        # Создаем ботов для других пользователей (если они есть в команде)
        other_users = [u for u in users if u.id != owner.id and u.role != "user"]
        
        if other_users:
            # Берем первого пользователя как участника команды
            team_member = other_users[0]
            
            # Проверяем, есть ли он в команде владельца
            team_entry = db.query(TeamMember).filter(
                TeamMember.owner_id == owner.id,
                TeamMember.user_id == team_member.id
            ).first()
            
            if not team_entry:
                # Добавляем в команду
                team_entry = TeamMember(
                    owner_id=owner.id,
                    user_id=team_member.id,
                    role="developer"
                )
                db.add(team_entry)
                print(f"✅ Добавлен {team_member.email} в команду владельца")
            
            # Создаем ботов для этого пользователя (его собственные боты)
            member_bots = [
                {
                    "title": "Личный бот разработчика",
                    "username": f"dev_bot_{team_member.id}",
                    "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{team_member.id}_1",
                    "is_active": True,
                },
            ]
            
            for bot_data in member_bots:
                existing = db.query(Bot).filter(Bot.username == bot_data["username"]).first()
                if existing:
                    print(f"⏭️  Бот '{bot_data['title']}' уже существует, пропускаем")
                    continue
                
                bot = Bot(
                    owner_id=team_member.id,
                    title=bot_data["title"],
                    username=bot_data["username"],
                    token=bot_data["token"],
                    is_active=bot_data["is_active"],
                )
                db.add(bot)
                created_count += 1
                print(f"✅ Создан бот: {bot_data['title']} для пользователя {team_member.email}")
        
        # Если есть второй пользователь, создаем для него отдельный проект с ботами
        if len(other_users) > 0:
            second_user = other_users[0] if len(other_users) > 0 else None
            
            # Проверяем, не является ли он уже участником команды владельца
            if second_user and second_user.id != owner.id:
                # Временно даем роль admin для создания ботов
                original_role = second_user.role
                if second_user.role not in ["owner", "admin"]:
                    second_user.role = "admin"
                    db.flush()
                
                # Создаем ботов для второго пользователя как отдельного владельца проекта
                second_project_bots = [
                    {
                        "title": "Проект разработки",
                        "username": f"dev_project_bot_{second_user.id}",
                        "token": f"987654321:XYZabcDEFghiJKLmnoPQRstu_{second_user.id}_1",
                        "is_active": True,
                    },
                    {
                        "title": "Тестовый бот",
                        "username": f"test_bot_{second_user.id}",
                        "token": f"987654321:XYZabcDEFghiJKLmnoPQRstu_{second_user.id}_2",
                        "is_active": True,
                    },
                ]
                
                for bot_data in second_project_bots:
                    existing = db.query(Bot).filter(Bot.username == bot_data["username"]).first()
                    if existing:
                        continue
                    
                    bot = Bot(
                        owner_id=second_user.id,
                        title=bot_data["title"],
                        username=bot_data["username"],
                        token=bot_data["token"],
                        is_active=bot_data["is_active"],
                    )
                    db.add(bot)
                    created_count += 1
                    print(f"✅ Создан бот: {bot_data['title']} для проекта {second_user.email}")
                
                # Возвращаем оригинальную роль
                if second_user.role != original_role:
                    second_user.role = original_role
                    db.flush()
        
        # Если есть еще пользователи, создаем для них отдельные проекты
        if len(other_users) > 1:
            second_owner = other_users[1]
            original_role = second_owner.role
            
            # Временно меняем роль на admin для возможности создания ботов
            if second_owner.role not in ["owner", "admin"]:
                second_owner.role = "admin"
                db.flush()
            
            second_owner_bots = [
                {
                    "title": "Бот проекта Марии",
                    "username": f"project_bot_{second_owner.id}",
                    "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{second_owner.id}_1",
                    "is_active": True,
                },
                {
                    "title": "Второй бот проекта",
                    "username": f"project_bot2_{second_owner.id}",
                    "token": f"123456789:ABCdefGHIjklMNOpqrsTUVwxyz_{second_owner.id}_2",
                    "is_active": True,
                },
            ]
            
            for bot_data in second_owner_bots:
                existing = db.query(Bot).filter(Bot.token == bot_data["token"]).first()
                if existing:
                    print(f"⏭️  Бот '{bot_data['title']}' уже существует, пропускаем")
                    continue
                
                bot = Bot(
                    owner_id=second_owner.id,
                    title=bot_data["title"],
                    username=bot_data["username"],
                    token=bot_data["token"],
                    is_active=bot_data["is_active"],
                )
                db.add(bot)
                created_count += 1
                print(f"✅ Создан бот: {bot_data['title']} для пользователя {second_owner.email}")
            
            # Возвращаем оригинальную роль если меняли
            if second_owner.role != original_role:
                second_owner.role = original_role
                db.flush()
        
        # Если есть третий пользователь, добавляем его в команду второго владельца
        if len(other_users) > 2:
            third_user = other_users[2]
            second_owner = other_users[1]
            
            # Проверяем, есть ли третий пользователь в команде второго владельца
            team_entry = db.query(TeamMember).filter(
                TeamMember.owner_id == second_owner.id,
                TeamMember.user_id == third_user.id
            ).first()
            
            if not team_entry:
                team_entry = TeamMember(
                    owner_id=second_owner.id,
                    user_id=third_user.id,
                    role="developer"
                )
                db.add(team_entry)
                print(f"✅ Добавлен {third_user.email} в команду {second_owner.email}")
        
        db.commit()
        
        print(f"\n✅ Готово! Создано ботов: {created_count}")
        print(f"\n📊 Статистика:")
        
        # Подсчитываем ботов по владельцам
        all_bots = db.query(Bot).all()
        bots_by_owner = {}
        for bot in all_bots:
            owner_email = db.query(User).filter(User.id == bot.owner_id).first().email
            if owner_email not in bots_by_owner:
                bots_by_owner[owner_email] = 0
            bots_by_owner[owner_email] += 1
        
        for email, count in bots_by_owner.items():
            print(f"   {email}: {count} ботов")
        
        print(f"\n💡 Теперь вы можете:")
        print(f"   1. Войти как владелец ({owner.email}) - увидите свои боты + боты команды")
        print(f"   2. Войти как участник команды - увидите боты владельца + свои боты")
        print(f"   3. Проверить группировку по проектам в разделе 'Мои боты'")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 Создание тестовых ботов...\n")
    create_test_bots()

