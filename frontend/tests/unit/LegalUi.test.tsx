import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { LegalRevisionAdmin, LegalLaunchStatus, LegalChecklistItem } from '@/api/legalAdmin';

const {
  listAdminLegalRevisions,
  createAdminLegalDraft,
  getAdminLegalChecklist,
  getAdminLegalLaunchStatus,
  toast,
} = vi.hoisted(() => ({
  listAdminLegalRevisions: vi.fn(),
  createAdminLegalDraft: vi.fn(),
  getAdminLegalChecklist: vi.fn(),
  getAdminLegalLaunchStatus: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/legalAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/legalAdmin')>('@/api/legalAdmin');
  return {
    ...actual,
    listAdminLegalRevisions,
    createAdminLegalDraft,
    updateAdminLegalDraft: vi.fn(),
    submitAdminLegalReview: vi.fn(),
    approveAdminLegalLawyer: vi.fn(),
    publishAdminLegalRevision: vi.fn(),
    archiveAdminLegalRevision: vi.fn(),
    getAdminLegalChecklist,
    getAdminLegalLaunchStatus,
    updateAdminLegalChecklistItem: vi.fn(),
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

import PlatformLegalPage from '@/features/dashboard/pages/PlatformLegalPage';
import { LegalIndexPage } from '@/pages/legal/LegalPublicPages';
import AccountLegalPage from '@/features/dashboard/pages/AccountLegalPage';

const listLegalDocuments = vi.hoisted(() => vi.fn());
const getLegalAccountOverview = vi.hoisted(() => vi.fn());

vi.mock('@/api/legal', async () => {
  const actual = await vi.importActual<typeof import('@/api/legal')>('@/api/legal');
  return {
    ...actual,
    listLegalDocuments,
    getLegalAccountOverview,
  };
});

function adminRevision(overrides: Partial<LegalRevisionAdmin> = {}): LegalRevisionAdmin {
  return {
    id: 1,
    doc_type: 'public_offer',
    slug: 'public-offer',
    version: '1.0',
    status: 'draft',
    title: 'Оферта',
    body_markdown: '# Offer',
    content_sha256: 'abc',
    published_at: null,
    archived_at: null,
    internal_notes: null,
    created_by_user_id: 1,
    updated_by_user_id: 1,
    lawyer_approved_by_user_id: null,
    published_by_user_id: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    lawyer_approved_at: null,
    ...overrides,
  };
}

function launchStatus(overrides: Partial<LegalLaunchStatus> = {}): LegalLaunchStatus {
  return {
    legal_launch_ready: false,
    environment: 'development',
    payments_blocked: false,
    checklist_complete: false,
    required_docs_published: false,
    missing_checklist_keys: ['seller_details'],
    missing_doc_types: ['public_offer'],
    ...overrides,
  };
}

describe('PlatformLegalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminLegalRevisions.mockResolvedValue([adminRevision()]);
    getAdminLegalChecklist.mockResolvedValue([
      {
        id: 1,
        item_key: 'seller_details',
        label_ru: 'Реквизиты продавца',
        is_completed: false,
        completed_at: null,
        completed_by_user_id: null,
        note: null,
        updated_at: '2026-07-01T10:00:00Z',
      } satisfies LegalChecklistItem,
    ]);
    getAdminLegalLaunchStatus.mockResolvedValue(launchStatus());
  });

  it('renders documents tab and revision list', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/legal']}>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('legal-admin-shell')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('legal-revision-row-1')).toBeInTheDocument();
    });
  });

  it('shows readiness tab with legal_launch_ready', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/legal?tab=readiness']}>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('legal-launch-ready-value')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('legal-checklist-seller_details')).toBeInTheDocument();
  });

  it('shows forbidden state for non-admin', async () => {
    listAdminLegalRevisions.mockRejectedValue(new ApiError('forbidden', 403));
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/legal']}>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('legal-revisions-forbidden')).toBeInTheDocument();
    });
  });

  it('opens create draft form', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/legal']}>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByTestId('legal-create-toggle'));
    fireEvent.click(screen.getByTestId('legal-create-toggle'));
    expect(screen.getByTestId('legal-create-form')).toBeInTheDocument();
  });
});

describe('LegalIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists published documents', async () => {
    listLegalDocuments.mockResolvedValue([
      {
        id: 5,
        doc_type: 'privacy_policy',
        slug: 'privacy-policy',
        version: '2.0',
        status: 'published',
        title: 'Политика',
        content_sha256: 'x',
        published_at: '2026-07-01T00:00:00Z',
        archived_at: null,
      },
    ]);
    render(
      <MemoryRouter>
        <LegalIndexPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('legal-public-link-privacy-policy')).toBeInTheDocument();
    });
  });
});

describe('AccountLegalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders accepted consents without requiring IP fields', async () => {
    getLegalAccountOverview.mockResolvedValue({
      current_documents: [
        {
          id: 1,
          doc_type: 'privacy_policy',
          slug: 'privacy-policy',
          version: '2.0',
          status: 'published',
          title: 'Политика',
          content_sha256: 'x',
          published_at: '2026-07-01T00:00:00Z',
          archived_at: null,
        },
      ],
      accepted: [
        {
          doc_type: 'privacy_policy',
          doc_version: '2.0',
          accepted_at: '2026-07-02T00:00:00Z',
          revision_id: 1,
          source: 'login',
        },
      ],
      purchase_snapshots: [],
    });
    render(
      <MemoryRouter>
        <AccountLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('account-legal-accepted')).toBeInTheDocument();
    });
    expect(screen.queryByText(/user.agent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.1/)).not.toBeInTheDocument();
  });
});
