/**
 * Admin Plan catalog API (Этапы 7.1.1–7.1.2).
 * GET /api/admin/tariffs/plans
 * PATCH /api/admin/tariffs/plans/{id}
 */
import { get, patch, post, del, ApiError } from './client';

export const ADMIN_TARIFF_PLANS_API_PATH = '/api/admin/tariffs/plans';

export interface AdminPlanLimits {
  monthly_messages: number | null;
  active_bots: number | null;
  team_members: number | null;
  analytics_history_days: number | null;
  addon_purchase: boolean;
  export_reports: boolean;
  priority_support: boolean;
  marketplace_access: boolean;
  template_publish: boolean;
  scenario_publish: boolean;
}

export interface AdminPlan {
  id: number;
  code: string;
  name: string;
  name_ru: string | null;
  description_ru: string | null;
  price_month: string | null;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  is_recommended: boolean;
  sort_order: number;
  limits: AdminPlanLimits;
  created_at: string | null;
  subscription_count: number;
  checkout_count: number;
  gift_count: number;
  has_references: boolean;
  can_delete: boolean;
}

export interface AdminPlanList {
  items: AdminPlan[];
  total: number;
}

export interface AdminPlanLimitsPatch {
  monthly_messages?: number | null;
  active_bots?: number | null;
  team_members?: number | null;
  analytics_history_days?: number | null;
  addon_purchase?: boolean;
  export_reports?: boolean;
  priority_support?: boolean;
  marketplace_access?: boolean;
  template_publish?: boolean;
  scenario_publish?: boolean;
}

export interface AdminPlanUpdatePayload {
  name?: string;
  name_ru?: string | null;
  description_ru?: string | null;
  price_month?: string | null;
  currency?: string;
  is_recommended?: boolean;
  sort_order?: number;
  limits?: AdminPlanLimitsPatch;
}

export interface AdminPlanCreatePayload {
  code: string;
  name: string;
  name_ru: string;
  description_ru?: string | null;
  price_month?: string | null;
  currency?: string;
  is_public?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  limits?: AdminPlanLimitsPatch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function moneyStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return null;
}

function normalizeLimits(raw: unknown): AdminPlanLimits {
  const o = asRecord(raw) ?? {};
  return {
    monthly_messages: asNullableNumber(o.monthly_messages),
    active_bots: asNullableNumber(o.active_bots),
    team_members: asNullableNumber(o.team_members),
    analytics_history_days: asNullableNumber(o.analytics_history_days),
    addon_purchase: asBool(o.addon_purchase, false),
    export_reports: asBool(o.export_reports, false),
    priority_support: asBool(o.priority_support, false),
    marketplace_access: asBool(o.marketplace_access, true),
    template_publish: asBool(o.template_publish, true),
    scenario_publish: asBool(o.scenario_publish, true),
  };
}

export function normalizeAdminPlan(raw: unknown): AdminPlan {
  const o = asRecord(raw) ?? {};
  return {
    id: asNumber(o.id),
    code: asString(o.code),
    name: asString(o.name),
    name_ru: asNullableString(o.name_ru),
    description_ru: asNullableString(o.description_ru),
    price_month: moneyStr(o.price_month),
    currency: asString(o.currency, 'RUB'),
    is_active: asBool(o.is_active, true),
    is_public: asBool(o.is_public, true),
    is_recommended: asBool(o.is_recommended, false),
    sort_order: asNumber(o.sort_order),
    limits: normalizeLimits(o.limits),
    created_at: asNullableString(o.created_at),
    subscription_count: asNumber(o.subscription_count),
    checkout_count: asNumber(o.checkout_count),
    gift_count: asNumber(o.gift_count),
    has_references: asBool(o.has_references, false),
    can_delete: asBool(o.can_delete, false),
  };
}

export async function listAdminPlans(): Promise<AdminPlanList> {
  const raw = await get(ADMIN_TARIFF_PLANS_API_PATH);
  const o = asRecord(raw) ?? {};
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map(normalizeAdminPlan);
  return {
    items,
    total: typeof o.total === 'number' ? o.total : items.length,
  };
}

export async function updateAdminPlan(
  planId: number,
  payload: AdminPlanUpdatePayload
): Promise<AdminPlan> {
  const raw = await patch(`${ADMIN_TARIFF_PLANS_API_PATH}/${planId}`, payload);
  return normalizeAdminPlan(raw);
}

export async function createAdminPlan(payload: AdminPlanCreatePayload): Promise<AdminPlan> {
  const raw = await post(ADMIN_TARIFF_PLANS_API_PATH, payload);
  return normalizeAdminPlan(raw);
}

export async function setAdminPlanVisibility(
  planId: number,
  isPublic: boolean
): Promise<AdminPlan> {
  const raw = await post(`${ADMIN_TARIFF_PLANS_API_PATH}/${planId}/visibility`, {
    is_public: isPublic,
  });
  return normalizeAdminPlan(raw);
}

export async function archiveAdminPlan(planId: number): Promise<AdminPlan> {
  const raw = await post(`${ADMIN_TARIFF_PLANS_API_PATH}/${planId}/archive`);
  return normalizeAdminPlan(raw);
}

export async function reactivateAdminPlan(planId: number): Promise<AdminPlan> {
  const raw = await post(`${ADMIN_TARIFF_PLANS_API_PATH}/${planId}/reactivate`);
  return normalizeAdminPlan(raw);
}

export async function deleteAdminPlan(planId: number): Promise<void> {
  await del(`${ADMIN_TARIFF_PLANS_API_PATH}/${planId}`);
}

export const ADMIN_TARIFF_PLANS_AUDIT_API_PATH = `${ADMIN_TARIFF_PLANS_API_PATH}/audit`;

export const TARIFF_PLAN_AUDIT_ACTIONS = [
  'tariff_plan_created',
  'tariff_plan_updated',
  'tariff_plan_published',
  'tariff_plan_hidden',
  'tariff_plan_archived',
  'tariff_plan_reactivated',
  'tariff_plan_deleted',
] as const;

export type TariffPlanAuditAction = (typeof TARIFF_PLAN_AUDIT_ACTIONS)[number];

export interface AdminPlanAuditChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface AdminPlanAuditItem {
  id: number;
  created_at: string | null;
  action: string;
  action_label: string;
  entity_type: string;
  entity_id: number | null;
  admin_user_id: number;
  admin_email: string | null;
  plan_code: string | null;
  plan_name: string | null;
  comment: string | null;
  changed_fields: string[] | null;
  changes: AdminPlanAuditChange[];
}

export interface AdminPlanAuditList {
  items: AdminPlanAuditItem[];
  total: number;
  limit: number;
  offset: number;
}

function normalizeAuditChange(raw: unknown): AdminPlanAuditChange {
  const o = asRecord(raw) ?? {};
  return {
    field: asString(o.field),
    label: asString(o.label) || asString(o.field),
    before: asString(o.before, '—'),
    after: asString(o.after, '—'),
  };
}

export function normalizeAdminPlanAuditItem(raw: unknown): AdminPlanAuditItem {
  const o = asRecord(raw) ?? {};
  const changesRaw = Array.isArray(o.changes) ? o.changes : [];
  const changedRaw = Array.isArray(o.changed_fields) ? o.changed_fields : null;
  return {
    id: asNumber(o.id),
    created_at: asNullableString(o.created_at),
    action: asString(o.action),
    action_label: asString(o.action_label) || asString(o.action),
    entity_type: asString(o.entity_type),
    entity_id: asNullableNumber(o.entity_id),
    admin_user_id: asNumber(o.admin_user_id),
    admin_email: asNullableString(o.admin_email),
    plan_code: asNullableString(o.plan_code),
    plan_name: asNullableString(o.plan_name),
    comment: asNullableString(o.comment),
    changed_fields: changedRaw
      ? changedRaw.filter((x): x is string => typeof x === 'string')
      : null,
    changes: changesRaw.map(normalizeAuditChange),
  };
}

export async function listAdminPlanAudit(params?: {
  action?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminPlanAuditList> {
  const qs = new URLSearchParams();
  if (params?.action) qs.set('action', params.action);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const path = qs.toString()
    ? `${ADMIN_TARIFF_PLANS_AUDIT_API_PATH}?${qs.toString()}`
    : ADMIN_TARIFF_PLANS_AUDIT_API_PATH;
  const raw = await get(path);
  const o = asRecord(raw) ?? {};
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  return {
    items: itemsRaw.map(normalizeAdminPlanAuditItem),
    total: asNumber(o.total),
    limit: asNumber(o.limit, 20),
    offset: asNumber(o.offset),
  };
}

export function safeAdminPlansErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Недостаточно прав для просмотра тарифов.';
    }
    if (err.status === 404) {
      // List/audit 404 is usually stale backend / missing route, not a missing plan row.
      return 'Сервис тарифов временно недоступен. Обновите страницу или перезапустите backend.';
    }
    if (err.status === 422) {
      const msg = (err.message || '').trim();
      if (msg && !/^\{/.test(msg) && !msg.includes('"loc"')) return msg;
      return 'Проверьте заполненные поля и повторите сохранение.';
    }
    return err.message || 'Не удалось загрузить тарифы.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось загрузить тарифы.';
}

export function safeAdminPlanUpdateErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Недостаточно прав для изменения тарифа.';
    }
    if (err.status === 404) return 'Тариф не найден.';
    if (err.status === 409) {
      if (err.code === 'plan_in_use') {
        return (
          err.message ||
          'Тариф уже использовался в покупках или других данных и не может быть удалён. Его можно скрыть или архивировать.'
        );
      }
      const msg = (err.message || '').trim();
      if (msg && !/^\{/.test(msg)) return msg;
      return 'Тариф с таким кодом уже существует.';
    }
    if (err.status === 422) {
      const msg = (err.message || '').trim();
      if (msg && !/^\{/.test(msg) && !msg.includes('"loc"')) return msg;
      return 'Проверьте заполненные поля и повторите сохранение.';
    }
    const msg = (err.message || '').trim();
    if (msg && !/^\{/.test(msg)) return msg;
  }
  if (err instanceof Error && err.message && !/^\{/.test(err.message)) {
    return err.message;
  }
  return 'Не удалось сохранить тариф.';
}
