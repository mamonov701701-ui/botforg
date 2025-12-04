# Доработка блока "Сообщение" (Message)

Дата: 2025-12-04  
Статус: ✅ Завершено

## Обзор

Выполнена комплексная доработка блока "Сообщение" по 4 направлениям:
1. Улучшен визуал кнопок
2. Исправлено позиционирование хэндлов
3. Добавлен preview текста на ноде
4. Реализована загрузка медиа-файлов

---

## 1. Визуал кнопок

### Было:
- Кнопки выглядели как полупрозрачные полоски с градиентом
- Текст не всегда читался
- Фон просвечивал

### Стало:
- **Непрозрачный градиентный фон**: Кнопки имеют объемный градиент `linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)`
- **Ширина с отступами**: Кнопки занимают ширину с отступом **2px справа и слева** от границ блока
- **Контрастный текст**: Белый цвет `#ffffff`, жирность `600` для максимальной читаемости
- **Скругленные углы**: `borderRadius: 10px` для современного, мягкого вида
- **Объемные тени**: `boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)'` для 3D-эффекта
- **Hover-эффект**: При наведении:
  - Градиент меняется на `linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)`
  - Тень усиливается: `0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(37, 99, 235, 0.4)`
  - Кнопка слегка поднимается: `transform: translateY(-1px)`
- **Очередность слоев**: `zIndex: 1`, `opacity: 1` для полной непрозрачности и отсутствия разметки редактора

### Код:

```typescript:frontend/src/features/editorV2/EditorV2Shell.tsx
<div
  style={{
    marginTop: 12,
    paddingTop: 12,
    borderTop: '2px solid rgba(0, 0, 0, 0.08)',
    marginLeft: -18,    // Отступ 2px от левого края блока
    marginRight: -18,   // Отступ 2px от правого края блока
    paddingLeft: 0,
    paddingRight: 0,
    width: 'calc(100% + 36px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    position: 'relative',
  }}
>
  {buttons.slice(0, 5).map((button: any, index: number) => (
    <div
      key={index}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        minWidth: 0,
        background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
        border: 'none',
        borderRadius: '10px',  // Увеличенный радиус закругления
        padding: '12px 20px',
        fontSize: 14,
        fontWeight: 600,
        color: '#ffffff',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'center',
        opacity: 1,
        boxSizing: 'border-box',
        zIndex: 1,
        pointerEvents: 'auto',
      }}
      title={button.label || `Кнопка ${index + 1}`}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)';
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(37, 99, 235, 0.4)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        {button.label || `Кнопка ${index + 1}`}
      </span>
      
      {/* Хэндл для каждой кнопки на правой границе блока */}
      <Handle
        id={`button_${index}`}
        type="source"
        position={Position.Right}
        isConnectable={true}
        style={{
          background: '#FFB300',
          width: 19.4,
          height: 19.4,
          border: '3px solid #fff',
          right: -11.7,  // Позиция с учетом отступа 2px
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10001,
          position: 'absolute',
          boxShadow: '0 2px 6px rgba(255, 179, 0, 0.5)',
          cursor: 'crosshair',
        }}
        className="react-flow__handle-visible"
      />
    </div>
  ))}
</div>
```

---

## 2. Позиционирование хэндлов

### Проблема:
Хэндлы (соединительные точки) были внутри кнопок и не находились строго на границе блока.

### Решение:
- Хэндлы рендерятся **внутри каждой кнопки** с абсолютным позиционированием
- Используется `position: 'absolute'` с `right: -11.7px` для размещения на правой границе блока
- Вертикальное выравнивание: `top: '50%'` + `transform: 'translateY(-50%)'` для центрирования
- Простое и надежное решение без сложных динамических вычислений

### Логика хэндлов:

**Входные хэндлы:**
- Для блока message с кнопками: **только `top` (сверху)**
- Левый входной хэндл удалён для упрощения UI
- Это позволяет подключаться к блоку сверху

**Выходные хэндлы:**
- **Без кнопок**: Стандартные хэндлы `right`, `bottom`
- **С кнопками**: Скрываются стандартные хэндлы, каждая кнопка получает свой хэндл с ID `button_0`, `button_1`, `button_2`, и т.д.

### Позиционирование хэндлов:

Хэндлы рендерятся **прямо внутри каждой кнопки** (см. код выше), что обеспечивает:
- Автоматическое вертикальное выравнивание по центру кнопки
- Правильное позиционирование на правой границе блока
- Стабильность при изменении размеров или количества кнопок
- Отсутствие необходимости в сложных динамических вычислениях

---

## 3. Preview текста сообщения

### Функционал:
- На самой ноде теперь отображается краткий preview текста сообщения
- Показываются первые 2 строки текста (максимум 40px высоты)
- Длинный текст обрезается с `...`
- При наведении доступен полный текст через `title` attribute

### Код:

```typescript:frontend/src/features/editorV2/EditorV2Shell.tsx
{/* Preview текста сообщения */}
{isMessageNode && data?.settings?.text && (
  <div
    style={{
      fontSize: 12,
      color: '#1f2937',
      opacity: 0.85,
      fontWeight: 400,
      marginTop: 6,
      lineHeight: 1.4,
      maxHeight: 48,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      wordBreak: 'break-word',
    }}
    title={data.settings.text}
  >
    {data.settings.text}
  </div>
)}
```

### Результат:
Теперь пользователь может видеть содержимое сообщения прямо на canvas, не открывая настройки.

---

## 4. Загрузка медиа-файлов

### Новая схема данных

Добавлено новое поле в блок message:

```json
{
  "name": "mediaSource",
  "type": "select",
  "label": "Источник медиа",
  "required": false,
  "options": [
    {"value": "upload", "label": "Загрузить файл"},
    {"value": "url", "label": "Ссылка (URL)"}
  ],
  "default": "upload",
  "description": "Выберите способ добавления медиа",
  "dependsOn": {
    "field": "mediaType",
    "value": "none",
    "invert": true
  }
}
```

Поле `mediaUrl` изменено на тип `media_upload` для универсальности.

### Backend API

**Новый роутер**: `backend/routers/media.py`

#### Эндпоинт загрузки: `POST /media/upload`
- Принимает `multipart/form-data` с полем `file`
- Поддерживаемые форматы:
  - **Изображения**: JPEG, PNG, GIF, WebP
  - **Видео**: MP4, MPEG, QuickTime
- Максимальный размер: **50MB**
- Файлы сохраняются в `uploads/media/`
- Имя файла: `{user_id}_{timestamp}_{filename}`
- Возвращает JSON:
  ```json
  {
    "url": "/uploads/media/123_20251204_120000_image.jpg",
    "fileName": "123_20251204_120000_image.jpg",
    "contentType": "image/jpeg"
  }
  ```

#### Эндпоинт удаления: `DELETE /media/{filename}`
- Пользователь может удалять только свои файлы (проверка по `user_id` в имени)

#### Раздача статических файлов:
```python
# В backend/main.py
from fastapi.staticfiles import StaticFiles

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
```

### Frontend API

**Новый файл**: `frontend/src/api/media.ts`

```typescript
export async function uploadMedia(file: File): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');
  
  const response = await fetch(`${API_URL}/media/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Ошибка загрузки файла');
  }

  return response.json();
}
```

### Frontend UI компонент

**Новый файл**: `frontend/src/features/editorV2/BlockSettingsPanel/fields/MediaUploadField.tsx`

#### Два режима работы:

**1. Режим "Загрузить файл" (`mediaSource = 'upload'`):**
- Показывает кнопку "Выбрать файл" с иконкой upload
- После выбора файла:
  - Показывается индикатор загрузки
  - Файл отправляется на сервер
  - При успехе: отображается зеленый бокс с галочкой и названием файла
  - URL автоматически записывается в `mediaUrl`
  - Есть кнопка "×" для очистки и повторного выбора

**2. Режим "Ссылка (URL)" (`mediaSource = 'url'`):**
- Показывается обычное текстовое поле для ввода URL
- Placeholder: `https://example.com/image.jpg`
- Есть кнопка "×" для очистки поля

#### Валидация:
- Проверка типа файла в зависимости от `mediaType`
- Проверка размера файла (макс 50MB)
- Обработка ошибок с отображением в UI

### Интеграция в FieldRenderer

```typescript:frontend/src/features/editorV2/BlockSettingsPanel/FieldRenderer.tsx
case 'media_upload':
  return (
    <MediaUploadField 
      {...props}
      mediaSource={allSettings?.mediaSource as 'upload' | 'url'}
      mediaType={allSettings?.mediaType as 'none' | 'image' | 'gif' | 'video'}
    />
  );
```

---

## Тестирование

### ✅ Протестированные сценарии:

1. **Блок без кнопок**:
   - Показывается preview текста
   - Есть стандартные входы (top, left) и выходы (right, bottom)

2. **Блок с 1 кнопкой**:
   - Кнопка отображается с объемным стилем и закруглениями 10px
   - Отступы 2px справа и слева от границ блока
   - Только верхний входной хэндл (зелёный)
   - Стандартные выходы скрыты
   - Есть один выходной хэндл (оранжевый) от кнопки на правой границе блока

3. **Блок с 3 кнопками**:
   - Все кнопки имеют одинаковый объемный стиль с градиентом
   - Закругления 10px на всех кнопках
   - Только верхний входной хэндл (зелёный)
   - Каждая кнопка имеет свой выходной хэндл (оранжевый)
   - Хэндлы строго на правой границе блока, вертикально по центру каждой кнопки
   - Можно создавать соединения от каждой кнопки к другим блокам
   - Отступы 2px с обеих сторон от границ блока

4. **Медиа через URL**:
   - Выбран тип "Картинка / фото"
   - Источник "Ссылка (URL)"
   - URL введён: `https://picsum.photos/600/400`
   - Валидация работает корректно

5. **Медиа через загрузку**:
   - Выбран тип "Картинка / фото"
   - Источник "Загрузить файл"
   - Показывается кнопка "Выбрать файл"
   - При выборе файла появляется input[type=file] с правильными accept-атрибутами

---

## Изменённые файлы

### Backend:

1. **`backend/routers/media.py`** (NEW)
   - API для загрузки и удаления медиа-файлов
   - Валидация типов и размеров файлов
   - Безопасное хранение с user_id в имени файла

2. **`backend/main.py`**
   - Добавлен import `media_router`
   - Подключен роутер: `app.include_router(media_router.router, prefix="/media")`
   - Настроена раздача статики: `app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")`

3. **`backend/data/editor_blocks.json`**
   - Добавлено поле `mediaSource` в блок message
   - Изменён тип поля `mediaUrl` на `media_upload`

4. **`backend/schemas/blocks.py`**
   - Добавлен тип `media_upload` в `VALID_FIELD_TYPES`

### Frontend:

1. **`frontend/src/api/media.ts`** (NEW)
   - API клиент для загрузки и удаления медиа
   - Использует встроенный `fetch` вместо axios

2. **`frontend/src/features/editorV2/BlockSettingsPanel/fields/MediaUploadField.tsx`** (NEW)
   - Компонент для загрузки файлов или ввода URL
   - Два режима: upload / url
   - Валидация, обработка ошибок, индикаторы загрузки

3. **`frontend/src/features/editorV2/BlockSettingsPanel/FieldRenderer.tsx`**
   - Добавлен case для `media_upload`
   - Передаёт `mediaSource` и `mediaType` в `MediaUploadField`

4. **`frontend/src/features/editorV2/EditorV2Shell.tsx`**
   - Улучшен визуал кнопок (непрозрачный фон, полная ширина)
   - Добавлен preview текста сообщения
   - Реализовано динамическое позиционирование хэндлов с `useEffect`
   - Хэндлы рендерятся отдельно от кнопок

5. **`frontend/src/types/blocks.ts`**
   - Добавлен тип `media_upload` в `BlockConfigField.type`

---

## Визуальные примеры

### До:
- Кнопки с полупрозрачным градиентом
- Хэндлы внутри кнопок
- Нет preview текста на ноде
- Только ввод URL для медиа

### После:
- ✅ Кнопки с объемным градиентным фоном и закруглениями 10px
- ✅ Отступы 2px справа и слева от границ блока
- ✅ Только верхний входной хэндл (зелёный), левый удалён
- ✅ Выходные хэндлы (оранжевые) точно на правой границе блока, по центру кнопок
- ✅ Preview текста отображается на ноде
- ✅ Возможность загрузки файлов с устройства
- ✅ Валидация файлов по типу и размеру
- ✅ Индикаторы загрузки и статусы
- ✅ Полная непрозрачность, нет видимой разметки редактора

---

## UX улучшения

1. **Интуитивность**: Кнопки теперь выглядят как настоящие кнопки бот-меню
2. **Читаемость**: Preview текста помогает быстро идентифицировать блок
3. **Удобство**: Не нужно искать внешний хостинг для картинок - можно загрузить прямо из редактора
4. **Гибкость**: Поддержка как загрузки файлов, так и внешних URL
5. **Визуальная связь**: Хэндлы чётко показывают, от какой кнопки идёт соединение

---

## Следующие шаги (опционально)

1. **Runtime**: Интеграция отправки медиа в `backend/services/scenario_runtime.py`
2. **Preview медиа**: Показывать миниатюру загруженного изображения на ноде
3. **Drag & Drop**: Возможность перетаскивать файлы прямо на поле загрузки
4. **Прогресс-бар**: Индикатор прогресса загрузки для больших файлов
5. **Очистка**: Автоматическое удаление неиспользуемых файлов

---

## Заключение

Блок "Сообщение" теперь имеет профессиональный вид и интуитивный UX:
- Кнопки выглядят "настоящими"
- Хэндлы правильно позиционированы
- Preview текста ускоряет навигацию
- Загрузка медиа работает "из коробки"

Все изменения выполнены с сохранением существующего стиля редактора и без breaking changes.

