/**
 * API для управления платформой (только для владельца)
 */
import api from './client';

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  platform_roles: string[];
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
 * Получить список всех пользователей
 */
export async function getAllUsers(search?: string): Promise<User[]> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);

  const response = await api.get(`/api/platform-admin/users?${params.toString()}`);
  // API возвращает массив напрямую
  return Array.isArray(response) ? response : response.data || [];
}

/**
 * Получить детальную информацию о пользователе
 */
export async function getUserDetail(userId: number): Promise<UserDetail> {
  const response = await api.get(`/api/platform-admin/users/${userId}`);
  return response.data;
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
  return response.data;
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
 * Изменить базовую роль пользователя
 */
export async function updateUserBaseRole(userId: number, role: string): Promise<void> {
  await api.patch(`/api/platform-admin/users/${userId}/base-role`, null, {
    params: { role },
  });
}
