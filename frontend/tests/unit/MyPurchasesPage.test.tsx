import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MyPurchasesPage from '@/features/dashboard/pages/MyPurchasesPage';
import type { PurchaseList, PurchaseListItem } from '@/api/checkout';
import { ApiError } from '@/api/client';

vi.mock('@/api/checkout', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/checkout')>();
  return {
    ...actual,
    listCheckoutIntents: vi.fn(),
  };
});

import { listCheckoutIntents } from '@/api/checkout';

function item(partial: Partial<PurchaseListItem> & Pick<PurchaseListItem, 'id'>): PurchaseListItem {
  return {
    created_at: '2026-07-22T12:00:00Z',
    product_type: 'addon',
    product_code: 'msg_1000',
    product_name: 'Пакет 1000',
    amount: '190.00',
    currency: 'RUB',
    intent_status: 'fulfilled',
    purchase_status: 'succeeded',
    paid_at: '2026-07-22T12:01:00Z',
    fulfilled_at: '2026-07-22T12:01:00Z',
    cancelled_at: null,
    refunded_at: null,
    failed_at: null,
    payment_provider: 'yookassa',
    latest_attempt_status: 'succeeded',
    fulfilled_subscription_id: null,
    fulfilled_addon_id: 1,
    fulfillment_result_type: 'addon',
    ...partial,
  };
}

function list(partial: Partial<PurchaseList> & { items: PurchaseListItem[] }): PurchaseList {
  return {
    total: partial.items.length,
    limit: 20,
    offset: 0,
    ...partial,
  };
}

function renderPage(initial = '/dashboard/finance/purchases') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/dashboard/finance/purchases" element={<MyPurchasesPage />} />
        <Route
          path="/dashboard/finance/purchases/:purchaseId"
          element={<div data-testid="purchase-detail-route">detail</div>}
        />
        <Route path="/pricing" element={<div data-testid="pricing-route">pricing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MyPurchasesPage', () => {
  beforeEach(() => {
    vi.mocked(listCheckoutIntents).mockReset();
  });

  it('calls GET list with limit/offset', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(list({ items: [] }));
    renderPage();
    await waitFor(() => {
      expect(listCheckoutIntents).toHaveBeenCalled();
    });
    expect(listCheckoutIntents).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      product_type: undefined,
      status: undefined,
    });
  });

  it('renders purchases in backend order (newest first)', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(
      list({
        items: [
          item({
            id: 20,
            product_name: 'Новая',
            product_type: 'tariff',
            purchase_status: 'succeeded',
          }),
          item({
            id: 10,
            product_name: 'Старая',
            product_type: 'addon',
            purchase_status: 'pending',
            intent_status: 'pending',
          }),
        ],
        total: 2,
      })
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('purchases-list')).toBeTruthy();
    });
    const rows = screen.getAllByTestId(/purchases-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('purchases-row-20');
    expect(rows[1].getAttribute('data-testid')).toBe('purchases-row-10');
    expect(within(rows[0]).getByText('Тариф')).toBeTruthy();
    expect(within(rows[1]).getByText('Доп. пакет')).toBeTruthy();
    expect(screen.getByTestId('purchases-status-20').textContent).toBe('Оплачено');
    expect(screen.getByTestId('purchases-status-10').textContent).toBe('Ожидает оплаты');
  });

  it('shows loading state', () => {
    vi.mocked(listCheckoutIntents).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('purchases-loading')).toBeTruthy();
  });

  it('shows error state', async () => {
    vi.mocked(listCheckoutIntents).mockRejectedValue(new ApiError('boom', 500));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('purchases-error')).toBeTruthy();
    });
  });

  it('shows empty state with pricing link', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(list({ items: [], total: 0 }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('purchases-empty')).toBeTruthy();
    });
    expect(screen.getByText('У вас пока нет покупок.')).toBeTruthy();
    expect(screen.getByTestId('purchases-empty-pricing').getAttribute('href')).toBe('/pricing');
  });

  it('pagination next/prev changes offset', async () => {
    const page1 = list({
      items: Array.from({ length: 20 }, (_, i) =>
        item({ id: 100 - i, product_name: `P${100 - i}` })
      ),
      total: 25,
      offset: 0,
    });
    const page2 = list({
      items: Array.from({ length: 5 }, (_, i) => item({ id: 5 - i, product_name: `P${5 - i}` })),
      total: 25,
      offset: 20,
    });
    vi.mocked(listCheckoutIntents)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page1);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('purchases-pagination-range').textContent).toBe('1–20 из 25');
    });

    fireEvent.click(screen.getByTestId('purchases-next'));
    await waitFor(() => {
      expect(listCheckoutIntents).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 20, offset: 20 })
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('purchases-pagination-range').textContent).toBe('21–25 из 25');
    });

    fireEvent.click(screen.getByTestId('purchases-prev'));
    await waitFor(() => {
      expect(listCheckoutIntents).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });
  });

  it('product_type filter resets offset', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(
      list({
        items: Array.from({ length: 20 }, (_, i) => item({ id: i + 1 })),
        total: 40,
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('purchases-next')).toBeTruthy());

    fireEvent.click(screen.getByTestId('purchases-next'));
    await waitFor(() => {
      expect(listCheckoutIntents).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
    });

    fireEvent.change(screen.getByTestId('purchases-filter-product-type'), {
      target: { value: 'addon' },
    });
    await waitFor(() => {
      expect(listCheckoutIntents).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 0,
        product_type: 'addon',
        status: undefined,
      });
    });
  });

  it('Подробнее navigates to purchase detail', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(
      list({ items: [item({ id: 42, product_name: 'Biz' })] })
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('purchases-detail-link-42')).toBeTruthy());
    fireEvent.click(screen.getByTestId('purchases-detail-link-42'));
    expect(screen.getByTestId('purchase-detail-route')).toBeTruthy();
  });

  it('mobile cards do not expose technical ids in visible text', async () => {
    vi.mocked(listCheckoutIntents).mockResolvedValue(
      list({
        items: [
          item({
            id: 777,
            product_name: 'Пакет сообщений',
            product_code: 'msg_1000',
            purchase_status: 'succeeded',
          }),
        ],
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('purchases-card-777')).toBeTruthy());
    const card = screen.getByTestId('purchases-card-777');
    expect(card.textContent).not.toMatch(/CheckoutIntent|PaymentAttempt|msg_1000|provider/i);
    expect(card.textContent).toMatch(/Пакет сообщений/);
    expect(card.textContent).toMatch(/Доп\. пакет/);
    expect(card.textContent).toMatch(/Оплачено/);
  });
});
