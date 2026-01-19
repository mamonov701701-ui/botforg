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

// ============== Marketing Analytics ==============

export interface HourlyDataPoint {
  hour: string;
  hour_num: number;
  users: number;
  messages: number;
  is_now: boolean;
}

export interface DailyDataPoint {
  date: string;
  date_short: string;
  new_users: number;
  active_users: number;
  messages: number;
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

export interface MarketingAnalytics {
  period_days: number;
  hourly: HourlyDataPoint[];
  daily: DailyDataPoint[];
  retention: RetentionData;
  messages: MessagesStats;
  peaks: PeaksData;
  growth: GrowthData;
  online_now: number;
}

/**
 * Получить маркетинговую аналитику
 */
export async function getMarketingAnalytics(
  days: number = 30,
  botId?: number
): Promise<MarketingAnalytics> {
  try {
    let url = `/analytics/marketing?days=${days}`;
    if (botId) {
      url += `&bot_id=${botId}`;
    }
    return await api.get(url);
  } catch (error: any) {
    console.error('Failed to fetch marketing analytics:', error);
    // Возвращаем пустую структуру при ошибке
    return {
      period_days: days,
      hourly: [],
      daily: [],
      retention: {
        total_users: 0,
        active_7d: 0,
        active_30d: 0,
        returning_users: 0,
        retention_7d: 0,
        retention_30d: 0,
        return_rate: 0,
      },
      messages: { total: 0, incoming: 0, outgoing: 0, avg_per_user: 0 },
      peaks: { peak_hour: 'N/A', peak_hour_users: 0, peak_day: 'N/A', peak_day_users: 0 },
      growth: { users_growth: 0, messages_growth: 0, current_new_users: 0, previous_new_users: 0 },
      online_now: 0,
    };
  }
}
