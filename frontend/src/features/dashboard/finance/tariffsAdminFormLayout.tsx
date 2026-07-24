/**
 * Shared viewport-safe modal shell + compact form layout for tariff admin create/edit.
 */
import React from 'react';
import { X } from 'lucide-react';
import { FINANCE_COLORS } from './financeHelpers';

export const tariffsFieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  fontSize: 13,
  boxSizing: 'border-box',
};

export const tariffsLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: FINANCE_COLORS.textSecondary,
  marginBottom: 4,
};

export const tariffsSectionTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  margin: '0 0 8px',
  color: FINANCE_COLORS.text,
};

export const tariffsHelpStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  lineHeight: 1.4,
  color: FINANCE_COLORS.textSecondary,
};

export const tariffsFormGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '10px 12px',
  marginBottom: 12,
};

export const tariffsFormSectionStyle: React.CSSProperties = {
  marginBottom: 14,
};

export const tariffsBtnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: 'transparent',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  color: FINANCE_COLORS.text,
};

export const tariffsBtnPrimaryLayout: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 13,
  minHeight: 36,
};

export function TariffsCheckbox({
  label,
  checked,
  onChange,
  testId,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 13,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.85 : 1,
        }}
      >
        <input
          type="checkbox"
          data-testid={testId}
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          <span style={{ fontWeight: 600 }}>{label}</span>
          {hint ? <span style={{ display: 'block', ...tariffsHelpStyle }}>{hint}</span> : null}
        </span>
      </label>
    </div>
  );
}

export function TariffsAdminFormModalShell({
  testId,
  title,
  onClose,
  footer,
  children,
}: {
  testId: string;
  title: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  // Overlay sits strictly between fixed site header and site footer
  // (--header-h / --footer-h / --modal-viewport-gap from index.css).
  const overlayTop = 'calc(var(--header-h, 80px) + var(--modal-viewport-gap, 12px))';
  const overlayBottom = 'calc(var(--footer-h, 64px) + var(--modal-viewport-gap, 12px))';

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onClick={onClose}
      style={{
        position: 'fixed',
        top: overlayTop,
        right: 0,
        bottom: overlayBottom,
        left: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 12,
        paddingRight: 12,
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        data-testid={`${testId}-dialog`}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: FINANCE_COLORS.panelBg,
          borderRadius: 12,
          border: `1px solid ${FINANCE_COLORS.accentBorder}`,
          overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div
          data-testid={`${testId}-header`}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
          }}
        >
          <h3 style={{ margin: 0, color: FINANCE_COLORS.accent, fontSize: 18 }}>{title}</h3>
          <button
            type="button"
            aria-label="Закрыть"
            data-testid={`${testId}-close`}
            onClick={onClose}
            style={{
              ...tariffsBtnSecondary,
              padding: 6,
              minWidth: 36,
              minHeight: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div
          data-testid={`${testId}-body`}
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '14px 16px',
            minHeight: 0,
          }}
        >
          {children}
        </div>
        <div
          data-testid={`${testId}-footer`}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderTop: `1px solid ${FINANCE_COLORS.accentBorder}`,
            background: FINANCE_COLORS.panelBgElevated,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
