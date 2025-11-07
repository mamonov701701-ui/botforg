import React, { useState } from 'react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';

type PeriodType = '7d' | '30d' | '90d' | 'all';

interface TopBot {
  id: string;
  name: string;
  interactions: number;
  revenue: number;
  lastActive: Date;
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<PeriodType>('30d');

  // Моковые данные (позже заменить на реальный API)
  const kpiData = {
    users: { current: 1243, change: '+12%', changeType: 'positive' as const },
    messages: { current: 8567, change: '+8%', changeType: 'positive' as const },
    revenue: { current: 24500, change: '+15%', changeType: 'positive' as const },
    rating: { current: 4.7, change: '+0.2', changeType: 'positive' as const },
  };

  const activityData = [
    { date: '01.11', users: 120, messages: 450 },
    { date: '05.11', users: 135, messages: 520 },
    { date: '10.11', users: 145, messages: 580 },
    { date: '15.11', users: 160, messages: 620 },
    { date: '20.11', users: 180, messages: 710 },
    { date: '25.11', users: 195, messages: 780 },
    { date: '30.11', users: 210, messages: 850 },
  ];

  const revenueData = [
    { month: 'Июль', amount: 18000 },
    { month: 'Август', amount: 21000 },
    { month: 'Сентябрь', amount: 19500 },
    { month: 'Октябрь', amount: 23000 },
    { month: 'Ноябрь', amount: 24500 },
  ];

  const topBots: TopBot[] = [
    {
      id: '1',
      name: 'Поддержка магазина',
      interactions: 5420,
      revenue: 12500,
      lastActive: new Date(Date.now() - 1000 * 60 * 15),
    },
    {
      id: '2',
      name: 'Бот-консультант',
      interactions: 3210,
      revenue: 8900,
      lastActive: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: '3',
      name: 'Бронирование столиков',
      interactions: 1890,
      revenue: 3100,
      lastActive: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  ];

  const periodLabels: Record<PeriodType, string> = {
    '7d': 'За 7 дней',
    '30d': 'За 30 дней',
    '90d': 'За 90 дней',
    all: 'За всё время',
  };

  const canExport = hasAccessToAction(user?.role, 'transactions_export');

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    console.log(`Export analytics as ${format}`);
    // TODO: Реализовать экспорт
  };

  const formatRelativeTime = (date: Date) => {
    const minutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  return (
    <DashboardPage
      title="Аналитика"
      subtitle={periodLabels[period]}
      actions={
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Переключатель периода */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as PeriodType)}
            style={{
              padding: '10px 16px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none',
              fontWeight: 500,
            }}
          >
            <option value="7d">За 7 дней</option>
            <option value="30d">За 30 дней</option>
            <option value="90d">За 90 дней</option>
            <option value="all">За всё время</option>
          </select>

          {/* Экспорт */}
          {canExport && (
            <div style={{ position: 'relative' }}>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
                onClick={() => handleExport('pdf')}
              >
                ⬇️ Экспорт
              </button>
            </div>
          )}
        </div>
      }
    >
      {/* KPI карточки */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        <Card>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Пользователи
            </p>
            <p style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
              {kpiData.users.current.toLocaleString()}
            </p>
            <p style={{ fontSize: '13px', color: '#10b981' }}>{kpiData.users.change}</p>
          </div>
        </Card>

        <Card>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Сообщения
            </p>
            <p style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
              {kpiData.messages.current.toLocaleString()}
            </p>
            <p style={{ fontSize: '13px', color: '#10b981' }}>{kpiData.messages.change}</p>
          </div>
        </Card>

        <Card>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Доход
            </p>
            <p style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
              {kpiData.revenue.current.toLocaleString()} ₽
            </p>
            <p style={{ fontSize: '13px', color: '#10b981' }}>{kpiData.revenue.change}</p>
          </div>
        </Card>

        <Card>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Средний рейтинг
            </p>
            <p style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
              {kpiData.rating.current}
            </p>
            <p style={{ fontSize: '13px', color: '#10b981' }}>{kpiData.rating.change}</p>
          </div>
        </Card>
      </div>

      {/* Графики */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {/* График активности */}
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
            Активность пользователей
          </h3>
          <div style={{ position: 'relative', height: '240px' }}>
            {/* Простой график (в реальности - использовать библиотеку) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                height: '200px',
                borderBottom: '1px solid var(--border)',
                borderLeft: '1px solid var(--border)',
                padding: '10px',
                gap: '8px',
              }}
            >
              {activityData.map((point, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${(point.users / 250) * 100}%`,
                      background: 'var(--primary)',
                      borderRadius: '4px 4px 0 0',
                      minHeight: '10px',
                      transition: 'all 0.3s',
                    }}
                    title={`${point.users} пользователей`}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginTop: '8px',
                    }}
                  >
                    {point.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* График выручки */}
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
            Выручка по месяцам
          </h3>
          <div style={{ position: 'relative', height: '240px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                height: '200px',
                borderBottom: '1px solid var(--border)',
                borderLeft: '1px solid var(--border)',
                padding: '10px',
                gap: '8px',
              }}
            >
              {revenueData.map((point, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${(point.amount / 30000) * 100}%`,
                      background: '#10b981',
                      borderRadius: '4px 4px 0 0',
                      minHeight: '10px',
                      transition: 'all 0.3s',
                    }}
                    title={`${point.amount.toLocaleString()} ₽`}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginTop: '8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {point.month}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Таблица топ ботов */}
      <Card>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
          Топ ботов по активности
        </h3>

        <div style={{ overflowX: 'auto' }}>
          {/* Заголовки */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              gap: '16px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>Название</div>
            <div>Взаимодействия</div>
            <div>Выручка</div>
            <div>Последняя активность</div>
          </div>

          {/* Строки */}
          <div>
            {topBots.map(bot => (
              <div
                key={bot.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  gap: '16px',
                  padding: '16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 600 }}>{bot.name}</div>
                <div>{bot.interactions.toLocaleString()}</div>
                <div>{bot.revenue.toLocaleString()} ₽</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  {formatRelativeTime(bot.lastActive)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Подсказка о графиках */}
      <div
        style={{
          marginTop: '32px',
          padding: '16px',
          background: 'var(--card)',
          borderRadius: '8px',
          borderLeft: '4px solid var(--primary)',
        }}
      >
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          💡 <strong>Совет:</strong> Изменяйте период для получения более детальной статистики.
          Используйте экспорт для сохранения отчётов.
        </p>
      </div>
    </DashboardPage>
  );
}
