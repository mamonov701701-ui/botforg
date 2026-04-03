# Реляционное ядро конструктора (ctor_*)

Дополняет существующие сущности **`users`**, **`bots`**, **`scenarios`** (JSON-граф), **`bot_tags`** / **`bot_user_states`** — **не заменяет** их.

## Имена таблиц

| В ТЗ (логически) | Таблица в БД | Примечание |
|------------------|--------------|------------|
| platform_users | `platform_users` | Учётные записи контура конструктора |
| bots | `ctor_bots` | Конфликт с таблицей `bots` снят префиксом |
| bot_users | `ctor_bot_users` | Собеседники по каналу |
| scenarios | `ctor_scenarios` | Конфликт с `scenarios` снят префиксом |
| blocks | `ctor_blocks` | Узлы графа в БД |
| block_edges | `ctor_block_edges` | Рёбра |
| bot_variable_definitions | `ctor_bot_variable_definitions` | |
| bot_user_variables | `ctor_bot_user_variables` | |
| bot_tags | `ctor_bot_tags` | Конфликт с `bot_tags` снят префиксом |
| bot_user_tags | `ctor_bot_user_tags` | |
| bot_user_sessions | `ctor_bot_user_sessions` | |
| bot_user_events | `ctor_bot_user_events` | |

## Миграция

`backend/migrations/versions/constructor_core_015.py` (revision `constructor_core_015`).

## Модели и сиды

- Модели: `backend/models/constructor_core.py`
- Системные переменные (`user_name`, `phone`, `email`, `last_input`): `backend/seeds/constructor_system_variables.py` — вызов `ensure_system_variable_definitions(db, bot_id)` после создания `CtorBot`
- Схемы API: `backend/schemas/constructor_core.py`

## Связь entry_block_id

Внешний ключ `ctor_scenarios.entry_block_id` → `ctor_blocks.id` создаётся в миграции после создания `ctor_blocks` (избежание цикла ORM).

## Сервисы и репозитории

Пакет `backend/services/constructor/`: `VariableService`, `TagService`, `SessionService`, `EventLogService`, репозитории в `repositories/`, тип `ServiceResult`, DTO в `dto.py`. События `variable_set`, `tag_added`, `tag_removed`, `block_entered` пишутся в `ctor_bot_user_events`.

## Рендер шаблонов ({{ user_name }}, {{ user.first_name }}, {{ system.last_input }})

- **Backend:** `backend/services/template_render/` — `TemplateRenderService`, чистая функция `render_template`, `extract_placeholder_keys`. Без `eval` и полноценного Jinja; допускаются только идентификаторы и точки в плейсхолдере (под будущие фильтры символ `|` не используется).
- **Предпросмотр:** `frontend/src/lib/templateRender.ts` — тот же синтаксис; `buildSimulatorTemplateContext` + `renderForSimulator` подключены в `scenarioRunner.ts` для текста сообщений и подписей кнопок.
