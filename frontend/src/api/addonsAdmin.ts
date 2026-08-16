/**
 * Admin AddonPackage catalog API (Этап 7.2).
 * GET/POST /api/admin/tariffs/addons
 */
import { get, patch, post, del, ApiError } from './client';

export const ADMIN_ADDON_PACKAGES_API_PATH = '/api/admin/tariffs/addons';

export const ADMIN_ADDON_TYPES = ['messages', 'active_bot', 'team_member', 'ai_credits'] as const;
export type AdminAddonType = (typeof ADMIN_ADDON_TYPES)[number];

export interface AdminAddon {
  id: number;
  code: string;
  name_ru: string;
  description_ru: string | null;
  type: string;
  amount: number;
  price: string;
  currency: string;
  duration_type: string;
  validity_days: number;
  available_from_plan: unknown;
  max_per_period: number | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
  user_addon_count: number;
  checkout_count: number;
  gift_count: number;
  refund_count: number;
  has_references: boolean;
  can_delete: boolean;
}

export interface AdminAddonList {
  items: AdminAddon[];
  total: number;
}

export interface AdminCustomMessagesProduct {
  code: string;
  title: string;
  public_title: string;
  resource_type: string;
  sales_enabled: boolean;
  sales_status_label: string;
  active_grid_version_id: number | null;
  active_grid_version_number: number | null;
  currency: string;
  validity_days: number;
  min_quantity: number;
  max_quantity: number;
  pricing_grids_hint: string;
}

export interface AdminAddonCreatePayload {
  code: string;
  name_ru: string;
  description_ru?: string | null;
  type: string;
  amount: number;
  price: string;
  currency?: string;
  duration_type?: string;
  validity_days?: number;
  available_from_plan?: string[] | null;
  max_per_period?: number | null;
  is_public?: boolean;
  sort_order?: number;
}

export interface AdminAddonUpdatePayload {
  name_ru?: string;
  description_ru?: string | null;
  type?: string;
  amount?: number;
  price?: string;
  currency?: string;
  duration_type?: string;
  validity_days?: number;
  available_from_plan?: string[] | null;
  max_per_period?: number | null;
  sort_order?: number;
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

function moneyStr(value: unknown): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return '0';
}

export function normalizeAdminAddon(raw: unknown): AdminAddon {
  const o = asRecord(raw) ?? {};
  return {
    id: asNumber(o.id),
    code: asString(o.code),
    name_ru: asString(o.name_ru),
    description_ru: asNullableString(o.description_ru),
    type: asString(o.type),
    amount: asNumber(o.amount),
    price: moneyStr(o.price),
    currency: asString(o.currency, 'RUB'),
    duration_type: asString(o.duration_type, 'current_period'),
    validity_days: asNumber(o.validity_days, 30) || 30,
    available_from_plan: o.available_from_plan ?? null,
    max_per_period: asNullableNumber(o.max_per_period),
    is_active: asBool(o.is_active, true),
    is_public: asBool(o.is_public, true),
    sort_order: asNumber(o.sort_order),
    created_at: asNullableString(o.created_at),
    updated_at: asNullableString(o.updated_at),
    user_addon_count: asNumber(o.user_addon_count),
    checkout_count: asNumber(o.checkout_count),
    gift_count: asNumber(o.gift_count),
    refund_count: asNumber(o.refund_count),
    has_references: asBool(o.has_references, false),
    can_delete: asBool(o.can_delete, false),
  };
}

export async function listAdminAddons(): Promise<AdminAddonList> {
  const raw = await get(ADMIN_ADDON_PACKAGES_API_PATH);
  const o = asRecord(raw) ?? {};
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map(normalizeAdminAddon);
  return {
    items,
    total: typeof o.total === 'number' ? o.total : items.length,
  };
}

export async function getAdminCustomMessagesProduct(): Promise<AdminCustomMessagesProduct> {
  const raw = await get(`${ADMIN_ADDON_PACKAGES_API_PATH}/system/custom-messages`);
  const o = asRecord(raw) ?? {};
  return {
    code: asString(o.code, 'custom_messages'),
    title: asString(o.title, 'Настраиваемый пакет сообщений'),
    public_title: asString(o.public_title, 'Настроить пакет'),
    resource_type: asString(o.resource_type, 'messages'),
    sales_enabled: Boolean(o.sales_enabled),
    sales_status_label: asString(
      o.sales_status_label,
      o.sales_enabled ? 'Продажи включены' : 'Продажи выключены — нет активной ценовой сетки'
    ),
    active_grid_version_id:
      typeof o.active_grid_version_id === 'number' ? o.active_grid_version_id : null,
    active_grid_version_number:
      typeof o.active_grid_version_number === 'number' ? o.active_grid_version_number : null,
    currency: asString(o.currency, 'RUB'),
    validity_days: asNumber(o.validity_days, 30),
    min_quantity: asNumber(o.min_quantity, 1),
    max_quantity: asNumber(o.max_quantity, 1_000_000),
    pricing_grids_hint: asString(
      o.pricing_grids_hint,
      'Управление ценами — во вкладке «Ценовые ступени».'
    ),
  };
}

export async function createAdminAddon(payload: AdminAddonCreatePayload): Promise<AdminAddon> {
  const raw = await post(ADMIN_ADDON_PACKAGES_API_PATH, payload);
  return normalizeAdminAddon(raw);
}

export async function updateAdminAddon(
  addonId: number,
  payload: AdminAddonUpdatePayload
): Promise<AdminAddon> {
  const raw = await patch(`${ADMIN_ADDON_PACKAGES_API_PATH}/${addonId}`, payload);
  return normalizeAdminAddon(raw);
}

export async function setAdminAddonVisibility(
  addonId: number,
  isPublic: boolean
): Promise<AdminAddon> {
  const raw = await post(`${ADMIN_ADDON_PACKAGES_API_PATH}/${addonId}/visibility`, {
    is_public: isPublic,
  });
  return normalizeAdminAddon(raw);
}

export async function archiveAdminAddon(addonId: number): Promise<AdminAddon> {
  const raw = await post(`${ADMIN_ADDON_PACKAGES_API_PATH}/${addonId}/archive`);
  return normalizeAdminAddon(raw);
}

export async function reactivateAdminAddon(addonId: number): Promise<AdminAddon> {
  const raw = await post(`${ADMIN_ADDON_PACKAGES_API_PATH}/${addonId}/reactivate`);
  return normalizeAdminAddon(raw);
}

export async function deleteAdminAddon(addonId: number): Promise<void> {
  await del(`${ADMIN_ADDON_PACKAGES_API_PATH}/${addonId}`);
}

export const ADMIN_ADDON_AUDIT_API_PATH = `${ADMIN_ADDON_PACKAGES_API_PATH}/audit`;

export const ADDON_PACKAGE_AUDIT_ACTIONS = [
  'addon_package_created',
  'addon_package_updated',
  'addon_package_published',
  'addon_package_hidden',
  'addon_package_archived',
  'addon_package_reactivated',
  'addon_package_deleted',
] as const;

export interface AdminAddonAuditChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface AdminAddonAuditItem {
  id: number;
  created_at: string | null;
  action: string;
  action_label: string;
  entity_type: string;
  entity_id: number | null;
  admin_user_id: number;
  admin_email: string | null;
  addon_code: string | null;
  addon_name: string | null;
  comment: string | null;
  changed_fields: string[] | null;
  changes: AdminAddonAuditChange[];
}

export interface AdminAddonAuditList {
  items: AdminAddonAuditItem[];
  total: number;
  limit: number;
  offset: number;
}

function normalizeAuditChange(raw: unknown): AdminAddonAuditChange {
  const o = asRecord(raw) ?? {};
  return {
    field: asString(o.field),
    label: asString(o.label) || asString(o.field),
    before: asString(o.before, '—'),
    after: asString(o.after, '—'),
  };
}

export function normalizeAdminAddonAuditItem(raw: unknown): AdminAddonAuditItem {
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
    addon_code: asNullableString(o.addon_code),
    addon_name: asNullableString(o.addon_name),
    comment: asNullableString(o.comment),
    changed_fields: changedRaw
      ? changedRaw.filter((x): x is string => typeof x === 'string')
      : null,
    changes: changesRaw.map(normalizeAuditChange),
  };
}

export async function listAdminAddonAudit(params?: {
  action?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminAddonAuditList> {
  const qs = new URLSearchParams();
  if (params?.action) qs.set('action', params.action);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const path = qs.toString()
    ? `${ADMIN_ADDON_AUDIT_API_PATH}?${qs.toString()}`
    : ADMIN_ADDON_AUDIT_API_PATH;
  const raw = await get(path);
  const o = asRecord(raw) ?? {};
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  return {
    items: itemsRaw.map(normalizeAdminAddonAuditItem),
    total: asNumber(o.total),
    limit: asNumber(o.limit, 20),
    offset: asNumber(o.offset),
  };
}

export function safeAdminAddonsErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Недостаточно прав для просмотра пакетов.';
    }
    if (err.status === 404) {
      return 'Сервис пакетов временно недоступен. Обновите страницу или перезапустите backend.';
    }
    if (err.status === 422) {
      const msg = (err.message || '').trim();
      if (msg && !/^\{/.test(msg) && !msg.includes('"loc"')) return msg;
      return 'Проверьте заполненные поля и повторите сохранение.';
    }
    return err.message || 'Не удалось загрузить пакеты.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось загрузить пакеты.';
}

export function safeAdminAddonUpdateErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Недостаточно прав для изменения пакета.';
    }
    if (err.status === 404) return 'Пакет не найден.';
    if (err.status === 409) {
      if (err.code === 'addon_in_use') {
        return (
          err.message ||
          'Пакет уже использовался в покупках или других данных и не может быть удалён. Его можно скрыть или архивировать.'
        );
      }
      if (err.code === 'addon_type_frozen') {
        return err.message || 'Тип ресурса нельзя менять: пакет уже использовался.';
      }
      const msg = (err.message || '').trim();
      if (msg && !/^\{/.test(msg)) return msg;
      return 'Пакет с таким кодом уже существует.';
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
  return 'Не удалось сохранить пакет.';
}
