import { describe, it, expect } from 'vitest';
import {
  formatAverageUnitPriceRu,
  formatMoneyRu,
  humanPricingBreakdownLines,
} from '@/features/pricing/pricingDisplay';

describe('pricingDisplay', () => {
  it('formats money with comma decimals', () => {
    expect(formatMoneyRu('0.300000')).toBe('0,30 ₽');
    expect(formatMoneyRu('838.92')).toBe('838,92 ₽');
    expect(formatAverageUnitPriceRu('0.2432')).toMatch(/≈ 0,24 ₽ за сообщение/);
  });

  it('builds human breakdown without tier ids', () => {
    const lines = humanPricingBreakdownLines([
      { units: 999, unit_price: '0.30', subtotal: '299.70' },
      { units: 2451, unit_price: '0.22', subtotal: '539.22' },
    ]);
    expect(lines[0]).toMatch(/первые 999/);
    expect(lines[0]).toMatch(/0,30/);
    expect(lines[1]).toMatch(/следующие 2451/);
    expect(lines.join(' ')).not.toMatch(/tier/i);
  });
});
