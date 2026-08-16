/**
 * Admin UI: versioned addon pricing grids (Этап 7.2).
 * Active / draft / archived versions; edit tiers only on draft; publish swaps active.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  archiveAdminPricingGrid,
  createAdminPricingGridDraft,
  createAdminPricingGridTier,
  deleteAdminPricingGridDraft,
  deleteAdminPricingGridTier,
  formatPricingTierRange,
  getAdminPricingGrid,
  listAdminPricingGrids,
  pricingGridStatusLabel,
  publishAdminPricingGrid,
  safePricingGridsErrorMessage,
  updateAdminPricingGridTier,
  type AdminPricingGridVersion,
  type AdminPricingTier,
} from '../../../api/addonPricingAdmin';
import { MAX_CUSTOM_MESSAGES_QUANTITY } from '../../../api/addons';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import { formatMoneyRu } from '../../pricing/pricingDisplay';
import { FINANCE_COLORS } from './financeHelpers';
import { addonTypeLabel } from './addonsAdminDisplay';
import {
  TariffsAdminFormModalShell,
  tariffsBtnPrimaryLayout,
  tariffsBtnSecondary,
  tariffsFieldStyle,
  tariffsFormGridStyle,
  tariffsHelpStyle,
  tariffsLabelStyle,
} from './tariffsAdminFormLayout';

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 600,
  color: FINANCE_COLORS.textSecondary,
  borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: 13,
  borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
  verticalAlign: 'top',
};

const actionBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: 'transparent',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12,
  color: FINANCE_COLORS.text,
  marginRight: 6,
  marginBottom: 4,
};

const RESOURCE_OPTIONS = [
  { value: 'messages', label: 'Сообщения' },
  { value: 'ai_credits', label: 'ИИ-кредиты' },
];

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type FilterTab = 'all' | 'active' | 'draft' | 'archived';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function TierForm({
  version,
  initial,
  onClose,
  onSaved,
}: {
  version: AdminPricingGridVersion;
  initial?: AdminPricingTier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rangeStart, setRangeStart] = useState(String(initial?.range_start ?? '1'));
  const [rangeEnd, setRangeEnd] = useState(
    initial?.range_end == null ? '' : String(initial.range_end)
  );
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const submit = async () => {
    if (savingRef.current) return;
    const start = Number(rangeStart);
    if (!Number.isInteger(start) || start < 1) {
      setError('Начало диапазона: целое число ≥ 1.');
      return;
    }
    let end: number | null = null;
    if (rangeEnd.trim() !== '') {
      end = Number(rangeEnd);
      if (!Number.isInteger(end) || end < start) {
        setError('Конец диапазона: целое число ≥ начала, либо пусто (открытый верх).');
        return;
      }
    }
    const price = Number(String(unitPrice).replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      setError('Цена за единицу должна быть больше 0.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        range_start: start,
        range_end: end,
        unit_price: String(unitPrice).replace(',', '.'),
      };
      if (initial) {
        await updateAdminPricingGridTier(version.id, initial.id, payload);
      } else {
        await createAdminPricingGridTier(version.id, payload);
      }
      toast.success(initial ? 'Ступень сохранена' : 'Ступень добавлена');
      onSaved();
      onClose();
    } catch (err) {
      setError(safePricingGridsErrorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <TariffsAdminFormModalShell
      title={initial ? 'Изменить ступень' : 'Добавить ступень'}
      testId={initial ? 'addon-tiers-edit-modal' : 'addon-tiers-create-modal'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={tariffsBtnSecondary} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="bf-primary-cta"
            data-testid={initial ? 'addon-tiers-edit-submit' : 'addon-tiers-create-submit'}
            disabled={saving}
            onClick={() => void submit()}
            style={tariffsBtnPrimaryLayout}
          >
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <p style={tariffsHelpStyle}>
        Версия v{version.version_number} · {addonTypeLabel(version.resource_type)} ·{' '}
        {version.currency}. Открытый верх — оставьте конец пустым (только у последней ступени).
      </p>
      <div style={tariffsFormGridStyle}>
        <div>
          <label style={tariffsLabelStyle}>Начало</label>
          <input
            data-testid="addon-tiers-create-range-start"
            value={rangeStart}
            onChange={e => setRangeStart(e.target.value)}
            style={tariffsFieldStyle}
            inputMode="numeric"
          />
        </div>
        <div>
          <label style={tariffsLabelStyle}>Конец (пусто = от N)</label>
          <input
            data-testid="addon-tiers-create-range-end"
            value={rangeEnd}
            onChange={e => setRangeEnd(e.target.value)}
            style={tariffsFieldStyle}
            inputMode="numeric"
            placeholder="открытый верх"
          />
        </div>
        <div>
          <label style={tariffsLabelStyle}>Цена за единицу</label>
          <input
            data-testid="addon-tiers-create-unit-price"
            value={unitPrice}
            onChange={e => setUnitPrice(e.target.value)}
            style={tariffsFieldStyle}
            inputMode="decimal"
            placeholder="0,30"
          />
        </div>
      </div>
      {error ? (
        <div
          data-testid="addon-tiers-create-error"
          style={{ color: FINANCE_COLORS.danger, marginTop: 10, fontSize: 13 }}
        >
          {error}
        </div>
      ) : null}
    </TariffsAdminFormModalShell>
  );
}

export default function AddonPricingTiersPanel() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AdminPricingGridVersion[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [resourceFilter, setResourceFilter] = useState('messages');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminPricingGridVersion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tierForm, setTierForm] = useState<'create' | AdminPricingTier | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const res = await listAdminPricingGrids({ resource_type: resourceFilter });
      setVersions(res.items);
      setLoadState(res.items.length ? 'ready' : 'empty');
      setSelectedId(prev => {
        if (prev && res.items.some(v => v.id === prev)) return prev;
        const active = res.items.find(v => v.status === 'active');
        return active?.id ?? res.items[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLoadState('forbidden');
        setError('Недостаточно прав для управления ценовыми сетками.');
      } else {
        setLoadState('error');
        setError(safePricingGridsErrorMessage(err));
      }
    }
  }, [resourceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const v = await getAdminPricingGrid(id);
      setDetail(v);
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    if (filter === 'all') return versions;
    return versions.filter(v => v.status === filter);
  }, [versions, filter]);

  const editable = detail?.status === 'draft';

  const createDraft = async (basedOn?: number | null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const draft = await createAdminPricingGridDraft({
        resource_type: resourceFilter,
        currency: detail?.currency || 'RUB',
        based_on_version_id: basedOn ?? detail?.id ?? null,
      });
      toast.success(`Черновик v${draft.version_number} создан`);
      setSelectedId(draft.id);
      await load();
      await loadDetail(draft.id);
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!detail || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const published = await publishAdminPricingGrid(detail.id);
      toast.success(`Версия v${published.version_number} опубликована`);
      await load();
      await loadDetail(published.id);
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!detail || detail.status !== 'draft' || busyRef.current) return;
    if (
      !window.confirm(
        `Удалить черновик v${detail.version_number}? Действие необратимо и доступно только если версия не использовалась в покупках.`
      )
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await deleteAdminPricingGridDraft(detail.id);
      toast.success('Черновик удалён');
      setSelectedId(null);
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const archiveActive = async () => {
    if (!detail || detail.status !== 'active' || busyRef.current) return;
    if (
      !window.confirm(
        'После архивирования активной ценовой сетки покупка настраиваемого пакета будет недоступна до публикации новой версии.'
      )
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const archived = await archiveAdminPricingGrid(detail.id);
      toast.success(`Версия v${archived.version_number} архивирована — продажи приостановлены`);
      await load();
      await loadDetail(archived.id);
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const removeTier = async (tier: AdminPricingTier) => {
    if (!detail || !editable || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await deleteAdminPricingGridTier(detail.id, tier.id);
      toast.success('Ступень удалена');
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(safePricingGridsErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div data-testid="addon-pricing-tiers-panel">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Ценовые сетки</h3>
        <select
          data-testid="addon-grids-resource-filter"
          value={resourceFilter}
          onChange={e => setResourceFilter(e.target.value)}
          style={{ ...tariffsFieldStyle, width: 'auto', minWidth: 140 }}
        >
          {RESOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="addon-grids-refresh"
          onClick={() => void load()}
          style={actionBtn}
        >
          <RefreshCw size={14} style={{ verticalAlign: 'middle' }} /> Обновить
        </button>
        <button
          type="button"
          className="bf-primary-cta"
          data-testid="addon-grids-create-draft"
          disabled={busy}
          onClick={() => void createDraft(null)}
          style={tariffsBtnPrimaryLayout}
        >
          Создать новую версию
        </button>
      </div>

      <p style={{ ...tariffsHelpStyle, marginTop: 0 }}>
        Одна активная сетка на ресурс и валюту. Изменение цен — через черновик и публикацию. Старые
        покупки хранят свой snapshot и не меняются.
      </p>

      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(
          [
            ['all', 'Все'],
            ['active', 'Активные'],
            ['draft', 'Черновики'],
            ['archived', 'Архив'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            data-testid={`addon-grids-filter-${id}`}
            className={`bf-page-shell__tab${filter === id ? ' is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadState === 'loading' && <div data-testid="addon-grids-loading">Загрузка…</div>}
      {loadState === 'forbidden' && (
        <div data-testid="addon-grids-forbidden" style={{ color: FINANCE_COLORS.danger }}>
          {error}
        </div>
      )}
      {loadState === 'error' && (
        <div data-testid="addon-grids-error" style={{ color: FINANCE_COLORS.danger }}>
          {error}
        </div>
      )}
      {loadState === 'empty' && (
        <div data-testid="addon-grids-empty">
          Нет версий сетки. Создайте черновик и добавьте ступени, затем опубликуйте.
        </div>
      )}

      {loadState === 'ready' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 280px) 1fr',
            gap: 14,
          }}
          className="addon-grids-layout"
        >
          <div data-testid="addon-grids-list">
            {filtered.map(v => (
              <button
                key={v.id}
                type="button"
                data-testid={`addon-grids-item-${v.id}`}
                onClick={() => setSelectedId(v.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${
                    selectedId === v.id ? FINANCE_COLORS.accent : FINANCE_COLORS.accentBorder
                  }`,
                  background:
                    selectedId === v.id ? FINANCE_COLORS.panelBgElevated : FINANCE_COLORS.panelBg,
                  cursor: 'pointer',
                  color: FINANCE_COLORS.text,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  v{v.version_number} · {pricingGridStatusLabel(v.status)}
                </div>
                <div style={{ fontSize: 12, color: FINANCE_COLORS.textSecondary, marginTop: 4 }}>
                  {addonTypeLabel(v.resource_type)} · {v.currency} · ступеней {v.tiers_count}
                </div>
                <div style={{ fontSize: 11, color: FINANCE_COLORS.textSecondary, marginTop: 4 }}>
                  созд. {formatDate(v.created_at)}
                  {v.published_at ? ` · публ. ${formatDate(v.published_at)}` : ''}
                  {v.archived_at ? ` · арх. ${formatDate(v.archived_at)}` : ''}
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
                Нет версий в этом фильтре.
              </div>
            ) : null}
          </div>

          <div data-testid="addon-grids-detail">
            {detailLoading && <div>Загрузка версии…</div>}
            {!detailLoading && detail && (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <strong>
                    Версия v{detail.version_number} — {pricingGridStatusLabel(detail.status)}
                  </strong>
                  {editable ? (
                    <>
                      <button
                        type="button"
                        data-testid="addon-tiers-create-open"
                        className="bf-primary-cta"
                        style={tariffsBtnPrimaryLayout}
                        onClick={() => setTierForm('create')}
                      >
                        Добавить ступень
                      </button>
                      <button
                        type="button"
                        data-testid="addon-grids-publish"
                        className="bf-primary-cta"
                        style={tariffsBtnPrimaryLayout}
                        disabled={busy}
                        onClick={() => void publish()}
                      >
                        Опубликовать
                      </button>
                      <button
                        type="button"
                        data-testid="addon-grids-delete-draft"
                        style={{ ...actionBtn, color: FINANCE_COLORS.danger }}
                        disabled={busy}
                        onClick={() => void deleteDraft()}
                      >
                        Удалить черновик
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid="addon-grids-clone-draft"
                        style={actionBtn}
                        disabled={busy}
                        onClick={() => void createDraft(detail.id)}
                      >
                        Создать черновик на основе
                      </button>
                      {detail.status === 'active' ? (
                        <button
                          type="button"
                          data-testid="addon-grids-archive-active"
                          style={{ ...actionBtn, color: FINANCE_COLORS.danger }}
                          disabled={busy}
                          onClick={() => void archiveActive()}
                        >
                          Остановить продажи / архивировать
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
                <p style={tariffsHelpStyle}>
                  {editable
                    ? 'Черновик можно править и удалить (если не было покупок). Публикация сделает её активной и архивирует предыдущую.'
                    : detail.status === 'active'
                      ? 'Активную сетку нельзя менять задним числом. Для новых цен — черновик на основе. Архив без замены остановит продажи «Настроить пакет».'
                      : 'Только просмотр. Для новых цен создайте черновик на основе этой версии.'}
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Диапазон</th>
                      <th style={thStyle}>Цена</th>
                      <th style={thStyle}>Валюта</th>
                      {editable ? <th style={thStyle}>Действия</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.tiers.map(tier => (
                      <tr key={tier.id} data-testid={`addon-tiers-row-${tier.id}`}>
                        <td style={tdStyle} data-testid={`addon-tiers-range-${tier.id}`}>
                          {formatPricingTierRange(
                            tier.range_start,
                            tier.range_end,
                            MAX_CUSTOM_MESSAGES_QUANTITY
                          )}
                        </td>
                        <td style={tdStyle} data-testid={`addon-tiers-price-${tier.id}`}>
                          {formatMoneyRu(tier.unit_price, tier.currency)}
                        </td>
                        <td style={tdStyle}>{tier.currency}</td>
                        {editable ? (
                          <td style={tdStyle}>
                            <button
                              type="button"
                              data-testid={`addon-tiers-edit-${tier.id}`}
                              style={actionBtn}
                              onClick={() => setTierForm(tier)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              data-testid={`addon-tiers-delete-${tier.id}`}
                              style={{ ...actionBtn, color: FINANCE_COLORS.danger }}
                              disabled={!tier.can_delete}
                              title={
                                tier.can_delete
                                  ? undefined
                                  : 'Ступень использована в покупках — удаление запрещено'
                              }
                              onClick={() => void removeTier(tier)}
                            >
                              Удалить
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.tiers.length === 0 ? (
                  <div data-testid="addon-tiers-empty" style={{ marginTop: 8 }}>
                    В версии пока нет ступеней.
                  </div>
                ) : null}
                <p style={{ ...tariffsHelpStyle, marginTop: 12 }}>
                  Технический максимум количества в «Настроить пакет»:{' '}
                  {MAX_CUSTOM_MESSAGES_QUANTITY.toLocaleString('ru-RU')} (защита от overflow, не
                  коммерческий лимит и не граница последней ступени).
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 800px) {
          .addon-grids-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {tierForm && detail && editable ? (
        <TierForm
          version={detail}
          initial={tierForm === 'create' ? null : tierForm}
          onClose={() => setTierForm(null)}
          onSaved={() => {
            if (detail) void loadDetail(detail.id);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
