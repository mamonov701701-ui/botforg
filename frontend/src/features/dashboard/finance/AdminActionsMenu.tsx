/**
 * Compact «Действия» dropdown for finance admin tables (packages / tariffs).
 * Fixed-position portal avoids overflow clipping in table/card containers.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FINANCE_COLORS } from './financeHelpers';

export type AdminActionItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  testId?: string;
};

type Props = {
  items: AdminActionItem[];
  testId?: string;
  disabled?: boolean;
};

type MenuCoords = {
  top: number;
  left: number;
  maxHeight: number;
};

const MENU_MIN_WIDTH = 188;

export default function AdminActionsMenu({ items, testId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const trigger = rootRef.current;
    const menuEl = menuRef.current;
    if (!trigger || !menuEl) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.max(MENU_MIN_WIDTH, menuEl.offsetWidth);
    const menuHeight = menuEl.offsetHeight || items.length * 42 + 12;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const placeAbove = spaceBelow < Math.min(menuHeight, 220) && spaceAbove > spaceBelow;
    let top: number;
    let maxHeight: number;
    if (placeAbove) {
      maxHeight = Math.min(320, Math.max(120, spaceAbove - 8));
      const h = Math.min(menuHeight, maxHeight);
      top = Math.max(8, rect.top - gap - h);
    } else {
      top = rect.bottom + gap;
      maxHeight = Math.min(320, Math.max(120, window.innerHeight - top - 8));
    }
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );
    setCoords({ top, left, maxHeight });
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, close, updatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition, items.length]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        style={triggerBtn}
      >
        Действия
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              data-testid={testId ? `${testId}-menu` : undefined}
              style={{
                ...menuPanel,
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                maxHeight: coords?.maxHeight ?? 320,
                visibility: coords ? 'visible' : 'hidden',
              }}
            >
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-testid={item.testId}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    item.onSelect();
                  }}
                  style={{
                    ...menuItem,
                    ...(item.danger ? { color: FINANCE_COLORS.danger } : null),
                    ...(item.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null),
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const triggerBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12,
  minHeight: 36,
};

const menuPanel: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10050,
  minWidth: MENU_MIN_WIDTH,
  maxWidth: 'min(280px, calc(100vw - 16px))',
  overflowY: 'auto',
  background: FINANCE_COLORS.panelBgElevated || FINANCE_COLORS.panelBg,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  padding: 4,
};

const menuItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  border: 'none',
  background: 'transparent',
  color: FINANCE_COLORS.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 6,
};
