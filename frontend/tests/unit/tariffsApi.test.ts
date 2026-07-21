import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RECOMMENDED_BADGE_LABEL,
  buildTariffLimitLines,
  formatTariffPriceMonth,
  getPublicTariffs,
} from '@/api/tariffs';

vi.mock('@/api/client', () => ({
  get: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { get } from '@/api/client';

describe('getPublicTariffs', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it('calls GET /tariffs', async () => {
    vi.mocked(get).mockResolvedValue([]);
    await getPublicTariffs();
    expect(get).toHaveBeenCalledWith('/tariffs');
  });

  it('normalizes tariff items from API', async () => {
    vi.mocked(get).mockResolvedValue([
      {
        code: 'start',
        name: 'Старт',
        description_ru: null,
        price_month: '0.00',
        currency: 'RUB',
        is_recommended: false,
        sort_order: 10,
        limits: { active_bots: 1, monthly_messages: 500 },
      },
    ]);
    const items = await getPublicTariffs();
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('start');
    expect(items[0].price_month).toBe('0.00');
    expect(items[0].limits.active_bots).toBe(1);
  });
});

describe('formatTariffPriceMonth', () => {
  it('shows Бесплатно for price 0', () => {
    expect(formatTariffPriceMonth(0)).toBe('Бесплатно');
    expect(formatTariffPriceMonth('0')).toBe('Бесплатно');
    expect(formatTariffPriceMonth('0.00')).toBe('Бесплатно');
  });

  it('shows По запросу for null price', () => {
    expect(formatTariffPriceMonth(null)).toBe('По запросу');
  });

  it('formats monthly price with currency', () => {
    expect(formatTariffPriceMonth(990, 'RUB')).toBe('990 ₽/мес');
  });
});

describe('buildTariffLimitLines', () => {
  it('uses user-facing labels and skips missing keys', () => {
    const lines = buildTariffLimitLines({
      active_bots: 3,
      monthly_messages: 10000,
      export_reports: true,
      unknown_key: 1,
    });
    expect(lines.some(l => l.includes('Активные боты'))).toBe(true);
    expect(lines.some(l => l.includes('Сообщений в месяц'))).toBe(true);
    expect(lines.some(l => l.includes('Экспорт отчётов'))).toBe(true);
    expect(lines.every(l => !l.includes('unknown_key'))).toBe(true);
    expect(lines.every(l => !l.includes('active_bots'))).toBe(true);
  });
});

describe('recommended badge label', () => {
  it('exposes Рекомендуем label constant', () => {
    expect(RECOMMENDED_BADGE_LABEL).toBe('Рекомендуем');
  });
});
