/**
 * Admin AddonPricingGrid versions + tiers (Этап 7.2).
 * /api/admin/tariffs/addon-pricing-grids
 */
import { get, patch, post, del, ApiError } from './client';

export const ADMIN_PRICING_GRIDS_API_PATH = '/api/admin/tariffs/addon-pricing-grids';
/** @deprecated flat list of active tiers only — prefer grids API */
export const ADMIN_PRICING_TIERS_API_PATH = '/api/admin/tariffs/addon-pricing-tiers';

export type PricingGridStatus = 'draft' | 'active' | 'archived' | string;

export interface AdminPricingTier {
  id: number;
  grid_version_id: number | null;
  resource_type: string;
  range_start: number;
  range_end: number | null;
  unit_price: string;
  currency: string;
  is_active: boolean;
  sort_order: number;
  used_in_purchases: boolean;
  can_delete: boolean;
}

export interface AdminPricingGridVersion {
  id: number;
  resource_type: string;
  currency: string;
  status: PricingGridStatus;
  version_number: number;
  based_on_version_id: number | null;
  created_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  note: string | null;
  tiers_count: number;
  tiers: AdminPricingTier[];
}

export interface AdminPricingGridVersionList {
  items: AdminPricingGridVersion[];
  total: number;
}

export interface AdminPricingGridCreateDraftPayload {
  resource_type: string;
  currency?: string;
  based_on_version_id?: number | null;
  note?: string | null;
}

export interface AdminPricingGridTierCreatePayload {
  range_start: number;
  range_end?: number | null;
  unit_price: string;
  currency?: string;
  sort_order?: number;
}

export interface AdminPricingGridTierUpdatePayload {
  range_start?: number;
  range_end?: number | null;
  unit_price?: string;
  currency?: string;
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

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

export function normalizeAdminPricingTier(raw: unknown): AdminPricingTier | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = asNumber(o.id, 0);
  if (!id) return null;
  return {
    id,
    grid_version_id: asNullableNumber(o.grid_version_id),
    resource_type: asString(o.resource_type, 'messages'),
    range_start: asNumber(o.range_start, 1),
    range_end: asNullableNumber(o.range_end),
    unit_price: asString(o.unit_price, '0'),
    currency: asString(o.currency, 'RUB'),
    is_active: asBool(o.is_active, true),
    sort_order: asNumber(o.sort_order, 0),
    used_in_purchases: asBool(o.used_in_purchases, false),
    can_delete: asBool(o.can_delete, true),
  };
}

export function normalizeAdminPricingGridVersion(raw: unknown): AdminPricingGridVersion | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = asNumber(o.id, 0);
  if (!id) return null;
  const tiersRaw = Array.isArray(o.tiers) ? o.tiers : [];
  const tiers = tiersRaw
    .map(normalizeAdminPricingTier)
    .filter((t): t is AdminPricingTier => t != null);
  return {
    id,
    resource_type: asString(o.resource_type, 'messages'),
    currency: asString(o.currency, 'RUB'),
    status: asString(o.status, 'draft'),
    version_number: asNumber(o.version_number, 0),
    based_on_version_id: asNullableNumber(o.based_on_version_id),
    created_at: asNullableString(o.created_at),
    published_at: asNullableString(o.published_at),
    archived_at: asNullableString(o.archived_at),
    note: asNullableString(o.note),
    tiers_count: asNumber(o.tiers_count, tiers.length),
    tiers,
  };
}

export async function listAdminPricingGrids(params?: {
  resource_type?: string;
}): Promise<AdminPricingGridVersionList> {
  const q = new URLSearchParams();
  if (params?.resource_type) q.set('resource_type', params.resource_type);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const raw = await get(`${ADMIN_PRICING_GRIDS_API_PATH}${suffix}`);
  const o = asRecord(raw) ?? {};
  const items = Array.isArray(o.items)
    ? o.items
        .map(normalizeAdminPricingGridVersion)
        .filter((v): v is AdminPricingGridVersion => v != null)
    : [];
  return { items, total: asNumber(o.total, items.length) };
}

export async function getAdminPricingGrid(id: number): Promise<AdminPricingGridVersion> {
  const raw = await get(`${ADMIN_PRICING_GRIDS_API_PATH}/${id}`);
  const version = normalizeAdminPricingGridVersion(raw);
  if (!version) throw new Error('Некорректный ответ сервера');
  return version;
}

export async function createAdminPricingGridDraft(
  payload: AdminPricingGridCreateDraftPayload
): Promise<AdminPricingGridVersion> {
  const raw = await post(ADMIN_PRICING_GRIDS_API_PATH, payload);
  const version = normalizeAdminPricingGridVersion(raw);
  if (!version) throw new Error('Некорректный ответ сервера');
  return version;
}

export async function publishAdminPricingGrid(id: number): Promise<AdminPricingGridVersion> {
  const raw = await post(`${ADMIN_PRICING_GRIDS_API_PATH}/${id}/publish`, {});
  const version = normalizeAdminPricingGridVersion(raw);
  if (!version) throw new Error('Некорректный ответ сервера');
  return version;
}

export async function archiveAdminPricingGrid(id: number): Promise<AdminPricingGridVersion> {
  const raw = await post(`${ADMIN_PRICING_GRIDS_API_PATH}/${id}/archive`, {});
  const version = normalizeAdminPricingGridVersion(raw);
  if (!version) throw new Error('Некорректный ответ сервера');
  return version;
}

export async function deleteAdminPricingGridDraft(id: number): Promise<void> {
  await del(`${ADMIN_PRICING_GRIDS_API_PATH}/${id}`);
}

export async function createAdminPricingGridTier(
  versionId: number,
  payload: AdminPricingGridTierCreatePayload
): Promise<AdminPricingTier> {
  const raw = await post(`${ADMIN_PRICING_GRIDS_API_PATH}/${versionId}/tiers`, payload);
  const tier = normalizeAdminPricingTier(raw);
  if (!tier) throw new Error('Некорректный ответ сервера');
  return tier;
}

export async function updateAdminPricingGridTier(
  versionId: number,
  tierId: number,
  payload: AdminPricingGridTierUpdatePayload
): Promise<AdminPricingTier> {
  const raw = await patch(`${ADMIN_PRICING_GRIDS_API_PATH}/${versionId}/tiers/${tierId}`, payload);
  const tier = normalizeAdminPricingTier(raw);
  if (!tier) throw new Error('Некорректный ответ сервера');
  return tier;
}

export async function deleteAdminPricingGridTier(versionId: number, tierId: number): Promise<void> {
  await del(`${ADMIN_PRICING_GRIDS_API_PATH}/${versionId}/tiers/${tierId}`);
}

/** @deprecated use listAdminPricingGrids */
export async function listAdminPricingTiers(): Promise<{
  items: AdminPricingTier[];
  total: number;
}> {
  const raw = await get(ADMIN_PRICING_TIERS_API_PATH);
  const o = asRecord(raw) ?? {};
  const items = Array.isArray(o.items)
    ? o.items.map(normalizeAdminPricingTier).filter((t): t is AdminPricingTier => t != null)
    : [];
  return { items, total: asNumber(o.total, items.length) };
}

export function safePricingGridsErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message && !/^\d{3}$/.test(err.message)) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось выполнить операцию с ценовой сеткой. Попробуйте ещё раз.';
}

/** @deprecated alias */
export const safePricingTierErrorMessage = safePricingGridsErrorMessage;

/** Human range: open-ended → «от 5 000», not fake upper bound / technical max. */
export function formatPricingTierRange(
  rangeStart: number,
  rangeEnd: number | null | undefined,
  /** Technical custom qty ceiling; ends at/above this are treated as open. */
  technicalMaxQuantity: number = 1_000_000
): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  if (rangeEnd == null || rangeEnd >= technicalMaxQuantity) {
    return `от ${fmt(rangeStart)}`;
  }
  return `${fmt(rangeStart)}–${fmt(rangeEnd)}`;
}

export function pricingGridStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Активная';
    case 'draft':
      return 'Черновик';
    case 'archived':
      return 'Архив';
    default:
      return status;
  }
}
