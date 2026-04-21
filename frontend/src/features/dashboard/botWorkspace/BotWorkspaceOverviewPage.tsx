import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBot, type Bot } from '../../../api/bot';
import { crmOverview, type CrmOverview } from '../../../api/botCrm';

export default function BotWorkspaceOverviewPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
  const [overview, setOverview] = useState<CrmOverview | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getBot(id)
      .then(setBot)
      .catch(() => setBot(null));
    crmOverview(id, 'prod')
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [id]);

  const contacts = overview?.total_contacts ?? bot?.usersCount ?? 0;
  const channel = (bot?.channel || 'telegram').toUpperCase();

  return (
    <section className="bot-card">
      <h2 className="bot-section-title">Обзор рабочего пространства</h2>
      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">Канал</div>
          <div className="bot-card-value">{channel}</div>
        </div>
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">CRM</div>
          <div className="bot-card-value">{contacts} контактов</div>
        </div>
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">Доступные разделы</div>
          <div className="bot-card-value">CRM • Сценарии • Аналитика</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        <Link
          to="/dashboard/help/crm"
          style={{ color: 'var(--primary)', fontWeight: 500, textDecoration: 'underline' }}
        >
          Справка по CRM
        </Link>
        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
          — полная инструкция по разделам и режимам данных
        </span>
      </div>
      <div className="bot-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="bot-btn bot-btn--primary"
          onClick={() => navigate(`/dashboard/bots/${id}/crm`)}
        >
          Открыть CRM
        </button>
        <button
          type="button"
          className="bot-btn bot-btn--secondary"
          onClick={() => navigate(`/dashboard/bots/${id}/scenarios`)}
        >
          Перейти к сценариям
        </button>
        <button
          type="button"
          className="bot-btn bot-btn--secondary"
          onClick={() => navigate(`/dashboard/bots/${id}/analytics`)}
        >
          Открыть аналитику
        </button>
      </div>
    </section>
  );
}
