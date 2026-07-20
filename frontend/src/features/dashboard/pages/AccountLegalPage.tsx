import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLegalAccountOverview, type LegalAccountOverview } from '../../../api/legal';
import { ApiError } from '../../../api/client';
import PageShell from '../../../ui/PageShell';
import {
  LEGAL_COLORS,
  LEGAL_LIST_TABS,
  formatLegalDateShort,
  legalPrimaryBtnStyle,
  type LegalListTabId,
} from '../legal/legalHelpers';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

const VALID = new Set<string>(LEGAL_LIST_TABS.map(t => t.id));

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  boxSizing: 'border-box',
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${LEGAL_COLORS.accentBorder}`,
  background: LEGAL_COLORS.panelBgElevated,
};

function tabFromSearch(raw: string | null): LegalListTabId {
  if (raw && VALID.has(raw)) return raw as LegalListTabId;
  return 'active';
}

export default function AccountLegalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<LegalListTabId>(() => tabFromSearch(searchParams.get('tab')));
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<LegalAccountOverview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  const setTabAndUrl = (id: LegalListTabId) => {
    setTab(id);
    if (id === 'active') setSearchParams({}, { replace: true });
    else setSearchParams({ tab: id }, { replace: true });
  };

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const overview = await getLegalAccountOverview();
      setData(overview);
      setLoadState('ready');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setLoadState('forbidden');
        setErrorMsg('Войдите в аккаунт, чтобы видеть документы');
        return;
      }
      setLoadState('error');
      setErrorMsg('Не удалось загрузить юридические данные');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const archived = data?.archived_documents ?? [];

  return (
    <PageShell
      testId="account-legal-shell"
      title={<span data-testid="account-legal-title">Юридические документы</span>}
      subtitle="Действующие и архивные версии документов"
      tabs={LEGAL_LIST_TABS.map(item => ({
        id: item.id,
        label: item.id === 'active' ? 'Действующие документы' : 'Архив',
        testId: `account-legal-tab-${item.id}`,
      }))}
      activeTabId={tab}
      onTabChange={id => setTabAndUrl(id as LegalListTabId)}
      tabsAriaLabel="Действующие и архив"
    >
      {loadState === 'loading' ? (
        <p style={{ color: LEGAL_COLORS.textSecondary }}>Загрузка…</p>
      ) : null}
      {loadState === 'forbidden' || loadState === 'error' ? (
        <p data-testid="account-legal-error" style={{ color: LEGAL_COLORS.danger }}>
          {errorMsg}
        </p>
      ) : null}

      {loadState === 'ready' && data && tab === 'active' ? (
        <section data-testid="account-legal-current" style={{ width: '100%' }}>
          {data.current_documents.length === 0 ? (
            <p style={{ color: LEGAL_COLORS.textSecondary }}>
              Действующих документов пока нет.{' '}
              <Link to="/legal" style={{ color: 'var(--accent)' }}>
                Открыть публичный раздел
              </Link>
            </p>
          ) : (
            <div
              data-testid="account-legal-active-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
            >
              {data.current_documents.map(doc => (
                <div key={doc.id} data-testid={`account-legal-card-${doc.slug}`} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ fontWeight: 600 }}>{doc.title}</div>
                    <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary, marginTop: 4 }}>
                      Версия {doc.version}
                      {doc.published_at
                        ? ` · вступает в силу ${formatLegalDateShort(doc.published_at)}`
                        : ''}
                    </div>
                  </div>
                  <Link
                    to={`/legal/${doc.slug}`}
                    data-testid={`account-legal-read-${doc.slug}`}
                    style={{
                      ...legalPrimaryBtnStyle,
                      display: 'inline-block',
                      textDecoration: 'none',
                      flex: '0 0 auto',
                    }}
                  >
                    Прочитать
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {loadState === 'ready' && data && tab === 'archive' ? (
        <section data-testid="account-legal-archive" style={{ width: '100%' }}>
          {archived.length === 0 ? (
            <p
              data-testid="account-legal-archive-empty"
              style={{ color: LEGAL_COLORS.textSecondary }}
            >
              Архивных редакций пока нет.
            </p>
          ) : (
            <div
              data-testid="account-legal-archive-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
            >
              {archived.map(doc => (
                <div key={doc.id} data-testid={`account-legal-archive-${doc.id}`} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ fontWeight: 600 }}>{doc.title}</div>
                    <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary, marginTop: 4 }}>
                      Версия {doc.version}
                      {doc.archived_at
                        ? ` · архив с ${formatLegalDateShort(doc.archived_at)}`
                        : doc.published_at
                          ? ` · опубликована ${formatLegalDateShort(doc.published_at)}`
                          : ''}
                    </div>
                  </div>
                  <Link
                    to={`/legal/${doc.slug}/v/${encodeURIComponent(doc.version)}`}
                    style={{
                      ...legalPrimaryBtnStyle,
                      textDecoration: 'none',
                      flex: '0 0 auto',
                    }}
                  >
                    Открыть
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </PageShell>
  );
}
