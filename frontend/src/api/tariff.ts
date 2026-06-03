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
  billing_period: BillingPeriod | null;
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

const DEFAULT_FLAGS: TariffFlags = {
  marketplace_access: true,
  template_publish: true,
  scenario_publish: true,
  export_reports: false,
  priority_support: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceLimit(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function coerceUsageBlock(raw: unknown): UsageBlock {
  const o = asRecord(raw) ?? {};
  const limit = coerceLimit(o.limit);
  let used = typeof o.used === 'number' && Number.isFinite(o.used) ? Math.floor(o.used) : 0;
  used = Math.max(0, used);
  let remaining = coerceLimit(o.remaining);
  if (remaining !== null) {
    remaining = Math.max(0, remaining);
  }
  return { limit, used, remaining };
}

function coerceWarning(raw: unknown): TariffWarning | null {
  const o = asRecord(raw);
  if (!o) return null;
  const threshold =
    typeof o.threshold === 'number' && Number.isFinite(o.threshold) ? o.threshold : null;
  const message = typeof o.message === 'string' ? o.message : null;
  const type = typeof o.type === 'string' ? o.type : 'unknown';
  if (threshold === null || !message) return null;
  return { type, threshold, message };
}

/**
 * Нормализация ответа API: защита от null-массивов, частичных flags и битых чисел.
 */
export function normalizeTariffSummary(raw: unknown): TariffSummary {
  const data = asRecord(raw) ?? {};
  const planRaw = asRecord(data.current_plan) ?? {};
  const bpRaw = asRecord(planRaw.billing_period);
  const billing_period =
    bpRaw &&
    typeof bpRaw.start === 'string' &&
    typeof bpRaw.end === 'string' &&
    bpRaw.start &&
    bpRaw.end
      ? { start: bpRaw.start, end: bpRaw.end }
      : null;

  const flagsRaw = asRecord(data.flags) ?? {};
  const code = String(planRaw.code ?? 'start');
  const name = typeof planRaw.name === 'string' && planRaw.name.trim() ? planRaw.name : code;

  const warningsRaw = Array.isArray(data.warnings) ? data.warnings : [];
  const warnings = warningsRaw.map(coerceWarning).filter((w): w is TariffWarning => w !== null);

  return {
    current_plan: {
      code,
      slug: String(planRaw.slug ?? code),
      name,
      billing_period,
      subscription_status:
        planRaw.subscription_status == null ? null : String(planRaw.subscription_status),
      source: String(planRaw.source ?? 'legacy_plan_code'),
    },
    messages: coerceUsageBlock(data.messages),
    active_bots: coerceUsageBlock(data.active_bots),
    team_members: coerceUsageBlock(data.team_members),
    active_addons: Array.isArray(data.active_addons) ? data.active_addons : [],
    active_gifts: Array.isArray(data.active_gifts) ? data.active_gifts : [],
    warnings,
    flags: {
      marketplace_access: coerceBool(flagsRaw.marketplace_access, DEFAULT_FLAGS.marketplace_access),
      template_publish: coerceBool(flagsRaw.template_publish, DEFAULT_FLAGS.template_publish),
      scenario_publish: coerceBool(flagsRaw.scenario_publish, DEFAULT_FLAGS.scenario_publish),
      export_reports: coerceBool(flagsRaw.export_reports, DEFAULT_FLAGS.export_reports),
      priority_support: coerceBool(flagsRaw.priority_support, DEFAULT_FLAGS.priority_support),
    },
  };
}

export async function getTariffSummary(): Promise<TariffSummary> {
  const raw = await get('/me/tariff/summary');
  return normalizeTariffSummary(raw);
}
