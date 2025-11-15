/**
 * API клиент для управления командой проекта
 */
import api from './client';
import { BaseRoleListItem } from './platformAdmin';

export interface TeamMember {
  id: number;
  user_id: number;
  owner_id: number;
  role: string;
  created_at: string;
  public_id: number;
  email: string;
  name: string | null;
  base_roles: BaseRoleListItem[];
}

export interface TeamMemberCreate {
  user_id: number;
  role: string;
}

/**
 * Получить список участников команды проекта
 */
export async function getMyTeam(search?: string): Promise<TeamMember[]> {
  try {
    const params = new URLSearchParams();
    if (search) {
      params.append('search', search);
    }
    const queryString = params.toString();
    const url = `/api/team/my-team${queryString ? `?${queryString}` : ''}`;
    return await api.get(url);
  } catch (error: any) {
    console.error('Failed to fetch team members:', error);
    throw error;
  }
}

/**
 * Добавить участника в команду проекта
 */
export async function addTeamMember(
  member: TeamMemberCreate,
  expiresInDays?: number
): Promise<any> {
  try {
    const params = new URLSearchParams();
    if (expiresInDays) {
      params.append('expires_in_days', expiresInDays.toString());
    }
    const queryString = params.toString();
    const url = `/api/team/add-member${queryString ? `?${queryString}` : ''}`;
    return await api.post(url, member);
  } catch (error: any) {
    console.error('Failed to add team member:', error);
    throw error;
  }
}

/**
 * Обновить роль участника команды проекта
 */
export async function updateTeamMemberRole(
  memberId: number,
  role: string,
  expiresInDays?: number
): Promise<any> {
  try {
    const params = new URLSearchParams();
    if (expiresInDays) {
      params.append('expires_in_days', expiresInDays.toString());
    }
    const queryString = params.toString();
    const url = `/api/team/${memberId}${queryString ? `?${queryString}` : ''}`;
    return await api.put(url, { user_id: 0, role }); // user_id не используется при обновлении
  } catch (error: any) {
    console.error('Failed to update team member role:', error);
    throw error;
  }
}

/**
 * Удалить участника из команды проекта
 */
export async function deleteTeamMember(memberId: number): Promise<void> {
  try {
    await api.delete(`/api/team/${memberId}`);
  } catch (error: any) {
    console.error('Failed to delete team member:', error);
    throw error;
  }
}

/**
 * Найти пользователя по public_id или email
 */
export async function findUserByIdentifier(
  identifier: string
): Promise<{ id: number; public_id: number; email: string; name: string | null } | null> {
  try {
    // Используем API platform-admin для поиска пользователя
    // Увеличиваем лимит для поиска и не фильтруем по команде
    const users = await api.get(
      `/api/platform-admin/users?search=${encodeURIComponent(identifier)}&limit=100`
    );

    // Проверяем, что получили массив
    if (!Array.isArray(users)) {
      console.error('API returned non-array:', users);
      return null;
    }

    // Ищем по public_id (число) или email
    const foundUser = users.find((u: any) => {
      // Проверяем по public_id (точное совпадение)
      if (u.public_id && u.public_id.toString() === identifier.trim()) {
        return true;
      }
      // Проверяем по email (без учета регистра)
      if (u.email && u.email.toLowerCase() === identifier.trim().toLowerCase()) {
        return true;
      }
      return false;
    });

    if (foundUser) {
      return {
        id: foundUser.id,
        public_id: foundUser.public_id,
        email: foundUser.email,
        name: foundUser.name,
      };
    }

    console.log('User not found. Searched:', identifier, 'Found users:', users.length);
    return null;
  } catch (error: any) {
    console.error('Failed to find user:', error);
    // Если ошибка доступа, пробуем через другой endpoint
    if (error.response?.status === 403 || error.response?.status === 401) {
      console.error('Access denied to platform-admin API');
    }
    throw error;
  }
}
