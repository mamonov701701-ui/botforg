import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { getBot, type Bot } from '../../../api/bot';
import { LayoutDashboard, Users, Workflow, BarChart3, Settings, ChevronLeft } from 'lucide-react';

export default function BotWorkspaceLayout() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const [bot, setBot] = useState<Bot | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getBot(id)
      .then(setBot)
      .catch(() => setBot(null));
  }, [id]);

  if (!Number.isFinite(id)) {
    return <div style={{ color: 'var(--text-muted)', padding: '18px 0' }}>Некорректный бот</div>;
  }

  const tabs = [
    { to: `/dashboard/bots/${id}/overview`, label: 'Обзор', icon: LayoutDashboard },
    { to: `/dashboard/bots/${id}/crm`, label: 'CRM', icon: Users },
    { to: `/dashboard/bots/${id}/scenarios`, label: 'Сценарии', icon: Workflow },
    { to: `/dashboard/bots/${id}/analytics`, label: 'Аналитика', icon: BarChart3 },
    { to: `/dashboard/bots/${id}/settings`, label: 'Настройки', icon: Settings },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button
        type="button"
        className="crm-back"
        onClick={() => navigate('/dashboard/bots')}
        style={{ alignSelf: 'flex-start' }}
      >
        <ChevronLeft size={17} strokeWidth={2} /> К моим ботам
      </button>
      <header
        style={{
          background: 'rgba(26, 34, 56, 0.9)',
          border: '1px solid rgba(255, 210, 76, 0.2)',
          borderRadius: 12,
          padding: '14px 16px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{bot?.title || `Бот #${id}`}</h1>
        <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          @{bot?.username || `bot-${id}`} • {(bot?.channel || 'telegram').toUpperCase()} • Рабочее
          пространство бота
        </p>
      </header>
      <nav
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: '4px 0',
        }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.label !== 'CRM'}
              style={({ isActive }) => ({
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 8,
                border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: isActive ? 'rgba(255, 210, 76, 0.12)' : 'rgba(26, 34, 56, 0.7)',
                color: isActive ? 'var(--primary)' : 'var(--text)',
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
              })}
            >
              <Icon size={16} />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
