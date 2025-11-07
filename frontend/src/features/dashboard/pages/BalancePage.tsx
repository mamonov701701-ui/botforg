import React, { useState } from 'react';
import {
  CreditCard,
  Wallet,
  RotateCcw,
  Calendar,
  Smartphone,
  Gem,
  AlertTriangle,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';

interface Transaction {
  id: string;
  date: Date;
  type: 'topup' | 'payment' | 'refund' | 'subscription';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  method?: string;
  description: string;
}

interface PaymentProvider {
  id: string;
  name: string;
  icon: string;
  status: 'active' | 'error' | 'disabled';
  error?: string;
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const typeIcons = {
    topup: CreditCard,
    payment: Wallet,
    refund: RotateCcw,
    subscription: Calendar,
  };

  const typeLabels = {
    topup: 'Пополнение',
    payment: 'Платёж',
    refund: 'Возврат',
    subscription: 'Подписка',
  };

  const statusColors = {
    completed: { bg: '#10b98120', color: '#10b981', label: 'Завершён' },
    pending: { bg: '#f59e0b20', color: '#f59e0b', label: 'В обработке' },
    failed: { bg: '#ef444420', color: '#ef4444', label: 'Ошибка' },
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
        gap: '16px',
        padding: '16px',
        background: 'rgba(255, 210, 76, 0.1)',
        borderRadius: '8px',
        alignItems: 'center',
        fontSize: '14px',
      }}
    >
      <div>{formatDate(transaction.date)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {React.createElement(typeIcons[transaction.type], {
          size: 16,
          style: { color: 'var(--primary)' },
        })}
        {typeLabels[transaction.type]}
      </div>
      <div style={{ fontWeight: 600 }}>
        {transaction.type === 'refund' || transaction.type === 'payment' ? '-' : '+'}
        {transaction.amount} {transaction.currency}
      </div>
      <div>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            background: statusColors[transaction.status].bg,
            color: statusColors[transaction.status].color,
          }}
        >
          {statusColors[transaction.status].label}
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)' }}>{transaction.method || '—'}</div>
      <div
        style={{
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {transaction.description}
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: PaymentProvider }) {
  const statusColors = {
    active: { bg: '#10b98120', color: '#10b981', label: 'Активен' },
    error: { bg: '#ef444420', color: '#ef4444', label: 'Ошибка' },
    disabled: { bg: '#6b728020', color: '#6b7280', label: 'Отключён' },
  };

  const iconMap: Record<
    string,
    React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  > = {
    Smartphone,
    CreditCard,
    Gem,
  };

  const IconComponent = iconMap[provider.icon] || CreditCard;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            background: 'rgba(255, 210, 76, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComponent size={24} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
            {provider.name}
          </h3>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 500,
              background: statusColors[provider.status].bg,
              color: statusColors[provider.status].color,
            }}
          >
            {statusColors[provider.status].label}
          </span>
          {provider.error && (
            <p style={{ fontSize: '13px', color: 'var(--error)', marginTop: '8px' }}>
              {provider.error}
            </p>
          )}
        </div>
        <button
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: 'var(--text)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Настроить
        </button>
      </div>
    </Card>
  );
}

export default function BalancePage() {
  const { user } = useAuthStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Моковые данные
  const balance = 5240;
  const currency = '₽';
  const subscription = {
    plan: 'Pro',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15), // 15 дней
  };

  const mockTransactions: Transaction[] = [
    {
      id: '1',
      date: new Date(Date.now() - 1000 * 60 * 60 * 2),
      type: 'topup',
      amount: 1000,
      currency: '₽',
      status: 'completed',
      method: 'Банковская карта',
      description: 'Пополнение баланса',
    },
    {
      id: '2',
      date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      type: 'subscription',
      amount: 499,
      currency: '₽',
      status: 'completed',
      method: 'Telegram Payments',
      description: 'Подписка Pro (месяц)',
    },
    {
      id: '3',
      date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      type: 'payment',
      amount: 250,
      currency: '₽',
      status: 'pending',
      method: 'YooKassa',
      description: 'Оплата за использование API',
    },
  ];

  const providers: PaymentProvider[] = [
    {
      id: '1',
      name: 'Telegram Payments',
      icon: 'Smartphone',
      status: 'active',
    },
    {
      id: '2',
      name: 'YooKassa',
      icon: 'CreditCard',
      status: 'active',
    },
    {
      id: '3',
      name: 'Stripe',
      icon: 'Gem',
      status: 'disabled',
    },
  ];

  // Фильтрация транзакций
  const filteredTransactions = mockTransactions.filter(transaction => {
    if (filterType !== 'all' && transaction.type !== filterType) return false;
    if (filterStatus !== 'all' && transaction.status !== filterStatus) return false;
    if (dateFrom && transaction.date < new Date(dateFrom)) return false;
    if (dateTo && transaction.date > new Date(dateTo)) return false;
    return true;
  });

  const canTopup = hasAccessToAction(user?.role, 'balance_topup');
  const canExport = hasAccessToAction(user?.role, 'transactions_export');

  const daysUntilExpiry = Math.ceil(
    (subscription.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const handleExport = (format: 'csv' | 'pdf') => {
    console.log(`Export transactions as ${format}`);
    // TODO: Реализовать экспорт
  };

  return (
    <DashboardPage title="Баланс и платежи" subtitle="Управление финансами">
      {/* Финансовый обзор */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        {/* Баланс */}
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Текущий баланс
            </p>
            <p style={{ fontSize: '48px', fontWeight: 700, marginBottom: '16px' }}>
              {balance.toLocaleString()} {currency}
            </p>
            {canTopup && (
              <button
                style={{
                  padding: '12px 32px',
                  background: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--primary-hover)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--primary)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <CreditCard size={18} /> Пополнить
              </button>
            )}
          </div>
        </Card>

        {/* Подписка */}
        <Card>
          <div style={{ padding: '20px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Текущая подписка
            </p>
            <p style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>
              {subscription.plan}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Истекает через {daysUntilExpiry} дн.
            </p>
            {daysUntilExpiry <= 7 && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#f59e0b20',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} /> Подписка скоро истекает
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* История транзакций */}
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        История транзакций
      </h2>

      {/* Фильтры */}
      <Card style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Тип
            </label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                color: 'var(--text)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">Все типы</option>
              <option value="topup">Пополнение</option>
              <option value="payment">Платёж</option>
              <option value="refund">Возврат</option>
              <option value="subscription">Подписка</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Статус
            </label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                color: 'var(--text)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">Все статусы</option>
              <option value="completed">Завершён</option>
              <option value="pending">В обработке</option>
              <option value="failed">Ошибка</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Период с
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Период до
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          {canExport && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleExport('csv')}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                CSV
              </button>
              <button
                onClick={() => handleExport('pdf')}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                PDF
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Таблица */}
      <div style={{ marginBottom: '32px' }}>
        {/* Заголовки */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
            gap: '16px',
            padding: '12px 16px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>Дата</div>
          <div>Тип</div>
          <div>Сумма</div>
          <div>Статус</div>
          <div>Метод</div>
          <div>Описание</div>
        </div>

        {/* Строки */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {filteredTransactions.map(transaction => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      </div>

      {/* Провайдеры платежей */}
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        Платёжные провайдеры
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {providers.map(provider => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </DashboardPage>
  );
}
