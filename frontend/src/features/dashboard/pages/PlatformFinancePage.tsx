import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PaymentProvidersPanel from '../finance/PaymentProvidersPanel';
import RefundsAdminPanel from '../finance/RefundsAdminPanel';
import TariffsAdminPanel from '../finance/TariffsAdminPanel';
import AddonsAdminPanel from '../finance/AddonsAdminPanel';
import FinancePlaceholderTab from '../finance/FinancePlaceholderTab';
import { FINANCE_TABS, type FinanceTabId } from '../finance/financeHelpers';
import PageShell from '../../../ui/PageShell';

const PLACEHOLDERS: Record<
  Exclude<FinanceTabId, 'providers' | 'refunds' | 'tariffs' | 'packages'>,
  { title: string; description: string }
> = {
  gifts: {
    title: 'Подарки',
    description:
      'Выдача и отзыв GiftGrant через UI админки будет добавлена после экрана провайдеров. Backend API уже есть.',
  },
  audit: {
    title: 'Журнал действий',
    description:
      'Общий AdminAuditLog (тарифы + платежи) появится позже. Журнал изменений тарифов уже доступен: вкладка «Тарифы» → «Журнал изменений». Журнал пакетов: вкладка «Пакеты» → «Журнал изменений».',
  },
};

const VALID_TABS = new Set<string>(FINANCE_TABS.map(t => t.id));

function tabFromSearch(raw: string | null): FinanceTabId {
  if (raw && VALID_TABS.has(raw)) return raw as FinanceTabId;
  return 'providers';
}

export default function PlatformFinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<FinanceTabId>(() => tabFromSearch(searchParams.get('tab')));

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  const setTabAndUrl = (id: FinanceTabId) => {
    setTab(id);
    if (id === 'providers') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };

  const subtitle = useMemo(() => {
    if (tab === 'providers') {
      return 'Настройки эквайринга без секретов: readiness, default, health-check';
    }
    if (tab === 'refunds') {
      return 'Очередь заявок на возврат. Одобрение не запускает выплату денег.';
    }
    if (tab === 'tariffs') {
      return 'Каталог тарифов Plan: просмотр публичных, скрытых и legacy.';
    }
    if (tab === 'packages') {
      return 'Каталог дополнительных пакетов: сообщения, боты, команда, ИИ-кредиты.';
    }
    return 'Раздел финансов платформы';
  }, [tab]);

  return (
    <PageShell
      testId="finance-shell"
      title={<span data-testid="finance-shell-title">Финансы</span>}
      subtitle={<span data-testid="finance-shell-subtitle">{subtitle}</span>}
      tabs={FINANCE_TABS.map(item => ({
        id: item.id,
        label: item.label,
        testId: `finance-tab-${item.id}`,
      }))}
      activeTabId={tab}
      onTabChange={id => setTabAndUrl(id as FinanceTabId)}
      tabsAriaLabel="Разделы финансов"
      tabsTestId="finance-tablist"
    >
      <div data-testid="finance-tabpanel">
        {tab === 'providers' ? (
          <PaymentProvidersPanel />
        ) : tab === 'refunds' ? (
          <RefundsAdminPanel />
        ) : tab === 'tariffs' ? (
          <TariffsAdminPanel />
        ) : tab === 'packages' ? (
          <AddonsAdminPanel />
        ) : (
          <FinancePlaceholderTab
            title={PLACEHOLDERS[tab].title}
            description={PLACEHOLDERS[tab].description}
          />
        )}
      </div>
    </PageShell>
  );
}
