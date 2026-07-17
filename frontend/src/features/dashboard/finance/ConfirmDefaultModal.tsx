import React from 'react';
import { FINANCE_COLORS } from './financeHelpers';
import type { PaymentProviderConnection } from '../../../api/paymentProviderConnections';

interface Props {
  connection: PaymentProviderConnection | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDefaultModal({ connection, busy, onCancel, onConfirm }: Props) {
  if (!connection) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-default-title"
      data-testid="confirm-default-modal"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: FINANCE_COLORS.panelBgElevated,
          border: `1px solid ${FINANCE_COLORS.accentBorder}`,
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          color: FINANCE_COLORS.text,
        }}
      >
        <h3
          id="finance-default-title"
          style={{ margin: '0 0 12px 0', color: FINANCE_COLORS.accent, fontSize: 18 }}
        >
          Сделать основным?
        </h3>
        <p style={{ margin: '0 0 20px 0', color: FINANCE_COLORS.text, lineHeight: 1.5 }}>
          Новые платежи будут направляться через{' '}
          <strong style={{ color: FINANCE_COLORS.accent }}>{connection.connection_name}</strong>.
          Уже созданные платежи останутся у прежнего провайдера.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} disabled={busy} style={secondaryBtn}>
            Отмена
          </button>
          <button
            type="button"
            data-testid="confirm-default-submit"
            onClick={onConfirm}
            disabled={busy}
            style={primaryBtn}
          >
            {busy ? 'Назначаем…' : 'Сделать основным'}
          </button>
        </div>
      </div>
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  cursor: 'pointer',
  fontWeight: 600,
  minHeight: 44,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: 'none',
  background: FINANCE_COLORS.accent,
  color: FINANCE_COLORS.dark,
  cursor: 'pointer',
  fontWeight: 700,
  minHeight: 44,
};
