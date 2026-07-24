import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ApiError } from '@/api/client';
import type { AdminPlanAuditItem } from '@/api/tariffsAdmin';

const { listAdminPlanAudit, listAdminPlans } = vi.hoisted(() => ({
  listAdminPlanAudit: vi.fn(),
  listAdminPlans: vi.fn(),
}));

vi.mock('@/api/tariffsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/tariffsAdmin')>('@/api/tariffsAdmin');
  return {
    ...actual,
    listAdminPlanAudit,
    listAdminPlans,
  };
});

import TariffsAdminAuditJournal from '@/features/dashboard/finance/TariffsAdminAuditJournal';
import TariffsAdminPanel from '@/features/dashboard/finance/TariffsAdminPanel';

function item(overrides: Partial<AdminPlanAuditItem> = {}): AdminPlanAuditItem {
  return {
    id: 1,
    created_at: '2026-07-23T10:00:00Z',
    action: 'tariff_plan_updated',
    action_label: 'Изменение',
    entity_type: 'plan',
    entity_id: 5,
    admin_user_id: 1,
    admin_email: 'admin@example.com',
    plan_code: 'pro',
    plan_name: 'Pro',
    comment: null,
    changed_fields: ['price_month', 'limits'],
    changes: [
      {
        field: 'price_month',
        label: 'Цена',
        before: '990.00 ₽ / мес.',
        after: '1090.00 ₽ / мес.',
      },
      {
        field: 'limits.addon_purchase',
        label: 'Покупка доп. пакетов',
        before: 'Нет',
        after: 'Да',
      },
    ],
    ...overrides,
  };
}

describe('TariffsAdminAuditJournal', () => {
  beforeEach(() => {
    listAdminPlanAudit.mockReset();
  });

  it('loads journal with loading then rows', async () => {
    let resolve!: (v: unknown) => void;
    listAdminPlanAudit.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<TariffsAdminAuditJournal />);
    expect(screen.getByTestId('tariffs-admin-audit-loading')).toBeTruthy();
    resolve({ items: [item()], total: 1, limit: 20, offset: 0 });
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-row-1'));
    expect(screen.getByTestId('tariffs-admin-audit-action-1').textContent).toMatch(/Изменение/);
  });

  it('expand shows changed fields and readable diffs', async () => {
    listAdminPlanAudit.mockResolvedValue({ items: [item()], total: 1, limit: 20, offset: 0 });
    render(<TariffsAdminAuditJournal />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-audit-detail-btn-1'));
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-detail-1'));
    expect(screen.getByTestId('tariffs-admin-audit-changed-1').textContent).toMatch(/price_month/);
    expect(screen.getByTestId('tariffs-admin-audit-change-1-price_month').textContent).toMatch(
      /990\.00/
    );
    expect(
      screen.getByTestId('tariffs-admin-audit-change-1-limits.addon_purchase').textContent
    ).toMatch(/Нет → Да/);
  });

  it('delete snapshot row displays plan code/name', async () => {
    listAdminPlanAudit.mockResolvedValue({
      items: [
        item({
          id: 7,
          action: 'tariff_plan_deleted',
          action_label: 'Удаление',
          plan_code: 'gone',
          plan_name: 'Ушедший',
          changed_fields: null,
          changes: [{ field: 'code', label: 'Код', before: 'gone', after: '—' }],
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    render(<TariffsAdminAuditJournal />);
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-code-7'));
    expect(screen.getByTestId('tariffs-admin-audit-code-7').textContent).toBe('gone');
    expect(screen.getByText(/Ушедший/)).toBeTruthy();
  });

  it('error and empty states', async () => {
    listAdminPlanAudit.mockRejectedValue(new ApiError('boom', 500));
    const { unmount } = render(<TariffsAdminAuditJournal />);
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-error'));
    unmount();

    listAdminPlanAudit.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    render(<TariffsAdminAuditJournal />);
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-empty'));
  });

  it('action filter resets offset to 0', async () => {
    listAdminPlanAudit.mockResolvedValue({
      items: [item()],
      total: 40,
      limit: 20,
      offset: 0,
    });
    render(<TariffsAdminAuditJournal />);
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-next'));

    listAdminPlanAudit.mockResolvedValue({
      items: [item({ id: 2 })],
      total: 40,
      limit: 20,
      offset: 20,
    });
    fireEvent.click(screen.getByTestId('tariffs-admin-audit-next'));
    await waitFor(() =>
      expect(listAdminPlanAudit).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }))
    );

    listAdminPlanAudit.mockResolvedValue({
      items: [item({ id: 3, action: 'tariff_plan_created', action_label: 'Создание' })],
      total: 5,
      limit: 20,
      offset: 0,
    });
    fireEvent.change(screen.getByTestId('tariffs-admin-audit-action-filter'), {
      target: { value: 'tariff_plan_created' },
    });
    await waitFor(() =>
      expect(listAdminPlanAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tariff_plan_created', offset: 0 })
      )
    );
  });
});

describe('TariffsAdminPanel audit subtab', () => {
  beforeEach(() => {
    listAdminPlans.mockReset();
    listAdminPlanAudit.mockReset();
    listAdminPlans.mockResolvedValue({ items: [], total: 0 });
    listAdminPlanAudit.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('opens journal inside tariffs panel', async () => {
    render(<TariffsAdminPanel />);
    fireEvent.click(await screen.findByTestId('tariffs-admin-subtab-audit'));
    await waitFor(() => screen.getByTestId('tariffs-admin-audit-journal'));
    expect(listAdminPlanAudit).toHaveBeenCalled();
    expect(screen.getByTestId('tariffs-admin-panel')).toBeTruthy();
  });
});
