import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getLegalDocument,
  getLegalDocumentVersion,
  listLegalArchive,
  listLegalDocuments,
  type LegalRevisionListItem,
  type LegalRevisionPublic,
} from '../../api/legal';
import { docMarkdownToSafeHtml } from '../features/renderDocMarkdown';
import PageShell from '../../ui/PageShell';
import { formatLegalDate, legalDocTypeLabel } from '../../features/dashboard/legal/legalHelpers';

export function LegalIndexPage() {
  const [items, setItems] = useState<LegalRevisionListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listLegalDocuments();
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setError('Не удалось загрузить документы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="legal-public-index">
      <PageShell
        framed={false}
        title="Юридические документы"
        subtitle="Актуальные опубликованные редакции"
      >
        {loading ? <p className="text-[var(--text-muted)]">Загрузка…</p> : null}
        {error ? <p className="text-[var(--danger,#c00)]">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Опубликованных документов пока нет.</p>
        ) : null}
        <ul className="space-y-3 mt-4">
          {items.map(item => (
            <li key={item.id}>
              <Link
                to={`/legal/${item.slug}`}
                className="text-[var(--accent)] hover:underline font-medium"
                data-testid={`legal-public-link-${item.slug}`}
              >
                {item.title}
              </Link>
              <div className="text-sm text-[var(--text-muted)]">
                {legalDocTypeLabel(item.doc_type)} · v{item.version}
                {item.published_at ? ` · ${formatLegalDate(item.published_at)}` : ''}
                {' · '}
                <Link to={`/legal/${item.slug}/archive`} className="hover:underline">
                  Архив
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </PageShell>
    </div>
  );
}

function LegalDocBody({
  title,
  version,
  status,
  bodyMarkdown,
  slug,
}: {
  title: string;
  version: string;
  status: string;
  bodyMarkdown: string;
  slug: string;
}) {
  const html = docMarkdownToSafeHtml(bodyMarkdown || '');
  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="legal-public-doc">
      <PageShell
        framed={false}
        title={title}
        subtitle={`Версия ${version} · ${status}`}
        breadcrumbs={[{ label: 'Юридические документы', path: '/legal' }, { label: title }]}
      >
        <div className="mb-4 text-sm text-[var(--text-muted)]">
          <Link to={`/legal/${slug}/archive`} className="text-[var(--accent)] hover:underline">
            Архив версий
          </Link>
        </div>
        <div className="block-doc-md" dangerouslySetInnerHTML={{ __html: html }} />
      </PageShell>
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
      setError('');
      try {
        const row = await getLegalDocument(slug);
        if (!cancelled) setDoc(row);
      } catch {
        if (!cancelled) {
          setDoc(null);
          setError('Документ не найден или не опубликован');
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--text-muted)]">Загрузка…</p>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" data-testid="legal-public-not-found">
        <p>{error || 'Не найдено'}</p>
        <Link to="/legal" className="text-[var(--accent)] hover:underline">
          К списку
        </Link>
      </div>
    );
  }
  return (
    <LegalDocBody
      title={doc.title}
      version={doc.version}
      status={doc.status}
      bodyMarkdown={doc.body_markdown}
      slug={doc.slug}
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
      setError('');
      try {
        const row = await getLegalDocumentVersion(slug, version);
        if (!cancelled) setDoc(row);
      } catch {
        if (!cancelled) {
          setDoc(null);
          setError('Версия не найдена');
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--text-muted)]">Загрузка…</p>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" data-testid="legal-version-not-found">
        <p>{error || 'Не найдено'}</p>
        <Link to={`/legal/${slug}`} className="text-[var(--accent)] hover:underline">
          К актуальной версии
        </Link>
      </div>
    );
  }
  return (
    <LegalDocBody
      title={doc.title}
      version={doc.version}
      status={doc.status}
      bodyMarkdown={doc.body_markdown}
      slug={doc.slug}
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
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="legal-public-archive">
      <PageShell
        framed={false}
        title="Архив версий"
        breadcrumbs={[
          { label: 'Юридические документы', path: '/legal' },
          { label: slug, path: `/legal/${slug}` },
          { label: 'Архив' },
        ]}
      >
        {loading ? <p className="text-[var(--text-muted)]">Загрузка…</p> : null}
        {error ? <p>{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Архивных версий нет.</p>
        ) : null}
        <ul className="space-y-3 mt-4">
          {items.map(item => (
            <li key={item.id}>
              <Link
                to={`/legal/${item.slug}/v/${encodeURIComponent(item.version)}`}
                className="text-[var(--accent)] hover:underline font-medium"
              >
                {item.title} · v{item.version}
              </Link>
              <div className="text-sm text-[var(--text-muted)]">
                {item.status === 'published'
                  ? 'Опубликовано'
                  : item.status === 'archived'
                    ? 'В архиве'
                    : item.status}
                {item.published_at ? ` · ${formatLegalDate(item.published_at)}` : ''}
                {item.archived_at ? ` · архив ${formatLegalDate(item.archived_at)}` : ''}
              </div>
            </li>
          ))}
        </ul>
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
