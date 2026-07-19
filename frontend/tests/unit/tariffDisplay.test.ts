import { describe, it, expect } from 'vitest';
import { coerceUsageBlock, normalizeTariffSummary } from '@/api/tariff';
import {
  formatBillingPeriod,
  formatUsageLine,
  giftDetails,
  giftTitle,
  planSourceLabel,
  subscriptionStatusLabel,
  usageBarColor,
  usagePercent,
  warningSeverityColor,
  USAGE_WARNING_THRESHOLDS,
} from '@/features/dashboard/tariff/tariffDisplay';

describe('tariffDisplay', () => {
  it('planSourceLabel maps known sources', () => {
    expect(planSourceLabel('gift_plan')).toBe('Подарочный тариф');
    expect(planSourceLabel('fallback_start')).toBe('Стартовый тариф');
    expect(planSourceLabel('unknown')).toBe('Тариф');
  });

  it('subscriptionStatusLabel maps active', () => {
    expect(subscriptionStatusLabel('active')).toBe('Активна');
  });

  it('formatBillingPeriod handles null', () => {
    expect(formatBillingPeriod(null)).toBe('Период не указан');
  });

  it('formatUsageLine shows unlimited', () => {
    expect(formatUsageLine({ used: 10, limit: null, remaining: null })).toBe(
      '10 / Безлимит · осталось: —'
    );
  });

  it('usagePercent caps at 100', () => {
    expect(usagePercent({ used: 600, limit: 500, remaining: 0 })).toBe(100);
  });

  it('supports warning threshold levels including 70/80/90/100', () => {
    expect([...USAGE_WARNING_THRESHOLDS]).toEqual([70, 80, 90, 100]);
    expect(warningSeverityColor(70)).toBe('#f59e0b');
    expect(warningSeverityColor(80)).toBe('#f97316');
    expect(warningSeverityColor(85)).toBe('#f97316');
    expect(warningSeverityColor(90)).toBe('#ef4444');
    expect(warningSeverityColor(95)).toBe('#ef4444');
    expect(warningSeverityColor(100)).toBe('#dc2626');
    expect(usageBarColor(70)).toMatch(/f59e0b|fbbf24/);
    expect(usageBarColor(100)).toMatch(/dc2626/);
  });

  it('giftTitle handles unsupported plan gift', () => {
    expect(giftTitle({ status: 'unsupported_missing_plan_id' })).toContain('настройки');
  });

  it('giftDetails shows safe message for unsupported', () => {
    const text = giftDetails({
      status: 'unsupported_missing_plan_id',
      message: 'PLAN gift requires plan_id',
    });
    expect(text).toContain('plan_id');
  });
});

describe('normalizeTariffSummary', () => {
  it('normalizes null arrays and partial flags', () => {
    const summary = normalizeTariffSummary({
      current_plan: {
        code: 'start',
        name: 'Старт',
        source: 'fallback_start',
        billing_period: null,
      },
      messages: { limit: 500, used: 10, remaining: 490 },
      active_addons: null,
      active_gifts: null,
      warnings: null,
      flags: { export_reports: false },
    });
    expect(summary.active_addons).toEqual([]);
    expect(summary.active_gifts).toEqual([]);
    expect(summary.warnings).toEqual([]);
    expect(summary.flags.marketplace_access).toBe(true);
    expect(summary.current_plan.billing_period).toBeNull();
  });

  it('coerceUsageBlock clamps invalid used', () => {
    expect(coerceUsageBlock({ limit: 5, used: -3, remaining: 8 }).used).toBe(0);
    expect(coerceUsageBlock({ limit: 5, used: 99, remaining: -1 }).remaining).toBe(0);
  });

  it('filters broken warnings', () => {
    const summary = normalizeTariffSummary({
      current_plan: { code: 'x', name: 'X', billing_period: { start: 'a', end: 'b' } },
      warnings: [{ type: 'messages_usage', threshold: 70, message: 'ok' }, { threshold: 1 }],
    });
    expect(summary.warnings).toHaveLength(1);
  });
});
