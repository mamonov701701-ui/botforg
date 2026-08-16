import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AdminAddonAuditItem } from '@/api/addonsAdmin';

const { listAdminAddonAudit } = vi.hoisted(() => ({
  listAdminAddonAudit: vi.fn(),
}));

vi.mock('@/api/addonsAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/addonsAdmin')>('@/api/addonsAdmin');
  return { ...actual, listAdminAddonAudit };
});

import AddonsAdminAuditJournal from '@/features/dashboard/finance/AddonsAdminAuditJournal';

function item(overrides: Partial<AdminAddonAuditItem> = {}): AdminAddonAuditItem {
  return {
    id: 1,
    created_at: '2026-08-15T12:00:00Z',
    action: 'addon_package_updated',
    action_label: 'Изменение',
    entity_type: 'addon_package',
    entity_id: 9,
    admin_user_id: 1,
    admin_email: 'admin@example.com',
    addon_code: 'msg_1000',
    addon_name: '1000 сообщений',
    comment: null,
    changed_fields: ['amount'],
    changes: [{ field: 'amount', label: 'Количество', before: '500', after: '1000' }],
    ...overrides,
  };
}

describe('AddonsAdminAuditJournal', () => {
  beforeEach(() => {
    listAdminAddonAudit.mockReset();
    listAdminAddonAudit.mockResolvedValue({
      items: [item()],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it('renders change lines in Russian', async () => {
    render(<AddonsAdminAuditJournal />);
    await waitFor(() => screen.getByTestId('addons-admin-audit-row-1'));
    fireEvent.click(screen.getByTestId('addons-admin-audit-detail-btn-1'));
    expect(screen.getByTestId('addons-admin-audit-change-1-amount').textContent).toMatch(
      /Количество/
    );
    expect(screen.getByTestId('addons-admin-audit-code-1').textContent).toBe('msg_1000');
  });
});
