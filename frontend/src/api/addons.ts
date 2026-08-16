/**
 * Публичный каталог дополнений (GET /addons) — этап 8.2.5 / 6.1.
 */
import { get, post } from './client';

export interface PublicAddon {
  code: string;
  name_ru: string;
  description_ru: string | null;
  type: string;
  amount: number;
  price: string | number;
  currency: string;
  duration_type: string;
  /** Calendar days from successful activation (from backend). */
  validity_days: number;
  available_from_plan: unknown;
  max_per_period: number | null;
  sort_order: number;
}

const ADDON_TYPE_LABELS: Record<string, string> = {
  messages: 'Сообщения',
  active_bots: 'Активные боты',
  active_bot: 'Активные боты',
  bots: 'Боты',
  team_members: 'Участники команды',
  team_member: 'Участник команды',
  ai_credits: 'ИИ-кредиты',
};

const DURATION_LABELS: Record<string, string> = {
  current_period: 'До конца текущего периода',
  current_billing_period: 'До конца текущего расчётного периода',
  permanent: 'Бессрочно',
  forever: 'Бессрочно',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function addonResourceTypeLabel(type: string): string {
  const key = (type || '').toLowerCase();
  return ADDON_TYPE_LABELS[key] ?? 'Ресурс';
}

export function addonDurationLabel(durationType: string): string {
  const key = (durationType || '').toLowerCase();
  if (DURATION_LABELS[key]) return DURATION_LABELS[key];
  if (!key) return '';
  return 'Срок действия указан продавцом';
}

function isCapacityAddonType(type: string | undefined): boolean {
  const t = (type || '').toLowerCase();
  return (
    t === 'active_bot' ||
    t === 'team_member' ||
    t === 'bots' ||
    t === 'active_bots' ||
    t === 'team_members'
  );
}

/** Visible validity line from backend validity_days (not a hardcoded FE-only 30). */
export function addonValidityLabel(addon: Pick<PublicAddon, 'validity_days'>): string {
  const days =
    typeof addon.validity_days === 'number' && addon.validity_days > 0 ? addon.validity_days : 30;
  return `Срок действия: ${days} дней с момента активации`;
}

export function addonActivationValiditySentence(
  addon: Pick<PublicAddon, 'type' | 'validity_days' | 'duration_type'>
): string {
  if (isCapacityAddonType(addon.type)) {
    return 'Пакет действует до конца текущего тарифного периода';
  }
  const days =
    typeof addon.validity_days === 'number' && addon.validity_days > 0 ? addon.validity_days : 30;
  return `Пакет будет действовать ${days} дней с момента успешной активации`;
}

export function formatAddonPrice(price: unknown, currency: string = 'RUB'): string {
  if (price === null || price === undefined) return 'Цена не указана';
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return 'Цена не указана';
  if (n <= 0) return 'Бесплатно';
  const cur = (currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : currency;
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${formatted} ${cur}`;
}

export function formatAddonAmountLine(addon: Pick<PublicAddon, 'type' | 'amount'>): string {
  const typeLabel = addonResourceTypeLabel(addon.type);
  const amount = Number.isFinite(addon.amount) ? addon.amount : 0;
  return `${typeLabel}: +${amount}`;
}

function normalizePublicAddon(raw: unknown): PublicAddon {
  const o = asRecord(raw);
  const priceRaw = o.price;
  let price: string | number = 0;
  if (typeof priceRaw === 'number' || typeof priceRaw === 'string') {
    price = priceRaw;
  }
  const maxRaw = o.max_per_period;
  return {
    code: String(o.code || ''),
    name_ru: String(o.name_ru || o.code || ''),
    description_ru:
      o.description_ru == null || o.description_ru === '' ? null : String(o.description_ru),
    type: String(o.type || ''),
    amount: typeof o.amount === 'number' ? o.amount : Number(o.amount) || 0,
    price,
    currency: String(o.currency || 'RUB'),
    duration_type: String(o.duration_type || ''),
    validity_days:
      typeof o.validity_days === 'number' && o.validity_days > 0
        ? o.validity_days
        : Number(o.validity_days) > 0
          ? Number(o.validity_days)
          : 30,
    available_from_plan: o.available_from_plan ?? null,
    max_per_period:
      maxRaw === null || maxRaw === undefined
        ? null
        : typeof maxRaw === 'number'
          ? maxRaw
          : Number(maxRaw) || null,
    sort_order: typeof o.sort_order === 'number' ? o.sort_order : Number(o.sort_order) || 0,
  };
}

export const CUSTOM_MESSAGES_CODE = 'custom_messages';
export const CUSTOM_PACK_TITLE_RU = 'Настроить пакет';
/**
 * Fallback UX ceiling until /me/addons/custom-messages-config loads.
 * Authoritative value is always backend MAX_CUSTOM_QUANTITY.
 */
export const MAX_CUSTOM_MESSAGES_QUANTITY = 1_000_000;
export const MIN_CUSTOM_MESSAGES_QUANTITY = 1;

export interface CustomMessagesConfig {
  min_quantity: number;
  max_quantity: number;
  validity_days: number;
  sales_enabled: boolean;
  currency: string;
}

export interface CustomAddonQuoteBand {
  tier_id: number;
  range_start: number;
  range_end: number | null;
  units: number;
  unit_price: string;
  subtotal: string;
}

export interface CustomAddonQuote {
  resource_type: string;
  quantity: number;
  currency: string;
  total: string;
  average_unit_price: string;
  validity_days: number;
  checkout_code: string;
  product_name: string;
  bands: CustomAddonQuoteBand[];
  min_quantity: number;
  max_quantity: number;
}

export function addonPublicDurationLabel(
  addon: Pick<PublicAddon, 'type' | 'validity_days' | 'duration_type'>
): string {
  if (isCapacityAddonType(addon.type)) {
    return 'Срок действия: до конца текущего тарифного периода';
  }
  return addonValidityLabel(addon);
}

function normalizeQuoteBand(raw: unknown): CustomAddonQuoteBand | null {
  const o = asRecord(raw);
  const tierId = typeof o.tier_id === 'number' ? o.tier_id : Number(o.tier_id);
  const units = typeof o.units === 'number' ? o.units : Number(o.units);
  if (!Number.isFinite(tierId) || !Number.isFinite(units)) return null;
  return {
    tier_id: tierId,
    range_start: typeof o.range_start === 'number' ? o.range_start : Number(o.range_start) || 0,
    range_end:
      o.range_end == null || o.range_end === ''
        ? null
        : typeof o.range_end === 'number'
          ? o.range_end
          : Number(o.range_end),
    units,
    unit_price: String(o.unit_price ?? ''),
    subtotal: String(o.subtotal ?? ''),
  };
}

export function normalizeCustomAddonQuote(raw: unknown): CustomAddonQuote {
  const o = asRecord(raw);
  const bandsRaw = Array.isArray(o.bands) ? o.bands : [];
  return {
    resource_type: String(o.resource_type || 'messages'),
    quantity: typeof o.quantity === 'number' ? o.quantity : Number(o.quantity) || 0,
    currency: String(o.currency || 'RUB'),
    total: String(o.total ?? '0.00'),
    average_unit_price: String(o.average_unit_price ?? ''),
    validity_days:
      typeof o.validity_days === 'number' && o.validity_days > 0 ? o.validity_days : 30,
    checkout_code: String(o.checkout_code || CUSTOM_MESSAGES_CODE),
    product_name: String(o.product_name || CUSTOM_PACK_TITLE_RU),
    bands: bandsRaw.map(normalizeQuoteBand).filter((b): b is CustomAddonQuoteBand => b != null),
    min_quantity:
      typeof o.min_quantity === 'number' && o.min_quantity > 0
        ? o.min_quantity
        : MIN_CUSTOM_MESSAGES_QUANTITY,
    max_quantity:
      typeof o.max_quantity === 'number' && o.max_quantity > 0
        ? o.max_quantity
        : MAX_CUSTOM_MESSAGES_QUANTITY,
  };
}

/** GET /me/addons/custom-messages-config — authoritative min/max for UX. */
export async function getCustomMessagesConfig(): Promise<CustomMessagesConfig> {
  const raw = await get('/me/addons/custom-messages-config');
  const o = asRecord(raw) ?? {};
  return {
    min_quantity:
      typeof o.min_quantity === 'number' && o.min_quantity > 0
        ? o.min_quantity
        : MIN_CUSTOM_MESSAGES_QUANTITY,
    max_quantity:
      typeof o.max_quantity === 'number' && o.max_quantity > 0
        ? o.max_quantity
        : MAX_CUSTOM_MESSAGES_QUANTITY,
    validity_days:
      typeof o.validity_days === 'number' && o.validity_days > 0 ? o.validity_days : 30,
    sales_enabled: Boolean(o.sales_enabled),
    currency: String(o.currency || 'RUB'),
  };
}

/** POST /me/addons/custom-quote — authoritative server price. */
export async function quoteCustomAddon(input: {
  quantity: number;
  resource_type?: string;
}): Promise<CustomAddonQuote> {
  const raw = await post('/me/addons/custom-quote', {
    resource_type: input.resource_type || 'messages',
    quantity: input.quantity,
  });
  return normalizeCustomAddonQuote(raw);
}

export async function getPublicAddons(): Promise<PublicAddon[]> {
  const raw = await get('/addons');
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(normalizePublicAddon)
    .filter(a => a.code)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}
