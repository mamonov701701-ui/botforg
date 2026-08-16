import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AdminPricingGridVersion } from '@/api/addonPricingAdmin';

const {
  listAdminPricingGrids,
  getAdminPricingGrid,
  createAdminPricingGridDraft,
  createAdminPricingGridTier,
  publishAdminPricingGrid,
  archiveAdminPricingGrid,
  deleteAdminPricingGridDraft,
  toast,
} = vi.hoisted(() => ({
  listAdminPricingGrids: vi.fn(),
  getAdminPricingGrid: vi.fn(),
  createAdminPricingGridDraft: vi.fn(),
  createAdminPricingGridTier: vi.fn(),
  publishAdminPricingGrid: vi.fn(),
  archiveAdminPricingGrid: vi.fn(),
  deleteAdminPricingGridDraft: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/addonPricingAdmin', async () => {
  const actual =
    await vi.importActual<typeof import('@/api/addonPricingAdmin')>('@/api/addonPricingAdmin');
  return {
    ...actual,
    listAdminPricingGrids,
    getAdminPricingGrid,
    createAdminPricingGridDraft,
    createAdminPricingGridTier,
    publishAdminPricingGrid,
    archiveAdminPricingGrid,
    deleteAdminPricingGridDraft,
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

import AddonPricingTiersPanel from '@/features/dashboard/finance/AddonPricingTiersPanel';

function version(overrides: Partial<AdminPricingGridVersion> = {}): AdminPricingGridVersion {
  return {
    id: 10,
    resource_type: 'messages',
    currency: 'RUB',
    status: 'draft',
    version_number: 2,
    based_on_version_id: 1,
    created_at: '2026-08-15T10:00:00',
    published_at: null,
    archived_at: null,
    note: null,
    tiers_count: 1,
    tiers: [
      {
        id: 1,
        grid_version_id: 10,
        resource_type: 'messages',
        range_start: 1,
        range_end: 999,
        unit_price: '0.30',
        currency: 'RUB',
        is_active: true,
        sort_order: 1,
        used_in_purchases: false,
        can_delete: true,
      },
      {
        id: 2,
        grid_version_id: 10,
        resource_type: 'messages',
        range_start: 5000,
        range_end: null,
        unit_price: '0.15',
        currency: 'RUB',
        is_active: true,
        sort_order: 2,
        used_in_purchases: false,
        can_delete: true,
      },
    ],
    ...overrides,
  };
}

describe('AddonPricingTiersPanel', () => {
  beforeEach(() => {
    listAdminPricingGrids.mockReset();
    getAdminPricingGrid.mockReset();
    createAdminPricingGridDraft.mockReset();
    createAdminPricingGridTier.mockReset();
    publishAdminPricingGrid.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('lists grid versions and formats open-ended range + human price', async () => {
    const draft = version();
    listAdminPricingGrids.mockResolvedValue({ items: [draft], total: 1 });
    getAdminPricingGrid.mockResolvedValue(draft);
    render(<AddonPricingTiersPanel />);
    await waitFor(() => expect(screen.getByTestId('addon-grids-item-10')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('addon-tiers-row-1')).toBeTruthy());
    expect(screen.getByTestId('addon-tiers-range-1').textContent).toMatch(/1–999/);
    expect(screen.getByTestId('addon-tiers-range-2').textContent).toMatch(/от 5/);
    expect(screen.getByTestId('addon-tiers-price-1').textContent).toMatch(/0,3/);
    expect(screen.getByTestId('addon-grids-delete-draft')).toBeTruthy();
    fireEvent.click(screen.getByTestId('addon-tiers-create-open'));
    expect(screen.getByTestId('addon-tiers-create-unit-price')).toBeTruthy();
    fireEvent.change(screen.getByTestId('addon-tiers-create-unit-price'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('addon-tiers-create-submit'));
    expect(screen.getByTestId('addon-tiers-create-error').textContent).toMatch(/больше 0/);
  });

  it('formats technical upper bound as open-ended', async () => {
    const { formatPricingTierRange } = await import('@/api/addonPricingAdmin');
    expect(formatPricingTierRange(5000, 10_000_000)).toMatch(/^от 5/);
    expect(formatPricingTierRange(5000, null)).toMatch(/^от 5/);
    expect(formatPricingTierRange(1, 999)).toMatch(/1–999/);
  });

  it('shows archive action for active version', async () => {
    const active = version({ status: 'active', published_at: '2026-08-15T12:00:00' });
    listAdminPricingGrids.mockResolvedValue({ items: [active], total: 1 });
    getAdminPricingGrid.mockResolvedValue(active);
    render(<AddonPricingTiersPanel />);
    await waitFor(() => expect(screen.getByTestId('addon-grids-archive-active')).toBeTruthy());
    expect(screen.getByTestId('addon-grids-clone-draft')).toBeTruthy();
    expect(screen.queryByTestId('addon-grids-delete-draft')).toBeNull();
  });

  it('shows forbidden state', async () => {
    const { ApiError } = await import('@/api/client');
    listAdminPricingGrids.mockRejectedValue(new ApiError('no', 403));
    render(<AddonPricingTiersPanel />);
    await waitFor(() => expect(screen.getByTestId('addon-grids-forbidden')).toBeTruthy());
  });
});
