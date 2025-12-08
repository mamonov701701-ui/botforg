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
