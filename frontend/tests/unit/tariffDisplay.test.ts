import { describe, it, expect } from 'vitest';
import {
  formatUsageLine,
  giftDetails,
  giftTitle,
  planSourceLabel,
  usagePercent,
} from '@/features/dashboard/tariff/tariffDisplay';

describe('tariffDisplay', () => {
  it('planSourceLabel maps known sources', () => {
    expect(planSourceLabel('gift_plan')).toBe('Подарочный тариф');
    expect(planSourceLabel('unknown')).toBe('Тариф');
  });

  it('formatUsageLine shows unlimited', () => {
    expect(formatUsageLine({ used: 10, limit: null, remaining: null })).toBe(
      '10 / Безлимит · осталось: —'
    );
  });

  it('usagePercent caps at 100', () => {
    expect(usagePercent({ used: 600, limit: 500, remaining: 0 })).toBe(100);
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
