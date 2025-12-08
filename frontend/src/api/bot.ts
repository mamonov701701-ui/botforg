/**
 * API клиент для работы с ботами
 */
import api from './client';
import { ROLE_NAMES } from '../constants/roles';

export interface Bot {
  id: number;
  title: string;
  username: string;
  webhook_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner_id: number;
  // Информация о владельце (для группировки по проектам)
  owner_name: string | null;
  owner_email: string | null;
  owner_public_id: number | null;
  // Роль пользователя в проекте владельца (если не владелец)
  team_role: string | null;
  // Дополнительные поля для отображения
  name?: string; // Алиас для title
  channel?: string; // Канал бота (telegram, whatsapp и т.д.)
  status?: string; // Статус бота (active, paused, error)
  usersCount?: number; // Количество пользователей бота
  messagesCount?: number; // Количество сообщений
}

export interface BotListResponse {
  total: number;
  items: Bot[];
}

/**
 * Получить список ботов пользователя
 * Включает: свои боты + боты команд, где пользователь участник
 */
export async function getBots(): Promise<BotListResponse> {
  try {
    return await api.get('/bots');
  } catch (error: any) {
    console.error('Failed to fetch bots:', error);
    throw error;
  }
}

/**
 * Получить конкретного бота
 */
export async function getBot(botId: number): Promise<Bot> {
  try {
    return await api.get(`/bots/${botId}`);
  } catch (error: any) {
    console.error('Failed to fetch bot:', error);
    throw error;
  }
}

/**
 * Группировка ботов по проектам (владельцам)
 */
export function groupBotsByProject(bots: Bot[], currentUserId: number) {
  const projects: Record<
    number,
    {
      owner_id: number;
      owner_name: string;
      owner_email: string;
      owner_public_id: number | null;
      team_role: string | null;
      is_own: boolean;
      bots: Bot[];
    }
  > = {};

  bots.forEach(bot => {
    const ownerId = bot.owner_id;

    if (!projects[ownerId]) {
      projects[ownerId] = {
        owner_id: ownerId,
        owner_name: bot.owner_name || 'Неизвестно',
        owner_email: bot.owner_email || '',
        owner_public_id: bot.owner_public_id,
        team_role: bot.team_role,
        is_own: ownerId === currentUserId,
        bots: [],
      };
    }

    projects[ownerId].bots.push(bot);
  });

  return Object.values(projects);
}

/**
 * Получить название проекта (для отображения)
 */
export function getProjectName(project: { owner_name: string; is_own: boolean }): string {
  if (project.is_own) {
    return 'Мои боты';
  }
  return `Проект ${project.owner_name}`;
}

/**
 * Получить роль в проекте (для отображения)
 */
export function getProjectRole(teamRole: string | null): string {
  if (!teamRole) return '';
  return ROLE_NAMES[teamRole as keyof typeof ROLE_NAMES] || teamRole;
}
