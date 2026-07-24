import { describe, it, expect } from 'vitest';
import {
  nextDefaultSortOrder,
  PLAN_SORT_ORDER_STEP,
  slugifyPlanCode,
  DELETE_PLAN_BLOCKED_HINT,
} from '@/features/dashboard/finance/tariffsAdminDisplay';

describe('tariffsAdminDisplay helpers (7.1 UX)', () => {
  it('slugifyPlanCode transliterates Russian and keeps [a-z0-9_]', () => {
    expect(slugifyPlanCode('Бизнес Максимум')).toBe('biznes_maksimum');
    expect(slugifyPlanCode('Test Admin Tariff')).toBe('test_admin_tariff');
    expect(slugifyPlanCode('  Hello!! World  ')).toBe('hello_world');
  });

  it('nextDefaultSortOrder uses max active + step', () => {
    expect(nextDefaultSortOrder([])).toBe(0);
    expect(
      nextDefaultSortOrder([
        { sort_order: 10, is_active: true },
        { sort_order: 40, is_active: true },
        { sort_order: 99, is_active: false },
      ])
    ).toBe(40 + PLAN_SORT_ORDER_STEP);
  });

  it('blocked delete hint mentions purchases/data', () => {
    expect(DELETE_PLAN_BLOCKED_HINT).toMatch(/покупк/i);
    expect(DELETE_PLAN_BLOCKED_HINT).toMatch(/архивир/i);
  });
});
