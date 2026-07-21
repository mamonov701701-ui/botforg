import { describe, it, expect } from 'vitest';
import {
  actorTypeLabel,
  auditActionLabel,
  calculationStatusLabel,
  formatRecommendedOrManual,
  MANUAL_AMOUNT_LABEL,
  MANUAL_REVIEW_GUIDANCE,
  parseRefundCalcDisplay,
  parseUsageDisplay,
  resolveNextAdminStep,
  SET_REFUND_AMOUNT_LABEL,
  CONFIRM_CALC_LABEL,
  APPROVE_REQUEST_LABEL,
  ADMIN_APPROVED_NOTICE,
} from '@/features/dashboard/finance/refundAdminDisplay';

describe('refundAdminDisplay helpers', () => {
  it('localizes audit and actors', () => {
    expect(actorTypeLabel('system')).toBe('Система');
    expect(auditActionLabel('revision_created')).toBe('Создан новый расчёт');
    expect(auditActionLabel('status_changed')).toBe('Смена статуса');
    expect(auditActionLabel('user_information_provided')).toMatch(/дополнительную информацию/i);
    expect(calculationStatusLabel('manual_required')).toBe('Требуется ручная проверка');
  });

  it('resolves next admin step', () => {
    expect(resolveNextAdminStep('manual_review_required').primaryLabel).toBe(
      SET_REFUND_AMOUNT_LABEL
    );
    expect(resolveNextAdminStep('manual_review_required').statusNote).toBe(MANUAL_REVIEW_GUIDANCE);
    expect(resolveNextAdminStep('admin_edited').primaryLabel).toBe(CONFIRM_CALC_LABEL);
    expect(resolveNextAdminStep('awaiting_admin_review').primaryLabel).toBe(APPROVE_REQUEST_LABEL);
    expect(resolveNextAdminStep('awaiting_final_confirmation').primaryLabel).toBe(
      APPROVE_REQUEST_LABEL
    );
    expect(resolveNextAdminStep('approved').nextActionText).toBe(ADMIN_APPROVED_NOTICE);
  });

  it('hides technical 0.00 recommendation', () => {
    expect(formatRecommendedOrManual('0.00', { manualReviewRequired: true, currency: 'RUB' })).toBe(
      MANUAL_AMOUNT_LABEL
    );
    expect(
      formatRecommendedOrManual('0.00', { proposedAmountUndefined: true, currency: 'RUB' })
    ).toBe(MANUAL_AMOUNT_LABEL);
    expect(formatRecommendedOrManual('0.00', { currency: 'RUB' })).toBe(MANUAL_AMOUNT_LABEL);
    expect(formatRecommendedOrManual('190.00', { currency: 'RUB' })).toMatch(/190\.00/);
  });

  it('parses usage snapshot for humans', () => {
    const u = parseUsageDisplay({
      messages_used_total: 3,
      active_bots_used_total: 1,
      team_members_used_total: 2,
      detectable_pool_usage_after_purchase: true,
    });
    expect(u.hasData).toBe(true);
    expect(u.messagesUsed).toBe(3);
    expect(u.activeBots).toBe(1);
    expect(u.teamMembers).toBe(2);
    expect(u.activityAfterPurchase).toBe(true);
  });

  it('parses financial snapshot for calc block', () => {
    const c = parseRefundCalcDisplay(
      {
        ledger_balance: {
          paid_amount: '190.00',
          confirmed_refunded_amount: '0.00',
          active_reserved_amount: '10.00',
          refundable_available_amount: '180.00',
        },
      },
      { proposed_refund_amount: '180.00', currency: 'RUB', paid_amount: '190.00' }
    );
    expect(c.paid).toBe('190.00');
    expect(c.alreadyRefunded).toBe('0.00');
    expect(c.reserved).toBe('10.00');
    expect(c.available).toBe('180.00');
    expect(c.recommended).toBe('180.00');
  });
});
