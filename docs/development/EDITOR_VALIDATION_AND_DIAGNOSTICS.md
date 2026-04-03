# Редактор V2: валидация и диагностика сценария

Документ для разработчиков: пайплайн проверки схемы блоков и консистентности графа, хранилища, устойчивость к лишним обновлениям и к ошибкам API переменных.

## Назначение

- **Схема блоков** — обязательные поля настроек узла по `configSchema` (`validateNodeSettings` в `frontend/src/utils/schemaValidation.ts`).
- **Консистентность** — переменные, плейсхолдеры, связи между блоками (`scenarioConsistency.ts`, `editorScenarioValidation.ts`).

Результаты попадают в UI: индикаторы на узлах (`CustomNode`), панель настроек (`BlockSettingsPanel`), модальное окно **«Проверка сценария»** (`ValidationModal.tsx`), сводка в шапке (`EditorValidationSummaryBar.tsx`).

## Хранилища (Zustand)

| Store | Назначение | Защита от лишних обновлений |
|-------|------------|----------------------------|
| `validationStore` | `Map<nodeId, ValidationResult>` | `setAllValidationResults` — `validationResultsMapEqual`; `setValidationResult` — `validationResultEqual` (`validationCompare.ts`) |
| `scenarioDiagnosticsStore` | Плоский список + `byNodeId`; пустой узел — **стабильная ссылка** `SCENARIO_DIAGNOSTICS_EMPTY_NODE` | `setDiagnostics` — `scenarioDiagnosticsEqual` |
| `scenarioStore` | `hasValidationErrors` и пр. | `setValidationStatus` — без записи, если флаг не меняется |
| `editorStore` | `editorScenarioValidationVars` (ключи ctor для проверки при сохранении) | `setEditorScenarioValidationVars` — поверхностное сравнение массивов ключей |

**Важно:** селекторы вида `map.get(id) ?? []` для подписки React **недопустимы** — каждый раз новый `[]` даёт ложное изменение снимка и цикл ререндеров. Используйте `SCENARIO_DIAGNOSTICS_EMPTY_NODE` или мемоизированный селектор.

## Пайплайн

- **`runEditorValidationPipeline(nodes, edges, options)`** (`editorScenarioValidation.ts`).
- По умолчанию только вычисление; запись в `validationStore` / `scenarioDiagnosticsStore` — при **`syncStores: true`**.
- В `EditorV2Shell` ручная и автоматическая проверка вызывают pipeline с **`syncStores: true`**.

Автопроверка в оболочке редактора: `useEffect` с зависимостями `storeGraphSignature`, `ctorVarKeys`, `ctorSysKeys`, `catalog`; внутри — **debounce 120 ms** (сброс предыдущего таймера), чтобы не устраивать «шторм» при пакетных обновлениях.

В **панели настроек** валидация выбранного узла: debounce **60 ms** + сравнение с предыдущим результатом перед `setValidationResult`.

## Переменные конструктора (ctor)

- Загрузка: **`GET /bots/{bot_id}/variable-definitions`** (см. backend `routers/bot.py`).
- Фронт в оболочке редактора: **`fetchVariableDefinitionsSafe`** (`frontend/src/api/botMessageTemplate.ts`) — при любой ошибке сети/404/500 возвращается пустой безопасный ответ; редактор остаётся работоспособным, проверка идёт с пустым списком объявленных ключей.
- Ключи попадают в `editorStore.editorScenarioValidationVars`; при **неизменном** наборе ключей store **не обновляется** (guard в `setEditorScenarioValidationVars`).

## UI и язык

- Тексты модалки проверки и подписи в `scenarioDiagnosticUi.ts` — **русские** для известных кодов диагностики.
- Неизвестный код диагностики: заголовок **«Проблема проверки сценария»**, не сырой идентификатор кода.
- В подсказках (hints) могут встречаться технические термины (`variable_key`, `user.`, `system.`) для однозначности; основной текст ошибок по возможности на русском.

## Тесты

- `frontend/tests/unit/validationStoresStability.test.ts` — отсутствие лишних уведомлений подписчиков при идентичных `setDiagnostics`, `setAllValidationResults`, `setValidationResult`, `setEditorScenarioValidationVars`; pipeline `syncStores`; стабильность пустой ссылки.
- `frontend/tests/unit/scenarioDiagnosticUi.test.ts` — отображение диагностик.

## Связанные файлы

- `frontend/src/features/editorV2/EditorV2Shell.tsx` — sync ctor vars, автопроверка, `runValidation`
- `frontend/src/features/editorV2/ValidationModal.tsx`
- `frontend/src/features/editorV2/EditorValidationSummaryBar.tsx`
- `frontend/src/features/editorV2/BlockSettingsPanel/index.tsx`
- `frontend/src/utils/validationCompare.ts`
- `frontend/src/utils/scenarioDiagnosticUi.ts`
- `frontend/src/utils/editorScenarioValidation.ts`
