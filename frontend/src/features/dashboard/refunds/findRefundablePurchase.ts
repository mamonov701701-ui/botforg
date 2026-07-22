/**
 * Поиск refundable purchase по checkout_intent_id с pagination (Этап 8.3.4).
 * Не загружает весь список одним запросом.
 */
import { listMyRefundablePurchases, type RefundablePurchase } from '../../../api/refunds';

export const REFUNDABLE_PICKER_PAGE_SIZE = 20;

export async function findRefundablePurchaseByIntent(
  intentId: number,
  options?: { pageSize?: number; maxPages?: number }
): Promise<RefundablePurchase | null> {
  const id = Number(intentId);
  if (!Number.isFinite(id) || id < 1) return null;

  const pageSize = options?.pageSize ?? REFUNDABLE_PICKER_PAGE_SIZE;
  const maxPages = options?.maxPages ?? 50;
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const data = await listMyRefundablePurchases({ limit: pageSize, offset });
    const found = data.items.find(p => p.checkout_intent_id === id);
    if (found) return found;
    if (data.items.length === 0) return null;
    offset += pageSize;
    if (offset >= data.total) return null;
  }
  return null;
}

export function parseRefundIntentParam(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
