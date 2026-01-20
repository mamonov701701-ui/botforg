/**
 * API для управления платформой (только для владельца)
 */
import api from './client';

export interface PlatformRoleListItem {
  id: number;
  role_name: string;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface BaseRoleListItem {
  id: number;
  role_name: string;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface User {
  id: number;
  public_id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  platform_roles: PlatformRoleListItem[];
  base_roles: BaseRoleListItem[];
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PlatformStats {
  total_users: number;
  total_projects: number;
  total_bots: number;
  active_bots: number;
  total_scenarios: number;
  total_bot_users: number;
  total_messages: number;
}

export interface PlatformRole {
  id: number;
  user_id: number;
  role_name: string;
  granted_by: number;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface UserDetail extends User {
  platform_roles: PlatformRole[];
}

export interface AssignRoleRequest {
  user_id: number;
  role_name: string;
  expires_at?: string | null;
  notes?: string | null;
}

export interface UpdateRoleRequest {
  is_active?: boolean;
  expires_at?: string | null;
  notes?: string | null;
}

/**
 * Получить список всех пользователей с пагинацией
 */
export async function getAllUsers(options?: {
  page?: number;
  pageSize?: number;
  search?: string;
  teamOnly?: boolean;
  sortBy?: 'id' | 'email' | 'name' | 'role' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}): Promise<UserListResponse> {
  const params = new URLSearchParams();

  if (options?.page) params.append('page', options.page.toString());
  if (options?.pageSize) params.append('page_size', options.pageSize.toString());
  if (options?.search) params.append('search', options.search);
  if (options?.teamOnly) params.append('team_only', 'true');
  if (options?.sortBy) params.append('sort_by', options.sortBy);
  if (options?.sortOrder) params.append('sort_order', options.sortOrder);

  const url = `/api/platform-admin/users${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await api.get(url);

  // API возвращает объект с пагинацией
  let result;
  if (response?.items && Array.isArray(response.items)) {
    // Правильный формат ответа
    result = response;
  } else if (Array.isArray(response)) {
    // Если пришел массив (старый формат), оборачиваем
    result = {
      items: response,
      total: response.length,
      page: 1,
      page_size: response.length,
      total_pages: 1,
    };
  } else {
    // Пустой результат
    result = {
      items: [],
      total: 0,
      page: options?.page || 1,
      page_size: options?.pageSize || 50,
      total_pages: 0,
    };
  }

  if (import.meta.env.DEV) {
    console.log(
      `[getAllUsers] Loaded ${result.items.length} users from ${url} (total: ${result.total})`,
      {
        responseType: Array.isArray(response) ? 'array' : typeof response,
        hasItems: !!response?.items,
        result,
      }
    );
  }

  return result;
}

/**
 * Получить детальную информацию о пользователе
 */
export async function getUserDetail(userId: number): Promise<UserDetail> {
  const response = await api.get(`/api/platform-admin/users/${userId}`);
  return response.data;
}

/**
 * Получить статистику платформы
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const response = await api.get('/api/platform-admin/stats');

    if (import.meta.env.DEV) {
      console.log('[getPlatformStats] Raw response:', response);
      console.log('[getPlatformStats] Response type:', typeof response);
      console.log('[getPlatformStats] Has total_users:', 'total_users' in response);
    }

    // API возвращает данные напрямую (response.json() уже распарсил JSON)
    // FastAPI с response_model возвращает объект напрямую
    const result = response as PlatformStats;

    if (import.meta.env.DEV) {
      console.log('[getPlatformStats] Processed result:', result);
    }

    return result;
  } catch (error: any) {
    console.error('[getPlatformStats] Error:', error);
    throw error;
  }
}

/**
 * Получить расширенную информацию о пользователе (проекты, боты, статистика)
 */
export interface UserDetailedInfo {
  user: {
    id: number;
    public_id: number;
    email: string;
    name: string | null;
    role: string;
    created_at: string | null;
    platform_roles: Array<{
      id: number;
      role_name: string;
      granted_at: string | null;
      expires_at: string | null;
      is_active: boolean;
    }>;
  };
  bots: Array<{
    id: number;
    title: string;
    username: string;
    is_active: boolean;
    is_suspended: boolean;
    suspension_type: 'warning' | 'temporary' | 'permanent' | null;
    suspension_reason: string | null;
    created_at: string | null;
    users_count: number;
    messages_count: number;
  }>;
  scenarios: Array<{
    id: number;
    name: string;
    bot_id: number | null;
    is_main: boolean;
    is_library: boolean;
    created_at: string | null;
  }>;
  team_memberships: Array<{
    owner_id: number;
    owner_name: string | null;
    owner_email: string;
    role: string;
    bots_count: number;
  }>;
  statistics: {
    total_bots: number;
    active_bots: number;
    total_scenarios: number;
    total_bot_users: number;
    total_messages: number;
    team_projects_count: number;
  };
}

export async function getUserDetailedInfo(userId: number): Promise<UserDetailedInfo> {
  const response = await api.get(`/api/platform-admin/users/${userId}/detailed`);
  return response.data || response;
}

/**
 * Назначить BF-роль пользователю
 */
export async function assignPlatformRole(data: AssignRoleRequest): Promise<PlatformRole> {
  const response = await api.post('/api/platform-admin/roles', data);
  return response.data;
}

/**
 * Обновить BF-роль
 */
export async function updatePlatformRole(
  roleId: number,
  data: UpdateRoleRequest
): Promise<PlatformRole> {
  const response = await api.patch(`/api/platform-admin/roles/${roleId}`, data);
  return response;
}

/**
 * Удалить BF-роль
 */
export async function deletePlatformRole(roleId: number): Promise<void> {
  await api.delete(`/api/platform-admin/roles/${roleId}`);
}

/**
 * Получить список доступных BF-ролей
 */
export async function getAvailableRoles(): Promise<string[]> {
  try {
    const response = await api.get('/api/platform-admin/roles/available');
    // API возвращает массив напрямую, не в data
    const roles = Array.isArray(response) ? response : response.data || [];
    console.log('Available roles loaded:', roles);
    return roles;
  } catch (error) {
    console.error('Failed to load available roles:', error);
    return [];
  }
}

/**
 * Удалить участника из BF команды (удаляет все его BF-роли)
 */
export async function removeTeamMember(userId: number): Promise<void> {
  await api.delete(`/api/platform-admin/users/${userId}/team-member`);
}

/**
 * Изменить базовую роль пользователя (устаревший метод)
 */
export async function updateUserBaseRole(userId: number, role: string): Promise<void> {
  await api.patch(`/api/platform-admin/users/${userId}/base-role?role=${encodeURIComponent(role)}`);
}

/**
 * Назначить базовую роль пользователю с возможностью указать срок действия
 */
export async function assignBaseRole(data: AssignRoleRequest): Promise<BaseRoleListItem> {
  const response = await api.post('/api/platform-admin/base-roles', data);
  return response.data;
}

/**
 * Обновить базовую роль
 */
export async function updateBaseRole(
  roleId: number,
  data: UpdateRoleRequest
): Promise<BaseRoleListItem> {
  const response = await api.patch(`/api/platform-admin/base-roles/${roleId}`, data);
  return response;
}

/**
 * Удалить базовую роль
 */
export async function deleteBaseRole(roleId: number): Promise<void> {
  await api.delete(`/api/platform-admin/base-roles/${roleId}`);
}

// === Suspension Management ===

export interface SuspensionInfo {
  is_suspended: boolean;
  suspension_type: 'warning' | 'temporary' | 'permanent' | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  suspended_until: string | null;
  suspended_by_id: number | null;
  suspended_by_email: string | null;
}

export interface SuspendRequest {
  suspension_type: 'warning' | 'temporary' | 'permanent';
  reason: string;
  duration_days?: number; // Required for temporary suspension
}

/**
 * Заблокировать пользователя
 */
export async function suspendUser(userId: number, data: SuspendRequest): Promise<any> {
  return api.post(`/api/platform-admin/users/${userId}/suspend`, data);
}

/**
 * Снять блокировку с пользователя
 */
export async function unsuspendUser(userId: number): Promise<any> {
  return api.post(`/api/platform-admin/users/${userId}/unsuspend`);
}

/**
 * Получить информацию о блокировке пользователя
 */
export async function getUserSuspension(userId: number): Promise<SuspensionInfo> {
  return api.get(`/api/platform-admin/users/${userId}/suspension`);
}

/**
 * Заблокировать бота
 */
export async function suspendBot(botId: number, data: SuspendRequest): Promise<any> {
  return api.post(`/api/platform-admin/bots/${botId}/suspend`, data);
}

/**
 * Снять блокировку с бота
 */
export async function unsuspendBot(botId: number): Promise<any> {
  return api.post(`/api/platform-admin/bots/${botId}/unsuspend`);
}

/**
 * Получить информацию о блокировке бота
 */
export async function getBotSuspension(botId: number): Promise<SuspensionInfo> {
  return api.get(`/api/platform-admin/bots/${botId}/suspension`);
}

/**
 * Заблокировать все боты пользователя
 */
export async function suspendAllUserBots(userId: number, data: SuspendRequest): Promise<any> {
  return api.post(`/api/platform-admin/users/${userId}/suspend-all-bots`, data);
}

/**
 * Снять блокировку со всех ботов пользователя
 */
export async function unsuspendAllUserBots(userId: number): Promise<any> {
  return api.post(`/api/platform-admin/users/${userId}/unsuspend-all-bots`);
}

// === Platform Analytics ===

export interface HourlyData {
  hour: string;
  hour_num: number;
  users: number;
  messages: number;
  is_now: boolean;
}

export interface DailyData {
  date: string;
  date_short: string;
  new_bot_users: number;
  active_users: number;
  messages: number;
  new_platform_users: number;
}

export interface RetentionData {
  total_users: number;
  active_7d: number;
  active_30d: number;
  returning_users: number;
  retention_7d: number;
  retention_30d: number;
  return_rate: number;
}

export interface MessagesStats {
  total: number;
  incoming: number;
  outgoing: number;
  avg_per_user: number;
}

export interface PeaksData {
  peak_hour: string;
  peak_hour_users: number;
  peak_day: string;
  peak_day_users: number;
}

export interface GrowthData {
  users_growth: number;
  messages_growth: number;
  current_new_users: number;
  previous_new_users: number;
}

export interface PlatformSummary {
  total_users: number;
  total_bots: number;
  active_bots: number;
  total_scenarios: number;
  total_bot_users: number;
  total_messages: number;
}

export interface PlatformAnalyticsData {
  period_days: number;
  summary: PlatformSummary;
  hourly: HourlyData[];
  daily: DailyData[];
  retention: RetentionData;
  messages: MessagesStats;
  peaks: PeaksData;
  growth: GrowthData;
  online_now: number;
}

/**
 * Получить платформенную аналитику
 */
export async function getPlatformAnalytics(days: number = 30): Promise<PlatformAnalyticsData> {
  return api.get(`/api/platform-admin/analytics?days=${days}`);
}
