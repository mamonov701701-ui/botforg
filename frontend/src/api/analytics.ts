/**
 * API клиент для аналитики
 */
import api from './client';

export interface DashboardData {
  summary: {
    total_bots: number;
    active_bots: number;
    total_scenarios: number;
    total_executions: number;
    total_users: number;
    total_messages: number;
    bonus_balance: number;
  };
  daily: Record<
    string,
    {
      executions: number;
      completions: number;
      failures: number;
    }
  >;
  period_days: number;
}

export interface RecentEvent {
  id: number;
  type: string;
  name: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface RecentEventsResponse {
  items: RecentEvent[];
}

/**
 * Получить данные для дашборда
 */
export async function getDashboardData(days: number = 7): Promise<DashboardData> {
  try {
    return await api.get(`/analytics/dashboard?days=${days}`);
  } catch (error: any) {
    console.error('Failed to fetch dashboard data:', error);
    throw error;
  }
}

/**
 * Получить последние события
 */
export async function getRecentEvents(limit: number = 10): Promise<RecentEventsResponse> {
  try {
    return await api.get(`/analytics/events/recent?limit=${limit}`);
  } catch (error: any) {
    console.error('Failed to fetch recent events:', error);
    // Возвращаем пустой список при ошибке
    return { items: [] };
  }
}
