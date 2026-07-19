import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ApiError } from '@/api/client';
import type { RefundAdminDetail, RefundAdminListItem } from '@/api/refundsAdmin';
import {
  ADMIN_APPROVED_NOTICE,
  ADMIN_NO_MONEY_MOVED,
  canAdminApprove,
  canAdminConfirm,
} from '@/features/dashboard/finance/refundAdminDisplay';

const {
  listAdminRefunds,
  getAdminRefund,
  adminRecalculateRefund,
  adminCreateRefundRevision,
  adminNeedsInformation,
  adminRejectRefund,
  adminConfirmRefund,
  adminApproveRefund,
  toast,
} = vi.hoisted(() => ({
  listAdminRefunds: vi.fn(),
  getAdminRefund: vi.fn(),
  adminRecalculateRefund: vi.fn(),
  adminCreateRefundRevision: vi.fn(),
  adminNeedsInformation: vi.fn(),
  adminRejectRefund: vi.fn(),
  adminConfirmRefund: vi.fn(),
  adminApproveRefund: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/refundsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/refundsAdmin')>('@/api/refundsAdmin');
  return {
    ...actual,
    listAdminRefunds,
    getAdminRefund,
    adminRecalculateRefund,
    adminCreateRefundRevision,
    adminNeedsInformation,
    adminRejectRefund,
    adminConfirmRefund,
    adminApproveRefund,
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

import RefundsAdminPanel from '@/features/dashboard/finance/RefundsAdminPanel';
import PlatformFinancePage from '@/features/dashboard/pages/PlatformFinancePage';
import { MemoryRouter } from 'react-router-dom';

function listItem(overrides: Partial<RefundAdminListItem> = {}): RefundAdminListItem {
  return {
    id: 10,
    user_id: 3,
    user_email: 'u@example.com',
    checkout_intent_id: 7,
    payment_attempt_id: 8,
    status: 'awaiting_admin_review',
    reason_category: 'unused',
    user_comment: 'please',
    current_revision_number: 1,
    approved_revision_id: null,
    version: 2,
    recommended_refund_amount: '190.00',
    proposed_amount_undefined: false,
    manual_review_required: false,
    product_type: 'addon',
    product_code: 'msg_1000',
    product_name: '+1 000 сообщений',
    amount: '190.00',
    currency: 'RUB',
    refund_type: 'full',
    calculation_status: 'ok',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    submitted_at: '2026-07-01T10:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

function detail(overrides: Partial<RefundAdminDetail> = {}): RefundAdminDetail {
  const item = listItem();
  const revision = {
    id: 100,
    refund_request_id: 10,
    revision_number: 1,
    revision_type: 'automatic',
    created_by_user_id: null,
    based_on_revision_id: null,
    calculation_status: 'ok',
    refund_type: 'full',
    currency: 'RUB',
    paid_amount: '190.00',
    prior_refunded_amount: '0.00',
    proposed_refund_amount: '190.00',
    final_refund_amount: null,
    proposed_amount_undefined: false,
    calculation_at: '2026-07-01T10:00:00Z',
    entitlement_action: 'none',
    entitlement_effective_at: null,
    adjustment_reason_category: null,
    adjustment_comment: null,
    usage_snapshot: { used: 0 },
    calculation_snapshot: { ok: true },
    entitlement_snapshot: null,
    created_at: '2026-07-01T10:00:00Z',
  };
  return {
    request: {
      id: item.id,
      user_id: item.user_id,
      checkout_intent_id: item.checkout_intent_id,
      payment_attempt_id: item.payment_attempt_id,
      status: item.status,
      reason_category: item.reason_category,
      user_comment: item.user_comment,
      current_revision_number: 1,
      approved_revision_id: null,
      version: 2,
      recommended_refund_amount: '190.00',
      proposed_amount_undefined: false,
      manual_review_required: false,
      created_at: item.created_at,
      updated_at: item.updated_at,
      submitted_at: item.submitted_at,
      completed_at: null,
    },
    user: {
      id: 3,
      public_id: 3,
      email: 'u@example.com',
      name: 'User',
      role: 'user',
      plan_code: 'start',
      is_suspended: false,
      created_at: '2026-01-01T00:00:00Z',
    },
    checkout_intent: {
      id: 7,
      user_id: 3,
      product_type: 'addon',
      product_code: 'msg_1000',
      product_name: '+1 000 сообщений',
      description: null,
      amount: '190.00',
      currency: 'RUB',
      status: 'fulfilled',
      idempotency_key: 'k',
      payment_provider: 'yookassa',
      provider_payment_id: 'yk_1',
      paid_at: '2026-07-01T09:00:00Z',
      fulfilled_at: '2026-07-01T09:01:00Z',
      created_at: '2026-07-01T08:00:00Z',
      updated_at: '2026-07-01T09:01:00Z',
    },
    payment_attempt: {
      id: 8,
      checkout_intent_id: 7,
      user_id: 3,
      provider: 'yookassa',
      connection_id: 1,
      provider_payment_id: 'yk_1',
      amount: '190.00',
      currency: 'RUB',
      status: 'succeeded',
      idempotency_key: 'pay',
      created_at: '2026-07-01T08:00:00Z',
      updated_at: '2026-07-01T09:00:00Z',
    },
    product: {
      product_type: 'addon',
      product_code: 'msg_1000',
      product_name: '+1 000 сообщений',
      amount: '190.00',
      currency: 'RUB',
    },
    usage_snapshot: {
      messages_used_total: 0,
      active_bots_used_total: 0,
      team_members_used_total: 0,
      detectable_pool_usage_after_purchase: false,
      counters: [],
    },
    financial_snapshot: {
      paid_amount: '190.00',
      input_fingerprint: 'fp_test_abc',
      ledger_balance: {
        paid_amount: '190.00',
        confirmed_refunded_amount: '0.00',
        active_reserved_amount: '0.00',
        refundable_available_amount: '190.00',
      },
    },
    current_revision: revision,
    approved_revision: null,
    revisions: [revision],
    audit_timeline: [
      {
        id: 1,
        refund_request_id: 10,
        refund_revision_id: 100,
        actor_user_id: null,
        actor_type: 'system',
        action: 'created',
        previous_status: null,
        new_status: 'submitted',
        changed_fields: null,
        reason: null,
        event_metadata: null,
        created_at: '2026-07-01T10:00:00Z',
      },
    ],
    ...overrides,
  };
}

describe('PlatformFinancePage refunds tab', () => {
  beforeEach(() => {
    listAdminRefunds.mockReset();
    listAdminRefunds.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('shows unified shell with active Возвраты tab', async () => {
    render(
      <MemoryRouter>
        <PlatformFinancePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('finance-shell')).toBeTruthy();
    expect(screen.getByTestId('finance-shell-title').textContent).toBe('Финансы');
    expect(screen.getByTestId('finance-tab-providers').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByTestId('finance-tab-refunds'));
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-queue')).toBeTruthy();
    });
    expect(screen.getByTestId('finance-tab-refunds').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('finance-tabpanel')).toBeTruthy();
    expect(screen.getByTestId('finance-shell-subtitle').textContent).toMatch(/возврат/i);
  });

  it('opens Возвраты from ?tab=refunds deep-link and syncs query on switch', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/finance?tab=refunds']}>
        <PlatformFinancePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('finance-tab-refunds').getAttribute('aria-selected')).toBe('true');
      expect(screen.getByTestId('refund-admin-queue')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('finance-tab-providers'));
    await waitFor(() => {
      expect(screen.getByTestId('finance-tab-providers').getAttribute('aria-selected')).toBe(
        'true'
      );
    });
    expect(screen.queryByTestId('refund-admin-queue')).toBeNull();
  });
});

describe('RefundsAdminPanel queue', () => {
  beforeEach(() => {
    listAdminRefunds.mockReset();
    getAdminRefund.mockReset();
    adminRecalculateRefund.mockReset();
    adminCreateRefundRevision.mockReset();
    adminNeedsInformation.mockReset();
    adminRejectRefund.mockReset();
    adminConfirmRefund.mockReset();
    adminApproveRefund.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('shows loading then list', async () => {
    listAdminRefunds.mockResolvedValue({
      items: [listItem()],
      total: 1,
      limit: 20,
      offset: 0,
    });
    render(<RefundsAdminPanel />);
    expect(screen.getByTestId('refund-admin-loading')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-list')).toBeTruthy();
    });
    expect(screen.getByTestId('refund-admin-row-10')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-queue-disclaimer').textContent).toContain(
      'не выполняется'
    );
  });

  it('shows Russian filter labels without Manual review English', async () => {
    listAdminRefunds.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-filters')).toBeTruthy());
    expect(screen.getByLabelText('Пользователь')).toBeTruthy();
    expect(screen.getByLabelText('Ручная проверка')).toBeTruthy();
    const filters = screen.getByTestId('refund-admin-filters');
    expect(filters.textContent).not.toMatch(/Manual review/i);
    expect(filters.textContent).not.toMatch(/User ID/i);
    const manual = screen.getByTestId('refund-admin-filter-manual');
    expect(manual.textContent).toContain('Все заявки');
    expect(manual.textContent).toContain('Требуется ручная проверка');
    expect(manual.textContent).toContain('Ручная проверка не требуется');
  });

  it('shows empty without filters vs filtered empty', async () => {
    listAdminRefunds.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-empty')).toBeTruthy());
    expect(screen.getByTestId('refund-admin-empty').textContent).toBe('Заявок на возврат пока нет');

    fireEvent.change(screen.getByTestId('refund-admin-filter-status'), {
      target: { value: 'approved' },
    });
    // Draft change before Apply must not switch empty copy
    expect(screen.getByTestId('refund-admin-empty').textContent).toBe('Заявок на возврат пока нет');

    fireEvent.click(screen.getByTestId('refund-admin-filter-apply'));
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-empty').textContent).toBe(
        'По выбранным фильтрам заявки не найдены'
      );
    });
  });

  it('shows empty and error states', async () => {
    listAdminRefunds.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const { unmount } = render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-empty')).toBeTruthy());
    expect(screen.getByTestId('refund-admin-empty').textContent).toBe('Заявок на возврат пока нет');
    unmount();

    listAdminRefunds.mockRejectedValue(new ApiError('fail', 500));
    render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-error')).toBeTruthy());
  });

  it('applies filters', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-filters')).toBeTruthy());
    fireEvent.change(screen.getByTestId('refund-admin-filter-status'), {
      target: { value: 'approved' },
    });
    fireEvent.change(screen.getByTestId('refund-admin-filter-user'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('refund-admin-filter-reason'), {
      target: { value: 'defect' },
    });
    fireEvent.change(screen.getByTestId('refund-admin-filter-manual'), {
      target: { value: 'yes' },
    });
    fireEvent.click(screen.getByTestId('refund-admin-filter-apply'));
    await waitFor(() => {
      expect(listAdminRefunds).toHaveBeenCalled();
    });
    const last = listAdminRefunds.mock.calls.at(-1)?.[0];
    expect(last.status).toBe('approved');
    expect(last.user_id).toBe(3);
    expect(last.reason_category).toBe('defect');
    expect(last.manual_review).toBe(true);
  });

  it('opens human-readable detail without raw JSON in main UI', async () => {
    listAdminRefunds.mockResolvedValue({
      items: [
        listItem({
          manual_review_required: true,
          proposed_amount_undefined: true,
          recommended_refund_amount: null,
          status: 'manual_review_required',
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    getAdminRefund.mockResolvedValue(
      detail({
        request: {
          ...detail().request,
          status: 'manual_review_required',
          manual_review_required: true,
          proposed_amount_undefined: true,
          recommended_refund_amount: '0.00',
        },
        current_revision: {
          ...detail().current_revision!,
          proposed_amount_undefined: true,
          proposed_refund_amount: null,
        },
        audit_timeline: [
          {
            id: 1,
            refund_request_id: 10,
            refund_revision_id: 100,
            actor_user_id: null,
            actor_type: 'system',
            action: 'revision_created',
            previous_status: 'calculating',
            new_status: 'manual_review_required',
            changed_fields: null,
            reason: null,
            event_metadata: null,
            created_at: '2026-07-01T10:00:00Z',
          },
        ],
      })
    );
    render(<RefundsAdminPanel />);
    await waitFor(() => expect(screen.getByTestId('refund-admin-open-10')).toBeTruthy());
    fireEvent.click(screen.getByTestId('refund-admin-open-10'));
    await waitFor(() => expect(screen.getByTestId('refund-admin-detail-card')).toBeTruthy());

    expect(screen.getByTestId('refund-admin-manual-review').textContent).toMatch(
      /Автоматически определить сумму возврата не удалось/
    );
    expect(screen.getByTestId('refund-admin-next-action').textContent).toBe(
      'Указать сумму возврата'
    );
    expect(screen.getByTestId('refund-admin-action-revision').textContent).toBe(
      'Указать сумму возврата'
    );
    expect(screen.queryByTestId('refund-admin-action-approve')).toBeNull();
    expect(screen.getByTestId('refund-admin-blocked-notes').textContent).toMatch(
      /Одобрение недоступно/
    );
    expect(screen.getByTestId('refund-admin-detail-amount').textContent).not.toMatch(/0\.00/);
    expect(screen.getByTestId('refund-admin-calc-recommended').textContent).not.toMatch(/0\.00/);
    expect(screen.getByTestId('refund-admin-stage-no-payout').textContent).toMatch(
      /одобрение не выполняет денежный возврат/
    );

    expect(screen.getByTestId('refund-admin-user')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-purchase')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-payment')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-reason')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-user-comment')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-usage')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-calc')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-current-revision')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-approved-revision')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-audit')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-actions')).toBeTruthy();

    expect((screen.getByTestId('refund-admin-payment') as HTMLDetailsElement).open).toBe(false);
    expect((screen.getByTestId('refund-admin-usage') as HTMLDetailsElement).open).toBe(false);
    expect((screen.getByTestId('refund-admin-audit') as HTMLDetailsElement).open).toBe(false);
    expect((screen.getByTestId('refund-admin-user-purchase') as HTMLDetailsElement).open).toBe(
      false
    );

    const mainText = screen.getByTestId('refund-admin-detail').textContent || '';
    expect(mainText).toContain('Сводка решения');
    expect(mainText).toContain('Использование');
    expect(mainText).toContain('Расчёт возврата');
    expect(mainText).toContain('История решений');
    expect(mainText).toContain('Указать сумму возврата');
    expect(mainText).toContain('Создан новый расчёт');
    expect(mainText).toContain('Система');
    expect(mainText).toContain('Требуется ручная проверка');
    expect(mainText).not.toMatch(/manual_required/);
    expect(mainText).not.toMatch(/Audit timeline/i);
    expect(mainText).not.toMatch(/Admin revision/i);

    const tech = screen.getByTestId('refund-admin-tech-details');
    expect(tech).toBeTruthy();
    expect((tech as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByTestId('refund-admin-usage-snapshot').textContent).toMatch(
      /messages_used_total/
    );
    expect(screen.getByTestId('refund-admin-financial-snapshot').textContent).toMatch(
      /input_fingerprint|ledger_balance/
    );
    expect(screen.getByTestId('refund-admin-revisions')).toBeTruthy();
    expect(screen.getByTestId('refund-admin-money-disclaimer').textContent).toBe(
      ADMIN_NO_MONEY_MOVED
    );
  });

  it('shows approve as next action for awaiting_admin_review', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    getAdminRefund.mockResolvedValue(detail());
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-action-approve')).toBeTruthy());
    expect(screen.getByTestId('refund-admin-action-approve').textContent).toBe('Одобрить заявку');
    expect(screen.getByTestId('refund-admin-next-action').textContent).toBe('Одобрить заявку');
    expect(screen.queryByTestId('refund-admin-blocked-notes')).toBeNull();
    fireEvent.click(screen.getByTestId('refund-admin-action-approve'));
    expect(screen.getByTestId('refund-admin-approve-notice').textContent).toMatch(
      /одобрение не выполняет денежный возврат/
    );
  });

  it('shows confirm calculation for admin_edited', async () => {
    listAdminRefunds.mockResolvedValue({
      items: [listItem({ status: 'admin_edited' })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    getAdminRefund.mockResolvedValue(
      detail({
        request: { ...detail().request, status: 'admin_edited' },
      })
    );
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-action-confirm')).toBeTruthy());
    expect(screen.getByTestId('refund-admin-action-confirm').textContent).toBe(
      'Подтвердить расчёт'
    );
    expect(screen.queryByTestId('refund-admin-action-approve')).toBeNull();
    expect(screen.getByTestId('refund-admin-blocked-notes').textContent).toMatch(
      /Одобрение недоступно/
    );
  });

  it('requires reason for needs-information', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    getAdminRefund.mockResolvedValue(detail());
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-action-needs-info')).toBeTruthy());
    fireEvent.click(screen.getByTestId('refund-admin-action-needs-info'));
    fireEvent.click(screen.getByTestId('refund-admin-action-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-action-error').textContent).toMatch(/причин/i);
    });
    expect(adminNeedsInformation).not.toHaveBeenCalled();
  });

  it('requires revision fields', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    getAdminRefund.mockResolvedValue(detail());
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-action-revision')).toBeTruthy());
    fireEvent.click(screen.getByTestId('refund-admin-action-revision'));
    fireEvent.change(screen.getByTestId('refund-admin-revision-amount'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByTestId('refund-admin-revision-comment'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('refund-admin-action-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-action-error')).toBeTruthy();
    });
    expect(adminCreateRefundRevision).not.toHaveBeenCalled();
  });

  it('shows version conflict and refresh', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    getAdminRefund.mockResolvedValue(detail());
    adminRecalculateRefund.mockRejectedValue(new ApiError('stale', 409, 'version_conflict'));
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-action-recalculate')).toBeTruthy());
    fireEvent.click(screen.getByTestId('refund-admin-action-recalculate'));
    fireEvent.click(screen.getByTestId('refund-admin-action-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('refund-admin-version-conflict')).toBeTruthy();
    });
    expect(screen.getByTestId('refund-admin-conflict-refresh')).toBeTruthy();
  });

  it('updates after successful recalculate', async () => {
    listAdminRefunds.mockResolvedValue({ items: [listItem()], total: 1, limit: 20, offset: 0 });
    const d = detail();
    getAdminRefund.mockResolvedValue(d);
    adminRecalculateRefund.mockResolvedValue(
      detail({
        request: { ...d.request, version: 3, status: 'awaiting_admin_review' },
      })
    );
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-action-recalculate')));
    fireEvent.click(screen.getByTestId('refund-admin-action-submit'));
    await waitFor(() => {
      expect(adminRecalculateRefund).toHaveBeenCalledWith(10, 2);
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not claim money returned on approved', async () => {
    listAdminRefunds.mockResolvedValue({
      items: [listItem({ status: 'approved' })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    getAdminRefund.mockResolvedValue(
      detail({
        request: { ...detail().request, status: 'approved' },
      })
    );
    render(<RefundsAdminPanel />);
    await waitFor(() => fireEvent.click(screen.getByTestId('refund-admin-open-10')));
    await waitFor(() => expect(screen.getByTestId('refund-admin-detail-status-hint')).toBeTruthy());
    const hint = screen.getByTestId('refund-admin-detail-status-hint').textContent || '';
    expect(hint).toBe(ADMIN_APPROVED_NOTICE);
    expect(hint.toLowerCase()).not.toMatch(/деньги возвращены|средства возвращены|уже выполнен/);
    expect(canAdminApprove('approved')).toBe(false);
    expect(canAdminConfirm('admin_edited')).toBe(true);
  });
});
