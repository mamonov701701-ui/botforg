/**
 * API для получения своих BF-ролей
 */
import api from './client';

export interface MyPlatformRole {
  role_name: string;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

/**
 * Получить свои BF-роли
 */
export async function getMyPlatformRoles(): Promise<MyPlatformRole[]> {
  const response = await api.get('/api/my-roles');
  return response.data;
}
