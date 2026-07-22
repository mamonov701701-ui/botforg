/**
 * Отображение журнала покупок (Этап 8.3.2).
 * purchase_status → RU label; product_type → пользовательский тип.
 */

export type PurchaseStatusFilter =
  | 'all'
  | 'succeeded'
  | 'pending'
  | 'cancelled'
  | 'failed'
  | 'refunded';

export type PurchaseProductTypeFilter = 'all' | 'tariff' | 'addon';

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает оплаты',
  succeeded: 'Оплачено',
  failed: 'Ошибка оплаты',
  cancelled: 'Отменено',
  refunded: 'Возвращено',
};

/**
 * Backend list filter uses CheckoutIntent.status.
 * UI «Оплачено» → fulfilled (основной успешный кейс).
 */
const STATUS_FILTER_TO_INTENT: Record<Exclude<PurchaseStatusFilter, 'all'>, string> = {
  succeeded: 'fulfilled',
  pending: 'pending',
  cancelled: 'cancelled',
  failed: 'failed',
  refunded: 'refunded',
};

export function purchaseStatusLabel(status: string | null | undefined): string {
  const key = (status || '').trim().toLowerCase();
  if (!key) return '—';
  return PURCHASE_STATUS_LABELS[key] ?? 'Статус неизвестен';
}

export function purchaseProductTypeLabel(productType: string | null | undefined): string {
  const key = (productType || '').trim().toLowerCase();
  if (key === 'tariff') return 'Тариф';
  if (key === 'addon') return 'Доп. пакет';
  return 'Покупка';
}

export function formatPurchaseAmount(
  amount: string | null | undefined,
  currency: string | null | undefined
): string {
  const value = (amount || '').trim() || '0.00';
  const cur = (currency || 'RUB').toUpperCase();
  const symbol = cur === 'RUB' ? '₽' : cur;
  return `${value} ${symbol}`;
}

export function formatPurchaseDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function purchaseStatusFilterToApi(filter: PurchaseStatusFilter): string | undefined {
  if (filter === 'all') return undefined;
  return STATUS_FILTER_TO_INTENT[filter];
}

export function purchaseProductTypeFilterToApi(
  filter: PurchaseProductTypeFilter
): 'tariff' | 'addon' | undefined {
  if (filter === 'all') return undefined;
  return filter;
}

export function purchaseListRangeLabel(
  offset: number,
  limit: number,
  total: number,
  itemCount: number
): string {
  if (total <= 0 || itemCount <= 0) {
    return `0 из ${total}`;
  }
  const from = offset + 1;
  const to = offset + itemCount;
  return `${from}–${to} из ${total}`;
}

export const PURCHASE_PRODUCT_TYPE_OPTIONS: {
  value: PurchaseProductTypeFilter;
  label: string;
}[] = [
  { value: 'all', label: 'Все' },
  { value: 'tariff', label: 'Тарифы' },
  { value: 'addon', label: 'Доп. пакеты' },
];

export const PURCHASE_STATUS_FILTER_OPTIONS: {
  value: PurchaseStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'Все статусы' },
  { value: 'succeeded', label: 'Оплачено' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'cancelled', label: 'Отменено' },
  { value: 'failed', label: 'Ошибка' },
  { value: 'refunded', label: 'Возвращено' },
];

export const PURCHASES_PAGE_SIZE = 20;

/** CheckoutIntent.status → purchase_status для общего RU mapping. */
export function intentStatusToPurchaseStatus(intentStatus: string | null | undefined): string {
  const key = (intentStatus || '').trim().toLowerCase();
  if (key === 'fulfilled' || key === 'paid') return 'succeeded';
  if (key === 'refunded') return 'refunded';
  if (key === 'cancelled') return 'cancelled';
  if (key === 'failed') return 'failed';
  if (key === 'pending' || key === 'awaiting_payment') return 'pending';
  return key || 'pending';
}

export function purchaseIntentStatusLabel(intentStatus: string | null | undefined): string {
  return purchaseStatusLabel(intentStatusToPurchaseStatus(intentStatus));
}

/** CTA возврата только для fulfilled (eligibility проверит refund backend). */
export function canShowPurchaseRefundCta(intentStatus: string | null | undefined): boolean {
  return (intentStatus || '').trim().toLowerCase() === 'fulfilled';
}

export function purchaseProviderLabel(provider: string | null | undefined): string | null {
  const key = (provider || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'yookassa') return 'ЮKassa';
  return provider!.trim();
}

export function purchaseFulfillmentMessage(input: {
  product_type?: string | null;
  fulfilled_subscription_id?: number | null;
  fulfilled_addon_id?: number | null;
  status?: string | null;
}): string | null {
  const status = (input.status || '').trim().toLowerCase();
  if (status !== 'fulfilled' && status !== 'paid') return null;
  if (input.fulfilled_subscription_id != null) return 'Тариф активирован';
  if (input.fulfilled_addon_id != null) return 'Доп. пакет активирован';
  const type = (input.product_type || '').trim().toLowerCase();
  if (type === 'tariff') return 'Тариф активирован';
  if (type === 'addon') return 'Доп. пакет активирован';
  return null;
}

/** return_url после оплаты — обратно на detail покупки (polling уже на странице). */
export function buildPurchaseDetailReturnUrl(purchaseId: number): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/dashboard/finance/purchases/${encodeURIComponent(String(purchaseId))}`;
}

export function parsePurchaseIdParam(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
