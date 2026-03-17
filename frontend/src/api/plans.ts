/**
 * API тарифных планов
 */
import { get } from './client';

export interface PlanLimits {
  max_bots: number;
  can_publish?: boolean;
  can_use_analytics?: boolean;
  max_team_members?: number;
  can_publish_templates?: boolean;
  can_sell_templates?: boolean;
  can_view_marketplace_stats?: boolean;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  limits: PlanLimits;
}

export interface PlansResponse {
  total: number;
  items: Plan[];
}

export async function getPlans(): Promise<PlansResponse> {
  return get('/plans/');
}
