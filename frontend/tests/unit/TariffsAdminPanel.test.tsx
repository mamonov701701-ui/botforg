import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { AdminPlan } from '@/api/tariffsAdmin';

const {
  listAdminPlans,
  updateAdminPlan,
  createAdminPlan,
  setAdminPlanVisibility,
  archiveAdminPlan,
  reactivateAdminPlan,
  deleteAdminPlan,
  toast,
} = vi.hoisted(() => ({
  listAdminPlans: vi.fn(),
  updateAdminPlan: vi.fn(),
  createAdminPlan: vi.fn(),
  setAdminPlanVisibility: vi.fn(),
  archiveAdminPlan: vi.fn(),
  reactivateAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/tariffsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariffsAdmin')>('@/api/tariffsAdmin');
  return {
    ...actual,
    listAdminPlans,
    updateAdminPlan,
    createAdminPlan,
    setAdminPlanVisibility,
    archiveAdminPlan,
    reactivateAdminPlan,
    deleteAdminPlan,
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

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
  return {
    ...actual,
    listPaymentProviders: vi.fn().mockResolvedValue([]),
  };
});

import TariffsAdminPanel from '@/features/dashboard/finance/TariffsAdminPanel';
import PlatformFinancePage from '@/features/dashboard/pages/PlatformFinancePage';
import {
  formatPlanPrice,
  planActiveLabel,
  planPublicLabel,
} from '@/features/dashboard/finance/tariffsAdminDisplay';

function plan(overrides: Partial<AdminPlan> = {}): AdminPlan {
  return {
    id: 1,
    code: 'start',
    name: 'Start',
    name_ru: 'Старт',
    description_ru: 'Описание',
    price_month: '490.00',
    currency: 'RUB',
    is_active: true,
    is_public: true,
    is_recommended: false,
    sort_order: 10,
    limits: {
      monthly_messages: 500,
      active_bots: 1,
      team_members: 0,
      analytics_history_days: 7,
      addon_purchase: false,
      export_reports: false,
      priority_support: false,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
    created_at: '2026-01-01T00:00:00Z',
    subscription_count: 0,
    checkout_count: 0,
    gift_count: 0,
    has_references: false,
    can_delete: true,
    ...overrides,
  };
}

const SAMPLE_PLANS: AdminPlan[] = [
  plan({
    id: 1,
    code: 'free',
    name: 'Free',
    name_ru: 'Free',
    price_month: '0.00',
    sort_order: 0,
  }),
  plan({
    id: 2,
    code: 'pro',
    name: 'Pro',
    name_ru: 'Pro',
    price_month: '990.00',
    is_recommended: true,
    sort_order: 20,
    subscription_count: 3,
    limits: {
      monthly_messages: 3000,
      active_bots: 5,
      team_members: 1,
      analytics_history_days: 30,
      addon_purchase: true,
      export_reports: true,
      priority_support: false,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
  }),
  plan({
    id: 3,
    code: 'developer',
    name: 'Developer',
    name_ru: 'Developer',
    price_month: null,
    is_public: false,
    sort_order: 30,
  }),
  plan({
    id: 4,
    code: 'business_pro',
    name: 'Business PRO',
    name_ru: 'Business PRO',
    price_month: '2990.00',
    sort_order: 40,
    is_recommended: true,
    limits: {
      monthly_messages: 10000,
      active_bots: 20,
      team_members: 3,
      analytics_history_days: 90,
      addon_purchase: true,
      export_reports: true,
      priority_support: true,
      marketplace_access: true,
      template_publish: true,
      scenario_publish: true,
    },
  }),
  plan({
    id: 5,
    code: 'archived_hidden',
    name: 'Old',
    name_ru: 'Старый',
    price_month: null,
    is_active: false,
    is_public: false,
    sort_order: 99,
    has_references: true,
    can_delete: false,
  }),
];

describe('tariffsAdminDisplay helpers', () => {
  it('formats null price as По запросу', () => {
    expect(formatPlanPrice(null)).toBe('По запросу');
  });

  it('formats active/public labels', () => {
    expect(planActiveLabel(true)).toBe('Активен');
    expect(planActiveLabel(false)).toBe('Архивирован');
    expect(planPublicLabel(true)).toBe('Публичный');
    expect(planPublicLabel(false)).toBe('Скрыт');
  });
});

describe('PlatformFinancePage tariffs tab', () => {
  beforeEach(() => {
    listAdminPlans.mockReset();
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
  });

  it('replaces placeholder with TariffsAdminPanel', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/finance?tab=tariffs']}>
        <PlatformFinancePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('tariffs-admin-panel')).toBeTruthy();
    });
    expect(screen.queryByText(/будет реализовано позже/i)).toBeNull();
    expect(screen.getByTestId('finance-tab-tariffs').getAttribute('aria-selected')).toBe('true');
    expect(listAdminPlans).toHaveBeenCalled();
  });
});

describe('TariffsAdminPanel', () => {
  beforeEach(() => {
    listAdminPlans.mockReset();
    updateAdminPlan.mockReset();
    createAdminPlan.mockReset();
    setAdminPlanVisibility.mockReset();
    archiveAdminPlan.mockReset();
    reactivateAdminPlan.mockReset();
    deleteAdminPlan.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('shows loading then list from admin API', async () => {
    let resolve!: (v: { items: AdminPlan[]; total: number }) => void;
    listAdminPlans.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<TariffsAdminPanel />);
    expect(screen.getByTestId('tariffs-admin-loading')).toBeTruthy();
    resolve({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    await waitFor(() => {
      expect(screen.getByTestId('tariffs-admin-table')).toBeTruthy();
    });
    expect(screen.getByTestId('tariffs-admin-row-free')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-row-pro')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-row-developer')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-row-business_pro')).toBeTruthy();
  });

  it('shows active/public statuses and recommended badge', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    await waitFor(() => screen.getByTestId('tariffs-admin-row-pro'));
    expect(screen.getAllByText('Активен').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Публичный').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Скрыт').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Рекомендуемый').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('tariffs-admin-subtab-archived'));
    await waitFor(() => screen.getByTestId('tariffs-admin-row-archived_hidden'));
    expect(screen.getAllByText('Архивирован').length).toBeGreaterThan(0);
  });

  it('shows По запросу for null price', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    await waitFor(() => screen.getByTestId('tariffs-admin-row-developer'));
    expect(screen.getAllByText('По запросу').length).toBeGreaterThan(0);
  });

  it('shows Business PRO team_members=3 and addon_purchase', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    const row = await screen.findByTestId('tariffs-admin-row-business_pro');
    expect(row.textContent).toMatch(/3/);
    expect(row.textContent).toMatch(/Да/);
  });

  it('shows error state without fake plans', async () => {
    listAdminPlans.mockRejectedValue(new ApiError('boom', 500));
    render(<TariffsAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('tariffs-admin-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('tariffs-admin-table')).toBeNull();
    expect(screen.queryByTestId('tariffs-admin-row-free')).toBeNull();
  });

  it('expands detail on Подробнее', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    await waitFor(() => screen.getByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-detail-btn-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-detail-btn-pro'));
    await waitFor(() => {
      expect(screen.getAllByTestId('tariffs-admin-detail-pro').length).toBeGreaterThan(0);
    });
    const detail = screen.getAllByTestId('tariffs-admin-detail-pro')[0];
    expect(detail.textContent).toMatch(/Доп\. пакеты:\s*Да/);
    expect(detail.textContent).toMatch(/Не используется|Используется/);
  });

  it('opens edit form with filled values and read-only code', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-edit-btn-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-edit-modal'));
    const code = screen.getByTestId('tariffs-admin-edit-code') as HTMLInputElement;
    expect(code.value).toBe('pro');
    expect(code.readOnly || code.disabled).toBe(true);
    expect((screen.getByTestId('tariffs-admin-edit-name') as HTMLInputElement).value).toBe('Pro');
    expect(
      (screen.getByTestId('tariffs-admin-edit-monthly-messages') as HTMLInputElement).value
    ).toBe('3000');
    expect(screen.getByTestId('tariffs-admin-edit-addon-purchase')).toBeTruthy();
    const pub = screen.getByTestId('tariffs-admin-edit-is-public') as HTMLInputElement;
    expect(pub.disabled).toBe(true);
    expect(pub.checked).toBe(true);
    expect(screen.queryByTestId('tariffs-admin-edit-is-active')).toBeNull();
    expect(screen.getByTestId('tariffs-admin-edit-no-visibility')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-edit-recommended')).toBeTruthy();
  });

  it('shows price note and limits warning when fields change', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-edit-btn-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-edit-form'));
    fireEvent.change(screen.getByTestId('tariffs-admin-edit-price'), {
      target: { value: '1100' },
    });
    expect(screen.getByTestId('tariffs-admin-price-note').textContent).toMatch(/новых покупок/i);
    fireEvent.change(screen.getByTestId('tariffs-admin-edit-monthly-messages'), {
      target: { value: '4000' },
    });
    expect(screen.getByTestId('tariffs-admin-limits-warning').textContent).toMatch(
      /сразу повлияет/i
    );
    expect(screen.getByTestId('tariffs-admin-limits-warning').textContent).toMatch(
      /Текущих подписок:\s*3/
    );
  });

  it('save with limits shows confirm then PATCHes and refreshes', async () => {
    listAdminPlans
      .mockResolvedValueOnce({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length })
      .mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    updateAdminPlan.mockResolvedValue(
      plan({
        id: 2,
        code: 'pro',
        name: 'Pro',
        name_ru: 'Pro',
        price_month: '990.00',
        limits: {
          monthly_messages: 4000,
          active_bots: 5,
          team_members: 1,
          analytics_history_days: 30,
          addon_purchase: true,
          export_reports: true,
          priority_support: false,
          marketplace_access: true,
          template_publish: true,
          scenario_publish: true,
        },
      })
    );
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-edit-btn-pro'));
    fireEvent.change(await screen.findByTestId('tariffs-admin-edit-monthly-messages'), {
      target: { value: '4000' },
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-edit-save'));
    await waitFor(() => screen.getByTestId('tariffs-admin-limits-confirm'));
    expect(updateAdminPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tariffs-admin-limits-confirm-save'));
    await waitFor(() => {
      expect(updateAdminPlan).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ limits: { monthly_messages: 4000 } })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByTestId('tariffs-admin-edit-modal')).toBeNull();
    });
    expect(listAdminPlans.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps form open on error and blocks double submit', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    let resolvePatch!: (v: AdminPlan) => void;
    let rejectPatch!: (e: unknown) => void;
    updateAdminPlan.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          resolvePatch = resolve;
          rejectPatch = reject;
        })
    );
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-edit-btn-pro'));
    fireEvent.change(await screen.findByTestId('tariffs-admin-edit-name'), {
      target: { value: 'Pro Updated' },
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-edit-save'));
    await waitFor(() => expect(updateAdminPlan).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('tariffs-admin-edit-save'));
    expect(updateAdminPlan).toHaveBeenCalledTimes(1);

    rejectPatch(new ApiError('Некорректные данные', 422));
    await waitFor(() => screen.getByTestId('tariffs-admin-edit-error'));
    expect(screen.getByTestId('tariffs-admin-edit-modal')).toBeTruthy();
    expect((screen.getByTestId('tariffs-admin-edit-name') as HTMLInputElement).value).toBe(
      'Pro Updated'
    );
    // silence unused
    void resolvePatch;
  });

  it('opens create form with code help and POSTs create', async () => {
    listAdminPlans
      .mockResolvedValueOnce({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length })
      .mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    createAdminPlan.mockResolvedValue(
      plan({ id: 99, code: 'new_plan', name: 'New', name_ru: 'Новый' })
    );
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-create-open'));
    await waitFor(() => screen.getByTestId('tariffs-admin-create-modal'));
    expect(screen.getByTestId('tariffs-admin-create-code-help').textContent).toMatch(
      /технический идентификатор/i
    );
    fireEvent.change(screen.getByTestId('tariffs-admin-create-code'), {
      target: { value: 'new_plan' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-name'), {
      target: { value: 'New' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-name-ru'), {
      target: { value: 'Новый' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-price'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-create-save'));
    await waitFor(() => {
      expect(createAdminPlan).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'new_plan', name: 'New', name_ru: 'Новый' })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByTestId('tariffs-admin-create-modal')).toBeNull();
    });
  });

  it('shows create validation/duplicate error without closing', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    createAdminPlan.mockRejectedValue(new ApiError('Тариф с кодом уже существует', 409));
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-create-open'));
    fireEvent.change(await screen.findByTestId('tariffs-admin-create-code'), {
      target: { value: 'dup' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-name'), {
      target: { value: 'Dup' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-name-ru'), {
      target: { value: 'Дуп' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-price'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-create-save'));
    await waitFor(() => screen.getByTestId('tariffs-admin-create-error'));
    expect(screen.getByTestId('tariffs-admin-create-modal')).toBeTruthy();
  });

  it('hide confirmation then publish/archive/reactivate', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    setAdminPlanVisibility.mockResolvedValue(plan({ id: 2, code: 'pro', is_public: false }));
    archiveAdminPlan.mockResolvedValue(
      plan({ id: 2, code: 'pro', is_public: false, is_active: false })
    );
    reactivateAdminPlan.mockResolvedValue(
      plan({ id: 2, code: 'pro', is_public: false, is_active: true })
    );

    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-hide-btn-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-hide-confirm'));
    expect(screen.getByTestId('tariffs-admin-hide-confirm').textContent).toMatch(
      /скрыт из публичного каталога/i
    );
    fireEvent.click(screen.getByTestId('tariffs-admin-hide-confirm-confirm'));
    await waitFor(() => {
      expect(setAdminPlanVisibility).toHaveBeenCalledWith(2, false);
    });

    // after hide mock updates list via reload — re-seed list with hidden plan
    listAdminPlans.mockResolvedValue({
      items: SAMPLE_PLANS.map(p => (p.code === 'pro' ? { ...p, is_public: false } : p)),
      total: SAMPLE_PLANS.length,
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-refresh'));
    await waitFor(() => screen.getByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-publish-btn-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-publish-btn-pro'));
    await waitFor(() => expect(setAdminPlanVisibility).toHaveBeenCalledWith(2, true));

    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    fireEvent.click(screen.getByTestId('tariffs-admin-refresh'));
    await waitFor(() => screen.getByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-archive-btn-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-archive-btn-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-archive-confirm'));
    expect(screen.getByTestId('tariffs-admin-archive-confirm').textContent).toMatch(
      /недоступен для новых покупок/i
    );
    fireEvent.click(screen.getByTestId('tariffs-admin-archive-confirm-confirm'));
    await waitFor(() => expect(archiveAdminPlan).toHaveBeenCalledWith(2));

    listAdminPlans.mockResolvedValue({
      items: SAMPLE_PLANS.map(p => (p.code === 'pro' ? { ...p, is_active: false } : p)),
      total: SAMPLE_PLANS.length,
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-refresh'));
    fireEvent.click(screen.getByTestId('tariffs-admin-subtab-archived'));
    await waitFor(() => screen.getByTestId('tariffs-admin-actions-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-pro'));
    await waitFor(() => screen.getByTestId('tariffs-admin-reactivate-btn-pro'));
    fireEvent.click(screen.getByTestId('tariffs-admin-reactivate-btn-pro'));
    await waitFor(() => expect(reactivateAdminPlan).toHaveBeenCalledWith(2));
  });

  it('does not hardcode free/pro/developer labels beyond API data', async () => {
    listAdminPlans.mockResolvedValue({
      items: [plan({ id: 1, code: 'custom_only', name_ru: 'Кастом' })],
      total: 1,
    });
    render(<TariffsAdminPanel />);
    await waitFor(() => screen.getByTestId('tariffs-admin-row-custom_only'));
    expect(screen.queryByTestId('tariffs-admin-row-free')).toBeNull();
  });

  it('shows delete only when can_delete and requires confirmation', async () => {
    listAdminPlans
      .mockResolvedValueOnce({
        items: [
          plan({ id: 10, code: 'test_delete_unused', name_ru: 'Временный', can_delete: true }),
          plan({
            id: 11,
            code: 'used_plan',
            name_ru: 'Используемый',
            can_delete: false,
            has_references: true,
          }),
        ],
        total: 2,
      })
      .mockResolvedValue({ items: [], total: 0 });
    deleteAdminPlan.mockResolvedValue(undefined);

    render(<TariffsAdminPanel />);
    await waitFor(() => screen.getByTestId('tariffs-admin-actions-test_delete_unused'));
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-used_plan'));
    await waitFor(() => screen.getByTestId('tariffs-admin-delete-disabled-used_plan'));
    expect(screen.getByTestId('tariffs-admin-delete-disabled-used_plan')).toBeDisabled();
    expect(deleteAdminPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('tariffs-admin-actions-test_delete_unused'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-delete-btn-test_delete_unused'));
    await waitFor(() => screen.getByTestId('tariffs-admin-delete-confirm'));
    expect(screen.getByTestId('tariffs-admin-delete-confirm').textContent).toMatch(
      /без возможности восстановления/i
    );
    expect(screen.getByTestId('tariffs-admin-delete-confirm').textContent).toMatch(
      /test_delete_unused/
    );
    expect(screen.getByTestId('tariffs-admin-delete-confirm-confirm').textContent).toMatch(
      /Удалить тариф/
    );
    expect(deleteAdminPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('tariffs-admin-delete-confirm-confirm'));
    await waitFor(() => expect(deleteAdminPlan).toHaveBeenCalledWith(10));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(listAdminPlans.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows plan_in_use RU error with hide/archive guidance', async () => {
    listAdminPlans.mockResolvedValue({
      items: [plan({ id: 10, code: 'race_plan', can_delete: true })],
      total: 1,
    });
    deleteAdminPlan.mockRejectedValue(
      new ApiError(
        'Тариф используется. Его нельзя удалить, но можно скрыть из каталога или архивировать.',
        409,
        'plan_in_use'
      )
    );
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-race_plan'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-delete-btn-race_plan'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-delete-confirm-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0][0])).toMatch(/покупк|архивир|скрыть/i);
  });

  it('primary create CTA uses canonical bf-primary-cta (dark text on amber)', async () => {
    listAdminPlans.mockResolvedValue({ items: [plan()], total: 1 });
    render(<TariffsAdminPanel />);
    const createBtn = await screen.findByTestId('tariffs-admin-create-open');
    expect(createBtn.className).toMatch(/bf-primary-cta/);
    expect(createBtn).not.toHaveStyle({ color: '#fff' });
    expect(createBtn).not.toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });

  it('splits Catalog / Archived and hides archived from active catalog', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    render(<TariffsAdminPanel />);
    await screen.findByTestId('tariffs-admin-table');
    expect(screen.getByTestId('tariffs-admin-subtab-catalog').textContent).toMatch(/Каталог \(4\)/);
    expect(screen.getByTestId('tariffs-admin-subtab-archived').textContent).toMatch(
      /Архивные \(1\)/
    );
    expect(screen.getByTestId('tariffs-admin-row-free')).toBeTruthy();
    expect(screen.queryByTestId('tariffs-admin-row-archived_hidden')).toBeNull();

    fireEvent.click(screen.getByTestId('tariffs-admin-subtab-archived'));
    expect(await screen.findByTestId('tariffs-admin-row-archived_hidden')).toBeTruthy();
    expect(screen.queryByTestId('tariffs-admin-row-free')).toBeNull();
    fireEvent.click(screen.getByTestId('tariffs-admin-actions-archived_hidden'));
    expect(screen.getByTestId('tariffs-admin-reactivate-btn-archived_hidden')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-reactivate-btn-archived_hidden').textContent).toMatch(
      /Восстановить/
    );
  });

  it('create modal is viewport-safe and auto-fills code + default sort', async () => {
    listAdminPlans.mockResolvedValue({ items: SAMPLE_PLANS, total: SAMPLE_PLANS.length });
    createAdminPlan.mockResolvedValue(
      plan({ id: 99, code: 'testovyy_tarif', name: 'Тестовый тариф', name_ru: 'Тестовый тариф' })
    );
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-create-open'));
    const modal = await screen.findByTestId('tariffs-admin-create-modal');
    expect(screen.getByTestId('tariffs-admin-create-modal-header')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-create-modal-footer')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-create-modal-close')).toBeTruthy();
    const modalStyle = modal.getAttribute('style') || '';
    expect(modalStyle).toMatch(/header-h/);
    expect(modalStyle).toMatch(/footer-h/);
    expect(modalStyle).toMatch(/modal-viewport-gap/);
    const dialog = screen.getByTestId('tariffs-admin-create-modal-dialog');
    expect((dialog.getAttribute('style') || '').toLowerCase()).toMatch(/max-height:\s*100%/);

    fireEvent.change(screen.getByTestId('tariffs-admin-create-name-ru'), {
      target: { value: 'Тестовый тариф' },
    });
    expect((screen.getByTestId('tariffs-admin-create-code') as HTMLInputElement).value).toBe(
      'testovyy_tarif'
    );
    // max active sort in SAMPLE is 40 → 50
    expect((screen.getByTestId('tariffs-admin-create-sort-order') as HTMLInputElement).value).toBe(
      '50'
    );
    expect(screen.getByTestId('tariffs-admin-create-sort-help').textContent).toMatch(
      /меньше число/i
    );
    expect(screen.getByTestId('tariffs-admin-create-recommended')).toBeTruthy();

    fireEvent.change(screen.getByTestId('tariffs-admin-create-code'), {
      target: { value: 'custom_code' },
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-create-name-ru'), {
      target: { value: 'Другое имя' },
    });
    expect((screen.getByTestId('tariffs-admin-create-code') as HTMLInputElement).value).toBe(
      'custom_code'
    );
  });

  it('edit modal keeps recommended checked for business_pro and code read-only', async () => {
    listAdminPlans.mockResolvedValue({
      items: [SAMPLE_PLANS.find(p => p.code === 'business_pro')!],
      total: 1,
    });
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-business_pro'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-edit-btn-business_pro'));
    await screen.findByTestId('tariffs-admin-edit-modal');
    expect(screen.getByTestId('tariffs-admin-edit-modal-header')).toBeTruthy();
    expect(screen.getByTestId('tariffs-admin-edit-modal-footer')).toBeTruthy();
    const editStyle = screen.getByTestId('tariffs-admin-edit-modal').getAttribute('style') || '';
    expect(editStyle).toMatch(/footer-h/);
    expect(editStyle).toMatch(/header-h/);
    const code = screen.getByTestId('tariffs-admin-edit-code') as HTMLInputElement;
    expect(code).toBeDisabled();
    expect((screen.getByTestId('tariffs-admin-edit-recommended') as HTMLInputElement).checked).toBe(
      true
    );
  });

  it('shows purchase/data explanation on disabled delete', async () => {
    listAdminPlans.mockResolvedValue({
      items: [plan({ code: 'used', can_delete: false, has_references: true })],
      total: 1,
    });
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-used'));
    const btn = await screen.findByTestId('tariffs-admin-delete-disabled-used');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title') || '').toMatch(/покупк/i);
  });

  it('archive then restore moves between tabs and keeps is_public', async () => {
    const live = plan({
      id: 7,
      code: 'temp_arch',
      is_active: true,
      is_public: false,
      can_delete: true,
    });
    const archived = { ...live, is_active: false, is_public: false };
    const restored = { ...live, is_active: true, is_public: false };
    listAdminPlans.mockResolvedValue({ items: [live], total: 1 });
    archiveAdminPlan.mockImplementation(async () => {
      listAdminPlans.mockResolvedValue({ items: [archived], total: 1 });
      return archived;
    });
    reactivateAdminPlan.mockImplementation(async () => {
      listAdminPlans.mockResolvedValue({ items: [restored], total: 1 });
      return restored;
    });
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-temp_arch'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-archive-btn-temp_arch'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-archive-confirm-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('tariffs-admin-subtab-archived').textContent).toMatch(
        /Архивные \(1\)/
      )
    );
    fireEvent.click(screen.getByTestId('tariffs-admin-subtab-archived'));
    fireEvent.click(await screen.findByTestId('tariffs-admin-actions-temp_arch'));
    expect(await screen.findByTestId('tariffs-admin-reactivate-btn-temp_arch')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tariffs-admin-reactivate-btn-temp_arch'));
    await waitFor(() =>
      expect(screen.getByTestId('tariffs-admin-subtab-catalog').textContent).toMatch(
        /Каталог \(1\)/
      )
    );
    expect(reactivateAdminPlan).toHaveBeenCalledWith(7);
  });
});
