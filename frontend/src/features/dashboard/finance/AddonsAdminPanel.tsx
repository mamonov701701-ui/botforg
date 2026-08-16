import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  archiveAdminAddon,
  deleteAdminAddon,
  getAdminCustomMessagesProduct,
  listAdminAddons,
  reactivateAdminAddon,
  safeAdminAddonUpdateErrorMessage,
  safeAdminAddonsErrorMessage,
  setAdminAddonVisibility,
  type AdminAddon,
  type AdminCustomMessagesProduct,
} from '../../../api/addonsAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import { FINANCE_COLORS } from './financeHelpers';
import AddonsAdminCreateModal from './AddonsAdminCreateModal';
import AddonsAdminEditModal from './AddonsAdminEditModal';
import AddonsAdminAuditJournal from './AddonsAdminAuditJournal';
import AddonPricingTiersPanel from './AddonPricingTiersPanel';
import AdminActionsMenu, { type AdminActionItem } from './AdminActionsMenu';
import {
  ARCHIVE_ADDON_CONFIRM,
  DELETE_ADDON_BLOCKED_HINT,
  DELETE_ADDON_CONFIRM,
  HIDE_ADDON_CONFIRM,
  addonActiveLabel,
  addonDeleteHint,
  addonDisplayName,
  addonPublicLabel,
  addonTypeLabel,
  addonAdminDurationLabel,
  addonUsageHint,
  formatAddonAdminPrice,
  formatAddonAmount,
  formatAddonReferenceCounts,
} from './addonsAdminDisplay';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type PanelView = 'catalog' | 'archived' | 'audit' | 'tiers';
type ConfirmKind = 'hide' | 'archive' | 'delete';
type ConfirmState = { kind: ConfirmKind; pkg: AdminAddon };

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

function Badge({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'ok' | 'warn' | 'accent';
}) {
  const colors =
    tone === 'ok'
      ? { bg: 'rgba(34,197,94,0.12)', color: '#15803d' }
      : tone === 'warn'
        ? { bg: 'rgba(245,158,11,0.15)', color: '#b45309' }
        : tone === 'accent'
          ? { bg: FINANCE_COLORS.accentSoftBg, color: FINANCE_COLORS.text }
          : { bg: FINANCE_COLORS.fieldBg, color: FINANCE_COLORS.textSecondary };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: colors.bg,
        color: colors.color,
        marginRight: 4,
        marginBottom: 2,
      }}
    >
      {children}
    </span>
  );
}

function AddonDetail({ pkg }: { pkg: AdminAddon }) {
  return (
    <div
      data-testid={`addons-admin-detail-${pkg.code}`}
      style={{
        padding: 12,
        background: FINANCE_COLORS.panelBgElevated,
        borderRadius: 8,
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Основное</div>
      <div>Название: {addonDisplayName(pkg)}</div>
      <div>Код: {pkg.code}</div>
      <div>Описание: {pkg.description_ru?.trim() || '—'}</div>
      <div>Тип: {addonTypeLabel(pkg.type)}</div>
      <div>Количество: {pkg.amount}</div>
      <div>Цена: {formatAddonAdminPrice(pkg.price, pkg.currency)}</div>
      <div>Валюта: {pkg.currency || 'RUB'}</div>
      <div>Срок: {addonAdminDurationLabel(pkg)}</div>
      <div>sort_order: {pkg.sort_order}</div>
      <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Состояние</div>
      <div>{addonActiveLabel(pkg.is_active)}</div>
      <div>{addonPublicLabel(pkg.is_public)}</div>
      <div>{addonUsageHint(pkg)}</div>
      <div data-testid={`addons-admin-refs-${pkg.code}`}>{formatAddonReferenceCounts(pkg)}</div>
      <div>{addonDeleteHint(pkg)}</div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  testId,
  busy,
  confirmLabel = 'Подтвердить',
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  testId: string;
  busy: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: FINANCE_COLORS.panelBg,
          borderRadius: 12,
          border: `1px solid ${destructive ? FINANCE_COLORS.danger : FINANCE_COLORS.accentBorder}`,
          padding: 20,
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            onClick={onCancel}
            style={actionBtn}
            disabled={busy}
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            className={destructive ? undefined : 'bf-primary-cta'}
            onClick={onConfirm}
            disabled={busy}
            style={
              destructive
                ? {
                    ...actionBtn,
                    color: '#fff',
                    background: FINANCE_COLORS.danger,
                    borderColor: FINANCE_COLORS.danger,
                  }
                : { padding: '6px 12px', borderRadius: 8, minHeight: 36, fontSize: 13 }
            }
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SystemCustomMessagesRow({
  product,
  onOpenGrids,
}: {
  product: AdminCustomMessagesProduct;
  onOpenGrids: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sales = product.sales_enabled ? 'Продажи включены' : 'Продажи выключены';
  const grid =
    product.active_grid_version_number != null
      ? `v${product.active_grid_version_number} / ${product.currency}`
      : `нет сетки / ${product.currency}`;
  const summary = [
    product.title,
    'Сообщения',
    sales,
    grid,
    `${product.validity_days} дней`,
    `до ${product.max_quantity.toLocaleString('ru-RU')}`,
  ].join(' · ');

  return (
    <div
      data-testid="addons-admin-system-custom-messages"
      style={{
        marginBottom: 12,
        borderRadius: 8,
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        background: FINANCE_COLORS.panelBg,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.4, flex: '1 1 240px', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{product.title}</span>
          <span style={{ color: FINANCE_COLORS.textSecondary }}> · Сообщения · </span>
          <Badge tone={product.sales_enabled ? 'ok' : 'warn'}>{sales}</Badge>
          <span style={{ color: FINANCE_COLORS.textSecondary }}>
            {' '}
            · {grid} · {product.validity_days} дн. · до{' '}
            {product.max_quantity.toLocaleString('ru-RU')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="addons-admin-goto-pricing-grids"
            style={{ ...actionBtn, marginRight: 0, marginBottom: 0 }}
            onClick={onOpenGrids}
          >
            Ценовые сетки
          </button>
          <button
            type="button"
            data-testid="addons-admin-system-details-toggle"
            style={{ ...actionBtn, marginRight: 0, marginBottom: 0 }}
            onClick={() => setOpen(v => !v)}
          >
            {open ? 'Скрыть' : 'Подробнее'}
          </button>
        </div>
      </div>
      <div data-testid="addons-admin-system-summary" style={{ display: 'none' }}>
        {summary}
      </div>
      {open ? (
        <div
          data-testid="addons-admin-system-details"
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${FINANCE_COLORS.accentBorder}`,
            fontSize: 12,
            color: FINANCE_COLORS.textSecondary,
            lineHeight: 1.5,
          }}
        >
          <div>
            System code: <code>{product.code}</code>
          </div>
          <div>Public title: {product.public_title}</div>
          <div>
            Active grid ID:{' '}
            {product.active_grid_version_id != null ? product.active_grid_version_id : '—'}
          </div>
          <div>{product.sales_status_label}</div>
          <div>{product.pricing_grids_hint}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function AddonsAdminPanel() {
  const [items, setItems] = useState<AdminAddon[]>([]);
  const [systemProduct, setSystemProduct] = useState<AdminCustomMessagesProduct | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editAddon, setEditAddon] = useState<AdminAddon | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [view, setView] = useState<PanelView>('catalog');
  const busyRef = useRef(false);

  const activeAddons = useMemo(() => items.filter(p => p.is_active), [items]);
  const archivedAddons = useMemo(() => items.filter(p => !p.is_active), [items]);
  const visibleAddons = view === 'archived' ? archivedAddons : activeAddons;

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const [data, system] = await Promise.all([
        listAdminAddons(),
        getAdminCustomMessagesProduct().catch(() => null),
      ]);
      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      setSystemProduct(system);
      setLoadState(list.length === 0 && !system ? 'empty' : 'ready');
    } catch (err) {
      setItems([]);
      setSystemProduct(null);
      const status = err instanceof ApiError ? err.status : 0;
      setLoadState(status === 401 || status === 403 ? 'forbidden' : 'error');
      setErrorMessage(safeAdminAddonsErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyUpdated = (updated: AdminAddon) => {
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === updated.id);
      if (idx < 0) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  };

  const runLifecycle = async (fn: () => Promise<AdminAddon>, okMessage: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLifecycleBusy(true);
    try {
      const updated = await fn();
      applyUpdated(updated);
      toast.success(okMessage);
      setConfirm(null);
      void load();
    } catch (err) {
      toast.error(safeAdminAddonUpdateErrorMessage(err));
    } finally {
      busyRef.current = false;
      setLifecycleBusy(false);
    }
  };

  const runDelete = async (pkg: AdminAddon) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLifecycleBusy(true);
    try {
      await deleteAdminAddon(pkg.id);
      setItems(prev => prev.filter(p => p.id !== pkg.id));
      toast.success('Пакет удалён');
      setConfirm(null);
      void load();
    } catch (err) {
      toast.error(safeAdminAddonUpdateErrorMessage(err));
      void load();
    } finally {
      busyRef.current = false;
      setLifecycleBusy(false);
    }
  };

  const packageActionItems = (pkg: AdminAddon, prefix: string): AdminActionItem[] => {
    const open = expandedId === pkg.id;
    const items: AdminActionItem[] = [
      {
        id: 'detail',
        label: open ? 'Скрыть детали' : 'Подробнее',
        testId: `${prefix}-detail-btn-${pkg.code}`,
        onSelect: () => setExpandedId(prev => (prev === pkg.id ? null : pkg.id)),
      },
      {
        id: 'edit',
        label: 'Изменить',
        testId: `${prefix}-edit-btn-${pkg.code}`,
        onSelect: () => setEditAddon(pkg),
      },
    ];
    if (pkg.is_active) {
      items.push(
        pkg.is_public
          ? {
              id: 'hide',
              label: 'Скрыть',
              testId: `${prefix}-hide-btn-${pkg.code}`,
              onSelect: () => setConfirm({ kind: 'hide', pkg }),
            }
          : {
              id: 'publish',
              label: 'Опубликовать',
              testId: `${prefix}-publish-btn-${pkg.code}`,
              onSelect: () =>
                void runLifecycle(() => setAdminAddonVisibility(pkg.id, true), 'Пакет опубликован'),
            }
      );
      items.push({
        id: 'archive',
        label: 'Архивировать',
        testId: `${prefix}-archive-btn-${pkg.code}`,
        onSelect: () => setConfirm({ kind: 'archive', pkg }),
      });
    } else {
      items.push({
        id: 'reactivate',
        label: 'Восстановить',
        testId: `${prefix}-reactivate-btn-${pkg.code}`,
        onSelect: () => void runLifecycle(() => reactivateAdminAddon(pkg.id), 'Пакет восстановлен'),
      });
    }
    items.push({
      id: 'delete',
      label: 'Удалить',
      testId: pkg.can_delete
        ? `${prefix}-delete-btn-${pkg.code}`
        : `${prefix}-delete-disabled-${pkg.code}`,
      danger: true,
      disabled: !pkg.can_delete,
      title: pkg.can_delete ? undefined : DELETE_ADDON_BLOCKED_HINT,
      onSelect: () => setConfirm({ kind: 'delete', pkg }),
    });
    return items;
  };

  return (
    <div data-testid="addons-admin-panel">
      <div
        role="tablist"
        aria-label="Разделы пакетов"
        data-testid="addons-admin-subtabs"
        style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'catalog'}
          data-testid="addons-admin-subtab-catalog"
          className={`bf-page-shell__tab${view === 'catalog' ? ' is-active' : ''}`}
          onClick={() => setView('catalog')}
        >
          Каталог ({activeAddons.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archived'}
          data-testid="addons-admin-subtab-archived"
          className={`bf-page-shell__tab${view === 'archived' ? ' is-active' : ''}`}
          onClick={() => setView('archived')}
        >
          Архивные ({archivedAddons.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'tiers'}
          data-testid="addons-admin-subtab-tiers"
          className={`bf-page-shell__tab${view === 'tiers' ? ' is-active' : ''}`}
          onClick={() => setView('tiers')}
        >
          Ценовые ступени
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'audit'}
          data-testid="addons-admin-subtab-audit"
          className={`bf-page-shell__tab${view === 'audit' ? ' is-active' : ''}`}
          onClick={() => setView('audit')}
        >
          Журнал изменений
        </button>
      </div>

      {view === 'audit' ? (
        <AddonsAdminAuditJournal />
      ) : view === 'tiers' ? (
        <AddonPricingTiersPanel />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <p style={{ margin: 0, color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
              {view === 'archived'
                ? 'Архивные пакеты: восстановление без изменения публичности.'
                : 'Активные дополнительные пакеты: создание, редактирование, публикация и архив.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {view === 'catalog' && (
                <button
                  type="button"
                  data-testid="addons-admin-create-open"
                  className="bf-primary-cta"
                  onClick={() => setCreateOpen(true)}
                  style={{ padding: '6px 12px', borderRadius: 8, minHeight: 36, fontSize: 13 }}
                >
                  Создать пакет
                </button>
              )}
              <button
                type="button"
                data-testid="addons-admin-refresh"
                onClick={() => void load()}
                style={{
                  ...actionBtn,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginRight: 0,
                }}
              >
                <RefreshCw size={14} />
                Обновить
              </button>
            </div>
          </div>

          {loadState === 'loading' && (
            <div
              data-testid="addons-admin-loading"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              Загрузка пакетов…
            </div>
          )}
          {(loadState === 'error' || loadState === 'forbidden') && (
            <div
              data-testid="addons-admin-error"
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${FINANCE_COLORS.danger}`,
                color: FINANCE_COLORS.danger,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{errorMessage || 'Ошибка загрузки'}</span>
            </div>
          )}

          {view === 'catalog' &&
          systemProduct &&
          loadState !== 'loading' &&
          loadState !== 'error' &&
          loadState !== 'forbidden' ? (
            <SystemCustomMessagesRow product={systemProduct} onOpenGrids={() => setView('tiers')} />
          ) : null}
          {loadState === 'empty' && (
            <div
              data-testid="addons-admin-empty"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              Пакеты не найдены.
            </div>
          )}
          {loadState === 'ready' && visibleAddons.length === 0 && (
            <div
              data-testid="addons-admin-filtered-empty"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              {view === 'archived' ? 'Архивных пакетов нет.' : 'Активных пакетов нет.'}
            </div>
          )}

          {loadState === 'ready' && visibleAddons.length > 0 && (
            <>
              <div data-testid="addons-admin-table-wrap" className="addons-admin-desktop">
                <table
                  data-testid="addons-admin-table"
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Пакет</th>
                      <th style={thStyle}>Код</th>
                      <th style={thStyle}>Тип</th>
                      <th style={thStyle}>Количество</th>
                      <th style={thStyle}>Цена</th>
                      <th style={thStyle}>Срок</th>
                      <th style={thStyle}>Публичность</th>
                      <th style={thStyle}>Состояние</th>
                      <th style={thStyle}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAddons.map(pkg => {
                      const open = expandedId === pkg.id;
                      return (
                        <React.Fragment key={pkg.id}>
                          <tr data-testid={`addons-admin-row-${pkg.code}`}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{addonDisplayName(pkg)}</div>
                            </td>
                            <td style={tdStyle}>
                              <code>{pkg.code}</code>
                            </td>
                            <td style={tdStyle}>{addonTypeLabel(pkg.type)}</td>
                            <td style={tdStyle}>{pkg.amount}</td>
                            <td style={tdStyle}>
                              {formatAddonAdminPrice(pkg.price, pkg.currency)}
                            </td>
                            <td style={tdStyle}>{addonAdminDurationLabel(pkg)}</td>
                            <td style={tdStyle}>
                              <Badge tone={pkg.is_public ? 'ok' : 'muted'}>
                                {addonPublicLabel(pkg.is_public)}
                              </Badge>
                            </td>
                            <td style={tdStyle}>
                              <Badge tone={pkg.is_active ? 'ok' : 'warn'}>
                                {addonActiveLabel(pkg.is_active)}
                              </Badge>
                            </td>
                            <td style={tdStyle}>
                              <AdminActionsMenu
                                testId={`addons-admin-actions-${pkg.code}`}
                                items={packageActionItems(pkg, 'addons-admin')}
                              />
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={9} style={{ padding: '0 10px 12px' }}>
                                <AddonDetail pkg={pkg} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div data-testid="addons-admin-cards" className="addons-admin-mobile">
                {visibleAddons.map(pkg => {
                  const open = expandedId === pkg.id;
                  return (
                    <div
                      key={pkg.id}
                      data-testid={`addons-admin-card-${pkg.code}`}
                      style={{
                        marginBottom: 10,
                        padding: 12,
                        borderRadius: 10,
                        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                        background: FINANCE_COLORS.panelBg,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {addonDisplayName(pkg)}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: FINANCE_COLORS.textSecondary,
                          marginBottom: 6,
                        }}
                      >
                        <code>{pkg.code}</code> · {formatAddonAmount(pkg)} ·{' '}
                        {formatAddonAdminPrice(pkg.price, pkg.currency)}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Badge tone={pkg.is_public ? 'ok' : 'muted'}>
                          {addonPublicLabel(pkg.is_public)}
                        </Badge>
                        <Badge tone={pkg.is_active ? 'ok' : 'warn'}>
                          {addonActiveLabel(pkg.is_active)}
                        </Badge>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <AdminActionsMenu
                          testId={`addons-admin-card-actions-${pkg.code}`}
                          items={packageActionItems(pkg, 'addons-admin-card')}
                        />
                      </div>
                      {open && (
                        <div style={{ marginTop: 10 }}>
                          <AddonDetail pkg={pkg} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <style>{`
            .addons-admin-mobile { display: none; }
            @media (max-width: 900px) {
              .addons-admin-desktop { display: none; }
              .addons-admin-mobile { display: block; }
            }
          `}</style>
            </>
          )}

          {createOpen && (
            <AddonsAdminCreateModal
              existingAddons={items}
              onClose={() => setCreateOpen(false)}
              onCreated={created => {
                applyUpdated(created);
                setCreateOpen(false);
                toast.success('Пакет создан');
                void load();
              }}
            />
          )}
          {editAddon && (
            <AddonsAdminEditModal
              addon={editAddon}
              onClose={() => setEditAddon(null)}
              onSaved={saved => {
                applyUpdated(saved);
                setEditAddon(null);
                toast.success('Пакет сохранён');
                void load();
              }}
            />
          )}
        </>
      )}

      {confirm?.kind === 'hide' && (
        <ConfirmDialog
          title="Скрыть пакет"
          message={HIDE_ADDON_CONFIRM}
          testId="addons-admin-hide-confirm"
          busy={lifecycleBusy}
          confirmLabel="Скрыть"
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void runLifecycle(() => setAdminAddonVisibility(confirm.pkg.id, false), 'Пакет скрыт')
          }
        />
      )}
      {confirm?.kind === 'archive' && (
        <ConfirmDialog
          title="Архивировать пакет"
          message={ARCHIVE_ADDON_CONFIRM}
          testId="addons-admin-archive-confirm"
          busy={lifecycleBusy}
          confirmLabel="Архивировать"
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void runLifecycle(() => archiveAdminAddon(confirm.pkg.id), 'Пакет архивирован')
          }
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="Удалить пакет"
          message={DELETE_ADDON_CONFIRM}
          testId="addons-admin-delete-confirm"
          busy={lifecycleBusy}
          confirmLabel="Удалить"
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runDelete(confirm.pkg)}
        />
      )}
    </div>
  );
}
