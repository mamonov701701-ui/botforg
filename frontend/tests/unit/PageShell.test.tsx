import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import PageShell from '@/ui/PageShell';
import DashboardPage from '@/features/dashboard/components/DashboardPage';

describe('PageShell', () => {
  it('renders title, subtitle and body inside framed shell', () => {
    render(
      <PageShell title="Финансы" subtitle="Описание">
        <div data-testid="child">content</div>
      </PageShell>
    );
    expect(screen.getByTestId('bf-page-shell').className).toContain('bf-page-shell');
    expect(screen.getByTestId('bf-page-shell-title').textContent).toBe('Финансы');
    expect(screen.getByTestId('bf-page-shell-subtitle').textContent).toBe('Описание');
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('renders tabs with active selection', () => {
    const onTabChange = vi.fn();
    render(
      <PageShell
        title="Раздел"
        tabs={[
          { id: 'a', label: 'Тарифы' },
          { id: 'b', label: 'Возвраты' },
        ]}
        activeTabId="b"
        onTabChange={onTabChange}
      >
        body
      </PageShell>
    );
    expect(screen.getByTestId('bf-page-shell-tab-b').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('bf-page-shell-tab-a'));
    expect(onTabChange).toHaveBeenCalledWith('a');
  });

  it('renders optional eyebrow above title', () => {
    render(
      <PageShell eyebrow="БОТФОРГ" title="Возможности платформы">
        body
      </PageShell>
    );
    expect(screen.getByTestId('bf-page-shell-eyebrow').textContent).toBe('БОТФОРГ');
    expect(screen.getByTestId('bf-page-shell-title').textContent).toBe('Возможности платформы');
  });
});

describe('DashboardPage shell', () => {
  it('wraps titled pages in dashboard-page-shell', () => {
    render(
      <DashboardPage title="Главная" subtitle="Обзор">
        <span data-testid="page-body">ok</span>
      </DashboardPage>
    );
    expect(screen.getByTestId('dashboard-page-shell')).toBeTruthy();
    expect(screen.getByTestId('page-body')).toBeTruthy();
  });

  it('skips shell chrome when title is empty (CRM nested)', () => {
    render(
      <DashboardPage title="">
        <span data-testid="crm-body">crm</span>
      </DashboardPage>
    );
    expect(screen.queryByTestId('dashboard-page-shell')).toBeNull();
    expect(screen.getByTestId('crm-body')).toBeTruthy();
  });
});
