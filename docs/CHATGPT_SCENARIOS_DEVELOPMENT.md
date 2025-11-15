# 🤖 Инструкции для ChatGPT по разработке сценариев для BotForg

> **Цель:** Этот документ содержит всю необходимую информацию для ChatGPT, чтобы разработать готовые сценарии для ботов на платформе BotForg.

---

## 📋 Оглавление

1. [Обзор платформы BotForg](#обзор-платформы-botforg)
2. [Структура сценария](#структура-сценария)
3. [Типы блоков и их использование](#типы-блоков-и-их-использование)
4. [Формат данных сценария](#формат-данных-сценария)
5. [Примеры готовых сценариев](#примеры-готовых-сценариев)
6. [Рекомендации по разработке](#рекомендации-по-разработке)

---

## 🎯 Обзор платформы BotForg

### Что такое BotForg?

BotForg — это платформа для создания чат-ботов без программирования через визуальный редактор блоков. Пользователи создают ботов, добавляя блоки и связывая их между собой.

### Основные концепции:

1. **Бот (Bot)** — основной объект, который пользователь создает
   - Имеет `id`, `title`, `username`, `token` (Telegram Bot Token)
   - Принадлежит владельцу (`owner_id`)
   - Может иметь несколько сценариев

2. **Сценарий (Scenario)** — отдельная часть бота для конкретной задачи
   - Может быть частью бота (`bot_id`) или в библиотеке (`is_library=True`)
   - Содержит граф блоков в поле `content` (nodes и edges)
   - Имеет название, описание, категорию, иконку

3. **Блок (Block)** — элемент логики бота
   - Визуально представлен как узел на графе
   - Имеет тип (message, condition, payment и т.д.)
   - Все пользовательские данные хранятся в `node.data.settings`

---

## 📐 Структура сценария

### Модель данных Scenario:

```python
class Scenario:
    id: int                          # Уникальный ID
    user_id: int                     # Владелец сценария
    bot_id: Optional[int]            # ID бота (None если в библиотеке)
    name: str                        # Название сценария
    description: Optional[str]       # Описание
    icon: Optional[str]              # Название иконки (Lucide React)
    category: Optional[str]           # Категория (payment, support, catalog, faq, etc.)
    is_main: bool                    # Главный сценарий бота
    is_library: bool                 # В библиотеке для переиспользования
    is_standard: bool                # Стандартный шаблон от платформы
    is_public: bool                  # Для маркетплейса (будущее)
    content: Optional[dict]          # Данные сценария (nodes и edges в JSON)
    order: int                       # Порядок в списке
    created_at: datetime
    updated_at: datetime
```

### Структура content (граф блоков):

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "default",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Начало",
        "subtitle": "Старт сценария",
        "type": "start",
        "icon": "Play",
        "color": "#4CAF50",
        "settings": {}
      }
    },
    {
      "id": "node_2",
      "type": "default",
      "position": { "x": 300, "y": 200 },
      "data": {
        "label": "Сообщение",
        "subtitle": "Отправка текста",
        "type": "message",
        "icon": "MessageSquare",
        "color": "#2196F3",
        "settings": {
          "text": "Привет! Я ваш помощник.",
          "parseMode": "Markdown",
          "disablePreview": false
        }
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "type": "default"
    }
  ]
}
```

### ⚠️ КРИТИЧЕСКИ ВАЖНО:

**Все пользовательские данные должны храниться ТОЛЬКО в `node.data.settings`!**

✅ **Правильно:**
```json
{
  "data": {
    "label": "Сообщение",
    "type": "message",
    "settings": {
      "text": "Привет!",
      "parseMode": "Markdown"
    }
  }
}
```

❌ **Неправильно:**
```json
{
  "data": {
    "label": "Сообщение",
    "messageText": "Привет!",  // ❌ НЕ ДОПУСТИМО!
    "settings": {}
  }
}
```

---

## 🧩 Типы блоков и их использование

### Категории блоков:

1. **basic** — базовые блоки (доступны на всех тарифах)
2. **business** — бизнес-логика (pro/enterprise)
3. **service** — интеграции с внешними сервисами (pro/enterprise)
4. **system** — системные блоки для управления сценарием
5. **ai** — блоки с искусственным интеллектом (pro/enterprise)
6. **custom** — пользовательские расширения (enterprise)

### Основные блоки (basic):

#### 1. **start** — Начало сценария
```json
{
  "id": "node_start",
  "type": "default",
  "position": { "x": 100, "y": 100 },
  "data": {
    "label": "Начало",
    "subtitle": "Старт сценария",
    "type": "start",
    "icon": "Play",
    "color": "#4CAF50",
    "settings": {}
  }
}
```
- **Назначение:** Точка входа в сценарий
- **Особенности:** Должен быть один на сценарий, обычно в начале

#### 2. **message** — Отправка сообщения
```json
{
  "data": {
    "label": "Сообщение",
    "type": "message",
    "icon": "MessageSquare",
    "color": "#2196F3",
    "settings": {
      "text": "Текст сообщения пользователю",
      "parseMode": "Markdown",  // Markdown, HTML, или Plain
      "disablePreview": false    // Отключить превью ссылок
    }
  }
}
```
- **Назначение:** Отправка текстового сообщения пользователю
- **Поля:**
  - `text` (string, required) — текст сообщения
  - `parseMode` (select: Markdown/HTML/Plain) — форматирование
  - `disablePreview` (boolean) — отключить превью ссылок

#### 3. **buttons** — Кнопки выбора
```json
{
  "data": {
    "label": "Кнопки",
    "type": "buttons",
    "icon": "Grid3x3",
    "color": "#FF9800",
    "settings": {
      "text": "Выберите действие:",
      "buttons": [
        { "text": "Вариант 1", "value": "option1" },
        { "text": "Вариант 2", "value": "option2" },
        { "text": "Вариант 3", "value": "option3" }
      ],
      "inline": false  // true для inline-кнопок
    }
  }
}
```
- **Назначение:** Предоставить пользователю выбор из нескольких вариантов
- **Поля:**
  - `text` (string, required) — текст перед кнопками
  - `buttons` (array, required) — массив объектов `{text, value}`
  - `inline` (boolean) — inline-кнопки (в одну строку) или обычные

#### 4. **condition** — Условие
```json
{
  "data": {
    "label": "Условие",
    "type": "condition",
    "icon": "GitBranch",
    "color": "#9C27B0",
    "settings": {
      "variable": "user_choice",
      "operator": "equals",  // equals, not_equals, contains, greater, less
      "value": "option1",
      "trueLabel": "Да",
      "falseLabel": "Нет"
    }
  }
}
```
- **Назначение:** Ветвление логики по условию
- **Поля:**
  - `variable` (string, required) — имя переменной для проверки
  - `operator` (select) — оператор сравнения
  - `value` (string, required) — значение для сравнения
  - `trueLabel` (string) — метка для ветки "истина"
  - `falseLabel` (string) — метка для ветки "ложь"
- **Особенности:** Должен иметь два исходящих edge (true и false)

#### 5. **wait** — Ожидание ввода
```json
{
  "data": {
    "label": "Ожидание",
    "type": "wait",
    "icon": "Clock",
    "color": "#607D8B",
    "settings": {
      "variable": "user_input",
      "timeout": 60,  // секунды
      "timeoutMessage": "Время истекло"
    }
  }
}
```
- **Назначение:** Ожидание ответа от пользователя
- **Поля:**
  - `variable` (string, required) — имя переменной для сохранения ввода
  - `timeout` (number) — таймаут в секундах
  - `timeoutMessage` (string) — сообщение при таймауте

### Бизнес-блоки (business):

#### 6. **payment** — Оплата
```json
{
  "data": {
    "label": "Оплата",
    "type": "payment",
    "icon": "CreditCard",
    "color": "#4CAF50",
    "settings": {
      "amount": 1000,
      "currency": "RUB",
      "description": "Оплата заказа",
      "provider": "yookassa"  // yookassa, stripe, paypal
    }
  }
}
```

#### 7. **form** — Форма сбора данных
```json
{
  "data": {
    "label": "Форма",
    "type": "form",
    "icon": "FileText",
    "color": "#FF5722",
    "settings": {
      "fields": [
        { "name": "name", "label": "Имя", "type": "text", "required": true },
        { "name": "email", "label": "Email", "type": "email", "required": true },
        { "name": "phone", "label": "Телефон", "type": "phone", "required": false }
      ],
      "submitText": "Отправить"
    }
  }
}
```

### Системные блоки (system):

#### 8. **variable** — Установка переменной
```json
{
  "data": {
    "label": "Переменная",
    "type": "variable",
    "icon": "Variable",
    "color": "#795548",
    "settings": {
      "name": "user_name",
      "value": "Иван",
      "operation": "set"  // set, add, subtract, multiply, divide
    }
  }
}
```

#### 9. **scenario_switch** — Переход к сценарию
```json
{
  "data": {
    "label": "Переход к сценарию",
    "type": "scenario_switch",
    "icon": "ArrowRight",
    "color": "#00BCD4",
    "settings": {
      "scenarioId": 123,  // ID целевого сценария
      "returnTo": true     // Вернуться обратно после завершения
    }
  }
}
```
- **Назначение:** Переход из текущего сценария в другой
- **Особенности:** Используется для связывания сценариев

#### 10. **api_call** — API запрос
```json
{
  "data": {
    "label": "API запрос",
    "type": "api_call",
    "icon": "Globe",
    "color": "#3F51B5",
    "settings": {
      "url": "https://api.example.com/data",
      "method": "GET",  // GET, POST, PUT, DELETE
      "headers": {},
      "body": {},
      "responseVariable": "api_response"
    }
  }
}
```

---

## 📝 Формат данных сценария

### Полный пример сценария "Приветствие":

```json
{
  "name": "Приветствие",
  "description": "Главное меню бота с приветствием и выбором действия",
  "icon": "Home",
  "category": "main",
  "is_main": true,
  "is_library": false,
  "content": {
    "nodes": [
      {
        "id": "node_start",
        "type": "default",
        "position": { "x": 250, "y": 50 },
        "data": {
          "label": "Начало",
          "subtitle": "Старт сценария",
          "type": "start",
          "icon": "Play",
          "color": "#4CAF50",
          "settings": {}
        }
      },
      {
        "id": "node_message",
        "type": "default",
        "position": { "x": 250, "y": 200 },
        "data": {
          "label": "Приветствие",
          "subtitle": "Отправка текста",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Привет! 👋\n\nЯ бот-помощник. Чем могу помочь?",
            "parseMode": "Markdown",
            "disablePreview": false
          }
        }
      },
      {
        "id": "node_buttons",
        "type": "default",
        "position": { "x": 250, "y": 350 },
        "data": {
          "label": "Выбор действия",
          "subtitle": "Кнопки выбора",
          "type": "buttons",
          "icon": "Grid3x3",
          "color": "#FF9800",
          "settings": {
            "text": "Выберите действие:",
            "buttons": [
              { "text": "📦 Каталог", "value": "catalog" },
              { "text": "🛒 Корзина", "value": "cart" },
              { "text": "❓ Помощь", "value": "help" }
            ],
            "inline": false
          }
        }
      },
      {
        "id": "node_condition",
        "type": "default",
        "position": { "x": 250, "y": 500 },
        "data": {
          "label": "Проверка выбора",
          "subtitle": "Условие",
          "type": "condition",
          "icon": "GitBranch",
          "color": "#9C27B0",
          "settings": {
            "variable": "user_choice",
            "operator": "equals",
            "value": "catalog",
            "trueLabel": "Каталог",
            "falseLabel": "Другое"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_start",
        "target": "node_message",
        "type": "default",
        "sourceHandle": null,
        "targetHandle": null
      },
      {
        "id": "edge_2",
        "source": "node_message",
        "target": "node_buttons",
        "type": "default",
        "sourceHandle": null,
        "targetHandle": null
      },
      {
        "id": "edge_3",
        "source": "node_buttons",
        "target": "node_condition",
        "type": "default",
        "sourceHandle": null,
        "targetHandle": null
      }
    ]
  }
}
```

### Правила создания сценариев:

1. **Всегда начинайте с блока `start`**
   - ID должен быть уникальным (например, `node_start_${timestamp}`)
   - Позиция: `{x: 250, y: 50}` (или другая начальная точка)

2. **Используйте логичные позиции**
   - Вертикальное расположение: каждый следующий блок ниже на ~150px
   - Горизонтальное расположение: для ветвлений используйте разные x

3. **Создавайте edges последовательно**
   - От `start` к первому блоку
   - От каждого блока к следующему
   - Для `condition` — два edge (true и false)

4. **Используйте понятные ID**
   - Формат: `node_${type}_${index}` (например, `node_message_1`)
   - Уникальность обязательна

---

## 🎨 Примеры готовых сценариев

### Пример 1: Сценарий "FAQ" (Частые вопросы)

```json
{
  "name": "FAQ",
  "description": "Ответы на частые вопросы",
  "icon": "HelpCircle",
  "category": "support",
  "is_main": false,
  "content": {
    "nodes": [
      {
        "id": "node_start",
        "type": "default",
        "position": { "x": 250, "y": 50 },
        "data": {
          "label": "Начало",
          "type": "start",
          "icon": "Play",
          "color": "#4CAF50",
          "settings": {}
        }
      },
      {
        "id": "node_message",
        "type": "default",
        "position": { "x": 250, "y": 200 },
        "data": {
          "label": "Вопрос",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Выберите интересующий вопрос:",
            "parseMode": "Markdown"
          }
        }
      },
      {
        "id": "node_buttons",
        "type": "default",
        "position": { "x": 250, "y": 350 },
        "data": {
          "label": "Список вопросов",
          "type": "buttons",
          "icon": "Grid3x3",
          "color": "#FF9800",
          "settings": {
            "text": "",
            "buttons": [
              { "text": "Как оформить заказ?", "value": "order" },
              { "text": "Способы оплаты", "value": "payment" },
              { "text": "Доставка", "value": "delivery" },
              { "text": "Возврат товара", "value": "return" }
            ],
            "inline": false
          }
        }
      },
      {
        "id": "node_condition",
        "type": "default",
        "position": { "x": 250, "y": 500 },
        "data": {
          "label": "Проверка выбора",
          "type": "condition",
          "icon": "GitBranch",
          "color": "#9C27B0",
          "settings": {
            "variable": "user_choice",
            "operator": "equals",
            "value": "order",
            "trueLabel": "Заказ",
            "falseLabel": "Другое"
          }
        }
      },
      {
        "id": "node_answer_order",
        "type": "default",
        "position": { "x": 100, "y": 650 },
        "data": {
          "label": "Ответ: Заказ",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Для оформления заказа:\n1. Выберите товары в каталоге\n2. Добавьте в корзину\n3. Перейдите к оплате\n4. Заполните данные доставки",
            "parseMode": "Markdown"
          }
        }
      },
      {
        "id": "node_answer_other",
        "type": "default",
        "position": { "x": 400, "y": 650 },
        "data": {
          "label": "Ответ: Другое",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Для получения ответа на другие вопросы свяжитесь с поддержкой.",
            "parseMode": "Markdown"
          }
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "node_start", "target": "node_message" },
      { "id": "e2", "source": "node_message", "target": "node_buttons" },
      { "id": "e3", "source": "node_buttons", "target": "node_condition" },
      { "id": "e4", "source": "node_condition", "target": "node_answer_order", "sourceHandle": "true" },
      { "id": "e5", "source": "node_condition", "target": "node_answer_other", "sourceHandle": "false" }
    ]
  }
}
```

### Пример 2: Сценарий "Оформление заказа"

```json
{
  "name": "Оформление заказа",
  "description": "Процесс оформления заказа с сбором данных",
  "icon": "ShoppingCart",
  "category": "payment",
  "is_main": false,
  "content": {
    "nodes": [
      {
        "id": "node_start",
        "type": "default",
        "position": { "x": 250, "y": 50 },
        "data": {
          "label": "Начало",
          "type": "start",
          "icon": "Play",
          "color": "#4CAF50",
          "settings": {}
        }
      },
      {
        "id": "node_welcome",
        "type": "default",
        "position": { "x": 250, "y": 200 },
        "data": {
          "label": "Приветствие",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Отлично! Давайте оформим ваш заказ. Пожалуйста, укажите ваше имя:",
            "parseMode": "Markdown"
          }
        }
      },
      {
        "id": "node_wait_name",
        "type": "default",
        "position": { "x": 250, "y": 350 },
        "data": {
          "label": "Ожидание имени",
          "type": "wait",
          "icon": "Clock",
          "color": "#607D8B",
          "settings": {
            "variable": "customer_name",
            "timeout": 300,
            "timeoutMessage": "Время ожидания истекло. Попробуйте снова."
          }
        }
      },
      {
        "id": "node_save_name",
        "type": "default",
        "position": { "x": 250, "y": 500 },
        "data": {
          "label": "Сохранение имени",
          "type": "variable",
          "icon": "Variable",
          "color": "#795548",
          "settings": {
            "name": "customer_name",
            "value": "{{user_input}}",
            "operation": "set"
          }
        }
      },
      {
        "id": "node_ask_phone",
        "type": "default",
        "position": { "x": 250, "y": 650 },
        "data": {
          "label": "Запрос телефона",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Спасибо, {{customer_name}}! Теперь укажите ваш телефон:",
            "parseMode": "Markdown"
          }
        }
      },
      {
        "id": "node_wait_phone",
        "type": "default",
        "position": { "x": 250, "y": 800 },
        "data": {
          "label": "Ожидание телефона",
          "type": "wait",
          "icon": "Clock",
          "color": "#607D8B",
          "settings": {
            "variable": "customer_phone",
            "timeout": 300
          }
        }
      },
      {
        "id": "node_save_phone",
        "type": "default",
        "position": { "x": 250, "y": 950 },
        "data": {
          "label": "Сохранение телефона",
          "type": "variable",
          "icon": "Variable",
          "color": "#795548",
          "settings": {
            "name": "customer_phone",
            "value": "{{user_input}}",
            "operation": "set"
          }
        }
      },
      {
        "id": "node_success",
        "type": "default",
        "position": { "x": 250, "y": 1100 },
        "data": {
          "label": "Успех",
          "type": "message",
          "icon": "MessageSquare",
          "color": "#2196F3",
          "settings": {
            "text": "Заказ оформлен! ✅\n\nИмя: {{customer_name}}\nТелефон: {{customer_phone}}\n\nНомер заказа: #{{order_id}}",
            "parseMode": "Markdown"
          }
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "node_start", "target": "node_welcome" },
      { "id": "e2", "source": "node_welcome", "target": "node_wait_name" },
      { "id": "e3", "source": "node_wait_name", "target": "node_save_name" },
      { "id": "e4", "source": "node_save_name", "target": "node_ask_phone" },
      { "id": "e5", "source": "node_ask_phone", "target": "node_wait_phone" },
      { "id": "e6", "source": "node_wait_phone", "target": "node_save_phone" },
      { "id": "e7", "source": "node_save_phone", "target": "node_success" }
    ]
  }
}
```

---

## 💡 Рекомендации по разработке

### 1. Структура сценария

- **Компактность:** Оптимально 10-20 блоков на сценарий
- **Одна задача:** Каждый сценарий решает одну конкретную задачу
- **Понятные названия:** Используйте описательные названия (например, "Оформление заказа", а не "Сценарий 1")

### 2. Использование блоков

- **Начало:** Всегда начинайте с блока `start`
- **Сообщения:** Используйте `message` для всех текстовых ответов
- **Взаимодействие:** Используйте `buttons` для выбора и `wait` для ввода текста
- **Логика:** Используйте `condition` для ветвления
- **Переменные:** Используйте `variable` для сохранения данных пользователя

### 3. Переменные

- **Именование:** Используйте понятные имена (`customer_name`, а не `var1`)
- **Использование:** В текстах сообщений используйте `{{variable_name}}` для подстановки значений

### 4. Переходы между сценариями

- Используйте блок `scenario_switch` для перехода к другому сценарию
- Указывайте `scenarioId` целевого сценария
- Используйте `returnTo: true` для возврата обратно

### 5. Обработка ошибок

- Добавляйте таймауты для блоков `wait`
- Используйте `condition` для валидации ввода
- Предусматривайте альтернативные пути при ошибках

### 6. Категории сценариев

Используйте следующие категории:
- `main` — главное меню
- `payment` — оплата и заказы
- `support` — поддержка и помощь
- `catalog` — каталог товаров
- `faq` — частые вопросы
- `other` — прочее

### 7. Иконки

Используйте иконки из Lucide React:
- `Home` — главное меню
- `ShoppingCart` — заказы и корзина
- `HelpCircle` — помощь и FAQ
- `CreditCard` — оплата
- `MessageSquare` — сообщения
- `Settings` — настройки

---

## 📋 Чек-лист для готового сценария

Перед отправкой сценария проверьте:

- [ ] Есть блок `start` в начале
- [ ] Все блоки имеют уникальные ID
- [ ] Все пользовательские данные в `node.data.settings`
- [ ] Все edges правильно связывают блоки
- [ ] Для `condition` есть два исходящих edge (true/false)
- [ ] Используются понятные названия переменных
- [ ] Тексты сообщений информативны и дружелюбны
- [ ] Сценарий решает одну конкретную задачу
- [ ] Количество блоков оптимально (10-20)
- [ ] Указаны правильные категория и иконка

---

## 🚀 Готовые шаблоны для разработки

### Шаблон 1: Простое меню

```json
{
  "name": "Главное меню",
  "description": "Главное меню с выбором действий",
  "icon": "Home",
  "category": "main",
  "is_main": true,
  "content": {
    "nodes": [
      { "id": "node_start", "type": "start", ... },
      { "id": "node_message", "type": "message", "settings": { "text": "Выберите действие:" } },
      { "id": "node_buttons", "type": "buttons", "settings": { "buttons": [...] } }
    ],
    "edges": [...]
  }
}
```

### Шаблон 2: Форма сбора данных

```json
{
  "name": "Сбор данных",
  "description": "Сбор информации от пользователя",
  "icon": "FileText",
  "category": "other",
  "content": {
    "nodes": [
      { "id": "node_start", "type": "start" },
      { "id": "node_ask", "type": "message", "settings": { "text": "Введите данные:" } },
      { "id": "node_wait", "type": "wait", "settings": { "variable": "user_data" } },
      { "id": "node_save", "type": "variable", "settings": { "name": "user_data", "value": "{{user_input}}" } },
      { "id": "node_confirm", "type": "message", "settings": { "text": "Спасибо! Данные сохранены." } }
    ],
    "edges": [...]
  }
}
```

---

## 📞 Дополнительная информация

### API Endpoints:

- `GET /scenarios/bot/{bot_id}` — получить все сценарии бота
- `GET /scenarios/library` — получить сценарии из библиотеки
- `POST /scenarios` — создать новый сценарий
- `PUT /scenarios/{scenario_id}` — обновить сценарий
- `DELETE /scenarios/{scenario_id}` — удалить сценарий

### Формат запроса создания сценария:

```json
{
  "name": "Название сценария",
  "description": "Описание",
  "icon": "Home",
  "category": "main",
  "bot_id": 123,  // или null для библиотеки
  "is_library": false,
  "is_main": false,
  "content": {
    "nodes": [...],
    "edges": [...]
  }
}
```

---

**Последнее обновление:** Ноябрь 2024  
**Версия:** 1.0.0

