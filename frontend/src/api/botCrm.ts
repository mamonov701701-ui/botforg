/**
 * Mini-CRM API (ctor-пользователи, переменные, теги платформенного бота).
 * Пути: /bots/{botId}/crm/...
 */
import api from './client';
export type CrmEnvironmentFilter = 'prod' | 'dev' | 'all';
export const SESSION_FILTER_NONE = '__none__';

export const SNAKE_KEY_RE = /^[a-z][a-z0-9_]*$/;

export function validateSnakeKey(key: string): string | undefined {
  const t = key.trim();
  if (!t) return 'Введите ключ';
  if (!SNAKE_KEY_RE.test(t)) return 'Только snake_case: a-z, цифры, _, с буквы';
  return undefined;
}

/** Ключ тега CRM: буква в начале (в т.ч. кириллица), далее буквы, цифры, _. */
export function validateTagKey(key: string): string | undefined {
  const t = key.trim();
  if (!t) return 'Введите ключ';
  if (t.length > 128) return 'Слишком длинный ключ';
  if (!/^[\p{L}]/u.test(t)) return 'Ключ должен начинаться с буквы';
  if (!/^[\p{L}][\p{L}\p{N}_]*$/u.test(t)) {
    return 'Только буквы, цифры и подчёркивание';
  }
  return undefined;
}

export interface CrmTagBrief {
  key: string;
  label?: string | null;
  color?: string | null;
}

export interface CrmUserListItem {
  id: number;
  display_name: string;
  channel: string;
  phone?: string | null;
  email?: string | null;
  tags: CrmTagBrief[];
  last_message_at?: string | null;
  current_scenario_id?: number | null;
  current_scenario_name?: string | null;
  current_block_id?: number | null;
  current_block_label?: string | null;
  session_status?: string | null;
  /** Статус контакта (CtorBotUser.status), задаётся сценарием «Данные пользователя» и CRM. */
  contact_status?: string;
  environment: string;
  created_at: string;
}

export interface CrmUserListResponse {
  total: number;
  page: number;
  page_size: number;
  items: CrmUserListItem[];
}

export interface CrmSession {
  id: number;
  scenario_id: number;
  scenario_name?: string | null;
  current_block_id?: number | null;
  current_block_label?: string | null;
  status: string;
  updated_at: string;
  started_at: string;
}

export interface CrmUserDetail {
  id: number;
  bot_id: number;
  channel: string;
  external_user_id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  language_code?: string | null;
  status: string;
  environment: string;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
  display_name: string;
  session?: CrmSession | null;
}

export interface CrmUserVariable {
  key: string;
  definition_id: number;
  data_type: string;
  scope: string;
  is_system: boolean;
  value: unknown;
}

export interface CrmEvent {
  id: number;
  event_type: string;
  created_at: string;
  session_id?: number | null;
  scenario_id?: number | null;
  block_id?: number | null;
  payload_json?: Record<string, unknown> | null;
}

export interface CrmVariableDef {
  id: number;
  key: string;
  label?: string | null;
  data_type: string;
  is_system: boolean;
  is_archived: boolean;
  used_in_blocks_count: number;
  used_in_scenarios_count: number;
  /** Сколько контактов имеют непустое значение этого поля. */
  contacts_with_value_count: number;
  updated_at: string;
}

export interface CrmVariableUsageRef {
  block_id: number;
  scenario_id: number;
  scenario_name: string;
  block_type: string;
  block_name?: string | null;
}

export interface CrmTagDef {
  id: number;
  key: string;
  label?: string | null;
  color?: string | null;
  users_count: number;
  updated_at: string;
}

export interface CrmOverviewTagRow {
  key: string;
  label?: string | null;
  contacts_count: number;
}

export interface CrmOverviewStatusRow {
  status: string;
  contacts_count: number;
}

export interface CrmOverviewProfileCompleteness {
  total_contacts: number;
  with_name: number;
  with_phone: number;
  with_email: number;
  fully_filled: number;
}

export interface CrmOverviewScenarioProgress {
  in_progress: number;
  completed: number;
}

export interface CrmOverviewTrendValue {
  current: number;
  previous: number;
  delta: number;
}

export interface CrmOverviewTrends {
  total_contacts: CrmOverviewTrendValue;
  new_contacts_7d: CrmOverviewTrendValue;
  active_contacts_7d: CrmOverviewTrendValue;
  sleeping_contacts_7d: CrmOverviewTrendValue;
  sleeping_contacts_30d: CrmOverviewTrendValue;
}

export interface CrmOverview {
  total_contacts: number;
  new_contacts_7d: number;
  active_contacts_7d: number;
  sleeping_contacts_7d: number;
  sleeping_contacts_30d: number;
  profile_completeness: CrmOverviewProfileCompleteness;
  top_tags: CrmOverviewTagRow[];
  statuses: CrmOverviewStatusRow[];
  scenario_progress: CrmOverviewScenarioProgress;
  trends: CrmOverviewTrends;
}

export interface CrmStatusSummaryRow {
  name: string;
  count: number;
  dialog_param?: string | null;
}

export interface CrmStatusesSummary {
  contact_statuses: CrmStatusSummaryRow[];
  session_statuses: CrmStatusSummaryRow[];
}

export type CrmUserListSort = 'activity' | 'name' | 'created';

export async function crmListUsers(
  botId: number,
  params?: {
    page?: number;
    page_size?: number;
    q?: string;
    channel?: string;
    tag_keys?: string;
    active_since?: string;
    active_until?: string;
    contact_status?: string;
    session_status?: string;
    has_phone?: boolean;
    has_email?: boolean;
    sort?: CrmUserListSort;
    environment?: CrmEnvironmentFilter;
  }
): Promise<CrmUserListResponse> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.page_size != null) q.set('page_size', String(params.page_size));
  if (params?.q) q.set('q', params.q);
  if (params?.channel) q.set('channel', params.channel);
  if (params?.tag_keys) q.set('tag_keys', params.tag_keys);
  if (params?.active_since) q.set('active_since', params.active_since);
  if (params?.active_until) q.set('active_until', params.active_until);
  if (params?.contact_status) q.set('contact_status', params.contact_status);
  if (params?.session_status) q.set('session_status', params.session_status);
  if (params?.has_phone === true) q.set('has_phone', 'true');
  if (params?.has_phone === false) q.set('has_phone', 'false');
  if (params?.has_email === true) q.set('has_email', 'true');
  if (params?.has_email === false) q.set('has_email', 'false');
  if (params?.sort) q.set('sort', params.sort);
  if (params?.environment) q.set('environment', params.environment);
  const suffix = q.toString() ? `?${q}` : '';
  return api.get(`/bots/${botId}/crm/users${suffix}`);
}

function withEnvironment(path: string, environment?: CrmEnvironmentFilter): string {
  if (!environment) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}environment=${environment}`;
}

export async function crmOverview(
  botId: number,
  environment?: CrmEnvironmentFilter
): Promise<CrmOverview> {
  return api.get(withEnvironment(`/bots/${botId}/crm/overview`, environment));
}

export async function crmStatusesSummary(
  botId: number,
  environment?: CrmEnvironmentFilter
): Promise<CrmStatusesSummary> {
  return api.get(withEnvironment(`/bots/${botId}/crm/statuses/summary`, environment));
}

export async function crmUserDetail(
  botId: number,
  botUserId: number,
  environment?: CrmEnvironmentFilter
): Promise<CrmUserDetail> {
  return api.get(withEnvironment(`/bots/${botId}/crm/users/${botUserId}`, environment));
}

export async function crmUserVariables(
  botId: number,
  botUserId: number,
  environment?: CrmEnvironmentFilter
): Promise<CrmUserVariable[]> {
  return api.get(withEnvironment(`/bots/${botId}/crm/users/${botUserId}/variables`, environment));
}

export async function crmSetUserVariable(
  botId: number,
  botUserId: number,
  key: string,
  value: unknown,
  environment?: CrmEnvironmentFilter
): Promise<CrmUserVariable> {
  return api.put(withEnvironment(`/bots/${botId}/crm/users/${botUserId}/variables`, environment), {
    key,
    value,
  });
}

export async function crmUserTags(
  botId: number,
  botUserId: number,
  environment?: CrmEnvironmentFilter
): Promise<{ id: number; key: string; label?: string | null; color?: string | null }[]> {
  return api.get(withEnvironment(`/bots/${botId}/crm/users/${botUserId}/tags`, environment));
}

export async function crmAddUserTag(
  botId: number,
  botUserId: number,
  key: string,
  environment?: CrmEnvironmentFilter
): Promise<void> {
  await api.post(withEnvironment(`/bots/${botId}/crm/users/${botUserId}/tags`, environment), {
    key,
  });
}

export async function crmRemoveUserTag(
  botId: number,
  botUserId: number,
  tagKey: string,
  environment?: CrmEnvironmentFilter
): Promise<void> {
  await api.delete(
    withEnvironment(
      `/bots/${botId}/crm/users/${botUserId}/tags/${encodeURIComponent(tagKey)}`,
      environment
    )
  );
}

export async function crmUserEvents(
  botId: number,
  botUserId: number,
  limit = 50,
  offset = 0,
  environment?: CrmEnvironmentFilter
): Promise<CrmEvent[]> {
  return api.get(
    withEnvironment(
      `/bots/${botId}/crm/users/${botUserId}/events?limit=${limit}&offset=${offset}`,
      environment
    )
  );
}

export async function crmListVariableDefs(
  botId: number,
  includeArchived = false,
  environment?: CrmEnvironmentFilter
): Promise<CrmVariableDef[]> {
  const q = new URLSearchParams();
  q.set('include_archived', includeArchived ? 'true' : 'false');
  if (environment) {
    q.set('environment', environment);
  }
  return api.get(`/bots/${botId}/crm/variables?${q.toString()}`);
}

export async function crmVariableUsage(
  botId: number,
  varKey: string
): Promise<CrmVariableUsageRef[]> {
  return api.get(`/bots/${botId}/crm/variables/${encodeURIComponent(varKey)}/usage`);
}

export async function crmCreateVariable(
  botId: number,
  body: {
    key: string;
    label?: string;
    data_type?: string;
    scope?: string;
    description?: string;
  },
  environment?: CrmEnvironmentFilter
): Promise<CrmVariableDef> {
  return api.post(withEnvironment(`/bots/${botId}/crm/variables`, environment), body);
}

export async function crmPatchVariable(
  botId: number,
  varKey: string,
  body: {
    label?: string;
    description?: string;
    data_type?: string;
    is_archived?: boolean;
  },
  environment?: CrmEnvironmentFilter
): Promise<CrmVariableDef> {
  return api.patch(
    withEnvironment(`/bots/${botId}/crm/variables/${encodeURIComponent(varKey)}`, environment),
    body
  );
}

export async function crmListTags(
  botId: number,
  environment?: CrmEnvironmentFilter
): Promise<CrmTagDef[]> {
  return api.get(withEnvironment(`/bots/${botId}/crm/tags`, environment));
}

export async function crmCreateTag(
  botId: number,
  body: { key: string; label?: string; color?: string; description?: string }
): Promise<CrmTagDef> {
  return api.post(`/bots/${botId}/crm/tags`, body);
}

export async function crmPatchTag(
  botId: number,
  tagKey: string,
  body: { label?: string; color?: string; description?: string },
  environment?: CrmEnvironmentFilter
): Promise<CrmTagDef> {
  return api.patch(
    withEnvironment(`/bots/${botId}/crm/tags/${encodeURIComponent(tagKey)}`, environment),
    body
  );
}

export async function crmDeleteTag(botId: number, tagKey: string): Promise<void> {
  await api.delete(`/bots/${botId}/crm/tags/${encodeURIComponent(tagKey)}`);
}

export async function crmUsersByTag(
  botId: number,
  tagKey: string,
  page = 1,
  pageSize = 25,
  environment?: CrmEnvironmentFilter
): Promise<CrmUserListResponse> {
  return api.get(
    withEnvironment(
      `/bots/${botId}/crm/tags/${encodeURIComponent(tagKey)}/users?page=${page}&page_size=${pageSize}`,
      environment
    )
  );
}

export async function crmPreviewSync(
  botId: number,
  body: {
    external_user_id: string;
    channel?: string;
    first_name?: string;
    username?: string;
    last_input?: string;
    variables?: Record<string, unknown>;
    tags?: string[];
    status_value?: string;
    /** Если true — обновить CtorBotUser.status (пустая строка → active). */
    status_patch?: boolean;
  }
): Promise<void> {
  await api.post(`/bots/${botId}/crm/preview-sync`, body);
}
