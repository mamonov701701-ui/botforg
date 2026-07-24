import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  archiveAdminPlan,
  deleteAdminPlan,
  listAdminPlans,
  reactivateAdminPlan,
  safeAdminPlanUpdateErrorMessage,
  safeAdminPlansErrorMessage,
  setAdminPlanVisibility,
  type AdminPlan,
} from '../../../api/tariffsAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import { FINANCE_COLORS } from './financeHelpers';
import TariffsAdminCreateModal from './TariffsAdminCreateModal';
import TariffsAdminEditModal from './TariffsAdminEditModal';
import TariffsAdminAuditJournal from './TariffsAdminAuditJournal';
import {
  ARCHIVE_PLAN_CONFIRM,
  DELETE_PLAN_BLOCKED_HINT,
  DELETE_PLAN_CONFIRM,
  formatAddonPurchase,
  formatBoolRu,
  formatLimitValue,
  formatPlanPrice,
  formatSubscriptionCount,
  HIDE_PLAN_CONFIRM,
  planActiveLabel,
  planDeleteHint,
  planDisplayName,
  planPublicLabel,
  planUsageHint,
} from './tariffsAdminDisplay';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

type PanelView = 'catalog' | 'archived' | 'audit';

type ConfirmKind = 'hide' | 'archive' | 'delete';

type ConfirmState = {
  kind: ConfirmKind;
  plan: AdminPlan;
};

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

function PlanDetail({ plan }: { plan: AdminPlan }) {
  const lim = plan.limits;
  return (
    <div
      data-testid={`tariffs-admin-detail-${plan.code}`}
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
      <div>Название: {planDisplayName(plan)}</div>
      <div>Код: {plan.code}</div>
      <div>Описание: {plan.description_ru?.trim() || '—'}</div>
      <div>Цена: {formatPlanPrice(plan.price_month, plan.currency)}</div>
      <div>Валюта: {plan.currency || 'RUB'}</div>
      <div>sort_order: {plan.sort_order}</div>

      <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Лимиты</div>
      <div>Сообщения: {formatLimitValue(lim.monthly_messages)}</div>
      <div>Боты: {formatLimitValue(lim.active_bots)}</div>
      <div>Команда: {formatLimitValue(lim.team_members)}</div>
      <div>Аналитика (дней): {formatLimitValue(lim.analytics_history_days)}</div>
      <div>Доп. пакеты: {formatAddonPurchase(lim)}</div>
      <div>Экспорт отчётов: {formatBoolRu(lim.export_reports)}</div>
      <div>Приоритетная поддержка: {formatBoolRu(lim.priority_support)}</div>
      <div>Маркетплейс: {formatBoolRu(lim.marketplace_access)}</div>
      <div>Публикация шаблонов: {formatBoolRu(lim.template_publish)}</div>
      <div>Публикация сценариев: {formatBoolRu(lim.scenario_publish)}</div>

      <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Состояние</div>
      <div>{planActiveLabel(plan.is_active)}</div>
      <div>{planPublicLabel(plan.is_public)}</div>
      <div>Рекомендуемый: {formatBoolRu(plan.is_recommended)}</div>
      <div>{planUsageHint(plan)}</div>
      <div>{formatSubscriptionCount(plan.subscription_count)}</div>
      <div>{planDeleteHint(plan)}</div>
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
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 16,
            color: destructive ? FINANCE_COLORS.danger : undefined,
          }}
        >
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            disabled={busy}
            onClick={onCancel}
            style={actionBtn}
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={onConfirm}
            className={destructive ? undefined : 'bf-primary-cta'}
            style={
              destructive
                ? {
                    ...actionBtn,
                    background: FINANCE_COLORS.danger,
                    borderColor: FINANCE_COLORS.danger,
                    color: '#fff',
                  }
                : {
                    padding: '6px 10px',
                    borderRadius: 8,
                    minHeight: 36,
                    fontSize: 12,
                    marginRight: 0,
                  }
            }
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TariffsAdminPanel() {
  const [items, setItems] = useState<AdminPlan[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState<AdminPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [view, setView] = useState<PanelView>('catalog');
  const busyRef = useRef(false);

  const activePlans = useMemo(() => items.filter(p => p.is_active), [items]);
  const archivedPlans = useMemo(() => items.filter(p => !p.is_active), [items]);
  const visiblePlans = view === 'archived' ? archivedPlans : activePlans;

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const data = await listAdminPlans();
      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      setLoadState(list.length === 0 ? 'empty' : 'ready');
    } catch (err) {
      setItems([]);
      const status = err instanceof ApiError ? err.status : 0;
      setLoadState(status === 401 || status === 403 ? 'forbidden' : 'error');
      setErrorMessage(safeAdminPlansErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyUpdated = (updated: AdminPlan) => {
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === updated.id);
      if (idx < 0) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  };

  const runLifecycle = async (fn: () => Promise<AdminPlan>, okMessage: string) => {
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
      toast.error(safeAdminPlanUpdateErrorMessage(err));
    } finally {
      busyRef.current = false;
      setLifecycleBusy(false);
    }
  };

  const runDelete = async (plan: AdminPlan) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLifecycleBusy(true);
    try {
      await deleteAdminPlan(plan.id);
      setItems(prev => prev.filter(p => p.id !== plan.id));
      toast.success('Тариф удалён');
      setConfirm(null);
      void load();
    } catch (err) {
      toast.error(safeAdminPlanUpdateErrorMessage(err));
      void load();
    } finally {
      busyRef.current = false;
      setLifecycleBusy(false);
    }
  };

  const deleteButton = (plan: AdminPlan, prefix: string) =>
    plan.can_delete ? (
      <button
        type="button"
        data-testid={`${prefix}-delete-btn-${plan.code}`}
        onClick={() => setConfirm({ kind: 'delete', plan })}
        style={{
          ...actionBtn,
          color: FINANCE_COLORS.danger,
          borderColor: FINANCE_COLORS.danger,
        }}
      >
        Удалить
      </button>
    ) : (
      <button
        type="button"
        data-testid={`${prefix}-delete-disabled-${plan.code}`}
        disabled
        title={DELETE_PLAN_BLOCKED_HINT}
        style={{
          ...actionBtn,
          opacity: 0.45,
          cursor: 'not-allowed',
        }}
      >
        Удалить
      </button>
    );

  const lifecycleButtons = (plan: AdminPlan, prefix: string) => (
    <>
      {plan.is_active &&
        (plan.is_public ? (
          <button
            type="button"
            data-testid={`${prefix}-hide-btn-${plan.code}`}
            onClick={() => setConfirm({ kind: 'hide', plan })}
            style={actionBtn}
          >
            Скрыть
          </button>
        ) : (
          <button
            type="button"
            data-testid={`${prefix}-publish-btn-${plan.code}`}
            className="bf-primary-cta"
            onClick={() =>
              void runLifecycle(() => setAdminPlanVisibility(plan.id, true), 'Тариф опубликован')
            }
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              minHeight: 36,
              fontSize: 12,
              marginRight: 6,
            }}
          >
            Опубликовать
          </button>
        ))}
      {plan.is_active ? (
        <button
          type="button"
          data-testid={`${prefix}-archive-btn-${plan.code}`}
          onClick={() => setConfirm({ kind: 'archive', plan })}
          style={actionBtn}
        >
          Архивировать
        </button>
      ) : (
        <button
          type="button"
          data-testid={`${prefix}-reactivate-btn-${plan.code}`}
          className="bf-primary-cta"
          onClick={() =>
            void runLifecycle(() => reactivateAdminPlan(plan.id), 'Тариф восстановлен')
          }
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            minHeight: 36,
            fontSize: 12,
            marginRight: 6,
          }}
        >
          Восстановить
        </button>
      )}
      {deleteButton(plan, prefix)}
    </>
  );

  return (
    <div data-testid="tariffs-admin-panel">
      <div
        role="tablist"
        aria-label="Разделы тарифов"
        data-testid="tariffs-admin-subtabs"
        style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'catalog'}
          data-testid="tariffs-admin-subtab-catalog"
          className={`bf-page-shell__tab${view === 'catalog' ? ' is-active' : ''}`}
          onClick={() => setView('catalog')}
        >
          Каталог ({activePlans.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archived'}
          data-testid="tariffs-admin-subtab-archived"
          className={`bf-page-shell__tab${view === 'archived' ? ' is-active' : ''}`}
          onClick={() => setView('archived')}
        >
          Архивные ({archivedPlans.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'audit'}
          data-testid="tariffs-admin-subtab-audit"
          className={`bf-page-shell__tab${view === 'audit' ? ' is-active' : ''}`}
          onClick={() => setView('audit')}
        >
          Журнал изменений
        </button>
      </div>

      {view === 'audit' ? (
        <TariffsAdminAuditJournal />
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
                ? 'Архивные тарифы: восстановление без изменения публичности.'
                : 'Активные тарифы Plan: создание, редактирование, публикация и архив.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {view === 'catalog' && (
                <button
                  type="button"
                  data-testid="tariffs-admin-create-open"
                  className="bf-primary-cta"
                  onClick={() => setCreateOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    minHeight: 36,
                    fontSize: 13,
                    marginRight: 0,
                  }}
                >
                  Создать тариф
                </button>
              )}
              <button
                type="button"
                data-testid="tariffs-admin-refresh"
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
              data-testid="tariffs-admin-loading"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              Загрузка тарифов…
            </div>
          )}

          {(loadState === 'error' || loadState === 'forbidden') && (
            <div
              data-testid="tariffs-admin-error"
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

          {loadState === 'empty' && (
            <div
              data-testid="tariffs-admin-empty"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              Тарифы не найдены.
            </div>
          )}

          {loadState === 'ready' && visiblePlans.length === 0 && (
            <div
              data-testid="tariffs-admin-filtered-empty"
              style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
            >
              {view === 'archived' ? 'Архивных тарифов нет.' : 'Активных тарифов нет.'}
            </div>
          )}

          {loadState === 'ready' && visiblePlans.length > 0 && (
            <>
              <div data-testid="tariffs-admin-table-wrap" className="tariffs-admin-desktop">
                <table
                  data-testid="tariffs-admin-table"
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Тариф</th>
                      <th style={thStyle}>Код</th>
                      <th style={thStyle}>Цена</th>
                      <th style={thStyle}>Сообщения</th>
                      <th style={thStyle}>Боты</th>
                      <th style={thStyle}>Команда</th>
                      <th style={thStyle}>Доп. пакеты</th>
                      <th style={thStyle}>Публичность</th>
                      <th style={thStyle}>Состояние</th>
                      <th style={thStyle}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlans.map(plan => {
                      const open = expandedId === plan.id;
                      return (
                        <React.Fragment key={plan.id}>
                          <tr data-testid={`tariffs-admin-row-${plan.code}`}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{planDisplayName(plan)}</div>
                              {plan.is_recommended && <Badge tone="accent">Рекомендуемый</Badge>}
                            </td>
                            <td style={tdStyle}>
                              <code>{plan.code}</code>
                            </td>
                            <td style={tdStyle}>
                              {formatPlanPrice(plan.price_month, plan.currency)}
                            </td>
                            <td style={tdStyle}>
                              {formatLimitValue(plan.limits.monthly_messages)}
                            </td>
                            <td style={tdStyle}>{formatLimitValue(plan.limits.active_bots)}</td>
                            <td style={tdStyle}>{formatLimitValue(plan.limits.team_members)}</td>
                            <td style={tdStyle}>{formatAddonPurchase(plan.limits)}</td>
                            <td style={tdStyle}>
                              <Badge tone={plan.is_public ? 'ok' : 'muted'}>
                                {planPublicLabel(plan.is_public)}
                              </Badge>
                            </td>
                            <td style={tdStyle}>
                              <Badge tone={plan.is_active ? 'ok' : 'warn'}>
                                {planActiveLabel(plan.is_active)}
                              </Badge>
                            </td>
                            <td style={tdStyle}>
                              <button
                                type="button"
                                data-testid={`tariffs-admin-edit-btn-${plan.code}`}
                                onClick={() => setEditPlan(plan)}
                                style={actionBtn}
                              >
                                Изменить
                              </button>
                              {lifecycleButtons(plan, 'tariffs-admin')}
                              <button
                                type="button"
                                data-testid={`tariffs-admin-detail-btn-${plan.code}`}
                                onClick={() =>
                                  setExpandedId(prev => (prev === plan.id ? null : plan.id))
                                }
                                style={actionBtn}
                              >
                                {open ? 'Скрыть детали' : 'Подробнее'}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={10} style={{ padding: '0 10px 12px' }}>
                                <PlanDetail plan={plan} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div data-testid="tariffs-admin-cards" className="tariffs-admin-mobile">
                {visiblePlans.map(plan => {
                  const open = expandedId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      data-testid={`tariffs-admin-card-${plan.code}`}
                      style={{
                        marginBottom: 10,
                        padding: 12,
                        borderRadius: 10,
                        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                        background: FINANCE_COLORS.panelBg,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {planDisplayName(plan)}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: FINANCE_COLORS.textSecondary,
                          marginBottom: 6,
                        }}
                      >
                        <code>{plan.code}</code> ·{' '}
                        {formatPlanPrice(plan.price_month, plan.currency)}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Badge tone={plan.is_public ? 'ok' : 'muted'}>
                          {planPublicLabel(plan.is_public)}
                        </Badge>
                        <Badge tone={plan.is_active ? 'ok' : 'warn'}>
                          {planActiveLabel(plan.is_active)}
                        </Badge>
                        {plan.is_recommended && <Badge tone="accent">Рекомендуемый</Badge>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          data-testid={`tariffs-admin-card-edit-btn-${plan.code}`}
                          onClick={() => setEditPlan(plan)}
                          style={actionBtn}
                        >
                          Изменить
                        </button>
                        {lifecycleButtons(plan, 'tariffs-admin-card')}
                        <button
                          type="button"
                          data-testid={`tariffs-admin-card-detail-btn-${plan.code}`}
                          onClick={() => setExpandedId(prev => (prev === plan.id ? null : plan.id))}
                          style={actionBtn}
                        >
                          {open ? 'Скрыть детали' : 'Подробнее'}
                        </button>
                      </div>
                      {open && (
                        <div style={{ marginTop: 10 }}>
                          <PlanDetail plan={plan} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <style>{`
            .tariffs-admin-mobile { display: none; }
            @media (max-width: 900px) {
              .tariffs-admin-desktop { display: none; }
              .tariffs-admin-mobile { display: block; }
            }
          `}</style>
            </>
          )}

          {createOpen && (
            <TariffsAdminCreateModal
              existingPlans={items}
              onClose={() => setCreateOpen(false)}
              onCreated={created => {
                setCreateOpen(false);
                applyUpdated(created);
                setView('catalog');
                toast.success('Тариф создан');
                void load();
              }}
            />
          )}

          {editPlan && (
            <TariffsAdminEditModal
              plan={editPlan}
              onClose={() => setEditPlan(null)}
              onSaved={updated => {
                applyUpdated(updated);
                setEditPlan(null);
                toast.success('Тариф сохранён');
                void load();
              }}
            />
          )}

          {confirm?.kind === 'hide' && (
            <ConfirmDialog
              title="Скрыть тариф"
              message={HIDE_PLAN_CONFIRM}
              testId="tariffs-admin-hide-confirm"
              busy={lifecycleBusy}
              onCancel={() => setConfirm(null)}
              onConfirm={() =>
                void runLifecycle(
                  () => setAdminPlanVisibility(confirm.plan.id, false),
                  'Тариф скрыт'
                )
              }
            />
          )}

          {confirm?.kind === 'archive' && (
            <ConfirmDialog
              title="Архивировать тариф"
              message={ARCHIVE_PLAN_CONFIRM}
              testId="tariffs-admin-archive-confirm"
              busy={lifecycleBusy}
              onCancel={() => setConfirm(null)}
              onConfirm={() =>
                void runLifecycle(() => archiveAdminPlan(confirm.plan.id), 'Тариф архивирован')
              }
            />
          )}

          {confirm?.kind === 'delete' && (
            <ConfirmDialog
              title="Удалить тариф"
              message={`${DELETE_PLAN_CONFIRM}\n\n${planDisplayName(confirm.plan)} (${confirm.plan.code})`}
              testId="tariffs-admin-delete-confirm"
              busy={lifecycleBusy}
              confirmLabel="Удалить тариф"
              destructive
              onCancel={() => setConfirm(null)}
              onConfirm={() => void runDelete(confirm.plan)}
            />
          )}
        </>
      )}
    </div>
  );
}
