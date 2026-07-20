import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { RefundablePurchase, RefundRequest } from '@/api/refunds';
import { REFUND_REASON_OPTIONS } from '@/features/dashboard/refunds/refundDisplay';

const {
  listMyRefundRequests,
  listMyRefundablePurchases,
  createMyRefundRequest,
  getMyRefundRequest,
  cancelMyRefundRequest,
  toast,
} = vi.hoisted(() => ({
  listMyRefundRequests: vi.fn(),
  listMyRefundablePurchases: vi.fn(),
  createMyRefundRequest: vi.fn(),
  getMyRefundRequest: vi.fn(),
  cancelMyRefundRequest: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/api/refunds', async () => {
  const actual = await vi.importActual<typeof import('@/api/refunds')>('@/api/refunds');
  return {
    ...actual,
    listMyRefundRequests,
    listMyRefundablePurchases,
    createMyRefundRequest,
    getMyRefundRequest,
    cancelMyRefundRequest,
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

import RefundRequestsPage from '@/features/dashboard/pages/RefundRequestsPage';
import RefundRequestDetailPage from '@/features/dashboard/pages/RefundRequestDetailPage';
import { safeRefundErrorMessage } from '@/api/refunds';

function sample(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: 12,
    checkout_intent_id: 5,
    payment_attempt_id: 6,
    status: 'awaiting_admin_review',
    reason_category: 'unused',
    user_comment: 'please',
    current_revision_number: 1,
    version: 2,
    recommended_refund_amount: '190.00',
    currency: 'RUB',
    refund_type: 'full',
    calculation_status: 'ok',
    proposed_amount_undefined: false,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    submitted_at: '2026-07-01T10:00:00Z',
    completed_at: null,
    status_history: [
      {
        id: 1,
        occurred_at: '2026-07-01T10:00:00Z',
        title: 'Заявка на возврат создана',
        description: 'Мы получили вашу заявку и начали её рассмотрение.',
        category: 'request',
        status: 'submitted',
      },
    ],
    public_decision_message: null,
    ...overrides,
  };
}

function purchase(overrides: Partial<RefundablePurchase> = {}): RefundablePurchase {
  return {
    checkout_intent_id: 5,
    payment_attempt_id: 6,
    product_type: 'addon',
    product_code: 'msg_1000',
    product_name: '+1 000 сообщений',
    amount: '190.00',
    currency: 'RUB',
    paid_at: '2026-07-01T09:00:00Z',
    current_refund_status: null,
    current_refund_request_id: null,
    can_request_refund: true,
    unavailable_reason: null,
    ...overrides,
  };
}

describe('RefundRequestsPage', () => {
  beforeEach(() => {
    listMyRefundRequests.mockReset();
    listMyRefundablePurchases.mockReset();
    createMyRefundRequest.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    listMyRefundablePurchases.mockResolvedValue({
      items: [purchase()],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  it('shows loading then list and create form', async () => {
    listMyRefundRequests.mockResolvedValue([sample()]);
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('refund-list-loading')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('refund-list')).toBeTruthy();
    });
    expect(screen.getByText(/Заявка №12/)).toBeTruthy();
    expect(screen.getByTestId('refund-create-form')).toBeTruthy();
    expect(screen.queryByTestId('refund-create-empty')).toBeNull();
    expect(screen.getByTestId('refund-create-purchase')).toBeTruthy();
    expect(screen.getByTestId('refund-create-reason')).toBeTruthy();
  });

  it('shows empty-state without create form when no refundable purchases', async () => {
    listMyRefundRequests.mockResolvedValue([]);
    listMyRefundablePurchases.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('refund-create-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('refund-create-empty-purchases')).toBeTruthy();
    expect(screen.queryByTestId('refund-create-form')).toBeNull();
    expect(screen.queryByTestId('refund-create-purchase')).toBeNull();
    expect(screen.getByTestId('refund-list-empty')).toBeTruthy();
    expect(screen.queryByText(/Заявка на возврат не найдена/i)).toBeNull();
  });

  it('does not show «заявка не найдена» on list load 404', async () => {
    listMyRefundRequests.mockRejectedValue(new ApiError('missing', 404));
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('refund-list-error')).toBeTruthy();
    });
    expect(screen.queryByText(/Заявка на возврат не найдена/i)).toBeNull();
    expect(screen.getByTestId('refund-list-error').textContent).toMatch(/не удалось загрузить/i);
  });

  it('shows Russian reason options and requires reason for active submit', async () => {
    listMyRefundRequests.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('refund-create-reason')).toBeTruthy();
    });
    const reason = screen.getByTestId('refund-create-reason') as HTMLSelectElement;
    const optionTexts = Array.from(reason.options).map(o => o.textContent || '');
    expect(optionTexts).toContain('Выберите причину');
    for (const opt of REFUND_REASON_OPTIONS) {
      expect(optionTexts).toContain(opt.label);
      expect(opt.label).toMatch(/[А-Яа-яЁё]/);
    }
    fireEvent.change(screen.getByTestId('refund-create-purchase'), {
      target: { value: '5' },
    });
    expect(screen.getByTestId('refund-create-submit').getAttribute('data-state')).toBe('disabled');
    expect((screen.getByTestId('refund-create-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(reason, { target: { value: 'defect' } });
    expect(reason.value).toBe('defect');
    await waitFor(() => {
      expect(screen.getByTestId('refund-create-submit').getAttribute('data-state')).toBe('active');
    });
    expect((screen.getByTestId('refund-create-submit') as HTMLButtonElement).disabled).toBe(false);
    const activeStyle = (screen.getByTestId('refund-create-submit') as HTMLButtonElement).style;
    expect(activeStyle.background).toContain('var(--primary)');
    expect(activeStyle.color).toMatch(/text-on-primary|#111/);
  });

  it('keeps submit disabled styling without purchase', async () => {
    listMyRefundRequests.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('refund-create-submit')).toBeTruthy();
    });
    const btn = screen.getByTestId('refund-create-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('data-state')).toBe('disabled');
    expect(btn.style.background).toContain('var(--surface)');
    expect(btn.style.color).toContain('var(--text-muted)');
  });

  it('shows manual review amount label in list', async () => {
    listMyRefundRequests.mockResolvedValue([
      sample({
        status: 'manual_review_required',
        recommended_refund_amount: null,
        proposed_amount_undefined: true,
      }),
    ]);
    render(
      <MemoryRouter>
        <RefundRequestsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Сумма определяется администратором')).toBeTruthy();
    });
    expect(screen.queryByText(/^0(\.00)?\s*₽$/)).toBeNull();
  });

  it('submits create form with purchase and reason', async () => {
    listMyRefundRequests.mockResolvedValue([]);
    createMyRefundRequest.mockResolvedValue(sample({ id: 99 }));
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<RefundRequestsPage />} />
          <Route path="/dashboard/finance/refunds/:refundId" element={<div>detail</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('refund-create-purchase')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('refund-create-purchase'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByTestId('refund-create-reason'), {
      target: { value: 'unused' },
    });
    fireEvent.change(screen.getByTestId('refund-create-comment'), {
      target: { value: 'optional note' },
    });
    fireEvent.click(screen.getByTestId('refund-create-submit'));
    await waitFor(() => {
      expect(createMyRefundRequest).toHaveBeenCalled();
    });
    const arg = createMyRefundRequest.mock.calls[0][0];
    expect(arg.checkout_intent_id).toBe(5);
    expect(arg.payment_attempt_id).toBe(6);
    expect(arg.reason_category).toBe('unused');
    expect(arg.user_comment).toBe('optional note');
    expect(typeof arg.idempotency_key).toBe('string');
    expect(arg.idempotency_key.length).toBeGreaterThan(8);
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('RefundRequestDetailPage', () => {
  beforeEach(() => {
    getMyRefundRequest.mockReset();
    cancelMyRefundRequest.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  function renderDetail(id = '12') {
    return render(
      <MemoryRouter initialEntries={[`/dashboard/finance/refunds/${id}`]}>
        <Routes>
          <Route
            path="/dashboard/finance/refunds/:refundId"
            element={<RefundRequestDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    );
  }

  it('shows detail card and amount', async () => {
    getMyRefundRequest.mockResolvedValue(sample());
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('refund-detail-card')).toBeTruthy();
    });
    expect(screen.getByTestId('refund-detail-amount').textContent).toContain('190.00');
    expect(screen.getByTestId('refund-detail-cancel')).toBeTruthy();
  });

  it('shows «заявка не найдена» only on missing detail', async () => {
    getMyRefundRequest.mockRejectedValue(new ApiError('missing', 404, 'request_not_found'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('refund-detail-error')).toBeTruthy();
    });
    expect(screen.getByTestId('refund-detail-error').textContent).toMatch(
      /Заявка на возврат не найдена/i
    );
  });

  it('shows manual review copy and no zero money', async () => {
    getMyRefundRequest.mockResolvedValue(
      sample({
        status: 'manual_review_required',
        recommended_refund_amount: null,
        proposed_amount_undefined: true,
      })
    );
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('refund-detail-amount').textContent).toBe(
        'Сумма определяется администратором'
      );
    });
    expect(screen.getByTestId('refund-detail-status-hint').textContent).toMatch(/вручную/i);
    expect(screen.queryByText(/0 ₽/)).toBeNull();
  });

  it('shows approved without claiming money returned', async () => {
    getMyRefundRequest.mockResolvedValue(sample({ status: 'approved' }));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('refund-detail-status').textContent).toMatch(/Одобрена/);
    });
    const hint = screen.getByTestId('refund-detail-status-hint').textContent || '';
    expect(hint).toMatch(/ещё не выполнен/i);
    expect(hint.toLowerCase()).not.toMatch(/деньги возвращены|средства возвращены/);
    expect(screen.queryByTestId('refund-detail-cancel')).toBeNull();
  });

  it('shows status history with Russian titles and safe decision message', async () => {
    getMyRefundRequest.mockResolvedValue(
      sample({
        status: 'needs_information',
        public_decision_message: 'Укажите номер заказа в комментарии.',
        status_history: [
          {
            id: 1,
            occurred_at: '2026-07-01T10:00:00Z',
            title: 'Заявка на возврат создана',
            description: 'Мы получили вашу заявку и начали её рассмотрение.',
            category: 'request',
            status: 'submitted',
          },
          {
            id: 2,
            occurred_at: '2026-07-01T11:00:00Z',
            title: 'Нужна дополнительная информация',
            description: 'Укажите номер заказа в комментарии.',
            category: 'information',
            status: 'needs_information',
          },
        ],
      })
    );
    renderDetail();
    await waitFor(() => screen.getByTestId('refund-detail-history-list'));
    expect(screen.getByTestId('refund-detail-history-title').textContent).toBe('История заявки');
    expect(screen.getByTestId('refund-history-item-1').textContent).toMatch(
      /Заявка на возврат создана/
    );
    expect(screen.getByTestId('refund-history-item-2').textContent).toMatch(
      /Нужна дополнительная информация/
    );
    expect(screen.getByTestId('refund-detail-public-decision').textContent).toMatch(/номер заказа/);
    expect(screen.queryByText('status_changed')).toBeNull();
    expect(screen.queryByText('event_metadata')).toBeNull();
    expect(screen.queryByText('provider_refund_id')).toBeNull();
  });

  it('shows empty history state', async () => {
    getMyRefundRequest.mockResolvedValue(sample({ status_history: [] }));
    renderDetail();
    await waitFor(() => screen.getByTestId('refund-detail-history-empty'));
    expect(screen.getByText('История заявки пока недоступна.')).toBeTruthy();
  });

  it('cancels when allowed', async () => {
    getMyRefundRequest.mockResolvedValue(sample());
    cancelMyRefundRequest.mockResolvedValue(sample({ status: 'canceled', version: 3 }));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('refund-detail-cancel')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('refund-detail-cancel'));
    await waitFor(() => {
      expect(cancelMyRefundRequest).toHaveBeenCalledWith(12, { expected_version: 2 });
    });
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('safeRefundErrorMessage 404', () => {
  it('uses request-not-found copy only with that code', () => {
    expect(safeRefundErrorMessage(new ApiError('x', 404, 'request_not_found'))).toMatch(
      /не найдена/i
    );
    expect(safeRefundErrorMessage(new ApiError('x', 404))).not.toMatch(/не найдена/i);
  });
});
