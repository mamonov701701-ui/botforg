import { describe, it, expect } from 'vitest';
import {
  normalizeRefundablePurchase,
  normalizeRefundRequest,
  safeRefundErrorMessage,
} from '@/api/refunds';
import { ApiError } from '@/api/client';
import {
  MANUAL_AMOUNT_LABEL,
  canUserCancelRefund,
  formatRecommendedRefundAmount,
  refundStatusHint,
  refundStatusLabel,
  unavailableReasonLabel,
} from '@/features/dashboard/refunds/refundDisplay';

describe('refundDisplay', () => {
  it('labels key statuses', () => {
    expect(refundStatusLabel('manual_review_required')).toMatch(/ручн/i);
    expect(refundStatusLabel('needs_information')).toMatch(/сведен/i);
    expect(refundStatusLabel('rejected')).toMatch(/отклон/i);
    expect(refundStatusLabel('approved')).toMatch(/одобр/i);
    expect(refundStatusLabel('canceled')).toMatch(/отмен/i);
  });

  it('does not claim money returned on approved', () => {
    const hint = refundStatusHint('approved', { amountLabel: '590.00 ₽' }) || '';
    expect(hint).toMatch(/Сумма возврата:\s*590\.00 ₽/);
    expect(hint.toLowerCase()).not.toMatch(
      /деньги возвращены|средства возвращены|подтвердила возврат/
    );
    expect(hint).toMatch(/ещё не отправлены|следующий этап/i);
  });

  it('processing and refunded stages are distinct', () => {
    expect(refundStatusLabel('refund_processing')).toMatch(/выполняется/i);
    expect(refundStatusHint('refund_processing') || '').toMatch(/платёжную систему/i);
    expect(refundStatusLabel('refunded')).toMatch(/деньги возвращены/i);
    expect(refundStatusHint('refunded', { amountLabel: '100 ₽' }) || '').toMatch(
      /подтвердила возврат 100 ₽/i
    );
  });

  it('shows admin-determined amount for null / undefined flags', () => {
    expect(formatRecommendedRefundAmount(null)).toBe(MANUAL_AMOUNT_LABEL);
    expect(formatRecommendedRefundAmount('0.00', { proposedAmountUndefined: true })).toBe(
      MANUAL_AMOUNT_LABEL
    );
    expect(formatRecommendedRefundAmount('190.00', { currency: 'RUB' })).toBe('190.00 ₽');
  });

  it('allows cancel only in open statuses', () => {
    expect(canUserCancelRefund('awaiting_admin_review')).toBe(true);
    expect(canUserCancelRefund('manual_review_required')).toBe(true);
    expect(canUserCancelRefund('needs_information')).toBe(true);
    expect(canUserCancelRefund('approved')).toBe(false);
    expect(canUserCancelRefund('rejected')).toBe(false);
    expect(canUserCancelRefund('canceled')).toBe(false);
  });

  it('labels unavailable reasons', () => {
    expect(unavailableReasonLabel('active_refund_request')).toMatch(/активн/i);
    expect(unavailableReasonLabel('refund_completed')).toMatch(/заверш/i);
  });
});

describe('refunds api normalize', () => {
  it('normalizes null recommended amount', () => {
    const row = normalizeRefundRequest({
      id: 7,
      checkout_intent_id: 3,
      payment_attempt_id: 4,
      status: 'manual_review_required',
      reason_category: 'unused',
      user_comment: null,
      current_revision_number: 1,
      version: 2,
      recommended_refund_amount: null,
      currency: 'RUB',
      refund_type: 'partial',
      calculation_status: 'manual_required',
      proposed_amount_undefined: true,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      submitted_at: '2026-07-01T00:00:00Z',
      completed_at: null,
    });
    expect(row.recommended_refund_amount).toBeNull();
    expect(row.proposed_amount_undefined).toBe(true);
    expect(
      formatRecommendedRefundAmount(row.recommended_refund_amount, {
        proposedAmountUndefined: row.proposed_amount_undefined,
      })
    ).toBe(MANUAL_AMOUNT_LABEL);
  });

  it('normalizes refundable purchase amount as string', () => {
    const row = normalizeRefundablePurchase({
      checkout_intent_id: 1,
      payment_attempt_id: 2,
      product_type: 'addon',
      product_code: 'msg_1000',
      product_name: 'Messages',
      amount: 190,
      currency: 'RUB',
      paid_at: '2026-07-01T00:00:00Z',
      current_refund_status: null,
      current_refund_request_id: null,
      can_request_refund: true,
      unavailable_reason: null,
    });
    expect(row.amount).toBe('190.00');
    expect(row.can_request_refund).toBe(true);
  });

  it('maps ApiError to safe message', () => {
    expect(safeRefundErrorMessage(new ApiError('x', 404, 'request_not_found'))).toMatch(
      /не найдена/i
    );
    expect(safeRefundErrorMessage(new ApiError('x', 404))).toMatch(/не удалось загрузить/i);
    expect(safeRefundErrorMessage(new ApiError('conflict', 409, 'version_conflict'))).toMatch(
      /уже была изменена/i
    );
    expect(safeRefundErrorMessage(new ApiError('dup', 409, 'duplicate_open_request'))).toMatch(
      /активн/i
    );
  });
});
