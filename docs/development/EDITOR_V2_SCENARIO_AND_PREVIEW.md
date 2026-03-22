# Редактор V2: сценарии и предпросмотр

Документ для разработчиков: хаб сценариев, копирование, рёбра/handles, симулятор.

## Источник правды

- **`scenarioStore`** — единственный источник `nodes` / `edges` и метаданных сценария.
- **React Flow** в `EditorV2Shell` синхронизируется со store (не дублировать граф вне store).
- В **`EditorControls`** не вызывать `setNodes` / `setEdges` напрямую.

## Меню «Сценарий» (`ScenarioHubDropdown`)

- В выпадающем списке только: сценарии **текущего бота**, **+ Новый сценарий**, **Добавить из моих сценариев**, **Импорт JSON**.
- Длинные списки «все мои» — в модалке **`AddScenarioFromMineModal`** (поиск по названию).
- **«Добавить из моих»** создаёт **копию** через `createScenario` с контентом исходника (не меняет `bot_id` оригинала).
- Переименование из строки списка: inline input, сохранение через **`scenarioStore.renameScenario`** → `updateScenario` (только `name`).

## Handles рёбер и React Flow

Узел **`CustomNode`** в `EditorV2Shell` отдаёт разные наборы handles:

| Тип узла | Target (вход) | Source (выход) |
|----------|---------------|----------------|
| `start` | `top` | `bottom` |
| `message` с кнопками | `top` | `button_0` … |
| Остальные | `top`, `left` | `right`, `bottom` |

В старых данных часто встречается **`targetHandle: "left"`** на вход в старт или message+кнопки — у таких узлов handle `left` **нет**, React Flow выдаёт ошибку про несуществующий handle.

**Нормализация:** `frontend/src/utils/flowHandleCompatibility.ts` — функция **`normalizeScenarioEdges`**. Она применяется:

- при синхронизации **store → React Flow** в `EditorV2Shell`;
- при построении графа для предпросмотра в **`BotSimulator`**.

## Предпросмотр (`BotSimulator` + `scenarioRunner`)

### Контракт `stepFromCurrentNode` / `applyUserChoice`

Обе функции возвращают **`RunStepResult`**:

```ts
{ context: RuntimeContext; waitingForUser: boolean }
```

Поля **`state` нет.** В UI состояние симулятора — это **`SimulatorState`**, его нужно собирать из **`context`** (например `currentNodeId`, `history`, `variables`, `lastUserInput`).

Ошибка вида `Cannot read properties of undefined (reading 'history')` возникает, если деструктурировать несуществующее `state` вместо `context`.

### Защита

- `history` в UI всегда как массив (через хелпер маппинга из `context`).
- При отсутствии `context` или пустом графе — сообщение пользователю на русском, без падения всего дерева React.

## Связанные файлы

- `frontend/src/features/editorV2/ScenarioHubDropdown.tsx`
- `frontend/src/features/editorV2/AddScenarioFromMineModal.tsx`
- `frontend/src/features/editorV2/NewScenarioNameModal.tsx`
- `frontend/src/features/editorV2/EditorControls.tsx`
- `frontend/src/utils/flowHandleCompatibility.ts`
- `frontend/src/features/simulator/BotSimulator.tsx`
- `frontend/src/features/simulator/scenarioRunner.ts`
- `frontend/src/stores/scenarioStore.ts`
