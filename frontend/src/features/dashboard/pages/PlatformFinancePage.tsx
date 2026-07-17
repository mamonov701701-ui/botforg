import React, { useMemo, useState } from 'react';
import DashboardPage from '../components/DashboardPage';
import PaymentProvidersPanel from '../finance/PaymentProvidersPanel';
import FinancePlaceholderTab from '../finance/FinancePlaceholderTab';
import { FINANCE_COLORS, FINANCE_TABS, type FinanceTabId } from '../finance/financeHelpers';

const PLACEHOLDERS: Record<
  Exclude<FinanceTabId, 'providers'>,
  { title: string; description: string }
> = {
  tariffs: {
    title: 'Тарифы',
    description:
      'Управление каталогом тарифов платформы будет доступно на следующих этапах. Сейчас используйте публичный каталог и admin backend без UI.',
  },
  packages: {
    title: 'Пакеты',
    description:
      'Управление пакетами расширения (сообщения, боты, команда) будет реализовано позже.',
  },
  gifts: {
    title: 'Подарки',
    description:
      'Выдача и отзыв GiftGrant через UI админки будет добавлена после экрана провайдеров. Backend API уже есть.',
  },
  audit: {
    title: 'Журнал действий',
    description: 'Просмотр AdminAuditLog по тарифам и платежам появится на следующих этапах.',
  },
};

export default function PlatformFinancePage() {
  const [tab, setTab] = useState<FinanceTabId>('providers');

  const subtitle = useMemo(() => {
    if (tab === 'providers') {
      return 'Настройки эквайринга без секретов: readiness, default, health-check';
    }
    return 'Раздел финансов платформы';
  }, [tab]);

  return (
    <DashboardPage
      title={<span style={{ color: FINANCE_COLORS.text }}>Финансы</span>}
      subtitle={<span style={{ color: FINANCE_COLORS.textSecondary }}>{subtitle}</span>}
    >
      <div style={{ color: FINANCE_COLORS.text }}>
        <div
          role="tablist"
          aria-label="Разделы финансов"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
            borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
            paddingBottom: 12,
          }}
        >
          {FINANCE_TABS.map(item => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                style={{
                  padding: '10px 14px',
                  minHeight: 44,
                  borderRadius: 8,
                  border: active ? `1px solid ${FINANCE_COLORS.accent}` : '1px solid transparent',
                  background: active ? FINANCE_COLORS.accentSoftBg : 'transparent',
                  color: active ? FINANCE_COLORS.accent : FINANCE_COLORS.textSecondary,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === 'providers' ? (
          <PaymentProvidersPanel />
        ) : (
          <FinancePlaceholderTab
            title={PLACEHOLDERS[tab].title}
            description={PLACEHOLDERS[tab].description}
          />
        )}
      </div>
    </DashboardPage>
  );
}
