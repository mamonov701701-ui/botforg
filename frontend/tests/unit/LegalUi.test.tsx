import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { LegalRevisionAdmin } from '@/api/legalAdmin';
import {
  canCreateNextRevision,
  canPublishLegal,
  LEGAL_COLORS,
  legalPrimaryBtnStyle,
} from '@/features/dashboard/legal/legalHelpers';

const { listAdminLegalRevisions, publishAdminLegalRevision, toast } = vi.hoisted(() => ({
  listAdminLegalRevisions: vi.fn(),
  publishAdminLegalRevision: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/legalAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/api/legalAdmin')>('@/api/legalAdmin');
  return {
    ...actual,
    listAdminLegalRevisions,
    createAdminLegalDraft: vi.fn(),
    updateAdminLegalDraft: vi.fn(),
    publishAdminLegalRevision,
    archiveAdminLegalRevision: vi.fn(),
    deleteAdminLegalDraft: vi.fn(),
  };
});

vi.mock('@/utils/toast', () => ({ toast }));

import PlatformLegalPage from '@/features/dashboard/pages/PlatformLegalPage';
import { LegalIndexPage } from '@/pages/legal/LegalPublicPages';
import AccountLegalPage from '@/features/dashboard/pages/AccountLegalPage';

const listLegalDocuments = vi.hoisted(() => vi.fn());
const listAllLegalArchive = vi.hoisted(() => vi.fn());
const getLegalAccountOverview = vi.hoisted(() => vi.fn());

vi.mock('@/api/legal', async () => {
  const actual = await vi.importActual<typeof import('@/api/legal')>('@/api/legal');
  return {
    ...actual,
    listLegalDocuments,
    listAllLegalArchive,
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
    body_markdown: '# Offer\n\nТекст',
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

describe('PlatformLegalPage tabs and publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminLegalRevisions.mockResolvedValue([
      adminRevision({ id: 1, status: 'draft', title: 'Черновик оферты' }),
      adminRevision({
        id: 2,
        status: 'published',
        title: 'Оферта',
        version: '2.0',
        published_at: '2026-07-01T00:00:00Z',
      }),
      adminRevision({
        id: 3,
        status: 'archived',
        title: 'Старая оферта',
        version: '1.0',
        published_at: '2026-06-01T00:00:00Z',
        archived_at: '2026-07-01T00:00:00Z',
      }),
    ]);
  });

  it('shows Действующие and Архив tabs; archive has no Новая редакция', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/platform/legal']}>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('legal-admin-tab-active')).toBeInTheDocument();
    expect(screen.getByTestId('legal-admin-tab-archive')).toBeInTheDocument();
    await waitFor(() => screen.getByTestId('legal-active-drafts'));
    expect(screen.getByTestId('legal-list-publish-1')).toBeInTheDocument();
    expect(screen.queryByText('Принятые редакции')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('legal-admin-tab-archive'));
    await waitFor(() => screen.getByTestId('legal-archive-list'));
    expect(screen.getByTestId('legal-archive-open-3')).toBeInTheDocument();
    expect(screen.queryByTestId('legal-new-revision-3')).not.toBeInTheDocument();
    expect(screen.queryByText('Новая редакция')).not.toBeInTheDocument();
  });

  it('publishes draft via single publish endpoint and refreshes active/archive lists', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    publishAdminLegalRevision.mockResolvedValue(
      adminRevision({
        id: 1,
        status: 'published',
        version: '2.0',
        published_at: '2026-07-02T00:00:00Z',
      })
    );
    listAdminLegalRevisions
      .mockResolvedValueOnce([
        adminRevision({ id: 1, status: 'draft', version: '2.0', title: 'Оферта 2' }),
        adminRevision({
          id: 2,
          status: 'published',
          version: '1.0',
          title: 'Оферта',
          published_at: '2026-06-01T00:00:00Z',
        }),
      ])
      .mockResolvedValue([
        adminRevision({
          id: 1,
          status: 'published',
          version: '2.0',
          title: 'Оферта 2',
          published_at: '2026-07-02T00:00:00Z',
        }),
        adminRevision({
          id: 2,
          status: 'archived',
          version: '1.0',
          title: 'Оферта',
          published_at: '2026-06-01T00:00:00Z',
          archived_at: '2026-07-02T00:00:00Z',
        }),
      ]);

    render(
      <MemoryRouter>
        <PlatformLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByTestId('legal-list-publish-1'));
    fireEvent.click(screen.getByTestId('legal-list-publish-1'));
    await waitFor(() => expect(publishAdminLegalRevision).toHaveBeenCalledTimes(1));
    expect(publishAdminLegalRevision).toHaveBeenCalledWith(1);
    await waitFor(() => expect(listAdminLegalRevisions.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => screen.getByTestId('legal-new-revision-1'));
    expect(screen.queryByTestId('legal-list-publish-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('legal-admin-tab-archive'));
    await waitFor(() => screen.getByTestId('legal-archive-open-2'));
    confirmSpy.mockRestore();
  });

  it('maps technical publish errors to Russian', async () => {
    const { safeLegalAdminErrorMessage } = await import('@/api/legalAdmin');
    const { ApiError } = await import('@/api/client');
    const msg = safeLegalAdminErrorMessage(
      new ApiError(
        'Only lawyer_approved revisions can be published',
        409,
        'invalid_status_transition'
      ),
      'Не удалось опубликовать'
    );
    expect(msg).not.toMatch(/lawyer_approved|409|Conflict/i);
    expect(msg).toMatch(/черновик/i);
  });

  it('primary buttons use dark text', () => {
    expect(legalPrimaryBtnStyle.color).toBe(LEGAL_COLORS.dark);
    expect(canPublishLegal('draft')).toBe(true);
    expect(canPublishLegal('lawyer_approved')).toBe(false);
    expect(canCreateNextRevision('archived')).toBe(false);
  });

  it('shows deferred 6.14.9Б-2 notice collapsed with expand and copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemoryRouter>
        <PlatformLegalPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('legal-deferred-package-refund-notice')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-notice-title')).toHaveTextContent('6.14.9Б-2');
    expect(screen.getByTestId('legal-deferred-notice-subtitle')).toHaveTextContent(
      'пакетным скидкам'
    );
    expect(screen.getByTestId('legal-deferred-notice-status')).toHaveTextContent('Отложено');
    expect(screen.getByTestId('legal-deferred-notice-summary')).toHaveTextContent(
      'нельзя включать в production'
    );
    expect(screen.getByTestId('legal-deferred-notice-toggle')).toHaveTextContent(
      'Показать подробности'
    );
    expect(screen.queryByTestId('legal-deferred-notice-details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('legal-deferred-notice-toggle'));
    expect(screen.getByTestId('legal-deferred-notice-details')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-context')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-why')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-prerequisites')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-implement')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-forbidden')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-prepared')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-section-next')).toBeInTheDocument();
    expect(screen.getByTestId('legal-deferred-notice-toggle')).toHaveTextContent(
      'Скрыть подробности'
    );

    fireEvent.click(screen.getByTestId('legal-deferred-notice-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('6.14.9Б-2');
    expect(copied).toContain('Контекст');
    expect(copied).toContain('Почему подэтап отложен');
    expect(copied).toContain('Следующее действие');
    await waitFor(() =>
      expect(screen.getByTestId('legal-deferred-notice-copy-hint')).toHaveTextContent(
        'Контекст скопирован'
      )
    );

    // Вкладки продолжают работать рядом с напоминанием.
    expect(screen.getByTestId('legal-admin-tab-active')).toBeInTheDocument();
    expect(screen.getByTestId('legal-admin-tab-archive')).toBeInTheDocument();
  });
});

describe('AccountLegalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLegalAccountOverview.mockResolvedValue({
      current_documents: [
        {
          id: 1,
          doc_type: 'privacy_policy',
          slug: 'privacy-policy',
          version: '2.0',
          status: 'published',
          title: 'Политика конфиденциальности',
          content_sha256: 'x',
          published_at: '2026-07-01T00:00:00Z',
          archived_at: null,
        },
      ],
      archived_documents: [
        {
          id: 9,
          doc_type: 'privacy_policy',
          slug: 'privacy-policy',
          version: '1.0',
          status: 'archived',
          title: 'Политика конфиденциальности',
          content_sha256: 'y',
          published_at: '2026-05-01T00:00:00Z',
          archived_at: '2026-07-01T00:00:00Z',
        },
      ],
      accepted: [],
      purchase_snapshots: [],
    });
  });

  it('shows vertical list; hides tech fields; splits active/archive', async () => {
    render(
      <MemoryRouter>
        <AccountLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByTestId('account-legal-active-list'));
    expect(screen.queryByTestId('legal-deferred-package-refund-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-legal-read-privacy-policy')).toBeInTheDocument();
    expect(screen.queryByText('Принятые редакции')).not.toBeInTheDocument();
    expect(screen.queryByText('privacy_policy')).not.toBeInTheDocument();
    expect(screen.queryByText('published')).not.toBeInTheDocument();
    expect(screen.queryByText('privacy-policy')).not.toBeInTheDocument();
    expect(screen.getByText('Политика конфиденциальности')).toBeInTheDocument();
    expect(screen.getByTestId('account-legal-tab-archive')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('account-legal-tab-archive'));
    await waitFor(() => screen.getByTestId('account-legal-archive-list'));
    expect(screen.getByTestId('account-legal-archive-9')).toBeInTheDocument();
    expect(screen.getByText('Открыть')).toBeInTheDocument();
  });

  it('shows empty archive message', async () => {
    getLegalAccountOverview.mockResolvedValue({
      current_documents: [],
      archived_documents: [],
      accepted: [],
      purchase_snapshots: [],
    });
    render(
      <MemoryRouter initialEntries={['/dashboard/account/legal?tab=archive']}>
        <AccountLegalPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByTestId('account-legal-archive-empty'));
    expect(screen.getByText('Архивных редакций пока нет.')).toBeInTheDocument();
  });
});

describe('public legal index tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    listAllLegalArchive.mockResolvedValue([
      {
        id: 8,
        doc_type: 'privacy_policy',
        slug: 'privacy-policy',
        version: '1.0',
        status: 'archived',
        title: 'Политика',
        content_sha256: 'z',
        published_at: '2026-05-01T00:00:00Z',
        archived_at: '2026-07-01T00:00:00Z',
      },
    ]);
  });

  it('separates active and archive without raw codes', async () => {
    render(
      <MemoryRouter>
        <LegalIndexPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByTestId('legal-public-link-privacy-policy'));
    expect(screen.queryByTestId('legal-deferred-package-refund-notice')).not.toBeInTheDocument();
    expect(screen.queryByText('published')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('legal-public-tab-archive'));
    await waitFor(() => screen.getByTestId('legal-public-archive-list'));
    expect(screen.getByText('Открыть')).toBeInTheDocument();
    expect(screen.queryByText('archived')).not.toBeInTheDocument();
  });
});
