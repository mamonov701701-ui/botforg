# Структура базы данных пользователей BotForg

**Версия:** 1.0  
**Дата:** 14.01.2025  
**Проект:** BotForg

---

## Обзор

В BotForg реализована двухуровневая система пользователей:

1. **Пользователи платформы** (`users`) - зарегистрированные пользователи платформы BotForg
2. **Пользователи ботов** (`bot_user_states`) - пользователи Telegram, которые взаимодействуют с ботами

Эти две системы **полностью разделены** и не связаны между собой напрямую.

---

## 1. Пользователи платформы (Platform Users)

### 1.1 Модель User

**Таблица:** `users`  
**Модель:** `backend/models/user.py`

```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)                    # Внутренний ID
    public_id = Column(BigInteger, unique=True)                # 8-значный публичный ID
    email = Column(String, unique=True, nullable=False)        # Email (уникальный)
    name = Column(String, nullable=True)                       # Имя пользователя
    avatar = Column(String, nullable=True)                     # URL аватара
    created_at = Column(DateTime)                             # Дата регистрации
    hashed_password = Column(String, nullable=True)            # Хеш пароля (NULL для OAuth)
    password_hash = Column(String, nullable=True)              # Alias для совместимости
    role = Column(String, default="viewer")                    # Роль на платформе
    email_verified_at = Column(DateTime, nullable=True)        # Дата верификации email
```

### 1.2 Роли платформы

**Доступные роли:** `owner`, `admin`, `developer`, `templates_manager`, `support`, `viewer`, `user`

**Роль по умолчанию:** `viewer`

**Маппинг ролей для блоков редактора:**
```python
role_mapping = {
    "owner": "owner",
    "admin": "admin",
    "developer": "developer",
    "templates_manager": "manager_template",
    "support": "support",
    "viewer": "viewer",
    "user": "viewer",  # Обычные пользователи имеют права viewer
}
```

### 1.3 Тарифные планы

**Текущая реализация:**
- Тарифные планы **не хранятся** в модели `User`
- По умолчанию используется план `"free"`
- Планы используются для фильтрации блоков в редакторе: `free`, `pro`, `enterprise`
- Логика определения плана находится в `backend/routers/blocks.py`:
  ```python
  user_plan = plan or "free"  # По умолчанию "free"
  ```

**Планы для блоков:**
- `free` - базовые блоки (8 блоков)
- `pro` - расширенные блоки (21 блок)
- `enterprise` - все блоки (24 блока)

### 1.4 Связи пользователя платформы

```python
# Связи User модели:
- templates          # Шаблоны пользователя
- ratings            # Оценки шаблонов
- comments           # Комментарии
- purchases          # Покупки
- payments           # Платежи
- owned_teams        # Команды, где пользователь владелец
- member_in_teams    # Команды, где пользователь участник
- bots               # Боты пользователя (Bot)
- bot_instances      # Экземпляры ботов (BotInstance)
- user_templates     # Пользовательские шаблоны
- accounts           # OAuth аккаунты (Google, GitHub и т.д.)
```

### 1.5 Дополнительные роли платформы (BF-роли)

**Модель:** `backend/models/platform_role.py`  
**Таблица:** `platform_roles`

```python
class PlatformRole(Base):
    __tablename__ = "platform_roles"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))         # Пользователь
    role_name = Column(String)                                # BF Администратор, BF Разработчик и т.д.
    granted_by = Column(Integer, ForeignKey("users.id"))     # Кто выдал роль
    granted_at = Column(DateTime)                             # Когда выдана
    expires_at = Column(DateTime, nullable=True)              # Срок действия (NULL = бессрочно)
    is_active = Column(Boolean, default=True)                 # Активна ли роль
    notes = Column(String, nullable=True)                      # Заметки
```

**BF-роли:**
- `BF Администратор`
- `BF Разработчик`
- `BF Менеджер шаблонов`
- `BF Поддержка`
- `BF Аналитик`
- `BF Модератор`

### 1.6 Команды ботов (Team Members)

**Модель:** `backend/models/team.py`  
**Таблица:** `team_members`

```python
class TeamMember(Base):
    __tablename__ = "team_members"
    
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))        # Владелец команды
    user_id = Column(Integer, ForeignKey("users.id"))         # Участник команды
    role = Column(String, default="observer")                 # Роль в команде
    created_at = Column(DateTime)                              # Дата добавления
```

**Роли в команде:**
- `owner` - владелец (полный доступ)
- `admin` - администратор
- `developer` - разработчик
- `observer` - наблюдатель (только просмотр)

---

## 2. Пользователи ботов (Bot Users)

### 2.1 Модель BotUserState

**Таблица:** `bot_user_states`  
**Модель:** `backend/models/bot_user_state.py`

```python
class BotUserState(Base):
    __tablename__ = "bot_user_states"
    
    id = Column(Integer, primary_key=True)
    telegram_user_id = Column(String, index=True)              # ID пользователя Telegram (chat_id)
    bot_id = Column(Integer, ForeignKey("bot_instances.id"))   # ID бота
    
    # Текущее состояние в сценарии
    current_scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    current_node_id = Column(String, nullable=True)           # ID текущего узла
    
    # Контекст выполнения
    context = Column(JSON, nullable=True)                      # Переменные, данные и т.д.
    history = Column(JSON, nullable=True)                      # История посещённых узлов
    
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
```

### 2.2 Идентификация пользователей ботов

**Ключевые особенности:**
- Пользователи ботов **НЕ** связаны с пользователями платформы
- Идентификация происходит по `telegram_user_id` (chat_id из Telegram)
- Один пользователь Telegram может взаимодействовать с разными ботами
- Для каждого бота создаётся отдельная запись `BotUserState`

**Пример:**
```
Пользователь Telegram (chat_id: 123456789):
  - BotUserState #1: bot_id=1, telegram_user_id="123456789"
  - BotUserState #2: bot_id=2, telegram_user_id="123456789"
  - BotUserState #3: bot_id=3, telegram_user_id="123456789"
```

### 2.3 Контекст выполнения сценария

**Структура `context` (JSON):**
```json
{
  "user_id": 123456789,              // Telegram user ID
  "bot_id": 1,                       // Bot ID
  "scenario_id": 5,                  // Текущий сценарий
  "variables": {                     // Переменные сценария
    "name": "Иван",
    "age": 25,
    "order_id": "ORD-123"
  },
  "previous_scenario_id": 4,         // Предыдущий сценарий
  "previous_node_id": "node_123",    // Предыдущий узел
  "nodes_visited": ["node_1", "node_2"],  // История узлов
  "current_node_id": "node_3"        // Текущий узел
}
```

### 2.4 Обработка сообщений от пользователей ботов

**Эндпоинт:** `POST /webhook/{bot_id}`  
**Файл:** `backend/routers/webhook.py`

**Процесс:**
1. Получение обновления от Telegram
2. Извлечение `chat_id` (telegram_user_id)
3. Поиск или создание `BotUserState` для пары `(telegram_user_id, bot_id)`
4. Загрузка текущего состояния из `context`
5. Выполнение сценария через `ScenarioRuntime`
6. Обновление `BotUserState` с новым состоянием

---

## 3. Разделение пользователей платформы и ботов

### 3.1 Ключевые различия

| Аспект | Пользователи платформы | Пользователи ботов |
|--------|------------------------|-------------------|
| **Таблица** | `users` | `bot_user_states` |
| **Идентификация** | `email` (уникальный) | `telegram_user_id` + `bot_id` |
| **Авторизация** | JWT токен | Нет (через Telegram) |
| **Связь** | С ботами через `owner_id` | С ботами через `bot_id` |
| **Роли** | Роли платформы (`owner`, `admin`, и т.д.) | Нет ролей |
| **Тарифы** | Планы доступа (`free`, `pro`, `enterprise`) | Нет тарифов |
| **Назначение** | Создание и управление ботами | Взаимодействие с ботами |

### 3.2 Связь между системами

**Пользователь платформы → Бот:**
```
User (id=1) 
  → Bot (owner_id=1, id=10)
    → BotInstance (user_id=1, id=20)
      → BotUserState (bot_id=20, telegram_user_id="123456789")
```

**Важно:**
- Пользователь платформы **создаёт** и **управляет** ботами
- Пользователи ботов **взаимодействуют** с ботами через Telegram
- Пользователи ботов **НЕ** имеют доступа к платформе
- Пользователи платформы **НЕ** видят личные данные пользователей ботов (только аналитику)

---

## 4. Модели ботов

### 4.1 Bot (Основной бот)

**Таблица:** `bots`  
**Модель:** `backend/models/bot.py`

```python
class Bot(Base):
    __tablename__ = "bots"
    
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))         # Владелец (пользователь платформы)
    title = Column(String)                                     # Название бота
    username = Column(String)                                  # Username бота
    token = Column(String)                                     # Telegram Bot Token
    webhook_url = Column(String, nullable=True)                # Webhook URL
    is_active = Column(Boolean, default=True)                 # Активен ли бот
    content = Column(JSON, nullable=True)                      # Граф бота (legacy)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
```

### 4.2 BotInstance (Экземпляр бота)

**Таблица:** `bot_instances`  
**Модель:** `backend/models/bot.py`

```python
class BotInstance(Base):
    __tablename__ = "bot_instances"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))          # Владелец (пользователь платформы)
    token = Column(String)                                    # Telegram Bot Token
    username = Column(String, nullable=True)                  # Username бота
    template_id = Column(Integer, ForeignKey("templates.id")) # Шаблон бота
    is_active = Column(Boolean, default=True)                # Активен ли бот
    webhook_url = Column(String, nullable=True)               # Webhook URL
    created_at = Column(DateTime)
```

**Связь:**
- `BotInstance` связан с `Template` (шаблоном бота)
- `BotUserState` связан с `BotInstance` (экземпляром бота)

---

## 5. Сообщения (Messages)

**Таблица:** `messages`  
**Модель:** `backend/models/message.py`

```python
class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))           # Бот
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Пользователь платформы (nullable!)
    direction = Column(String(10))                             # 'incoming' / 'outgoing'
    content = Column(Text)                                     # Текст сообщения
    status = Column(String(20), default="sent")               # 'sent', 'received', 'error'
    error = Column(Text, nullable=True)                        # Ошибка (если есть)
    language = Column(String(10), nullable=True)               # 'ru', 'en', etc.
    is_paid = Column(Boolean, default=False)                 # Платное ли сообщение
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
```

**Важно:**
- `user_id` в `Message` - это **пользователь платформы** (владелец бота), а НЕ пользователь бота
- Пользователи ботов идентифицируются через `telegram_user_id` в `BotUserState`
- Сообщения от пользователей ботов не сохраняются в `Message` (только аналитика в `Event`)

---

## 6. События и аналитика (Events)

**Таблица:** `events`  
**Модель:** `backend/models/event.py`

```python
class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True)
    event_type = Column(String(50))                           # "bot_message", "scenario_run", etc.
    event_name = Column(String(100))                          # Конкретное событие
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Пользователь платформы
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True)    # Бот
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    payload = Column(JSON, default={})                         # Дополнительные данные
    session_id = Column(String(100), nullable=True)            # Сессия пользователя бота
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime)
```

**Примечание:**
- `user_id` в `Event` может быть как пользователем платформы, так и ссылаться на пользователя бота через `payload`
- `session_id` используется для идентификации сессии пользователя бота

---

## 7. Квоты и биллинг

### 7.1 UserQuota

**Таблица:** `user_quotas`  
**Модель:** `backend/models/billing.py`

```python
class UserQuota(Base):
    __tablename__ = "user_quotas"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)  # Пользователь платформы
    monthly_limit = Column(Integer, default=1000)                 # Лимит сообщений в месяц
    used_messages = Column(Integer, default=0)                     # Использовано сообщений
    updated_at = Column(DateTime)
```

### 7.2 BillingRecord

**Таблица:** `billing_records`  
**Модель:** `backend/models/billing.py`

```python
class BillingRecord(Base):
    __tablename__ = "billing_records"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))          # Пользователь платформы
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    action = Column(String(50))                                 # "message", "purchase", "subscription"
    direction = Column(String(10))                             # "incoming" / "outgoing"
    is_paid = Column(Boolean, default=False)
    price = Column(Numeric(10, 2), default=Decimal("0.00"))
    created_at = Column(DateTime)
```

---

## 8. Схема базы данных (ER-диаграмма)

```
┌─────────────────┐
│   users         │  (Пользователи платформы)
│  - id           │
│  - email        │
│  - role         │
│  - public_id    │
└────────┬────────┘
         │
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│   bots          │                  │ team_members    │
│  - owner_id ────┼──────────────────┤ - owner_id      │
│  - title        │                  │ - user_id       │
│  - token        │                  │ - role          │
└────────┬────────┘                  └─────────────────┘
         │
         ▼
┌─────────────────┐
│ bot_instances   │
│  - user_id      │
│  - template_id  │
│  - token        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ bot_user_states │  (Пользователи ботов)
│  - bot_id       │
│  - telegram_user_id │
│  - context      │
│  - current_node_id │
└─────────────────┘

┌─────────────────┐
│   messages      │
│  - bot_id       │
│  - user_id      │  (Пользователь платформы, не бота!)
└─────────────────┘

┌─────────────────┐
│   events        │
│  - user_id      │  (Пользователь платформы)
│  - bot_id       │
│  - session_id  │  (Идентификатор пользователя бота)
└─────────────────┘
```

---

## 9. API эндпоинты

### 9.1 Пользователи платформы

- `POST /auth/register` - Регистрация
- `POST /auth/login` - Вход
- `GET /auth/me` - Получить текущего пользователя
- `GET /users/{id}` - Получить пользователя по ID

### 9.2 Пользователи ботов

- `POST /webhook/{bot_id}` - Webhook от Telegram (обработка сообщений пользователей ботов)
- Состояние пользователей ботов управляется автоматически через `BotUserState`

---

## 10. Безопасность и доступ

### 10.1 Пользователи платформы

- **Авторизация:** JWT токен
- **Проверка доступа:** `get_current_user` dependency
- **Роли:** Проверка через `role` в модели `User`
- **Тарифы:** Определяются логикой (по умолчанию `"free"`)

### 10.2 Пользователи ботов

- **Авторизация:** Нет (через Telegram)
- **Идентификация:** `telegram_user_id` из Telegram
- **Изоляция:** Каждый бот имеет отдельное состояние для каждого пользователя

---

## 11. Резюме

### Пользователи платформы:
- ✅ Хранятся в таблице `users`
- ✅ Имеют email, пароль, роли
- ✅ Создают и управляют ботами
- ✅ Имеют доступ к редактору и API
- ✅ Имеют тарифные планы (логика, не в БД)

### Пользователи ботов:
- ✅ Хранятся в таблице `bot_user_states`
- ✅ Идентифицируются по `telegram_user_id`
- ✅ Взаимодействуют с ботами через Telegram
- ✅ НЕ имеют доступа к платформе
- ✅ НЕ связаны с пользователями платформы

### Разделение:
- ✅ Полное разделение систем
- ✅ Разные таблицы и модели
- ✅ Разные способы идентификации
- ✅ Разные уровни доступа

---

**Последнее обновление:** 14.01.2025

