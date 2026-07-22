/**
 * Публичный каталог дополнений (GET /addons) — этап 8.2.5 / 6.1.
 */
import { get } from './client';

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
  team_members: 'Участники команды',
  team_member: 'Участник команды',
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

/** Visible validity line from backend validity_days (not a hardcoded FE-only 30). */
export function addonValidityLabel(addon: Pick<PublicAddon, 'validity_days'>): string {
  const days =
    typeof addon.validity_days === 'number' && addon.validity_days > 0 ? addon.validity_days : 30;
  return `Срок действия: ${days} дней с момента активации`;
}

export function addonActivationValiditySentence(addon: Pick<PublicAddon, 'validity_days'>): string {
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
