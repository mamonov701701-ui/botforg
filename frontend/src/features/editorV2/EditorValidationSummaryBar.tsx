import React from 'react';

export interface EditorValidationSummaryBarProps {
  errorNodeCount: number;
  warningCount: number;
  onClick?: () => void;
  /** Показывать даже при нуле (например «Всё ок») */
  showWhenClear?: boolean;
}

/**
 * Верхняя панель: краткая сводка проверки сценария.
 */
export function EditorValidationSummaryBar({
  errorNodeCount,
  warningCount,
  onClick,
  showWhenClear = false,
}: EditorValidationSummaryBarProps) {
  if (!showWhenClear && errorNodeCount === 0 && warningCount === 0) {
    return null;
  }

  const parts: string[] = [];
  if (errorNodeCount > 0) {
    parts.push(`${errorNodeCount} ${pluralRu(errorNodeCount, 'ошибка', 'ошибки', 'ошибок')}`);
  }
  if (warningCount > 0) {
    parts.push(
      `${warningCount} ${pluralRu(warningCount, 'предупреждение', 'предупреждения', 'предупреждений')}`
    );
  }
  const label =
    parts.length > 0 ? parts.join(' · ') : showWhenClear ? 'Ошибок и предупреждений нет' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? 'Открыть проверку сценария' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${
          errorNodeCount > 0 ? '#7f1d1d' : warningCount > 0 ? '#92400e' : '#334155'
        }`,
        background:
          errorNodeCount > 0
            ? 'rgba(127, 29, 29, 0.35)'
            : warningCount > 0
              ? 'rgba(146, 64, 14, 0.35)'
              : 'rgba(51, 65, 85, 0.5)',
        color: errorNodeCount > 0 ? '#fecaca' : warningCount > 0 ? '#fde68a' : '#94a3b8',
        fontSize: 13,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {errorNodeCount > 0 && (
        <span
          aria-hidden
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          !
        </span>
      )}
      {errorNodeCount === 0 && warningCount > 0 && (
        <span aria-hidden style={{ fontSize: 16 }}>
          ⚠
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
