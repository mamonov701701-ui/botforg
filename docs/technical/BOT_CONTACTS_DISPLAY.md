# Отображение данных пользователей ботов в личном кабинете

## Где отображаются данные

### 1. Страница списка ботов (`/dashboard/bots`)
**Файл:** `frontend/src/features/dashboard/pages/BotsPage.tsx`

**Отображаемые данные:**
- `bot.usersCount` - количество пользователей бота (кликабельно, ведет на страницу контактов)
- `bot.messagesCount` - количество сообщений
- `bot.status` - статус бота (active/paused/error)
- `bot.channel` - канал бота (telegram, whatsapp и т.д.)
- `bot.name` / `bot.title` - название бота

**API:** `GET /bots` (backend/routers/bot.py)
- Вычисляет `usersCount` из `BotUserState` через `BotInstance`
- Вычисляет `messagesCount` из таблицы `Message`

### 2. Страница пользователей бота (`/dashboard/bots/:botId/contacts`)
**Файл:** `frontend/src/features/dashboard/pages/BotContactsPage.tsx`

**Отображаемые данные для каждого контакта:**
- **Основная информация:**
  - `name` - имя пользователя (или telegram_user_id если имя не указано)
  - `email` - email контакта (если указан)
  - `phone` - телефон контакта (если указан)
  - `status` - статус (active, inactive, unsubscribed, banned)
  - `last_interaction_at` - время последнего взаимодействия

- **Теги:**
  - Список всех тегов, присвоенных контакту
  - Отображается с цветом тега (если указан)

- **UTM-метки:**
  - `entry_point` - точка входа
  - `utm_source` - источник трафика
  - `utm_campaign` - кампания

**API:** `GET /bots/{bot_id}/contacts` (backend/routers/bot_contacts.py)
- Поддерживает фильтрацию по статусу (`status_filter`)
- Поддерживает поиск по имени, email, телефону (`search`)
- Поддерживает фильтрацию по тегу (`tag_id`)
- Пагинация (`page`, `page_size`)

## Структура данных

### BotUserState (backend/models/bot_user_state.py)
```python
- id: int
- public_id: BigInteger (12-значный публичный ID)
- telegram_user_id: str
- bot_id: int (FK на bot_instances.id)
- channel: str (telegram, vk, whatsapp, webchat)
- status: str (active, unsubscribed, banned, inactive)
- name: str | None (CRM-поле)
- email: str | None (CRM-поле, индексировано)
- phone: str | None (CRM-поле, индексировано)
- entry_point: str | None (UTM)
- utm_source: str | None (UTM)
- utm_campaign: str | None (UTM)
- last_interaction_at: datetime | None (индексировано)
- tags: relationship (many-to-many с BotTag)
```

### BotTag (backend/models/bot_tag.py)
```python
- id: int
- bot_id: int (FK на bot_instances.id)
- name: str
- description: str | None
- color: str | None (hex цвет)
- contacts: relationship (many-to-many с BotUserState)
```

## API Endpoints

### GET /bots
Возвращает список ботов с подсчитанными `usersCount` и `messagesCount`.

### GET /bots/{bot_id}/contacts
Возвращает список контактов бота с полной информацией:
- Все CRM-поля (name, email, phone)
- Все UTM-метки (entry_point, utm_source, utm_campaign)
- Статус и время последнего взаимодействия
- Список тегов

**Параметры запроса:**
- `status_filter` - фильтр по статусу
- `search` - поиск по имени, email, телефону
- `tag_id` - фильтр по тегу
- `page` - номер страницы
- `page_size` - размер страницы

### GET /bots/{bot_id}/contacts/{contact_id}
Возвращает детальную информацию о конкретном контакте.

## Связь Bot и BotInstance

Важно понимать, что:
- `Bot` (таблица `bots`) - основная информация о боте
- `BotInstance` (таблица `bot_instances`) - экземпляр бота, связанный с шаблоном
- `BotUserState.bot_id` ссылается на `BotInstance.id`, а не на `Bot.id`

Поэтому при получении контактов нужно:
1. Получить `Bot` по `bot_id`
2. Найти соответствующий `BotInstance` по `token` или `username`
3. Использовать `BotInstance.id` для запросов к `BotUserState`

## Проверка работоспособности

Все данные отображаются согласно реальным данным из БД:
- ✅ CRM-поля (name, email, phone) отображаются если заполнены
- ✅ UTM-метки отображаются если указаны
- ✅ Теги отображаются с цветами
- ✅ Статусы отображаются с соответствующими цветами
- ✅ Время последнего взаимодействия форматируется корректно
- ✅ Подсчет количества пользователей работает корректно

