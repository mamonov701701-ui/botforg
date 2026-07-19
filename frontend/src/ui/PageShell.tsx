import React from 'react';
import '../styles/shell.css';

export interface PageShellTab {
  id: string;
  label: string;
  testId?: string;
}

export interface PageShellProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small label above the title (e.g. brand mark). */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
  tabs?: PageShellTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  tabsAriaLabel?: string;
  tabsTestId?: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
  /** When false, omit outer shell chrome (title still optional). Default true. */
  framed?: boolean;
}

/**
 * Unified page container: header + optional tabs + body.
 * Used by dashboard pages and tabbed admin sections.
 */
export default function PageShell({
  title,
  subtitle,
  eyebrow,
  actions,
  breadcrumbs,
  tabs,
  activeTabId,
  onTabChange,
  tabsAriaLabel = 'Разделы',
  tabsTestId,
  children,
  testId = 'bf-page-shell',
  className = '',
  framed = true,
}: PageShellProps) {
  const hasHeader =
    Boolean(title) ||
    Boolean(subtitle) ||
    Boolean(eyebrow) ||
    Boolean(actions) ||
    Boolean(breadcrumbs?.length);

  const body = (
    <>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div
          className="bf-page-shell__breadcrumbs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: hasHeader ? 12 : 0,
            fontSize: 14,
            color: 'var(--text-muted)',
            padding: framed ? undefined : undefined,
          }}
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <span>/</span>}
              {crumb.path ? (
                <a href={crumb.path} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: 'var(--text)' }}>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {hasHeader && (
        <div className="bf-page-shell__header" data-testid="bf-page-shell-header">
          <div className="bf-page-shell__header-row">
            <div>
              {eyebrow ? (
                <p className="bf-page-shell__eyebrow" data-testid="bf-page-shell-eyebrow">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h1 className="bf-page-shell__title" data-testid="bf-page-shell-title">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="bf-page-shell__subtitle" data-testid="bf-page-shell-subtitle">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? <div className="bf-page-shell__actions">{actions}</div> : null}
          </div>
        </div>
      )}

      {tabs && tabs.length > 0 ? (
        <div
          role="tablist"
          aria-label={tabsAriaLabel}
          data-testid={tabsTestId || 'bf-page-shell-tabs'}
          className="bf-page-shell__tabs"
        >
          {tabs.map(tab => {
            const active = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={tab.testId || `bf-page-shell-tab-${tab.id}`}
                className={`bf-page-shell__tab${active ? ' is-active' : ''}`}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="bf-page-shell__body" data-testid="bf-page-shell-body">
        {children}
      </div>
    </>
  );

  if (!framed) {
    return <div data-testid={testId}>{body}</div>;
  }

  return (
    <div data-testid={testId} className={`bf-page-shell ${className}`.trim()}>
      {body}
    </div>
  );
}
