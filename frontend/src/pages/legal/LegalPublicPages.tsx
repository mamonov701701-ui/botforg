import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  getLegalDocument,
  getLegalDocumentVersion,
  listAllLegalArchive,
  listLegalArchive,
  listLegalDocuments,
  type LegalRevisionListItem,
  type LegalRevisionPublic,
} from '../../api/legal';
import { docMarkdownToSafeHtml } from '../features/renderDocMarkdown';
import PageShell from '../../ui/PageShell';
import SectionCard from '../../ui/SectionCard';
import {
  LEGAL_LIST_TABS,
  formatLegalDateShort,
  legalPrimaryBtnStyle,
  type LegalListTabId,
} from '../../features/dashboard/legal/legalHelpers';

const pageWrap: React.CSSProperties = {
  maxWidth: 860,
  margin: '0 auto',
  padding: '32px 16px',
};

const VALID = new Set<string>(LEGAL_LIST_TABS.map(t => t.id));

function tabFromSearch(raw: string | null): LegalListTabId {
  if (raw && VALID.has(raw)) return raw as LegalListTabId;
  return 'active';
}

export function LegalIndexPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<LegalListTabId>(() => tabFromSearch(searchParams.get('tab')));
  const [items, setItems] = useState<LegalRevisionListItem[]>([]);
  const [archived, setArchived] = useState<LegalRevisionListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (tab === 'active') {
          const rows = await listLegalDocuments();
          if (!cancelled) setItems(rows);
        } else {
          const rows = await listAllLegalArchive();
          if (!cancelled) setArchived(rows);
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить документы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const setTabAndUrl = (id: LegalListTabId) => {
    setTab(id);
    if (id === 'active') setSearchParams({}, { replace: true });
    else setSearchParams({ tab: id }, { replace: true });
  };

  return (
    <div style={pageWrap} data-testid="legal-public-index">
      <PageShell
        title="Юридические документы"
        subtitle="Официальные документы BotForg"
        tabs={LEGAL_LIST_TABS.map(item => ({
          id: item.id,
          label: item.label,
          testId: `legal-public-tab-${item.id}`,
        }))}
        activeTabId={tab}
        onTabChange={id => setTabAndUrl(id as LegalListTabId)}
        tabsAriaLabel="Действующие и архив"
      >
        {loading ? <p className="text-[var(--text-muted)]">Загрузка…</p> : null}
        {error ? <p className="text-[var(--danger,#c00)]">{error}</p> : null}

        {!loading && !error && tab === 'active' && items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Действующих документов пока нет.</p>
        ) : null}
        {!loading && !error && tab === 'archive' && archived.length === 0 ? (
          <p className="text-[var(--text-muted)]">Архивных версий пока нет.</p>
        ) : null}

        {tab === 'active' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(item => (
              <SectionCard key={item.id} padding={16}>
                <Link
                  to={`/legal/${item.slug}`}
                  style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                  data-testid={`legal-public-link-${item.slug}`}
                >
                  {item.title}
                </Link>
                <div className="text-sm text-[var(--text-muted)]" style={{ marginTop: 6 }}>
                  Версия {item.version}
                  {item.published_at ? ` · ${formatLegalDateShort(item.published_at)}` : ''}
                </div>
              </SectionCard>
            ))}
          </div>
        ) : (
          <div
            data-testid="legal-public-archive-list"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {archived.map(item => (
              <SectionCard key={item.id} padding={14}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="text-sm text-[var(--text-muted)]" style={{ marginTop: 4 }}>
                      Версия {item.version}
                      {item.published_at ? ` · ${formatLegalDateShort(item.published_at)}` : ''}
                    </div>
                  </div>
                  <Link
                    to={`/legal/${item.slug}/v/${encodeURIComponent(item.version)}`}
                    style={{ ...legalPrimaryBtnStyle, textDecoration: 'none' }}
                  >
                    Открыть
                  </Link>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </PageShell>
    </div>
  );
}

function LegalDocBody({
  title,
  version,
  bodyMarkdown,
  slug,
  publishedAt,
}: {
  title: string;
  version: string;
  bodyMarkdown: string;
  slug: string;
  publishedAt: string | null;
}) {
  const html = docMarkdownToSafeHtml(bodyMarkdown || '');
  const dateLabel = formatLegalDateShort(publishedAt);
  return (
    <div style={pageWrap} data-testid="legal-public-doc">
      <PageShell
        title={title}
        breadcrumbs={[{ label: 'Юридические документы', path: '/legal' }, { label: title }]}
      >
        <SectionCard padding={20} testId="legal-doc-meta">
          <div style={{ display: 'grid', gap: 8, fontSize: 14, color: 'var(--text-muted)' }}>
            <div>
              <strong style={{ color: 'var(--text)' }}>Версия:</strong> {version}
            </div>
            <div>
              <strong style={{ color: 'var(--text)' }}>Дата публикации:</strong> {dateLabel}
            </div>
            <div>
              <strong style={{ color: 'var(--text)' }}>Дата вступления в силу:</strong> {dateLabel}
            </div>
            <div>
              <Link
                to={`/legal/${slug}/archive`}
                data-testid="legal-doc-archive-link"
                style={{ color: 'var(--accent)' }}
              >
                Архив версий
              </Link>
            </div>
          </div>
        </SectionCard>
        <SectionCard padding={24} testId="legal-doc-body" style={{ marginTop: 16 }}>
          <div
            className="block-doc-md"
            style={{ lineHeight: 1.65, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </SectionCard>
      </PageShell>
      <style>{`
        .block-doc-md h1, .block-doc-md h2, .block-doc-md h3 { margin: 1.2em 0 0.5em; font-weight: 700; }
        .block-doc-md p { margin: 0.75em 0; }
        .block-doc-md ul, .block-doc-md ol { margin: 0.75em 0; padding-left: 1.4em; }
      `}</style>
    </div>
  );
}

export function LegalDocumentPage({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<LegalRevisionPublic | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await getLegalDocument(slug);
        if (!cancelled) setDoc(row);
      } catch {
        if (!cancelled) {
          setDoc(null);
          setError('Документ не найден или ещё не опубликован');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div style={pageWrap}>
        <p className="text-[var(--text-muted)]">Загрузка…</p>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div style={pageWrap} data-testid="legal-public-not-found">
        <p>{error || 'Документ недоступен'}</p>
        <Link to="/legal" style={{ color: 'var(--accent)' }}>
          К списку документов
        </Link>
      </div>
    );
  }
  return (
    <LegalDocBody
      title={doc.title}
      version={doc.version}
      bodyMarkdown={doc.body_markdown}
      slug={doc.slug}
      publishedAt={doc.published_at}
    />
  );
}

export function LegalVersionPage({ slug, version }: { slug: string; version: string }) {
  const [doc, setDoc] = useState<LegalRevisionPublic | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await getLegalDocumentVersion(slug, version);
        if (!cancelled) setDoc(row);
      } catch {
        if (!cancelled) {
          setDoc(null);
          setError('Эта версия документа недоступна');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, version]);

  if (loading) {
    return (
      <div style={pageWrap}>
        <p className="text-[var(--text-muted)]">Загрузка…</p>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div style={pageWrap} data-testid="legal-version-not-found">
        <p>{error || 'Версия недоступна'}</p>
        <Link to={`/legal/${slug}`} style={{ color: 'var(--accent)' }}>
          К актуальной версии
        </Link>
      </div>
    );
  }
  return (
    <LegalDocBody
      title={doc.title}
      version={doc.version}
      bodyMarkdown={doc.body_markdown}
      slug={doc.slug}
      publishedAt={doc.published_at}
    />
  );
}

export function LegalArchivePage({ slug }: { slug: string }) {
  const [items, setItems] = useState<LegalRevisionListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listLegalArchive(slug);
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setError('Архив недоступен');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div style={pageWrap} data-testid="legal-public-archive">
      <PageShell
        title="Архив версий"
        breadcrumbs={[
          { label: 'Юридические документы', path: '/legal' },
          { label: 'Документ', path: `/legal/${slug}` },
          { label: 'Архив' },
        ]}
      >
        {loading ? <p className="text-[var(--text-muted)]">Загрузка…</p> : null}
        {error ? <p>{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Архивных версий нет.</p>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const href = `/legal/${item.slug}/v/${encodeURIComponent(item.version)}`;
            return (
              <SectionCard key={item.id} padding={14} testId={`legal-archive-row-${item.id}`}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Link to={href} style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="text-sm text-[var(--text-muted)]" style={{ marginTop: 4 }}>
                      Версия {item.version}
                      {item.published_at ? ` · ${formatLegalDateShort(item.published_at)}` : ''}
                    </div>
                  </Link>
                  <Link
                    to={href}
                    data-testid={`legal-archive-open-${item.id}`}
                    style={{ ...legalPrimaryBtnStyle, textDecoration: 'none' }}
                  >
                    Открыть
                  </Link>
                </div>
              </SectionCard>
            );
          })}
        </div>
      </PageShell>
    </div>
  );
}

export function LegalDocumentRoute() {
  const { slug = '' } = useParams();
  return <LegalDocumentPage slug={slug} />;
}

export function LegalVersionRoute() {
  const { slug = '', version = '' } = useParams();
  return <LegalVersionPage slug={slug} version={version} />;
}

export function LegalArchiveRoute() {
  const { slug = '' } = useParams();
  return <LegalArchivePage slug={slug} />;
}
