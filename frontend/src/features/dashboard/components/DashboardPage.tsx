import React from 'react';

interface DashboardPageProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
}

/**
 * Единый шаблон страницы личного кабинета
 */
export default function DashboardPage({
  title,
  subtitle,
  actions,
  children,
  breadcrumbs,
}: DashboardPageProps) {
  return (
    <div>
      {/* Хлебные крошки */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            fontSize: '14px',
            color: 'var(--text-muted)',
          }}
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span>/</span>}
              {crumb.path ? (
                <a
                  href={crumb.path}
                  style={{
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: 'var(--text)' }}>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Заголовок страницы */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '32px',
          gap: '24px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 700,
              marginBottom: subtitle ? '8px' : '0',
            }}
          >
            {title}
          </h1>
          {subtitle && <p style={{ fontSize: '16px', color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      </div>

      {/* Контент страницы */}
      <div>{children}</div>
    </div>
  );
}
