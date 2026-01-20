import React, { useState, useEffect } from 'react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { Users, Bot, TrendingUp, Building2, MessageSquare, Workflow } from 'lucide-react';
import { getPlatformStats, type PlatformStats } from '../../../api/platformAdmin';
import { toast } from '../../../utils/toast';

export default function PlatformOverviewPage() {
  const [stats, setStats] = useState<PlatformStats>({
    total_users: 0,
    total_projects: 0,
    total_bots: 0,
    active_bots: 0,
    total_scenarios: 0,
    total_bot_users: 0,
    total_messages: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      console.log('[PlatformOverviewPage] Loading platform stats...');
      const data = await getPlatformStats();
      console.log('[PlatformOverviewPage] Received stats:', data);
      setStats(data);
    } catch (error: any) {
      console.error('[PlatformOverviewPage] Failed to load stats:', error);
      toast.error(error.message || 'Не удалось загрузить статистику платформы');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardPage
      title="Обзор платформы"
      subtitle="Статистика и общая информация о работе платформы"
    >
      {/* Отладочная информация (только в dev режиме) */}
      {import.meta.env.DEV && !loading && (
        <Card
          style={{
            marginBottom: '24px',
            padding: '16px',
            background: 'rgba(255, 210, 76, 0.1)',
            border: '1px solid rgba(255, 210, 76, 0.3)',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              margin: 0,
              fontFamily: 'monospace',
            }}
          >
            DEBUG: {JSON.stringify(stats)}
          </p>
        </Card>
      )}

      {/* Статистика */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Всего пользователей
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_users || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '12px',
              }}
            >
              <Users size={32} style={{ color: '#3b82f6' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Проектов
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_projects || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '12px',
              }}
            >
              <Building2 size={32} style={{ color: '#10b981' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Всего ботов
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_bots || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(255, 210, 76, 0.1)',
                borderRadius: '12px',
              }}
            >
              <Bot size={32} style={{ color: '#ffd24c' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Активных ботов
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: '#22c55e' }}>
                {loading ? '...' : (stats.active_bots || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '12px',
              }}
            >
              <TrendingUp size={32} style={{ color: '#22c55e' }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Дополнительная статистика */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Сценариев
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_scenarios || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '12px',
              }}
            >
              <Workflow size={32} style={{ color: '#8b5cf6' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Пользователей ботов
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_bot_users || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '12px',
              }}
            >
              <Users size={32} style={{ color: '#3b82f6' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                Всего сообщений
              </p>
              <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {loading ? '...' : (stats.total_messages || 0).toLocaleString('ru-RU')}
              </p>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '12px',
              }}
            >
              <MessageSquare size={32} style={{ color: '#8b5cf6' }} />
            </div>
          </div>
        </Card>
      </div>
    </DashboardPage>
  );
}
