import React from 'react';
import { FINANCE_COLORS } from './financeHelpers';

interface Props {
  title: string;
  description?: string;
}

/** Placeholder-вкладка финансов до следующих этапов. */
export default function FinancePlaceholderTab({ title, description }: Props) {
  return (
    <div
      style={{
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        borderRadius: 12,
        background: FINANCE_COLORS.panelBg,
        padding: '28px 24px',
      }}
    >
      <h3
        style={{
          margin: '0 0 8px 0',
          fontSize: 18,
          fontWeight: 700,
          color: FINANCE_COLORS.accent,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          color: FINANCE_COLORS.textSecondary,
          lineHeight: 1.5,
          maxWidth: 560,
        }}
      >
        {description ||
          'Раздел будет реализован на следующих этапах. Сейчас доступны только настройки платёжных провайдеров.'}
      </p>
      <div
        style={{
          marginTop: 16,
          display: 'inline-block',
          padding: '6px 10px',
          borderRadius: 8,
          background: FINANCE_COLORS.accentSoftBg,
          border: `1px solid ${FINANCE_COLORS.accentBorder}`,
          color: FINANCE_COLORS.accent,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Будет реализовано на следующих этапах
      </div>
    </div>
  );
}
