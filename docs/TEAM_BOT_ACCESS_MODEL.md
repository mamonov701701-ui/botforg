# 🎯 Модель доступа команды к ботам (Стандартная SaaS модель)

## ✅ Ваше представление - это правильная модель!

Ваше описание полностью соответствует стандартной модели, используемой в популярных SaaS платформах:

### Примеры платформ с такой моделью:

1. **GitHub**
   - Владелец репозитория → набирает команду → участники получают доступ к репозиторию
   - Роли: Owner, Admin, Write, Read
   - При удалении из команды → теряется доступ

2. **GitLab**
   - Владелец проекта → приглашает участников → назначает роли
   - Роли: Owner, Maintainer, Developer, Reporter, Guest
   - Доступ к проекту в соответствии с ролью

3. **Notion**
   - Владелец workspace → приглашает участников → назначает роли
   - Роли: Owner, Admin, Member, Guest
   - Доступ к страницам в соответствии с ролью

4. **Figma**
   - Владелец файла → приглашает в команду → назначает роли
   - Роли: Owner, Admin, Editor, Viewer
   - Доступ к файлам в соответствии с ролью

5. **Discord Developer Portal**
   - Владелец приложения → создает команду → добавляет участников
   - Роли: Owner, Admin, Developer
   - Совместный доступ к ботам приложения

---

## 🎯 Модель для BotForg

### Как это должно работать:

```
1. Владелец платит за тариф
   └─ Получает доступ к платформе и возможность создавать ботов

2. Владелец создает ботов
   └─ Боты принадлежат владельцу (owner_id)

3. Владелец набирает команду
   └─ Приглашает участников через раздел "Команда"
   └─ Назначает роли: developer, templates_manager, support, viewer

4. Участники команды получают доступ к ботам владельца
   └─ Видят боты владельца в разделе "Боты"
   └─ Могут редактировать/разрабатывать боты (в соответствии с ролью)
   └─ Владелец может наблюдать или сам участвовать

5. Владелец управляет доступом
   └─ Может изменить роль участника
   └─ Может удалить участника → он теряет доступ к ботам
```

---

## 🔧 Техническая реализация

### Текущая модель (НЕ соответствует стандарту):

```python
# Текущая проверка доступа:
Bot.owner_id == current_user.id

# Результат:
# - Только владелец видит свои боты
# - Участники команды НЕ видят боты владельца
```

### Правильная модель (стандартная SaaS):

```python
# Проверка доступа должна быть:
def can_access_bot(bot_id: int, user_id: int, db: Session):
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        return False
    
    # 1. Владелец бота - всегда имеет доступ
    if bot.owner_id == user_id:
        return True
    
    # 2. Участник команды владельца - имеет доступ
    team_member = db.query(TeamMember).filter(
        TeamMember.owner_id == bot.owner_id,
        TeamMember.user_id == user_id
    ).first()
    
    return team_member is not None
```

### Изменения в API:

#### 1. Получение списка ботов:

```python
@router.get("/", response_model=BotListOut)
async def get_bots(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получение списка ботов: свои + боты команд, где пользователь участник"""
    
    # 1. Получаем ID владельцев команд, где пользователь участник
    team_owner_ids = db.query(TeamMember.owner_id).filter(
        TeamMember.user_id == current_user.id
    ).distinct().all()
    
    owner_ids = [to[0] for to in team_owner_ids]
    owner_ids.append(current_user.id)  # Добавляем свои боты
    
    # 2. Получаем все боты: свои + боты владельцев команд
    bots = db.query(Bot).filter(Bot.owner_id.in_(owner_ids)).all()
    
    return {"total": len(bots), "items": bots}
```

#### 2. Проверка доступа к конкретному боту:

```python
def check_bot_access(bot_id: int, user_id: int, db: Session) -> Bot:
    """Проверяет доступ пользователя к боту"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    # Владелец бота
    if bot.owner_id == user_id:
        return bot
    
    # Участник команды владельца
    team_member = db.query(TeamMember).filter(
        TeamMember.owner_id == bot.owner_id,
        TeamMember.user_id == user_id
    ).first()
    
    if not team_member:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You are not a member of bot owner's team"
        )
    
    return bot
```

#### 3. Использование в endpoints:

```python
@router.get("/{bot_id}", response_model=BotOut)
async def get_bot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Получение конкретного бота"""
    bot = check_bot_access(bot_id, current_user.id, db)
    return bot

@router.patch("/{bot_id}", response_model=BotOut)
async def update_bot(
    bot_id: int,
    bot_update: BotUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Обновление бота"""
    bot = check_bot_access(bot_id, current_user.id, db)
    
    # Проверка прав на редактирование (по роли в команде)
    if bot.owner_id != current_user.id:
        team_member = db.query(TeamMember).filter(
            TeamMember.owner_id == bot.owner_id,
            TeamMember.user_id == current_user.id
        ).first()
        
        # Только developer и выше могут редактировать
        if team_member.role not in ['developer', 'admin', 'owner']:
            raise HTTPException(
                status_code=403,
                detail="Access denied: Your role does not allow editing bots"
            )
    
    # Обновляем бота
    for key, value in bot_update.dict(exclude_unset=True).items():
        setattr(bot, key, value)
    
    db.commit()
    db.refresh(bot)
    return bot
```

---

## 📊 Права доступа по ролям команды

### Роли команды проекта и доступ к ботам:

| Роль | Видит боты | Редактирует | Удаляет | Запускает/Останавливает |
|------|:----------:|:-----------:|:-------:|:----------------------:|
| **owner** (владелец) | ✅ | ✅ | ✅ | ✅ |
| **admin** (в команде) | ✅ | ✅ | ✅* | ✅ |
| **developer** (в команде) | ✅ | ✅ | ❌ | ✅ |
| **templates_manager** | ✅ | ❌ | ❌ | ❌ |
| **support** | ✅ | ❌ | ❌ | ❌ |
| **viewer** | ✅ | ❌ | ❌ | ❌ |

*admin может удалять только если владелец разрешил

---

## 🎨 UI/UX изменения

### Раздел "Боты":

**Для владельца:**
```
Мои боты (5)
├─ Бот "Поддержка клиентов" [Владелец]
├─ Бот "Продажи" [Владелец]
└─ ...

Боты команд (2)
├─ Бот "Маркетинг" [Команда: Виктор]
└─ Бот "HR" [Команда: Мария]
```

**Для участника команды:**
```
Боты команд (3)
├─ Бот "Поддержка клиентов" [Команда: Виктор]
├─ Бот "Продажи" [Команда: Виктор]
└─ Бот "Маркетинг" [Команда: Мария]

Мои боты (1)
└─ Бот "Личный помощник" [Владелец]
```

### Индикация владельца:

- Бейдж "[Владелец]" для своих ботов
- Бейдж "[Команда: Имя владельца]" для ботов команды
- Разные цвета/иконки для визуального различия

---

## 🔐 Безопасность

### Важные моменты:

1. **Владелец всегда имеет полный доступ**
   - Может удалить участника → он теряет доступ
   - Может изменить роль → меняются права

2. **Участники не могут удалять боты**
   - Только владелец может удалить бот
   - Участники могут только редактировать

3. **При удалении из команды:**
   - Теряется доступ к ботам владельца
   - Базовая роль меняется на `user`
   - Созданные участником боты остаются у владельца

4. **Права на основе роли в команде:**
   - `developer` - может редактировать и запускать
   - `templates_manager` - только просмотр
   - `support` - только просмотр
   - `viewer` - только просмотр

---

## 💡 Преимущества этой модели

1. ✅ **Стандартная практика** - пользователи понимают как это работает
2. ✅ **Гибкость** - владелец контролирует доступ
3. ✅ **Безопасность** - четкое разделение прав
4. ✅ **Масштабируемость** - легко добавлять новых участников
5. ✅ **Монетизация** - владелец платит, команда работает

---

## 🚀 План реализации

### Этап 1: Бэкенд
1. ✅ Создать функцию `check_bot_access()`
2. ✅ Изменить `get_bots()` для включения ботов команд
3. ✅ Обновить все endpoints ботов для проверки доступа команды
4. ✅ Добавить проверку ролей для разных операций

### Этап 2: Фронтенд
1. ✅ Обновить список ботов с группировкой
2. ✅ Добавить индикацию владельца/команды
3. ✅ Обновить права доступа в UI (кнопки редактирования/удаления)

### Этап 3: Тестирование
1. ✅ Проверить доступ владельца
2. ✅ Проверить доступ участников команды
3. ✅ Проверить удаление из команды
4. ✅ Проверить изменение ролей

---

**Последнее обновление:** 2024

