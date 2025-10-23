# Editor Blocks Catalog

## Концепция

Система блоков редактора построена на принципе разделения визуального представления и пользовательских данных.

### Ключевой принцип: node.data.settings

**Узел на холсте = иконка + название + служебные метки**

Все пользовательские данные и конфигурация блока хранятся **исключительно** в `node.data.settings`.

```json
{
  "id": "node_123",
  "type": "default",
  "position": { "x": 100, "y": 200 },
  "data": {
    "label": "Сообщение", // визуальное название
    "subtitle": "Отправка текста", // подзаголовок
    "type": "message", // тип блока из каталога
    "icon": "MessageSquare", // иконка
    "color": "#2196F3", // цвет
    "settings": {
      // ВСЕ пользовательские данные
      "text": "Привет, пользователь!",
      "parseMode": "Markdown",
      "disablePreview": false
    }
  }
}
```

### Никаких других полей для пользовательских данных

❌ **Неправильно:**

```json
{
  "data": {
    "label": "Сообщение",
    "messageText": "Привет!", // пользовательские данные вне settings
    "parseMode": "Markdown", // пользовательские данные вне settings
    "settings": {}
  }
}
```

✅ **Правильно:**

```json
{
  "data": {
    "label": "Сообщение",
    "type": "message",
    "settings": {
      // все пользовательские данные здесь
      "text": "Привет!",
      "parseMode": "Markdown"
    }
  }
}
```

## Структура каталога блоков

Каталог блоков хранится в `backend/data/editor_blocks.json` и содержит определения всех доступных типов блоков.

### Структура элемента каталога

```typescript
{
  id: string;              // уникальный идентификатор блока
  title: string;           // отображаемое название
  category: string;        // категория (basic, business, service, system, ai, custom)
  description: string;     // описание функционала
  icon: string;            // название иконки (Lucide React)
  color: string;           // цвет блока (hex)
  planAccess: string[];    // доступ по тарифам ["free", "pro", "enterprise"]
  permissions: string[];   // доступ по ролям ["owner", "admin", "manager_template", "developer", "support", "viewer"]
  configSchema: ConfigField[];  // схема настроек
}
```

### Схема конфигурации (configSchema)

Определяет, какие настройки доступны для блока. Каждое поле:

```typescript
{
  name: string;            // имя поля в settings
  type: string;            // тип поля (см. ниже)
  label: string;           // отображаемое название
  required: boolean;       // обязательное ли поле
  default?: any;           // значение по умолчанию
  options?: string[];      // варианты для select/multiselect
}
```

### Поддерживаемые типы полей

- `string` — однострочный текст
- `text` — многострочный текст
- `number` — числовое значение
- `boolean` — переключатель (true/false)
- `select` — выбор из списка (одно значение)
- `multiselect` — выбор из списка (несколько значений)
- `json` — объект JSON
- `image` — загрузка изображения
- `file` — загрузка файла
- `datetime` — дата и время
- `duration` — длительность (секунды, минуты, часы)

## Категории блоков

### basic

Базовые блоки, доступные на всех тарифах:

- Начало (start)
- Сообщение (message)
- Ожидание (wait)
- Условие (condition)

### business

Бизнес-логика (доступны на pro/enterprise):

- Оплата (payment)
- Подписка (subscription)
- Счет на оплату (invoice)
- Скидка (discount)

### service

Интеграции с внешними сервисами (pro/enterprise):

- API запрос (api_call)
- Webhook (webhook)
- Email (email)
- SMS (sms)

### system

Системные блоки для управления сценарием:

- Переменная (variable)
- Лог (log)
- Обработчик ошибок (error_handler)
- Роутер (router)

### ai

Блоки с искусственным интеллектом (pro/enterprise):

- AI Чат (ai_chat)
- AI Генерация изображений (ai_image)
- AI Анализ текста (ai_text_analysis)
- AI Синтез речи (ai_voice)

### custom

Пользовательские расширения (преимущественно enterprise):

- Пользовательский код (custom_code)
- Плагин (custom_plugin)
- Пользовательский шаблон (custom_template)
- Интеграция (custom_integration)

## Система доступа

### По тарифам (planAccess)

- `free` — бесплатный тариф (базовые блоки)
- `pro` — профессиональный тариф
- `enterprise` — корпоративный тариф

### По ролям (permissions)

Роли упорядочены по уровню доступа:

1. `owner` — владелец (полный доступ)
2. `admin` — администратор
3. `manager_template` — менеджер шаблонов
4. `developer` — разработчик
5. `support` — поддержка
6. `viewer` — наблюдатель (только просмотр)

## REST API

### GET /blocks

Получение каталога блоков с фильтрацией.

**Query параметры:**

- `plan` — фильтр по тарифу (free, pro, enterprise)
- `role` — фильтр по роли (owner, admin, manager_template, developer, support, viewer)

**Примеры:**

```bash
# Все блоки
GET /blocks

# Блоки для бесплатного тарифа
GET /blocks?plan=free

# Блоки для роли viewer
GET /blocks?role=viewer

# Блоки для free тарифа и роли viewer
GET /blocks?plan=free&role=viewer
```

**Фильтрация:**

- Если указан `plan`, возвращаются только блоки, у которых указанный план есть в `planAccess`
- Если указан `role`, возвращаются только блоки, у которых указанная роль есть в `permissions`
- Фильтры применяются одновременно (AND логика)

## Использование блоков в редакторе

### 1. Получение каталога

```typescript
const response = await fetch('/blocks?plan=pro&role=developer');
const blocks = await response.json();
```

### 2. Создание узла из блока

```typescript
const block = blocks.find(b => b.id === 'message');

const node = {
  id: `node_${Date.now()}`,
  type: 'default',
  position: { x: 100, y: 100 },
  data: {
    label: block.title,
    subtitle: block.description,
    type: block.id,
    icon: block.icon,
    color: block.color,
    settings: {}, // заполняется пользователем через форму
  },
};
```

### 3. Настройка блока

Используйте `configSchema` для генерации формы настроек:

```typescript
const renderConfigForm = (block, currentSettings) => {
  return block.configSchema.map(field => {
    switch (field.type) {
      case 'string':
        return <Input name={field.name} label={field.label} />;
      case 'select':
        return <Select name={field.name} options={field.options} />;
      // ... другие типы
    }
  });
};
```

### 4. Сохранение настроек

Все введенные пользователем данные сохраняются в `node.data.settings`:

```typescript
const updateNodeSettings = (nodeId, newSettings) => {
  updateNode(nodeId, {
    data: {
      ...node.data,
      settings: {
        ...node.data.settings,
        ...newSettings,
      },
    },
  });
};
```

## Валидация

При сохранении сценария необходимо проверять:

1. Все обязательные поля (`required: true`) заполнены
2. Типы данных соответствуют `configSchema`
3. Значения `select` входят в список `options`
4. Все данные находятся в `node.data.settings`, а не в других полях

## Расширение каталога

Для добавления нового блока:

1. Добавьте определение в `backend/data/editor_blocks.json`
2. Укажите корректные `planAccess` и `permissions`
3. Определите `configSchema` с полным набором настроек
4. Реализуйте обработчик блока в backend (при необходимости)

**Важно:** Не добавляйте пользовательские поля в `node.data` напрямую. Используйте только `node.data.settings`.
