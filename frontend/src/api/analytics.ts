/**
 * Analytics API
 * All endpoints use the unified HTTP client with proper error handling
 */

import { get, post } from './client';

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

export interface BotStats {
  total_events: number;
  total_executions: number;
  completed_executions: number;
  failed_executions: number;
  completion_rate: number;
  avg_duration_ms: number;
  period: {
    start: string;
    end: string;
  };
}

export interface UserStats {
  events_by_type: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

export interface Execution {
  id: number;
  scenario_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  nodes_visited: number;
  error_message: string | null;
}

export interface ExecutionsResponse {
  total: number;
  items: Execution[];
}

/**
 * Get dashboard data for current user
 */
export async function getDashboard(days: number = 7): Promise<DashboardData> {
  return get(`/analytics/dashboard?days=${days}`);
}

/**
 * Get analytics for a specific bot
 */
export async function getBotAnalytics(
  botId: number,
  startDate?: string,
  endDate?: string
): Promise<BotStats> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const queryString = params.toString();
  return get(`/analytics/bot/${botId}${queryString ? '?' + queryString : ''}`);
}

/**
 * Get analytics for current user
 */
export async function getUserAnalytics(startDate?: string, endDate?: string): Promise<UserStats> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const queryString = params.toString();
  return get(`/analytics/user${queryString ? '?' + queryString : ''}`);
}

/**
 * Track a custom event
 */
export async function trackEvent(
  eventType: string,
  eventName: string,
  payload?: Record<string, any>
): Promise<{ id: number; created_at: string }> {
  const params = new URLSearchParams();
  params.append('event_type', eventType);
  params.append('event_name', eventName);

  return post(`/analytics/event?${params.toString()}`, payload);
}

/**
 * Get recent executions for a bot
 */
export async function getBotExecutions(
  botId: number,
  status?: string,
  limit: number = 50
): Promise<ExecutionsResponse> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  params.append('limit', limit.toString());

  return get(`/analytics/executions/${botId}?${params.toString()}`);
}
