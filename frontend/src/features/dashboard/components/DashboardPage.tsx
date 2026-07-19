import React from 'react';
import PageShell from '../../../ui/PageShell';

interface DashboardPageProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
}

/**
 * Единый шаблон страницы личного кабинета / platform admin.
 * Заголовок и контент внутри page shell (кроме пустого title — CRM nested shells).
 */
export default function DashboardPage({
  title,
  subtitle,
  actions,
  children,
  breadcrumbs,
}: DashboardPageProps) {
  const hasChrome =
    Boolean(title) || Boolean(subtitle) || Boolean(actions) || Boolean(breadcrumbs?.length);

  if (!hasChrome) {
    return <>{children}</>;
  }

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      breadcrumbs={breadcrumbs}
      testId="dashboard-page-shell"
    >
      {children}
    </PageShell>
  );
}
