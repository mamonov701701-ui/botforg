/**
 * API сводки тарифов и лимитов (GET /me/tariff/summary).
 */
import { get } from './client';

export interface BillingPeriod {
  start: string;
  end: string;
}

export interface CurrentPlan {
  code: string;
  slug: string;
  name: string;
  billing_period: BillingPeriod;
  subscription_status: string | null;
  source: string;
}

export interface UsageBlock {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface TariffWarning {
  type: string;
  threshold: number;
  message: string;
}

export interface TariffFlags {
  marketplace_access: boolean;
  template_publish: boolean;
  scenario_publish: boolean;
  export_reports: boolean;
  priority_support: boolean;
}

/** Элемент active_addons / active_gifts из backend (гибкая схема). */
export type TariffAddonItem = Record<string, unknown>;
export type TariffGiftItem = Record<string, unknown>;

export interface TariffSummary {
  current_plan: CurrentPlan;
  messages: UsageBlock;
  active_bots: UsageBlock;
  team_members: UsageBlock;
  active_addons: TariffAddonItem[];
  active_gifts: TariffGiftItem[];
  warnings: TariffWarning[];
  flags: TariffFlags;
}

export async function getTariffSummary(): Promise<TariffSummary> {
  return get('/me/tariff/summary') as Promise<TariffSummary>;
}
