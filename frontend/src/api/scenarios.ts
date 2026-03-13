/**
 * API клиент для работы со сценариями
 */

import * as api from './client';

/**
 * Нормализованный snapshot опубликованного сценария для runtime.
 *
 * Backend может хранить его в отдельном поле (например, published_content_runtime)
 * и использовать как вход для движка выполнения сценариев.
 *
 * ВАЖНО: структура намеренно не зависит от React Flow и UI.
 * Она синхронизирована с frontend‑типами из `src/utils/runtimeNormalization.ts`.
 */
export interface PublishedRuntimeSnapshot {
  nodes: {
    id: string;
    blockId: string;
    title?: string;
    settings: Record<string, unknown>;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    routing?: {
      buttonId?: string;
      conditionValue?: string | number | boolean | null;
      [key: string]: unknown;
    };
  }[];
  startNodeId: string | null;
  meta: {
    schemaVersion: number;
  };
}

export interface Scenario {
  id: number;
  user_id: number;
  bot_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  is_main: boolean;
  is_library: boolean;
  is_standard: boolean;
  is_public: boolean;
  content: {
    nodes: any[];
    edges: any[];
  } | null;
  /**
   * Оригинальный опубликованный контент (редакторский граф).
   * Может содержать UI‑поля и React Flow‑специфику.
   */
  published_content?: { nodes: any[]; edges: any[] } | null;
  /**
   * TODO (backend): добавить хранение нормализованного runtime‑snapshot,
   * совместимого с PublishedRuntimeSnapshot, чтобы избежать повторной
   * нормализации при каждом запуске сценария.
   *
   * Пример серверного поля:
   *   published_content_runtime: PublishedRuntimeSnapshot | null;
   */
  status: 'draft' | 'published' | 'archived';
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ScenarioCreate {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: {
    nodes: any[];
    edges: any[];
  };
  bot_id?: number;
  is_library?: boolean;
  is_main?: boolean;
}

export interface ScenarioUpdate {
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: {
    nodes: any[];
    edges: any[];
  };
  order?: number;
}

/**
 * DTO для передачи runtime‑snapshot на backend для исполнения.
 * Пока используется только на frontend как контракт для будущего API.
 */
export interface ScenarioRuntimeExecuteRequest {
  /** ID сценария, который будет выполняться (published). */
  scenarioId: number;
  /** Нормализованный runtime‑snapshot, см. PublishedRuntimeSnapshot. */
  runtime: PublishedRuntimeSnapshot;
  /**
   * Начальный контекст выполнения (переменные, пользователь, и т.п.).
   * Backend может расширить/уточнить этот контракт.
   */
  context?: Record<string, unknown>;
}

/**
 * Получить все сценарии бота
 */
export async function getBotScenarios(botId: number): Promise<Scenario[]> {
  return api.get(`/scenarios/bot/${botId}`);
}

/**
 * Получить все сценарии текущего пользователя
 */
export async function getMyScenarios(): Promise<Scenario[]> {
  return api.get('/scenarios/my');
}

/**
 * Получить сценарии из библиотеки
 */
export async function getLibraryScenarios(category?: string): Promise<Scenario[]> {
  const url = category ? `/scenarios/library?category=${category}` : '/scenarios/library';
  return api.get(url);
}

/**
 * Создать новый сценарий
 */
export async function createScenario(data: ScenarioCreate): Promise<Scenario> {
  return api.post('/scenarios/', data);
}

/**
 * Обновить сценарий
 */
export async function updateScenario(scenarioId: number, data: ScenarioUpdate): Promise<Scenario> {
  return api.put(`/scenarios/${scenarioId}`, data);
}

/**
 * Удалить сценарий
 */
export async function deleteScenario(scenarioId: number): Promise<void> {
  return api.del(`/scenarios/${scenarioId}`);
}

/**
 * Сохранить сценарий в библиотеку
 */
export async function saveToLibrary(
  scenarioId: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    icon?: string;
  }
): Promise<Scenario> {
  const params = new URLSearchParams();
  if (data.name) params.append('name', data.name);
  if (data.description) params.append('description', data.description);
  if (data.category) params.append('category', data.category);
  if (data.icon) params.append('icon', data.icon);

  const url = `/scenarios/${scenarioId}/save-to-library${params.toString() ? '?' + params.toString() : ''}`;
  return api.post(url);
}

/**
 * Добавить сценарий из библиотеки в бот
 */
export async function addFromLibrary(
  libraryScenarioId: number,
  botId: number,
  name?: string
): Promise<Scenario> {
  const params = new URLSearchParams();
  params.append('bot_id', botId.toString());
  if (name) params.append('name', name);

  const url = `/scenarios/library/${libraryScenarioId}/add-to-bot?${params.toString()}`;
  return api.post(url);
}

/**
 * Блок внутри сценария
 */
export interface ScenarioNode {
  id: string;
  title: string;
  block_type: string;
  icon?: string;
}

/**
 * Получить список блоков внутри сценария
 */
export async function getScenarioNodes(scenarioId: number): Promise<ScenarioNode[]> {
  return api.get(`/scenarios/${scenarioId}/nodes`);
}

/**
 * Версия сценария
 */
export interface ScenarioVersion {
  id: number;
  version: number;
  created_at: string;
  is_active: boolean;
}

/**
 * Получить список версий сценария
 */
export async function getScenarioVersions(scenarioId: number): Promise<ScenarioVersion[]> {
  return api.get(`/scenarios/${scenarioId}/versions`);
}

/**
 * Восстановить сценарий из версии
 */
export async function restoreScenarioVersion(
  scenarioId: number,
  versionId: number
): Promise<Scenario> {
  return api.post(`/scenarios/${scenarioId}/restore/${versionId}`);
}

/**
 * Опубликовать сценарий (draft -> published)
 */
export async function publishScenario(scenarioId: number): Promise<Scenario> {
  return api.post(`/scenarios/${scenarioId}/publish`);
}

/**
 * TODO: Backend runtime execution endpoint.
 *
 * ПРЕДПОЛАГАЕМЫЙ контракт:
 * - backend принимает нормализованный runtime‑snapshot + контекст
 * - возвращает первый "шаг" выполнения (сообщение, next node, и т.п.)
 *
 * Пока это заглушка, чтобы зафиксировать точку интеграции и типы.
 */
export async function executeScenarioRuntime(payload: ScenarioRuntimeExecuteRequest): Promise<any> {
  // TODO: заменить URL и тип ответа после реализации backend‑эндпоинта
  return api.post('/scenarios/runtime/execute', payload);
}
