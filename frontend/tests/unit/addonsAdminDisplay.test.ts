import { describe, it, expect } from 'vitest';
import {
  addonTypeLabel,
  addonAdminDurationLabel,
  addonDurationUiKind,
  formatAddonAdminPrice,
  nextAddonDefaultSortOrder,
  slugifyAddonCode,
  ADDON_SORT_ORDER_STEP,
  DELETE_ADDON_BLOCKED_HINT,
} from '@/features/dashboard/finance/addonsAdminDisplay';

describe('addonsAdminDisplay helpers (7.2)', () => {
  it('maps stored types to Russian labels including bots and ai_credits', () => {
    expect(addonTypeLabel('messages')).toBe('Сообщения');
    expect(addonTypeLabel('active_bot')).toBe('Боты');
    expect(addonTypeLabel('bots')).toBe('Боты');
    expect(addonTypeLabel('team_member')).toBe('Участники команды');
    expect(addonTypeLabel('ai_credits')).toBe('ИИ-кредиты');
  });

  it('formats price with ruble', () => {
    expect(formatAddonAdminPrice('199.00', 'RUB')).toMatch(/199/);
    expect(formatAddonAdminPrice('199.00', 'RUB')).toMatch(/₽/);
  });

  it('slugifyAddonCode transliterates Russian', () => {
    expect(slugifyAddonCode('1000 сообщений')).toBe('1000_soobscheniy');
  });

  it('nextAddonDefaultSortOrder uses max active + step', () => {
    expect(nextAddonDefaultSortOrder([])).toBe(0);
    expect(
      nextAddonDefaultSortOrder([
        { sort_order: 10, is_active: true },
        { sort_order: 40, is_active: true },
        { sort_order: 99, is_active: false },
      ])
    ).toBe(40 + ADDON_SORT_ORDER_STEP);
  });

  it('blocked delete hint mentions purchases and archive', () => {
    expect(DELETE_ADDON_BLOCKED_HINT).toMatch(/покупк/i);
    expect(DELETE_ADDON_BLOCKED_HINT).toMatch(/архивир/i);
  });

  it('duration UX depends on resource type', () => {
    expect(addonDurationUiKind('messages')).toBe('messages');
    expect(addonDurationUiKind('active_bot')).toBe('capacity');
    expect(addonDurationUiKind('team_member')).toBe('capacity');
    expect(addonDurationUiKind('ai_credits')).toBe('ai_credits');
    expect(addonAdminDurationLabel({ type: 'messages', validity_days: 30 })).toMatch(/30/);
    expect(addonAdminDurationLabel({ type: 'active_bot', validity_days: 30 })).toMatch(
      /тарифного периода/i
    );
    expect(addonAdminDurationLabel({ type: 'ai_credits', validity_days: 30 })).toMatch(
      /следующих этапах/i
    );
  });
});
