/**
 * API клиент для работы со сценариями
 */

import * as api from './client';

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
