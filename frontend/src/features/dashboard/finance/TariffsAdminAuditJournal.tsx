import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  listAdminPlanAudit,
  safeAdminPlansErrorMessage,
  TARIFF_PLAN_AUDIT_ACTIONS,
  type AdminPlanAuditItem,
} from '../../../api/tariffsAdmin';
import { ApiError } from '../../../api/client';
import { FINANCE_COLORS } from './financeHelpers';

const PAGE_SIZE = 20;

const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Все действия' },
  { value: 'tariff_plan_created', label: 'Создание' },
  { value: 'tariff_plan_updated', label: 'Изменение' },
  { value: 'tariff_plan_published', label: 'Публикация' },
  { value: 'tariff_plan_hidden', label: 'Скрытие' },
  { value: 'tariff_plan_archived', label: 'Архивирование' },
  { value: 'tariff_plan_reactivated', label: 'Восстановление' },
  { value: 'tariff_plan_deleted', label: 'Удаление' },
];

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export default function TariffsAdminAuditJournal() {
  const [items, setItems] = useState<AdminPlanAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(
    async (opts?: { action?: string; offset?: number }) => {
      const nextAction = opts?.action ?? action;
      const nextOffset = opts?.offset ?? offset;
      setLoadState('loading');
      setErrorMessage(null);
      try {
        const data = await listAdminPlanAudit({
          action: nextAction || null,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setItems(data.items);
        setTotal(data.total);
        setOffset(data.offset);
        setLoadState(data.items.length === 0 ? 'empty' : 'ready');
      } catch (err) {
        setItems([]);
        setTotal(0);
        const status = err instanceof ApiError ? err.status : 0;
        setLoadState(status === 401 || status === 403 ? 'forbidden' : 'error');
        setErrorMessage(safeAdminPlansErrorMessage(err));
      }
    },
    [action, offset]
  );

  useEffect(() => {
    void load({ offset: 0, action });
  }, []);

  const onActionChange = (value: string) => {
    setAction(value);
    setExpandedId(null);
    setOffset(0);
    void load({ action: value, offset: 0 });
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div data-testid="tariffs-admin-audit-journal">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
          alignItems: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
          Журнал изменений тарифов Plan. Подарки и платежи сюда не входят.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
            Действие{' '}
            <select
              data-testid="tariffs-admin-audit-action-filter"
              value={action}
              onChange={e => onActionChange(e.target.value)}
              style={{
                marginLeft: 6,
                padding: '6px 8px',
                borderRadius: 8,
                border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                background: FINANCE_COLORS.fieldBg,
              }}
            >
              {ACTION_FILTERS.map(f => (
                <option key={f.value || 'all'} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="tariffs-admin-audit-refresh"
            onClick={() => void load()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${FINANCE_COLORS.accentBorder}`,
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <RefreshCw size={14} />
            Обновить
          </button>
        </div>
      </div>

      {loadState === 'loading' && (
        <div
          data-testid="tariffs-admin-audit-loading"
          style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
        >
          Загрузка журнала…
        </div>
      )}

      {(loadState === 'error' || loadState === 'forbidden') && (
        <div
          data-testid="tariffs-admin-audit-error"
          style={{
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${FINANCE_COLORS.danger}`,
            color: FINANCE_COLORS.danger,
            display: 'flex',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} />
          <span>{errorMessage || 'Ошибка загрузки'}</span>
        </div>
      )}

      {loadState === 'empty' && (
        <div
          data-testid="tariffs-admin-audit-empty"
          style={{ padding: 16, color: FINANCE_COLORS.textSecondary }}
        >
          Записей журнала пока нет.
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <div data-testid="tariffs-admin-audit-list">
            {items.map(item => {
              const open = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`tariffs-admin-audit-row-${item.id}`}
                  style={{
                    marginBottom: 10,
                    padding: 12,
                    borderRadius: 10,
                    border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                    background: FINANCE_COLORS.panelBg,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <strong data-testid={`tariffs-admin-audit-action-${item.id}`}>
                        {item.action_label}
                      </strong>
                      <span
                        style={{ color: FINANCE_COLORS.textSecondary, marginLeft: 8, fontSize: 12 }}
                      >
                        {item.action}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: FINANCE_COLORS.textSecondary }}>
                      {formatWhen(item.created_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    Тариф: <strong>{item.plan_name || '—'}</strong>
                    {item.plan_code ? (
                      <>
                        {' '}
                        (
                        <code data-testid={`tariffs-admin-audit-code-${item.id}`}>
                          {item.plan_code}
                        </code>
                        )
                      </>
                    ) : null}
                  </div>
                  <div
                    style={{ fontSize: 12, color: FINANCE_COLORS.textSecondary, marginBottom: 8 }}
                  >
                    Админ: {item.admin_email || `id ${item.admin_user_id}`}
                    {item.changed_fields && item.changed_fields.length > 0
                      ? ` · Поля: ${item.changed_fields.join(', ')}`
                      : ''}
                  </div>
                  <button
                    type="button"
                    data-testid={`tariffs-admin-audit-detail-btn-${item.id}`}
                    onClick={() => setExpandedId(open ? null : item.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                      background: 'transparent',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {open ? 'Скрыть' : 'Подробнее'}
                  </button>
                  {open && (
                    <div
                      data-testid={`tariffs-admin-audit-detail-${item.id}`}
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 8,
                        background: FINANCE_COLORS.panelBgElevated,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {item.changed_fields && item.changed_fields.length > 0 && (
                        <div
                          data-testid={`tariffs-admin-audit-changed-${item.id}`}
                          style={{ marginBottom: 8 }}
                        >
                          Изменённые поля: {item.changed_fields.join(', ')}
                        </div>
                      )}
                      {item.changes.length === 0 ? (
                        <div style={{ color: FINANCE_COLORS.textSecondary }}>
                          Нет детализации изменений.
                        </div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {item.changes.map(ch => (
                            <li
                              key={`${item.id}-${ch.field}`}
                              data-testid={`tariffs-admin-audit-change-${item.id}-${ch.field}`}
                              style={{ marginBottom: 4 }}
                            >
                              <strong>{ch.label}</strong>: {ch.before} → {ch.after}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            data-testid="tariffs-admin-audit-pagination"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
              {total} записей · стр. {page}/{pageCount}
            </span>
            <button
              type="button"
              data-testid="tariffs-admin-audit-prev"
              disabled={offset <= 0}
              onClick={() => {
                const next = Math.max(0, offset - PAGE_SIZE);
                setOffset(next);
                void load({ offset: next });
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                background: 'transparent',
                cursor: offset <= 0 ? 'not-allowed' : 'pointer',
                opacity: offset <= 0 ? 0.5 : 1,
              }}
            >
              Назад
            </button>
            <button
              type="button"
              data-testid="tariffs-admin-audit-next"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                void load({ offset: next });
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                background: 'transparent',
                cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer',
                opacity: offset + PAGE_SIZE >= total ? 0.5 : 1,
              }}
            >
              Вперёд
            </button>
          </div>
        </>
      )}

      {/* Ensure action constants stay aligned with backend */}
      <span data-testid="tariffs-admin-audit-actions-meta" style={{ display: 'none' }}>
        {TARIFF_PLAN_AUDIT_ACTIONS.join(',')}
      </span>
    </div>
  );
}
