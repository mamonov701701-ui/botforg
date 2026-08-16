/**
 * Compact expandable admin audit row (packages / tariffs / pricing grids).
 * One operation = one collapsed line; details on demand.
 */
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FINANCE_COLORS } from './financeHelpers';

export type AdminAuditChangeLine = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type AdminAuditRowModel = {
  id: number;
  whenLabel: string;
  actionLabel: string;
  objectLabel: string;
  actorLabel: string;
  /** Technical action code — only in expanded details */
  actionCode?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  comment?: string | null;
  changedFields?: string[] | null;
  changes?: AdminAuditChangeLine[];
  extraDetails?: { label: string; value: string }[];
};

type Props = {
  item: AdminAuditRowModel;
  expanded: boolean;
  onToggle: () => void;
  testIdPrefix: string;
};

function formatMetaValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminAuditRow({ item, expanded, onToggle, testIdPrefix }: Props) {
  const hasDetails =
    Boolean(item.actionCode) ||
    item.entityId != null ||
    Boolean(item.comment) ||
    (item.changedFields && item.changedFields.length > 0) ||
    (item.changes && item.changes.length > 0) ||
    (item.extraDetails && item.extraDetails.length > 0);

  return (
    <div
      data-testid={`${testIdPrefix}-row-${item.id}`}
      style={{
        borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
        background: FINANCE_COLORS.panelBg,
      }}
    >
      <button
        type="button"
        data-testid={`${testIdPrefix}-detail-btn-${item.id}`}
        onClick={onToggle}
        disabled={!hasDetails}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          border: 'none',
          background: 'transparent',
          cursor: hasDetails ? 'pointer' : 'default',
          textAlign: 'left',
          color: FINANCE_COLORS.text,
          fontSize: 13,
          lineHeight: 1.35,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{ flexShrink: 0, color: FINANCE_COLORS.textSecondary, display: 'inline-flex' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px 8px',
            alignItems: 'baseline',
          }}
        >
          <span style={{ color: FINANCE_COLORS.textSecondary, whiteSpace: 'nowrap' }}>
            {item.whenLabel}
          </span>
          <span aria-hidden="true" style={{ color: FINANCE_COLORS.textSecondary }}>
            ·
          </span>
          <strong data-testid={`${testIdPrefix}-action-${item.id}`}>{item.actionLabel}</strong>
          <span aria-hidden="true" style={{ color: FINANCE_COLORS.textSecondary }}>
            ·
          </span>
          <span style={{ overflowWrap: 'anywhere' }}>{item.objectLabel}</span>
          <span aria-hidden="true" style={{ color: FINANCE_COLORS.textSecondary }}>
            ·
          </span>
          <span style={{ color: FINANCE_COLORS.textSecondary, overflowWrap: 'anywhere' }}>
            {item.actorLabel}
          </span>
        </span>
        {hasDetails ? (
          <span
            style={{
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 600,
              color: FINANCE_COLORS.textSecondary,
            }}
          >
            {expanded ? 'Скрыть' : 'Подробнее'}
          </span>
        ) : null}
      </button>
      {expanded && hasDetails ? (
        <div
          data-testid={`${testIdPrefix}-detail-${item.id}`}
          style={{
            padding: '0 10px 10px 32px',
            fontSize: 12,
            lineHeight: 1.5,
            color: FINANCE_COLORS.textSecondary,
          }}
        >
          {item.actionCode ? (
            <div>
              Тип события: <code>{item.actionCode}</code>
            </div>
          ) : null}
          {item.entityType || item.entityId != null ? (
            <div>
              Объект: {item.entityType || '—'}
              {item.entityId != null ? ` #${item.entityId}` : ''}
            </div>
          ) : null}
          {item.extraDetails?.map(d => (
            <div key={d.label}>
              {d.label}:{' '}
              {d.label === 'Код' ? (
                <code data-testid={`${testIdPrefix}-code-${item.id}`}>{d.value}</code>
              ) : (
                d.value
              )}
            </div>
          ))}
          {item.comment ? <div>Комментарий: {item.comment}</div> : null}
          {item.changedFields && item.changedFields.length > 0 ? (
            <div data-testid={`${testIdPrefix}-changed-${item.id}`}>
              Поля: {item.changedFields.join(', ')}
            </div>
          ) : null}
          {item.changes && item.changes.length > 0 ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {item.changes.map(ch => (
                <li
                  key={`${item.id}-${ch.field}`}
                  data-testid={`${testIdPrefix}-change-${item.id}-${ch.field}`}
                  style={{ marginBottom: 2 }}
                >
                  <strong style={{ color: FINANCE_COLORS.text }}>{ch.label}</strong>:{' '}
                  <span style={{ whiteSpace: 'pre-wrap' }}>{formatMetaValue(ch.before)}</span>
                  {' → '}
                  <span style={{ whiteSpace: 'pre-wrap' }}>{formatMetaValue(ch.after)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function formatAuditWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}
