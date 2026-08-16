import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { AdminAddon } from '@/api/addonsAdmin';

const {
  listAdminAddons,
  getAdminCustomMessagesProduct,
  updateAdminAddon,
  createAdminAddon,
  setAdminAddonVisibility,
  archiveAdminAddon,
  reactivateAdminAddon,
  deleteAdminAddon,
  listAdminPricingTiers,
  toast,
} = vi.hoisted(() => ({
  listAdminAddons: vi.fn(),
  getAdminCustomMessagesProduct: vi.fn(),
  updateAdminAddon: vi.fn(),
  createAdminAddon: vi.fn(),
  setAdminAddonVisibility: vi.fn(),
  archiveAdminAddon: vi.fn(),
  reactivateAdminAddon: vi.fn(),
  deleteAdminAddon: vi.fn(),
  listAdminPricingTiers: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/addonsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/addonsAdmin')>('@/api/addonsAdmin');
  return {
    ...actual,
    listAdminAddons,
    getAdminCustomMessagesProduct,
    updateAdminAddon,
    createAdminAddon,
    setAdminAddonVisibility,
    archiveAdminAddon,
    reactivateAdminAddon,
    deleteAdminAddon,
  };
});

vi.mock('@/api/addonPricingAdmin', async () => {
  const actual =
    await vi.importActual<typeof import('@/api/addonPricingAdmin')>('@/api/addonPricingAdmin');
  return { ...actual, listAdminPricingTiers };
});

vi.mock('@/utils/toast', () => ({ toast }));

vi.mock('@/api/tariffsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariffsAdmin')>('@/api/tariffsAdmin');
  return {
    ...actual,
    listAdminPlans: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
});

vi.mock('@/api/refundsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/refundsAdmin')>('@/api/refundsAdmin');
  return {
    ...actual,
    listAdminRefunds: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
  };
});

vi.mock('@/api/paymentProvidersAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/paymentProvidersAdmin')>(
    '@/api/paymentProvidersAdmin'
  );
  return { ...actual, listPaymentProviders: vi.fn().mockResolvedValue([]) };
});

import AddonsAdminPanel from '@/features/dashboard/finance/AddonsAdminPanel';
import PlatformFinancePage from '@/features/dashboard/pages/PlatformFinancePage';

function pkg(overrides: Partial<AdminAddon> = {}): AdminAddon {
  return {
    id: 1,
    code: 'msg_1000',
    name_ru: '1000 сообщений',
    description_ru: 'Пакет',
    type: 'messages',
    amount: 1000,
    price: '199.00',
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: 30,
    available_from_plan: null,
    max_per_period: null,
    is_active: true,
    is_public: true,
    sort_order: 10,
    created_at: null,
    updated_at: null,
    user_addon_count: 0,
    checkout_count: 0,
    gift_count: 0,
    refund_count: 0,
    has_references: false,
    can_delete: true,
    ...overrides,
  };
}

const SAMPLE: AdminAddon[] = [
  pkg(),
  pkg({
    id: 2,
    code: 'bot_1',
    name_ru: '+1 бот',
    type: 'active_bot',
    amount: 1,
    price: '490.00',
    is_public: false,
    can_delete: false,
    has_references: true,
    user_addon_count: 3,
  }),
  pkg({
    id: 3,
    code: 'ai_pack',
    name_ru: 'ИИ-кредиты',
    type: 'ai_credits',
    amount: 50,
    price: '0.00',
    is_active: false,
    is_public: false,
    can_delete: true,
  }),
];

describe('PlatformFinancePage packages tab', () => {
  beforeEach(() => {
    listAdminAddons.mockReset();
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
  });

  it('replaces placeholder with AddonsAdminPanel', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/finance?tab=packages']}>
        <PlatformFinancePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('addons-admin-panel')).toBeTruthy();
    });
    expect(screen.queryByText(/будет реализовано позже/i)).toBeNull();
    expect(screen.getByTestId('finance-tab-packages').getAttribute('aria-selected')).toBe('true');
    expect(listAdminAddons).toHaveBeenCalled();
  });
});

describe('AddonsAdminPanel', () => {
  beforeEach(() => {
    listAdminAddons.mockReset();
    getAdminCustomMessagesProduct.mockReset();
    getAdminCustomMessagesProduct.mockResolvedValue({
      code: 'custom_messages',
      title: 'Настраиваемый пакет сообщений',
      public_title: 'Настроить пакет',
      resource_type: 'messages',
      sales_enabled: true,
      sales_status_label: 'Продажи включены',
      active_grid_version_id: 1,
      active_grid_version_number: 1,
      currency: 'RUB',
      validity_days: 30,
      min_quantity: 1,
      max_quantity: 1_000_000,
      pricing_grids_hint: 'Управление ценами — во вкладке «Ценовые ступени».',
    });
    listAdminPricingTiers.mockReset();
    listAdminPricingTiers.mockResolvedValue({ items: [], total: 0 });
    updateAdminAddon.mockReset();
    createAdminAddon.mockReset();
    setAdminAddonVisibility.mockReset();
    archiveAdminAddon.mockReset();
    reactivateAdminAddon.mockReset();
    deleteAdminAddon.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('shows system custom messages product card', async () => {
    listAdminAddons.mockResolvedValue({ items: [pkg()], total: 1 });
    render(<AddonsAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('addons-admin-system-custom-messages')).toBeTruthy();
    });
    expect(screen.getByText('Настраиваемый пакет сообщений')).toBeTruthy();
    expect(screen.getByTestId('addons-admin-goto-pricing-grids')).toBeTruthy();
  });

  it('shows loading then list from admin API', async () => {
    let resolve!: (v: { items: AdminAddon[]; total: number }) => void;
    listAdminAddons.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<AddonsAdminPanel />);
    expect(screen.getByTestId('addons-admin-loading')).toBeTruthy();
    resolve({ items: SAMPLE, total: SAMPLE.length });
    await waitFor(() => {
      expect(screen.getByTestId('addons-admin-table')).toBeTruthy();
    });
    expect(screen.getByTestId('addons-admin-row-msg_1000')).toBeTruthy();
    expect(screen.getByTestId('addons-admin-row-bot_1')).toBeTruthy();
  });

  it('shows type labels and public/hidden badges', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-row-bot_1'));
    expect(screen.getAllByText('Сообщения').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Боты').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Скрыт').length).toBeGreaterThan(0);
  });

  it('shows archived packages on archive subtab including ai_credits', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    fireEvent.click(screen.getByTestId('addons-admin-subtab-archived'));
    await waitFor(() => screen.getByTestId('addons-admin-row-ai_pack'));
    expect(screen.getAllByText('ИИ-кредиты').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Архивирован').length).toBeGreaterThan(0);
  });

  it('opens create modal with resource type select', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-create-open'));
    fireEvent.click(screen.getByTestId('addons-admin-create-open'));
    expect(screen.getByTestId('addons-admin-create-modal')).toBeTruthy();
    expect(screen.getByTestId('addons-admin-create-type')).toBeTruthy();
    expect(screen.getByTestId('addons-admin-create-save').className).toMatch(/bf-primary-cta/);
  });

  it('disables delete when references exist', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-actions-bot_1'));
    fireEvent.click(screen.getByTestId('addons-admin-actions-bot_1'));
    await waitFor(() => screen.getByTestId('addons-admin-delete-disabled-bot_1'));
    expect(
      (screen.getByTestId('addons-admin-delete-disabled-bot_1') as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByTestId('addons-admin-detail-btn-bot_1'));
    const refs = screen.getAllByTestId('addons-admin-refs-bot_1');
    expect(refs[0].textContent).toMatch(/Покупки: 3/);
  });

  it('shows forbidden error from API', async () => {
    listAdminAddons.mockRejectedValue(new ApiError('no', 403));
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-error'));
    expect(screen.getByTestId('addons-admin-error').textContent).toMatch(/Недостаточно прав/);
  });

  it('opens pricing tiers tab', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-subtab-tiers'));
    fireEvent.click(screen.getByTestId('addons-admin-subtab-tiers'));
    await waitFor(() => {
      expect(screen.getByTestId('addon-pricing-tiers-panel')).toBeTruthy();
    });
  });

  it('create form shows days for messages and period hint for bots', async () => {
    listAdminAddons.mockResolvedValue({ items: SAMPLE, total: SAMPLE.length });
    render(<AddonsAdminPanel />);
    await waitFor(() => screen.getByTestId('addons-admin-create-open'));
    fireEvent.click(screen.getByTestId('addons-admin-create-open'));
    expect(screen.getByTestId('addons-admin-create-validity-days')).toBeTruthy();
    expect(screen.queryByTestId('addons-admin-create-duration')).toBeNull();
    fireEvent.change(screen.getByTestId('addons-admin-create-type'), {
      target: { value: 'active_bot' },
    });
    expect(screen.getByTestId('addons-admin-create-period-hint')).toBeTruthy();
    expect(screen.queryByTestId('addons-admin-create-validity-days')).toBeNull();
    fireEvent.change(screen.getByTestId('addons-admin-create-type'), {
      target: { value: 'ai_credits' },
    });
    expect(screen.getByTestId('addons-admin-create-ai-duration-hint')).toBeTruthy();
  });
});
