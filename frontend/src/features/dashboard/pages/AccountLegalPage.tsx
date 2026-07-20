import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLegalAccountOverview, type LegalAccountOverview } from '../../../api/legal';
import { ApiError } from '../../../api/client';
import PageShell from '../../../ui/PageShell';
import { LEGAL_COLORS, formatLegalDate, legalDocTypeLabel } from '../legal/legalHelpers';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

export default function AccountLegalPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<LegalAccountOverview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

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
        setErrorMsg('Войдите в аккаунт, чтобы видеть свои согласия');
        return;
      }
      setLoadState('error');
      setErrorMsg('Не удалось загрузить юридические данные');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      testId="account-legal-shell"
      title={<span data-testid="account-legal-title">Юридические документы</span>}
      subtitle="Актуальные документы, принятые редакции и снимки покупок"
    >
      {loadState === 'loading' ? (
        <p style={{ color: LEGAL_COLORS.textSecondary }}>Загрузка…</p>
      ) : null}
      {loadState === 'forbidden' || loadState === 'error' ? (
        <p data-testid="account-legal-error" style={{ color: LEGAL_COLORS.danger }}>
          {errorMsg}
        </p>
      ) : null}

      {loadState === 'ready' && data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section data-testid="account-legal-current">
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Актуальные документы</h3>
            {data.current_documents.length === 0 ? (
              <p style={{ color: LEGAL_COLORS.textSecondary }}>
                Опубликованных документов пока нет.{' '}
                <Link to="/legal" style={{ color: 'var(--accent)' }}>
                  Открыть раздел
                </Link>
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.current_documents.map(doc => (
                  <li key={doc.id} style={{ marginBottom: 8 }}>
                    <Link
                      to={`/legal/${doc.slug}`}
                      style={{ color: 'var(--accent)', fontWeight: 500 }}
                    >
                      {doc.title}
                    </Link>
                    <span style={{ color: LEGAL_COLORS.textSecondary, fontSize: 13 }}>
                      {' '}
                      · {legalDocTypeLabel(doc.doc_type)} · v{doc.version}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section data-testid="account-legal-accepted">
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Принятые редакции</h3>
            {data.accepted.length === 0 ? (
              <p style={{ color: LEGAL_COLORS.textSecondary }}>Согласий пока нет.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.accepted.map(row => (
                  <div
                    key={`${row.doc_type}-${row.accepted_at}`}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                      background: LEGAL_COLORS.panelBgElevated,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{legalDocTypeLabel(row.doc_type)}</div>
                    <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}>
                      Версия {row.doc_version} · {formatLegalDate(row.accepted_at)}
                      {row.source ? ` · ${row.source}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section data-testid="account-legal-snapshots">
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Юридические снимки покупок</h3>
            {data.purchase_snapshots.length === 0 ? (
              <p style={{ color: LEGAL_COLORS.textSecondary }}>
                Покупок с юридическим снимком пока нет.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.purchase_snapshots.map(snap => (
                  <div
                    key={snap.checkout_intent_id}
                    data-testid={`account-legal-snap-${snap.checkout_intent_id}`}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                      background: LEGAL_COLORS.panelBgElevated,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {snap.product_name} ({snap.product_code})
                    </div>
                    <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}>
                      {snap.amount} {snap.currency} · {snap.status}
                      {snap.legal_snapshot_at
                        ? ` · ${formatLegalDate(snap.legal_snapshot_at)}`
                        : ''}
                    </div>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {snap.offer ? (
                        <li>
                          Оферта v{snap.offer.version}{' '}
                          <Link
                            to={`/legal/${snap.offer.slug}/v/${encodeURIComponent(snap.offer.version)}`}
                            style={{ color: 'var(--accent)' }}
                          >
                            открыть
                          </Link>
                        </li>
                      ) : null}
                      {snap.refund_policy ? (
                        <li>
                          Возвраты v{snap.refund_policy.version}{' '}
                          <Link
                            to={`/legal/${snap.refund_policy.slug}/v/${encodeURIComponent(snap.refund_policy.version)}`}
                            style={{ color: 'var(--accent)' }}
                          >
                            открыть
                          </Link>
                        </li>
                      ) : null}
                      {snap.tariff_terms ? (
                        <li>
                          Тарифы v{snap.tariff_terms.version}{' '}
                          <Link
                            to={`/legal/${snap.tariff_terms.slug}/v/${encodeURIComponent(snap.tariff_terms.version)}`}
                            style={{ color: 'var(--accent)' }}
                          >
                            открыть
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
