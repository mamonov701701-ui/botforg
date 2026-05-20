import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot as BotIcon,
  Users,
  MessageCircle,
  Wallet,
  Star,
  RefreshCw,
  XCircle,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import NewBotModal from '../../editorV2/NewBotModal';
import { useAuthStore } from '../../../stores/authStore';
import {
  getDashboardData,
  getRecentEvents,
  getGlobalStats,
  getScenarioStats,
} from '../../../api/analytics';
import { getBots, type Bot } from '../../../api/bot';
import type { DashboardIcon } from '../../../types/icons';

const LS_ONBOARDING_DONE = 'bf_onboarding_done';
const LS_ONBOARDING_ACTIVE = 'bf_onboarding_active';

function readLs(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

interface OnboardingChecklistProps {
  bots: Bot[];
  onBump: () => void;
  onOpenCreateBot: () => void;
}

function OnboardingChecklist({ bots, onBump, onOpenCreateBot }: OnboardingChecklistProps) {
  const editorTo = bots[0]?.id != null ? `/editor/${bots[0].id}` : '/editor';
  const simulatorTo =
    bots[0]?.id != null ? `/editor/${bots[0].id}?simulator=true` : '/editor?simulator=true';
  const channelTo =
    bots[0]?.id != null ? `/dashboard/bots/${bots[0].id}/settings` : '/dashboard/bots';

  const step1Done = bots.length > 0;
  const step2Done = readLs('bf_onboarding_editor_visited') === 'true';
  const step3Done = readLs('bf_onboarding_channel_visited') === 'true';
  const step4Done = readLs('bf_onboarding_simulator_visited') === 'true';

  const doneCount = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length;

  const handleHide = () => {
    localStorage.setItem('bf_onboarding_done', 'true');
    localStorage.removeItem('bf_onboarding_active');
    onBump();
  };

  const StepRow = (p: { done: boolean; label: string; href?: string; onRowClick?: () => void }) => (
    <>
      <CheckCircle
        size={22}
        style={{
          flexShrink: 0,
          color: p.done ? 'var(--color-text-success)' : 'var(--text-muted)',
        }}
        aria-hidden
      />
      {p.href ? (
        <Link
          to={p.href}
          onClick={() => p.onRowClick?.()}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 500,
              textDecoration: p.done ? 'line-through' : undefined,
              opacity: p.done ? 0.55 : 1,
            }}
          >
            {p.label}
          </span>
          <ChevronRight size={20} style={{ opacity: p.done ? 0.35 : 0.7, flexShrink: 0 }} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => p.onRowClick?.()}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 500,
              textDecoration: p.done ? 'line-through' : undefined,
              opacity: p.done ? 0.55 : 1,
            }}
          >
            {p.label}
          </span>
          <ChevronRight size={20} style={{ opacity: p.done ? 0.35 : 0.7, flexShrink: 0 }} />
        </button>
      )}
    </>
  );

  return (
    <Card style={{ position: 'relative', marginBottom: 28 }}>
      <button
        type="button"
        onClick={handleHide}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          padding: '4px 8px',
        }}
      >
        Скрыть
      </button>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            height: 6,
            borderRadius: 4,
            background: 'var(--color-background-warning)',
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(doneCount / 4) * 100}%`,
              borderRadius: 4,
              background: 'var(--primary)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {doneCount} из 4 шагов выполнено
        </p>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>С чего начать</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 520 }}>
        Выполните 4 шага чтобы запустить первого бота
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StepRow
            done={step1Done}
            label="Создайте первого бота"
            onRowClick={() => !step1Done && onOpenCreateBot()}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StepRow
            done={step2Done}
            label="Откройте редактор сценариев"
            href={editorTo}
            onRowClick={() => {
              localStorage.setItem('bf_onboarding_editor_visited', 'true');
              onBump();
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StepRow
            done={step3Done}
            label="Подключите Telegram или MAX канал"
            href={channelTo}
            onRowClick={() => {
              localStorage.setItem('bf_onboarding_channel_visited', 'true');
              onBump();
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StepRow
            done={step4Done}
            label="Протестируйте в симуляторе"
            href={simulatorTo}
            onRowClick={() => {
              localStorage.setItem('bf_onboarding_simulator_visited', 'true');
              onBump();
            }}
          />
        </div>
      </div>
    </Card>
  );
}

interface KPICardProps {
  icon: DashboardIcon;
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
            background: 'var(--color-background-warning)',
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
                <p
                  style={{
                    fontSize: '13px',
                    color:
                      changeType === 'positive'
                        ? 'var(--color-text-success)'
                        : changeType === 'negative'
                          ? 'var(--color-text-danger)'
                          : 'var(--text-muted)',
                  }}
                >
                  {change}
                </p>
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

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const eventIcons: Record<ActivityEvent['type'], DashboardIcon> = {
    bot_created: BotIcon,
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
                  background: 'var(--color-background-warning)',
                  transition: 'background 0.2s',
                  cursor: event.link ? 'pointer' : 'default',
                }}
                onClick={() => event.link && console.log('Navigate to:', event.link)}
                onMouseEnter={e => {
                  if (event.link)
                    e.currentTarget.style.background = 'var(--color-background-warning-hover)';
                }}
                onMouseLeave={e => {
                  if (event.link)
                    e.currentTarget.style.background = 'var(--color-background-warning)';
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-background-warning)',
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
  const { user } = useAuthStore();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [botsData, setBotsData] = useState<any>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [topScenarioProblem, setTopScenarioProblem] = useState<string>('Нет данных');
  const [loading, setLoading] = useState(true);
  const [onboardingBump, setOnboardingBump] = useState(0);
  const [showNewBotModal, setShowNewBotModal] = useState(false);

  const bots: Bot[] = botsData?.items ?? [];
  const onboardingDone = readLs(LS_ONBOARDING_DONE) === 'true';
  const stepEditorDone = readLs('bf_onboarding_editor_visited') === 'true';
  const stepChannelDone = readLs('bf_onboarding_channel_visited') === 'true';
  const stepSimulatorDone = readLs('bf_onboarding_simulator_visited') === 'true';
  const allOnboardingStepsDone =
    bots.length > 0 && stepEditorDone && stepChannelDone && stepSimulatorDone;
  const onboardingActive = readLs(LS_ONBOARDING_ACTIVE) === '1';

  const showOnboardingChecklist =
    !!user && !loading && !onboardingDone && !allOnboardingStepsDone && onboardingActive;

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Снижаем пиковую нагрузку: запросы выполняются последовательно.
        const dashboard = await getDashboardData(7);
        const bots = await getBots();
        const recentEvents = await getRecentEvents(10);
        const global = await getGlobalStats();
        setDashboardData(dashboard);
        setBotsData(bots);
        setGlobalStats(global);
        if (global?.topScenarios?.length) {
          const top = global.topScenarios[0];
          const scenarioStats = await getScenarioStats(top.scenarioId);
          const firstDrop = scenarioStats.dropOffByStep?.[0];
          setTopScenarioProblem(
            firstDrop ? `${firstDrop.step} (${firstDrop.count})` : 'Отвалов не зафиксировано'
          );
        }

        // Map API events to ActivityEvent format
        if (recentEvents?.items) {
          const mappedEvents: ActivityEvent[] = recentEvents.items.map((ev: any) => ({
            id: String(ev.id),
            type: mapEventType(ev.type),
            title: getEventTitle(ev.type, ev.name),
            description: ev.payload?.description || ev.name || '',
            timestamp: new Date(ev.created_at),
          }));
          setEvents(mappedEvents);
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user || loading || onboardingDone || allOnboardingStepsDone) return;
    if (bots.length === 0 && readLs(LS_ONBOARDING_ACTIVE) !== '1') {
      localStorage.setItem(LS_ONBOARDING_ACTIVE, '1');
      setOnboardingBump(b => b + 1);
    }
  }, [user, loading, onboardingDone, allOnboardingStepsDone, bots.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || !allOnboardingStepsDone) return;
    if (readLs(LS_ONBOARDING_DONE) === 'true') return;
    localStorage.setItem(LS_ONBOARDING_DONE, 'true');
    localStorage.removeItem(LS_ONBOARDING_ACTIVE);
    setOnboardingBump(b => b + 1);
  }, [allOnboardingStepsDone]);

  // Helper functions for event mapping
  function mapEventType(type: string): ActivityEvent['type'] {
    const typeMap: Record<string, ActivityEvent['type']> = {
      bot_message: 'bot_created',
      bot_created: 'bot_created',
      bot_updated: 'bot_updated',
      payment: 'payment',
      review: 'review',
      error: 'error',
    };
    return typeMap[type] || 'bot_created';
  }

  function getEventTitle(type: string, name: string): string {
    const titles: Record<string, string> = {
      bot_message: 'Новое сообщение',
      bot_created: 'Создан бот',
      bot_updated: 'Бот обновлён',
      payment: 'Платёж',
      review: 'Отзыв',
      error: 'Ошибка',
    };
    return titles[type] || name || 'Событие';
  }

  return (
    <DashboardPage title="Главная" subtitle="Обзор вашего проекта">
      {showOnboardingChecklist && (
        <OnboardingChecklist
          bots={bots}
          onBump={() => setOnboardingBump(b => b + 1)}
          onOpenCreateBot={() => setShowNewBotModal(true)}
        />
      )}

      <NewBotModal
        isOpen={showNewBotModal}
        onClose={() => setShowNewBotModal(false)}
        onBotCreated={async (_botId: number) => {
          try {
            const data = await getBots();
            setBotsData(data);
          } finally {
            setShowNewBotModal(false);
            setOnboardingBump(b => b + 1);
          }
        }}
      />

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
          icon={BotIcon}
          label="Активные боты"
          value={loading ? '...' : dashboardData?.summary?.active_bots || 0}
          change={loading ? '' : `Всего: ${dashboardData?.summary?.total_bots || 0}`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={Users}
          label="Всего пользователей"
          value={loading ? '...' : dashboardData?.summary?.total_users || 0}
          change={loading ? '' : `в ${dashboardData?.summary?.total_bots || 0} ботах`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={MessageCircle}
          label="Сообщения"
          value={loading ? '...' : dashboardData?.summary?.total_messages || 0}
          change={loading ? '' : `Всего отправлено`}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={Wallet}
          label="Бонусный баланс"
          value={loading ? '...' : `${dashboardData?.summary?.bonus_balance || 0} ₽`}
          change={loading ? '' : 'Доступно для покупок'}
          changeType="neutral"
          isLoading={loading}
        />
        <KPICard
          icon={Star}
          label="Сценарии"
          value={loading ? '...' : dashboardData?.summary?.total_scenarios || 0}
          change={loading ? '' : `Выполнено: ${dashboardData?.summary?.total_executions || 0}`}
          changeType="neutral"
          isLoading={loading}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card>
          <h3 style={{ marginTop: 0 }}>Сегодня</h3>
          <p>
            Новые пользователи: <strong>{globalStats?.newUsers ?? 0}</strong>
          </p>
          <p>
            Активные сессии: <strong>{globalStats?.activeUsers ?? 0}</strong>
          </p>
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Топ сценарий</h3>
          <p>
            Название: <strong>{globalStats?.topScenarios?.[0]?.name || 'Нет данных'}</strong>
          </p>
          <p>
            Входы: <strong>{globalStats?.topScenarios?.[0]?.entries ?? 0}</strong>
          </p>
          <p>
            Конверсия: <strong>{globalStats?.topScenarios?.[0]?.conversionRate ?? 0}%</strong>
          </p>
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Проблемы</h3>
          <p>
            Шаг с наибольшим отвалом: <strong>{topScenarioProblem}</strong>
          </p>
        </Card>
      </div>

      {/* Лента событий */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '24px',
        }}
      >
        <ActivityFeed events={events} />
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
