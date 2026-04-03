import { get, post } from './client';

export interface VariableDefinitionItem {
  key: string;
  label: string | null;
  data_type: string;
  is_system: boolean;
  scope: string | null;
}

export interface VariableDefinitionsResponse {
  ctor_bot_linked: boolean;
  ctor_bot_id: number | null;
  items: VariableDefinitionItem[];
}

export interface MessageTemplateDiagnosticsResponse {
  placeholder_keys: string[];
  unknown_keys: string[];
  defined_variable_keys: string[];
  system_keys: string[];
  ctor_bot_linked: boolean;
}

export function fetchVariableDefinitions(botId: number): Promise<VariableDefinitionsResponse> {
  return get(`/bots/${botId}/variable-definitions`);
}

const EMPTY_VARIABLE_DEFINITIONS: VariableDefinitionsResponse = Object.freeze({
  ctor_bot_linked: false,
  ctor_bot_id: null,
  items: [],
});

/**
 * Загрузка определений переменных без падения редактора (404, сеть, старый бэкенд).
 * Маршрут: GET /bots/{id}/variable-definitions (см. backend routers/bot.py).
 */
export async function fetchVariableDefinitionsSafe(
  botId: number
): Promise<VariableDefinitionsResponse> {
  try {
    return await fetchVariableDefinitions(botId);
  } catch {
    return { ...EMPTY_VARIABLE_DEFINITIONS, items: [...EMPTY_VARIABLE_DEFINITIONS.items] };
  }
}

export function postMessageTemplateDiagnostics(
  botId: number,
  text: string
): Promise<MessageTemplateDiagnosticsResponse> {
  return post(`/bots/${botId}/message-template-diagnostics`, { text });
}
