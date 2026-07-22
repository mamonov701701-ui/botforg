import { describe, it, expect } from 'vitest';
import {
  formatPurchaseAmount,
  purchaseListRangeLabel,
  purchaseProductTypeFilterToApi,
  purchaseProductTypeLabel,
  purchaseStatusFilterToApi,
  purchaseStatusLabel,
  intentStatusToPurchaseStatus,
  purchaseIntentStatusLabel,
  canShowPurchaseRefundCta,
  purchaseFulfillmentMessage,
  purchaseProviderLabel,
  parsePurchaseIdParam,
} from '@/features/dashboard/purchases/purchaseDisplay';

describe('purchaseDisplay', () => {
  it('maps purchase_status to RU labels', () => {
    expect(purchaseStatusLabel('pending')).toBe('Ожидает оплаты');
    expect(purchaseStatusLabel('succeeded')).toBe('Оплачено');
    expect(purchaseStatusLabel('failed')).toBe('Ошибка оплаты');
    expect(purchaseStatusLabel('cancelled')).toBe('Отменено');
    expect(purchaseStatusLabel('refunded')).toBe('Возвращено');
  });

  it('maps product types', () => {
    expect(purchaseProductTypeLabel('tariff')).toBe('Тариф');
    expect(purchaseProductTypeLabel('addon')).toBe('Доп. пакет');
  });

  it('formats amount with currency', () => {
    expect(formatPurchaseAmount('990.00', 'RUB')).toBe('990.00 ₽');
  });

  it('maps filters to API params', () => {
    expect(purchaseProductTypeFilterToApi('all')).toBeUndefined();
    expect(purchaseProductTypeFilterToApi('tariff')).toBe('tariff');
    expect(purchaseProductTypeFilterToApi('addon')).toBe('addon');
    expect(purchaseStatusFilterToApi('all')).toBeUndefined();
    expect(purchaseStatusFilterToApi('succeeded')).toBe('fulfilled');
    expect(purchaseStatusFilterToApi('pending')).toBe('pending');
  });

  it('builds pagination range label', () => {
    expect(purchaseListRangeLabel(0, 20, 137, 20)).toBe('1–20 из 137');
    expect(purchaseListRangeLabel(20, 20, 137, 20)).toBe('21–40 из 137');
    expect(purchaseListRangeLabel(0, 20, 0, 0)).toBe('0 из 0');
  });

  it('maps intent status and refund CTA', () => {
    expect(intentStatusToPurchaseStatus('fulfilled')).toBe('succeeded');
    expect(intentStatusToPurchaseStatus('awaiting_payment')).toBe('pending');
    expect(purchaseIntentStatusLabel('cancelled')).toBe('Отменено');
    expect(canShowPurchaseRefundCta('fulfilled')).toBe(true);
    expect(canShowPurchaseRefundCta('pending')).toBe(false);
    expect(purchaseFulfillmentMessage({ status: 'fulfilled', fulfilled_subscription_id: 1 })).toBe(
      'Тариф активирован'
    );
    expect(purchaseFulfillmentMessage({ status: 'fulfilled', fulfilled_addon_id: 2 })).toBe(
      'Доп. пакет активирован'
    );
    expect(purchaseProviderLabel('yookassa')).toBe('ЮKassa');
    expect(parsePurchaseIdParam('12')).toBe(12);
    expect(parsePurchaseIdParam('x')).toBeNull();
  });
});
