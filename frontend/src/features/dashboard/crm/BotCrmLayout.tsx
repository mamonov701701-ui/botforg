import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Users, Tags, Braces, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getBot, type Bot } from '../../../api/bot';

const navBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: 'none',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  background: 'transparent',
  transition: 'all 0.15s',
};

export default function BotCrmLayout() {
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

  const base = `/dashboard/bots/${id}/crm`;

  if (!Number.isFinite(id)) {
    return <div style={{ padding: 24, color: 'var(--text)' }}>Некорректный бот</div>;
  }

  return (
    <div style={{ padding: '0 8px 48px' }}>
      <button
        type="button"
        onClick={() => navigate('/dashboard/bots')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <ChevronLeft size={18} /> К ботам
      </button>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px' }}>
          CRM{bot ? ` · ${bot.title}` : ''}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15 }}>
          Пользователи конструктора, переменные и теги (связаны с редактором сценариев).
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { to: `${base}/users`, label: 'Пользователи', icon: Users },
          { to: `${base}/variables`, label: 'Переменные', icon: Braces },
          { to: `${base}/tags`, label: 'Теги', icon: Tags },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              ...navBtn,
              borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              background: isActive ? 'rgba(255, 210, 76, 0.12)' : 'transparent',
            })}
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ botId: id }} />
    </div>
  );
}
