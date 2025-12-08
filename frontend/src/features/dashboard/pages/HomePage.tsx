import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Users,
  MessageCircle,
  Wallet,
  Star,
  Plus,
  FileText,
  CreditCard,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction, hasAccessToSection } from '../../../constants/roles';
import { getDashboardData } from '../../../api/analytics';
import { getBots } from '../../../api/bot';

interface KPICardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  isLoading?: boolean;
}

function KPICard({
  icon: Icon,
  label,
  value,
  change,
  changeType = 'neutral',
  isLoading,
}: KPICardProps) {
  const changeColors = {
    positive: '#10b981',
    negative: '#ef4444',
    neutral: 'var(--text-muted)',
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 210, 76, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Icon size={24} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            {label}
          </p>
          {isLoading ? (
            <div
              style={{
                height: '32px',
                width: '80px',
                background: 'var(--card)',
                borderRadius: '4px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ) : (
            <>
              <p style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>{value}</p>
              {change && (
                <p style={{ fontSize: '13px', color: changeColors[changeType] }}>{change}</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

interface ActivityEvent {
  id: string;
  type: 'bot_created' | 'bot_updated' | 'payment' | 'review' | 'error';
  title: string;
  description: string;
  timestamp: Date;
  link?: string;
}

function ActivityFeed() {
  // Моковые данные (позже заменить на API)
  const events: ActivityEvent[] = [
    {
      id: '1',
      type: 'bot_created',
      title: 'Создан новый бот',
      description: 'Бот "Поддержка магазина" успешно создан',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 минут назад
    },
    {
      id: '2',
      type: 'payment',
      title: 'Получен платёж',
      description: 'Новый платёж на сумму 500 ₽',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 часа назад
    },
    {
      id: '3',
      type: 'review',
      title: 'Новый отзыв',
      description: 'Получен отзыв на шаблон "Бот-консультант"',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 часов назад
    },
  ];

  const eventIcons: Record<ActivityEvent['type'], React.ComponentType<{ size?: number }>> = {
    bot_created: Bot,
    bot_updated: RefreshCw,
    payment: Wallet,
    review: Star,
    error: XCircle,
  };

  const formatRelativeTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'только что';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  return (
    <Card>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Лента событий</h3>
      {events.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          Событий пока нет
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {events.map(event => {
            const EventIcon = eventIcons[event.type];
            return (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 210, 76, 0.1)',
                  transition: 'background 0.2s',
                  cursor: event.link ? 'pointer' : 'default',
                }}
                onClick={() => event.link && console.log('Navigate to:', event.link)}
                onMouseEnter={e => {
                  if (event.link) e.currentTarget.style.background = 'rgba(255, 210, 76, 0.15)';
                }}
                onMouseLeave={e => {
                  if (event.link) e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)';
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 210, 76, 0.1)',
                    borderRadius: '8px',
                  }}
                >
                  <EventIcon size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, marginBottom: '2px' }}>{event.title}</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {event.description}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        style={{
          width: '100%',
          padding: '10px',
          marginTop: '16px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          color: 'var(--text)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--card)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        Показать ещё
      </button>
    </Card>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [botsData, setBotsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [dashboard, bots] = await Promise.all([getDashboardData(7), getBots()]);
        setDashboardData(dashboard);
        setBotsData(bots);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const quickActions = [
    {
      icon: Plus,
      label: 'Создать бота',
      action: () => navigate('/dashboard/bots/new'),
      permission: hasAccessToAction(user?.role, 'bot_create'),
    },
    {
      icon: FileText,
      label: 'Шаблоны',
      action: () => navigate('/dashboard/templates'),
      permission: hasAccessToSection(user?.role, 'templates'),
    },
    {
      icon: CreditCard,
      label: 'Пополнить баланс',
      action: () => navigate('/dashboard/balance'),
      permission: hasAccessToAction(user?.role, 'balance_topup'),
    },
  ];

  return (
    <DashboardPage title="Главная" subtitle="Обзор вашего проекта">
      {/* KPI блок */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        <KPICard
          icon={Bot}
          label="Активные боты"
          value={loading ? '...' : dashboardData?.summary?.active_bots || 0}
          change={loading ? '' : `Всего: ${dashboardData?.summary?.total_bots || 0}`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={Users}
          label="Всего пользователей"
          value={
            loading
              ? '...'
              : botsData?.items?.reduce(
                  (sum: number, bot: any) => sum + (bot.usersCount || 0),
                  0
                ) || 0
          }
          change={loading ? '' : `в ${botsData?.items?.length || 0} ботах`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={MessageCircle}
          label="Сообщения"
          value={
            loading
              ? '...'
              : botsData?.items?.reduce(
                  (sum: number, bot: any) => sum + (bot.messagesCount || 0),
                  0
                ) || 0
          }
          change={loading ? '' : `Всего отправлено`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={Wallet}
          label="Выручка"
          value="12 500 ₽"
          change="+8% за месяц"
          changeType="positive"
        />
        <KPICard icon={Star} label="Средний рейтинг" value="4.8" change="из 5.0" />
      </div>

      {/* Быстрые действия */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
          Быстрые действия
        </h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {quickActions
            .filter(action => action.permission)
            .map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={index}
                  onClick={action.action}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 20px',
                    background: 'var(--primary)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
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
                  <ActionIcon size={18} />
                  {action.label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Лента событий */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '24px',
        }}
      >
        <ActivityFeed />
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </DashboardPage>
  );
}
