# 📚 Полная документация: Блоки редактора и библиотека блоков

> **Версия:** 1.0  
> **Дата:** 04.12.2024  
> **Проект:** BotForg

---

## Содержание

1. [Архитектура системы блоков](#1-архитектура-системы-блоков)
2. [Каталог блоков (Backend)](#2-каталог-блоков-backend)
3. [API эндпоинты](#3-api-эндпоинты)
4. [Frontend компоненты](#4-frontend-компоненты)
5. [Система ролей и доступа](#5-система-ролей-и-доступа)
6. [Валидация](#6-валидация)
7. [Структура узла в редакторе](#7-структура-узла-в-редакторе)
8. [Типы полей настроек](#8-типы-полей-настроек)
9. [Соединения между блоками](#9-соединения-между-блоками)
10. [Stores (Zustand)](#10-stores-zustand)

---

## 1. Архитектура системы блоков

### 1.1 Структура данных блока

```typescript
// frontend/src/types/blocks.ts

interface BlockCatalogItem {
  id: string;           // Уникальный идентификатор (start, message, wait...)
  title: string;        // Отображаемое название
  category: 'basic' | 'business' | 'service' | 'system' | 'ai' | 'custom';
  description: string;  // Описание функционала
  icon: string;         // Эмодзи иконка
  color: string;        // HEX цвет (#4CAF50)
  planAccess: ('free' | 'pro' | 'enterprise')[]; // Доступ по тарифам
  permissions: RoleType[];  // Доступ по ролям
  configSchema: BlockConfigField[]; // Схема настроек
}

interface BlockConfigField {
  name: string;     // Имя поля в settings
  type: 'string' | 'text' | 'number' | 'boolean' | 'select' | 
        'multiselect' | 'json' | 'image' | 'file' | 'datetime' | 'duration' |
        'media_upload' | 'media_list' | 'button_list' | 'scenario_select' | 'node_select';
  label: string;    // Отображаемое название
  required: boolean;
  default?: any;
  options?: string[]; // Для select/multiselect
}
```

### 1.2 Типы тарифов и ролей

```typescript
type PlanType = 'free' | 'pro' | 'enterprise';

type RoleType = 'owner' | 'admin' | 'manager_template' | 'developer' | 'support' | 'viewer';
```

---

## 2. Каталог блоков (Backend)

### 2.1 Расположение файла

📁 **Путь:** `backend/data/editor_blocks.json`

### 2.2 Категории блоков

| Категория | Название | Описание |
|-----------|----------|----------|
| `basic` | Базовые | Основные блоки для любого сценария |
| `business` | Бизнесовые | Оплата, подписки, скидки |
| `service` | Сервисные | API, webhooks, email, SMS |
| `system` | Системные | Переменные, логи, обработка ошибок |
| `ai` | AI | Интеграции с AI (ChatGPT, генерация изображений) |
| `custom` | Дополнительные | Кастомный код, плагины, интеграции |

### 2.3 Список всех блоков

#### 📦 Базовые (basic) — доступны всем тарифам и ролям

| ID | Название | Иконка | Цвет | Обязательные поля |
|----|----------|--------|------|-------------------|
| `start` | Начало | ▶️ | #4CAF50 | — |
| `message` | Сообщение | 💬 | #2196F3 | Текст сообщения |
| `wait` | Ожидание | ⏱️ | #FF9800 | Длительность паузы |
| `condition` | Условие | 🔀 | #9C27B0 | Переменная, Оператор |

**Пример конфигурации блока "Сообщение":**
```json
{
  "id": "message",
  "title": "Сообщение",
  "category": "basic",
  "description": "Отправка текстового сообщения пользователю.",
  "icon": "💬",
  "color": "#2196F3",
  "planAccess": ["free", "pro", "enterprise"],
  "permissions": ["owner", "admin", "manager_template", "developer", "support", "viewer"],
  "configSchema": [
    {
      "name": "text",
      "type": "text",
      "label": "Текст сообщения",
      "required": true
    },
    {
      "name": "parseMode",
      "type": "select",
      "label": "Режим парсинга",
      "required": false,
      "options": ["Markdown", "HTML", "Plain"],
      "default": "Plain"
    },
    {
      "name": "disablePreview",
      "type": "boolean",
      "label": "Отключить превью ссылок",
      "required": false,
      "default": false
    }
  ]
}
```

#### 💳 Бизнесовые (business) — Pro/Enterprise

| ID | Название | Иконка | Цвет | Доступ (роли) |
|----|----------|--------|------|---------------|
| `payment` | Оплата | 💳 | #4CAF50 | owner, admin, manager_template, developer |
| `subscription` | Подписка | 🔄 | #00BCD4 | owner, admin, manager_template, developer |
| `invoice` | Счет на оплату | 📄 | #3F51B5 | owner, admin, manager_template, developer |
| `discount` | Скидка | 🏷️ | #E91E63 | owner, admin, manager_template, developer |

#### 🌐 Сервисные (service) — Pro/Enterprise

| ID | Название | Иконка | Цвет | Доступ (роли) |
|----|----------|--------|------|---------------|
| `api_call` | HTTP-запрос | 🌐 | #607D8B | owner, admin, developer |
| `webhook` | Вебхук | 🔗 | #795548 | owner, admin, developer |
| `email` | Электронная почта | 📧 | #F44336 | owner, admin, manager_template, developer |
| `sms` | SMS-сообщение | 📱 | #009688 | owner, admin, manager_template, developer |

#### ⚙️ Системные (system) — доступны всем

| ID | Название | Иконка | Цвет |
|----|----------|--------|------|
| `variable` | Переменная | 🗄️ | #673AB7 |
| `log` | Лог | 📄 | #9E9E9E |
| `error_handler` | Обработчик ошибок | ⚠️ | #FF5722 |
| `router` | Роутер | 🔁 | #00BCD4 |

#### 🤖 AI (ai) — Pro/Enterprise

| ID | Название | Иконка | Цвет | Доступ (тариф) |
|----|----------|--------|------|----------------|
| `ai_chat` | ИИ Чат | 🤖 | #8BC34A | Pro+ |
| `ai_image` | ИИ Генерация изображений | 🖼️ | #CDDC39 | **Enterprise only** |
| `ai_text_analysis` | ИИ Анализ текста | 🔍 | #FFC107 | Pro+ |
| `ai_voice` | ИИ Синтез речи | 🎤 | #FF9800 | Pro+ |

#### 🔌 Дополнительные (custom) — Enterprise

| ID | Название | Иконка | Цвет | Доступ (роли) |
|----|----------|--------|------|---------------|
| `custom_code` | Пользовательский код | 💻 | #607D8B | owner, admin |
| `custom_plugin` | Плагин | 📦 | #9C27B0 | owner, admin |
| `custom_template` | Пользовательский шаблон | 📋 | #3F51B5 | Pro+ (owner, admin, manager_template, developer) |
| `custom_integration` | Интеграция | 🔌 | #00BCD4 | Pro+ (owner, admin, developer) |

---

## 3. API эндпоинты

### 3.1 Получение каталога блоков

```http
GET /blocks?plan={plan}&role={role}
```

**Параметры запроса:**

| Параметр | Тип | Обязательный | Значения |
|----------|-----|--------------|----------|
| `plan` | string | Нет | `free`, `pro`, `enterprise` |
| `role` | string | Нет | `owner`, `admin`, `manager_template`, `developer`, `support`, `viewer` |

**Логика фильтрации:** AND — блок должен соответствовать И тарифу, И роли.

**Пример ответа:**
```json
[
  {
    "id": "start",
    "title": "Начало",
    "category": "basic",
    "description": "Точка входа сценария...",
    "icon": "▶️",
    "color": "#4CAF50",
    "planAccess": ["free", "pro", "enterprise"],
    "permissions": ["owner", "admin", "manager_template", "developer", "support", "viewer"],
    "configSchema": [...]
  }
]
```

### 3.2 Получение категорий

```http
GET /blocks/categories
```

**Пример ответа:**
```json
["ai", "basic", "business", "custom", "service", "system"]
```

---

## 4. Frontend компоненты

### 4.1 BlockLibraryModal

📁 **Путь:** `frontend/src/features/editorV2/BlockLibraryModal.tsx`

**Функционал:**
- ✅ Отображение каталога блоков по категориям (табы)
- ✅ Поиск по названию и описанию
- ✅ Фильтрация по тарифу и роли
- ✅ Предпросмотр блока с параметрами
- ✅ Добавление блока в редактор по клику

**Порядок категорий:**
```typescript
const CATEGORY_ORDER = ['basic', 'business', 'service', 'system', 'ai', 'custom'];
```

### 4.2 BlockSettingsPanel

📁 **Путь:** `frontend/src/features/editorV2/BlockSettingsPanel/`

**Структура:**
```
BlockSettingsPanel/
├── index.tsx          # Основная панель настроек
├── FieldRenderer.tsx  # Рендеринг полей по типу
└── fields/
    └── JsonField.tsx  # Специальный редактор JSON
```

**Функционал:**
- ✅ Редактирование настроек выбранного блока
- ✅ Валидация обязательных полей в реальном времени
- ✅ Сохранение / Дублирование / Удаление блока
- ✅ Инспектор для отладки (вывод в консоль)
- ✅ Справка по блоку

---

## 5. Система ролей и доступа

### 5.1 Роли пользователей

📁 **Путь:** `frontend/src/constants/roles.ts`

| Код | Название | Описание |
|-----|----------|----------|
| `owner` | Владелец проекта | Полный доступ ко всем разделам |
| `admin` | Администратор | Всё, кроме критичных финансовых настроек |
| `developer` | Разработчик | Боты, Шаблоны, Интеграции, просмотр Аналитики |
| `manager_template` | Менеджер шаблонов | Управление шаблонами, публикация |
| `support` | Поддержка | Только чтение базовой аналитики |
| `viewer` | Наблюдатель | Только просмотр без права изменений |

### 5.2 Проверка доступа к блоку

📁 **Путь:** `frontend/src/utils/accessControl.ts`

```typescript
function canAccessBlock(block: BlockCatalogItem, userPlan: PlanType, userRole: RoleType): boolean {
  const hasPlanAccess = block.planAccess.includes(userPlan);
  const hasRolePermission = block.permissions.includes(userRole);
  return hasPlanAccess && hasRolePermission;
}
```

### 5.3 Сообщение при отказе в доступе

```typescript
function getAccessDeniedMessage(block, userPlan, userRole): string {
  if (!hasPlanAccess) {
    return `Блок "${block.title}" доступен только в тарифе PRO / ENTERPRISE`;
  }
  if (!hasRolePermission) {
    return `У вас недостаточно прав для использования блока "${block.title}"`;
  }
  return 'Доступ запрещён';
}
```

---

## 6. Валидация

### 6.1 Схема валидации

📁 **Путь:** `frontend/src/utils/schemaValidation.ts`

```typescript
interface ValidationResult {
  nodeId: string;
  isValid: boolean;
  missingFields: string[];
  blockTitle?: string;
}
```

### 6.2 Процесс валидации

1. **При добавлении блока** — создаётся узел с пустыми settings
2. **При изменении настроек** — валидация с debounce (100ms)
3. **При экспорте** — полная проверка всех блоков, предупреждение если есть ошибки

### 6.3 Правила валидации полей

```typescript
function validateField(field: BlockConfigField, value: any): string | undefined {
  if (field.required) {
    if (value === null || value === undefined || value === '') {
      return 'Обязательное поле';
    }
    if (Array.isArray(value) && value.length === 0) {
      return 'Обязательное поле';
    }
  }
  return undefined;
}
```

### 6.4 ValidationStore

📁 **Путь:** `frontend/src/stores/validationStore.ts`

**Методы:**
- `setValidationResult(nodeId, result)` — установить результат для узла
- `setAllValidationResults(results)` — установить все результаты
- `getNodeValidation(nodeId)` — получить валидацию узла
- `hasErrors()` — есть ли ошибки
- `getInvalidNodes()` — получить узлы с ошибками

---

## 7. Структура узла в редакторе

### 7.1 Node structure (React Flow)

```typescript
interface NodeData {
  blockId: string;      // ID из каталога блоков
  title: string;        // Название для отображения
  icon: string;         // Эмодзи иконка
  color: string;        // Цвет рамки (HEX)
  settings: {           // Настройки пользователя
    [fieldName: string]: any;
  };
}

// Пример узла
{
  id: "TP4ocO9nS8Y9PcN8rWZn3",  // nanoid
  type: "default",
  position: { x: 100, y: 200 },
  data: {
    blockId: "message",
    title: "Сообщение",
    icon: "💬",
    color: "#2196F3",
    settings: {
      text: "Привет! Как дела?",
      parseMode: "Plain",
      disablePreview: false
    }
  }
}
```

### 7.2 Создание нового узла

```typescript
const newNode: Node = {
  id: nanoid(),
  type: 'default',
  position: { x, y },
  data: {
    blockId: block.id,
    title: block.title,
    icon: block.icon,
    color: block.color,
    settings: {},  // Пустые настройки при создании
  },
};
```

---

## 8. Типы полей настроек

| Тип | Описание | UI компонент | Пример использования |
|-----|----------|--------------|---------------------|
| `string` | Однострочный текст | `<input type="text">` | Имя переменной, URL |
| `text` | Многострочный текст | `<textarea>` | Текст сообщения, промпт |
| `number` | Число | `<input type="number">` | Сумма, таймаут, температура |
| `boolean` | Да/Нет | `<input type="checkbox">` | Вкл/Выкл опции |
| `select` | Выпадающий список | `<select>` | Валюта, метод HTTP |
| `multiselect` | Множественный выбор | Кастомный компонент | Типы ошибок, типы анализа |
| `json` | JSON редактор | Monaco/CodeMirror | Заголовки API, конфиг |
| `datetime` | Дата и время | DateTimePicker | Срок действия |
| `duration` | Длительность | DurationPicker | Пауза, таймаут |
| `image` | Загрузка изображения | FileUpload | — |
| `file` | Загрузка файла | FileUpload | Вложения |
| `media_upload` | Загрузка одного медиа-файла (изображение/GIF/видео) или URL | MediaUploadField | Медиа для блока сообщения (устаревший) |
| `media_list` | Список медиа-файлов (несколько изображений/GIF/видео) | MediaListField | Множественные медиа для блока сообщения |
| `button_list` | Список кнопок для сообщений | ButtonListField | Кнопки в блоке сообщения |
| `scenario_select` | Выбор сценария из списка | ScenarioSelectField | Переход к другому сценарию |
| `node_select` | Выбор блока внутри сценария | NodeSelectField | Переход к конкретному блоку |

---

## 9. Соединения между блоками

### 9.1 Handle (точки подключения)

| Цвет | Тип | Позиция | Описание |
|------|-----|---------|----------|
| 🟢 Зелёный | `target` | top, left | Входящие соединения |
| 🟠 Оранжевый | `source` | bottom, right | Исходящие соединения |

### 9.2 Особенности блоков

- **Стартовый блок (`start`):** только top (target) и bottom (source)
- **Блок сообщения (`message`) без кнопок:** top (target) и right (source)
- **Блок сообщения (`message`) с кнопками:** 
  - top (target) — входной handle
  - Для каждой кнопки: `button_${index}` (source) на правой границе блока
  - Стандартный right handle скрывается при наличии кнопок
- **Остальные блоки:** 4 Handle — по одному на каждой стороне

### 9.3 Логика ID соединений

```typescript
// Уникальный ID для поддержки множественных соединений
const edgeId = `${source}_${sourceHandle || 'default'}-${target}_${targetHandle || 'default'}`;

// Примеры:
// "nodeA_bottom-nodeB_top" - обычное соединение
// "messageNode_button_0-targetNode_left" - соединение от кнопки
```

### 9.4 Валидация edges при загрузке

При загрузке сценария все edges валидируются на корректность handles:

- Проверяется существование source и target узлов
- Для handles кнопок (`button_0`, `button_1`, ...) проверяется, что соответствующая кнопка существует в настройках узла
- Некорректные edges автоматически удаляются при загрузке

### 9.4 Валидация соединений

```typescript
// Запрет самосоединения
if (params.source === params.target) {
  showToast('Нельзя соединить блок с самим собой', 'warning');
  return;
}

// Запрет дублирующих соединений
const existingEdge = edges.find(e => e.id === edgeId);
if (existingEdge) {
  showToast('Такое соединение уже существует', 'warning');
  return;
}
```

### 9.5 Структура Edge

```typescript
const newEdge: Edge = {
  id: edgeId,
  source: params.source,
  target: params.target,
  sourceHandle: params.sourceHandle,
  targetHandle: params.targetHandle,
  type: 'default',
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 30,
    height: 30,
    color: '#FFB300',
  },
  style: {
    stroke: '#FFB300',
    strokeWidth: 4,
  },
};
```

---

## 10. Stores (Zustand)

### 10.1 editorStore

📁 **Путь:** `frontend/src/stores/editorStore.ts`

**State:**
```typescript
interface EditorStore {
  // Каталог
  catalog: BlockCatalogItem[];
  plan: PlanType;
  role: RoleType;
  isLoading: boolean;
  
  // Flow данные
  nodes: Node[];
  edges: Edge[];
  
  // Поиск
  searchQuery: string;
  
  // Уведомления
  toasts: Toast[];
  
  // Персистентные данные
  favoriteBlockIds: string[];
  recentBlockIds: string[];
  collapsedCategories: string[];
}
```

**Основные методы:**
- `loadCatalog(plan?, role?)` — загрузка каталога
- `setNodes(nodes)` — установка узлов
- `setEdges(edges)` — установка соединений
- `showToast(message, type)` — показ уведомления
- `toggleFavorite(blockId)` — добавить/убрать из избранного
- `addToRecent(blockId)` — добавить в недавние

### 10.2 validationStore

📁 **Путь:** `frontend/src/stores/validationStore.ts`

**State:**
```typescript
interface ValidationStore {
  validationResults: Map<string, ValidationResult>;
  isValidating: boolean;
}
```

**Методы:**
- `setValidationResult(nodeId, result)`
- `setAllValidationResults(results)`
- `clearValidation()`
- `getNodeValidation(nodeId)`
- `hasErrors()`
- `getInvalidNodes()`

### 10.3 scenarioStore

📁 **Путь:** `frontend/src/stores/scenarioStore.ts`

**State:**
```typescript
interface ScenarioStore {
  currentBotId: number | null;
  scenarios: Scenario[];
  currentScenarioId: number | null;
  currentState: ScenarioState | null;
  libraryScenarios: Scenario[];
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
}
```

**Основные методы:**
- `loadBotScenarios(botId)` — загрузка сценариев бота
- `selectScenario(scenarioId)` — выбор сценария
- `createScenario(data)` — создание сценария
- `saveCurrentScenario()` — сохранение
- `enableAutoSave()` / `disableAutoSave()` — автосохранение (30 сек)

---

## 11. Файловая структура

```
frontend/src/
├── features/editorV2/
│   ├── EditorV2Shell.tsx       # Главный компонент редактора
│   ├── BlockLibraryModal.tsx   # Модалка библиотеки блоков
│   ├── BlockSettingsPanel/     # Панель настроек блока
│   ├── CustomEdge.tsx          # Кастомное соединение
│   ├── EditorControls.tsx      # Верхняя панель управления
│   ├── ValidationModal.tsx     # Модалка валидации
│   └── flow.css                # Стили для React Flow
├── stores/
│   ├── editorStore.ts          # Стор редактора
│   ├── validationStore.ts      # Стор валидации
│   └── scenarioStore.ts        # Стор сценариев
├── types/
│   └── blocks.ts               # Типы блоков
├── utils/
│   ├── schemaValidation.ts     # Валидация схемы
│   └── accessControl.ts        # Контроль доступа
├── api/
│   └── blocks.ts               # API блоков
└── constants/
    └── roles.ts                # Константы ролей

backend/
├── routers/
│   └── blocks.py               # API роутер блоков
├── schemas/
│   └── blocks.py               # Pydantic схемы
└── data/
    └── editor_blocks.json      # Каталог блоков (JSON)
```

---

## 12. Быстрый старт для разработчика

### Добавление нового блока

1. **Добавить в каталог** (`backend/data/editor_blocks.json`):
```json
{
  "id": "my_new_block",
  "title": "Мой новый блок",
  "category": "basic",
  "description": "Описание блока",
  "icon": "🆕",
  "color": "#FF5722",
  "planAccess": ["free", "pro", "enterprise"],
  "permissions": ["owner", "admin", "developer"],
  "configSchema": [
    {
      "name": "myField",
      "type": "string",
      "label": "Моё поле",
      "required": true
    }
  ]
}
```

2. **Перезагрузить frontend** — блок появится в библиотеке

### Изменение логики валидации

📁 `frontend/src/utils/schemaValidation.ts`

### Изменение UI полей

📁 `frontend/src/features/editorV2/BlockSettingsPanel/FieldRenderer.tsx`

---

*Документация создана автоматически. Актуальна на момент создания.*

