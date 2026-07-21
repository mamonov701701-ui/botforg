/**
 * Публичный каталог тарифов (GET /tariffs) — этап 8.1 / 6.1.
 */
import { get } from './client';

export interface PublicTariff {
  code: string;
  name: string;
  description_ru: string | null;
  price_month: string | number | null;
  currency: string;
  is_recommended: boolean;
  sort_order: number;
  limits: Record<string, unknown>;
}

const LIMIT_LABELS: Array<{ key: string; label: string; format: (v: unknown) => string | null }> = [
  {
    key: 'active_bots',
    label: 'Активные боты',
    format: v => (v == null ? null : String(v)),
  },
  {
    key: 'monthly_messages',
    label: 'Сообщений в месяц',
    format: v => (v == null ? null : String(v)),
  },
  {
    key: 'team_members',
    label: 'Участников команды',
    format: v => (v == null ? null : String(v)),
  },
  {
    key: 'analytics_history_days',
    label: 'История аналитики',
    format: v => (v == null ? null : `${v} дн.`),
  },
  {
    key: 'export_reports',
    label: 'Экспорт отчётов',
    format: v => (typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : null),
  },
  {
    key: 'priority_support',
    label: 'Приоритетная поддержка',
    format: v => (typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : null),
  },
  {
    key: 'marketplace_access',
    label: 'Доступ к маркетплейсу',
    format: v => (typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : null),
  },
  {
    key: 'template_publish',
    label: 'Публикация шаблонов',
    format: v => (typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : null),
  },
  {
    key: 'scenario_publish',
    label: 'Публикация сценариев',
    format: v => (typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : null),
  },
];

export const RECOMMENDED_BADGE_LABEL = 'Рекомендуем';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePriceMonth(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Цена для карточки: «Бесплатно» / «По запросу» / «N ₽/мес». */
export function formatTariffPriceMonth(priceMonth: unknown, currency: string = 'RUB'): string {
  const n = normalizePriceMonth(priceMonth);
  if (n === null || n === undefined) return 'По запросу';
  if (n === 0) return 'Бесплатно';
  const cur = (currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : currency;
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${formatted} ${cur}/мес`;
}

/** Пользовательские строки лимитов; неизвестные ключи пропускаются. */
export function buildTariffLimitLines(limits: unknown): string[] {
  const rec = asRecord(limits);
  const lines: string[] = [];
  for (const item of LIMIT_LABELS) {
    if (!(item.key in rec)) continue;
    const formatted = item.format(rec[item.key]);
    if (formatted == null) continue;
    lines.push(`${item.label}: ${formatted}`);
  }
  return lines;
}

function normalizePublicTariff(raw: unknown): PublicTariff {
  const o = asRecord(raw);
  const priceRaw = o.price_month;
  let price_month: string | number | null = null;
  if (priceRaw === null || priceRaw === undefined) {
    price_month = null;
  } else if (typeof priceRaw === 'number' || typeof priceRaw === 'string') {
    price_month = priceRaw;
  } else {
    price_month = null;
  }
  return {
    code: String(o.code || ''),
    name: String(o.name || o.code || ''),
    description_ru:
      o.description_ru == null || o.description_ru === '' ? null : String(o.description_ru),
    price_month,
    currency: String(o.currency || 'RUB'),
    is_recommended: Boolean(o.is_recommended),
    sort_order: typeof o.sort_order === 'number' ? o.sort_order : Number(o.sort_order) || 0,
    limits: asRecord(o.limits),
  };
}

export async function getPublicTariffs(): Promise<PublicTariff[]> {
  const raw = await get('/tariffs');
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normalizePublicTariff).filter(t => t.code);
}
