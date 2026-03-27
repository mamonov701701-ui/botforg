# block_message_spec

Техническая спецификация блока `message` в редакторе сценариев (frontend) и каталоге `editor_blocks.json`. Основана на коде: `frontend` (панель «Сообщение», `schemaValidation`, `scenarioRunner`, `ChatPreview`, `messageMedia`, `messageButton`) и `backend/data/editor_blocks.json`.

Исключения: поведение Telegram/других каналов при **реальной** отправке не описано здесь, если нет ссылки на backend-обработчик в этом репозитории.

---

## 1. Назначение блока

- Узел сценария с `blockId` / типом `message`.
- Формирует сообщение бота: текст, опционально медиа, опционально кнопки.
- В симуляторе (`scenarioRunner` + `ChatPreview`): отображение текста с `parseMode`, рендер `media`, обработка кнопок `next` | `url`.

---

## 2. Структура данных (`node.data.settings`)

Поля ниже — фактически используемые в UI и/или в валидации/превью. Каталог может содержать дополнительные ключи для совместимости; в UI формы сообщения часть полей **не отображается** (см. §4).

| Имя | Тип (логический) | Обяз. (schema) | Допустимые значения | По умолчанию (каталог) | Влияние на preview | Влияние на валидацию |
|-----|------------------|----------------|----------------------|-------------------------|----------------------|------------------------|
| `text` | string | **да** | произвольная строка | — | `buildMessageFromNode` → `SimulatorMessage.text`; fallback: `settings.title` / `data.title` / `data.label` / `Блок {id}` | Пусто → `missingFields`: label поля из schema (`Что отправить пользователю?`) |
| `parseMode` | string | нет | `Plain` \| `Markdown` \| `HTML` (иные → `Plain` через `parseModeForSimulator`) | `Plain` | `ChatPreview`: Plain / подмножество Markdown / HTML+DOMPurify | Нет отдельных правил |
| `mediaType` | string | нет | `none` \| `image` \| `gif` \| `video` | `none` | Через `normalizeMessageMediaFromSettings`; при `none` и пустом списке медиа нет | Если ≠ `none` → см. §5 медиа |
| `mediaList` | array | нет | элементы: `{ url, type?, source?, fileName? }` | — | Нормализация в `MessageMediaItem[]`; пустые `url` отбрасываются | Если `mediaType` активен — см. §5 |
| `mediaUrl` | string | нет (legacy) | URL | — | Используется, если `mediaList` пуст | Как один элемент при активном `mediaType` |
| `buttons` | array | нет | см. §кнопки | — | Маппинг в `SimulatorMessage.buttons` с `id`, `label`, `sourceHandle: button_{i}`, `action` | См. §5 |
| `disablePreview` | boolean | нет | — | `false` | **Не используется** в `ChatPreview` / `scenarioRunner` | Не валидируется отдельно |
| `saveLastMessageId` | boolean | нет | — | `false` | **Не используется** в preview | Не валидируется отдельно |

**Кнопка (элемент `buttons[]`):**

| Поле | Тип | Обяз. | Допуск | Default / нормализация | Preview |
|------|-----|-------|--------|------------------------|---------|
| `id` | string | нет | — | `btn_{index}` если нет | `buttonId` в клике |
| `label` | string | да* | непустой после trim | — | Текст кнопки |
| `action` | string | нет | после нормализации: `next` \| `url` | всё кроме `url` → `next` (`branch` и др. → `next`) | Ветвление в `applyUserChoice` |
| `url` | string | условно | при `action===url`: non-empty, `^https?://` | — | `window.open` при `url` |

\*Обязательность через спецправила, не через `required` в JSON кнопки.

---

## 3. Зависимости

- `configSchema`: поле `mediaList` имеет `dependsOn`: показывается/валидируется как зависимое только когда `mediaType !== "none"` (инверсия от `none`).
- **Кнопка `action === 'url'`** (после `normalizeMessageButtonAction`): требуется непустой `url` с префиксом `http://` или `https://`.
- **Кнопка `action === 'next'`** (по смыслу сценария): в preview переход только если есть ребро от `sourceHandle` / `buttonId` соответствующей кнопки; иначе `resolveNextNodeId` → `null`, системное сообщение об ошибке (не падение).
- **`mediaType`** ∈ {`image`,`gif`,`video`}: каждый элемент `mediaList` (или legacy `mediaUrl`) должен быть согласован с объявленным типом (MIME при загрузке; URL+stored type при валидации — см. `schemaValidation` и `messageMedia`).

---

## 4. Ограничения

- Один блок — **один** `mediaType` из перечисленных; все элементы `mediaList` должны соответствовать этому типу (смешение типов в одном блоке не допускается правилами и UI).
- **MIME (загрузка):** `image`: jpeg, png, webp; `gif`: gif; `video`: mp4, webm, quicktime, mpeg.
- **Размер файла (UI):** 50 MB (`MediaListField`).
- **Кнопок не более 10.**
- **`branch` как действие** в данных не используется как отдельная ветка: нормализуется в `next`.
- **`disablePreview`, `saveLastMessageId`:** в каталоге есть, в форме «Сообщение» **не показываются**; в JSON сценария могут сохраняться; на preview в коде фронта не влияют.

---

## 5. Валидация (`validateNodeSettings` + schema required)

**Блок валиден**, если `missingFields.length === 0`.

**Возможные сообщения (не исчерпывающе для других блоков):**

- Из schema (required): пустой `text` → метка поля `text`.
- Кнопки: `Текст кнопки {n}`; `URL кнопки {n}`; `URL кнопки {n}: укажите адрес с http:// или https://`; `Слишком много кнопок (максимум 10)`.
- Медиа (если `mediaType` задан и ≠ `none`):
  - `Медиа-файлы: добавьте хотя бы один файл или ссылку`
  - `Медиа {n}: укажите файл или ссылку`
  - `Медиа {n}: ссылка должна начинаться с http:// или https://`
  - `Медиа {n}: несовпадение с типом «{declared}» (...)` / `Медиа (ссылка): ...`
  - legacy: `Медиа: ссылка должна начинаться...`

Сравнение типа медиа: логика `inferred` из URL + опционально `stored` `type` элемента (`schemaValidation`).

---

## 6. Поведение в preview

### Формирование сообщения

- `buildMessageFromNode`: собирает `text`, `parseMode` (`parseModeForSimulator`), `buttons` (нормализация `action`), `media` через `normalizeMessageMediaFromSettings`.

### Текст

- **Plain:** как строка, `white-space: pre-wrap`.
- **Markdown:** экранирование `<>&`, затем regex: `**..**` → strong, `__..__` → em, `[text](https?..)` → `<a>`, `\n` → `<br>`; санитизация тегов `strong,em,a,br,code`.
- **HTML:** `DOMPurify` с `USE_PROFILES: { html: true }`.

Подстановка `{{variables}}` в текст в `buildMessageFromNode` **не выполняется**.

### Медиа

- Для каждого элемента: `gif`/`image` → `<img>`; `video` → `<video controls playsInline>`.

### Кнопки

- `applyUserChoice`: если выбор по кнопке (`buttonId` или `sourceHandle`), отдельный пузырь пользователя с текстом кнопки **не добавляется** в историю (в отличие от свободного ввода).
- `action === url`: пустой `url` → системная ошибка, узел не меняется; иначе `window.open(url, '_blank', 'noopener,noreferrer')`, переход по графу **не выполняется**.
- `action === next`: `resolveNextNodeId` с `buttonId` / `sourceHandle`; при отсутствии подходящего ребра для `message`/`start` — `null`, сообщение об ошибке (текст зависит от `isNext`).

---

## 7. Правила для BF-агента

**Рекомендовать `message`, когда:**

- Нужно вывести текст/медиа/кнопки пользователю без записи ответа в переменную через этот блок.
- Однотипные вложения в рамках одного шага.

**Не рекомендовать `message` как замену:**

- Сбор ответа → `input`.
- Ветвление по данным → `condition` (и др.).
- Задержка → `wait`.
- Смена сценария → `go_to_scenario`.
- Несовместимые типы медиа в одном шаге → два блока `message` или отдельный дизайн сценария.

**Альтернативы:** `input`, `condition`, `wait`, `go_to_scenario`, `variable` (системные шаги).

---

## 8. Примеры

### Валидные (минимум 5)

1. `{ "text": "Привет" }` (остальное по умолчанию / отсутствует).
2. `{ "text": "X", "parseMode": "Plain", "mediaType": "none" }`.
3. `{ "text": "Фото", "mediaType": "image", "mediaList": [{ "url": "https://example.com/a.png", "type": "image", "source": "url" }] }`.
4. `{ "text": "Выберите", "buttons": [{ "id": "a", "label": "Ок", "action": "next" }], "mediaType": "none" }` + на графе ребро от `button_0`.
5. `{ "text": "Сайт", "buttons": [{ "id": "u", "label": "Сайт", "action": "url", "url": "https://example.com" }], "mediaType": "none" }`.

### Невалидные (минимум 5)

1. `{ "text": "" }` или отсутствует `text` — нарушение required.
2. `{ "text": "x", "mediaType": "image", "mediaList": [] }` — нет вложений.
3. `{ "text": "x", "mediaType": "image", "mediaList": [{ "url": "https://x.com/v.mp4", "type": "video" }] }` — несовпадение с типом `image` (при несовпадении inferred/stored с declared).
4. `{ "text": "x", "buttons": [{ "label": "", "action": "next" }] }` — пустой label.
5. `{ "text": "x", "buttons": [{ "label": "u", "action": "url" }] }` — нет `url`.
6. `{ "text": "x", "buttons": [{ "label": "u", "action": "url", "url": "ftp://a" }] }` — неверный протокол.
7. 11 кнопок — ошибка лимита.

*(Примеры 6–7 расширяют требование «≥5 невалидных».)*

---

## 9. Изменения UI без смены контракта

- Смена `mediaType` в панели может очищать `mediaList` / `mediaUrl` и фильтровать несовместимые элементы (`BlockSettingsPanel.handleFieldChange`).

---

*Версия: по коду ревизии, включающей `MessageBlockSettingsForm`, `MediaListField` variant `compact`, и правила выше.*
