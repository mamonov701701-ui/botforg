import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { getBot, type Bot } from '../../../api/bot';
import { LayoutDashboard, Users, Workflow, BarChart3, Settings, ChevronLeft } from 'lucide-react';
import './botWorkspace.css';
import type { DashboardIcon } from '../../../types/icons';

type WorkspaceTab = {
  to: string;
  label: string;
  icon: DashboardIcon;
};

function BotHeader({
  bot,
  fallbackId,
  tabs,
}: {
  bot: Bot | null;
  fallbackId: number;
  tabs: WorkspaceTab[];
}) {
  return (
    <header className="bot-header">
      <h1 className="bot-header__title">{bot?.title || `Бот #${fallbackId}`}</h1>
      <p className="bot-header__meta">
        @{bot?.username || `bot-${fallbackId}`} • {(bot?.channel || 'telegram').toUpperCase()} •
        Рабочее пространство
      </p>
      <nav className="bot-tabs" aria-label="Разделы бота">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.label !== 'CRM'}
              className={({ isActive }) =>
                isActive ? 'bot-tabs__link bot-tabs__link--active' : 'bot-tabs__link'
              }
            >
              <Icon size={16} />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}

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

  const tabs: WorkspaceTab[] = [
    { to: `/dashboard/bots/${id}/overview`, label: 'Обзор', icon: LayoutDashboard },
    { to: `/dashboard/bots/${id}/crm`, label: 'CRM', icon: Users },
    { to: `/dashboard/bots/${id}/scenarios`, label: 'Сценарии', icon: Workflow },
    { to: `/dashboard/bots/${id}/analytics`, label: 'Аналитика', icon: BarChart3 },
    { to: `/dashboard/bots/${id}/settings`, label: 'Настройки', icon: Settings },
  ];

  return (
    <div
      className="bot-page-container"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <button
        type="button"
        className="crm-back"
        onClick={() => navigate('/dashboard/bots')}
        style={{ alignSelf: 'flex-start' }}
      >
        <ChevronLeft size={17} strokeWidth={2} /> К моим ботам
      </button>
      <BotHeader bot={bot} fallbackId={id} tabs={tabs} />
      <div>
        <Outlet />
      </div>
    </div>
  );
}
