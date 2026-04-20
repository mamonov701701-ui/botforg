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
    <section
      style={{
        background: 'rgba(26, 34, 56, 0.9)',
        border: '1px solid rgba(255, 210, 76, 0.2)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Обзор рабочего пространства</h2>
      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div className="crm-card" style={{ padding: 12 }}>
          <div className="crm-muted" style={{ fontSize: 12 }}>
            Канал
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>{channel}</div>
        </div>
        <div className="crm-card" style={{ padding: 12 }}>
          <div className="crm-muted" style={{ fontSize: 12 }}>
            CRM
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>{contacts} контактов</div>
        </div>
        <div className="crm-card" style={{ padding: 12 }}>
          <div className="crm-muted" style={{ fontSize: 12 }}>
            Доступные разделы
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>CRM • Сценарии • Аналитика</div>
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
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="crm-button"
          onClick={() => navigate(`/dashboard/bots/${id}/crm`)}
        >
          Открыть CRM
        </button>
        <button
          type="button"
          className="crm-button crm-button--secondary"
          onClick={() => navigate(`/dashboard/bots/${id}/scenarios`)}
        >
          Перейти к сценариям
        </button>
        <button
          type="button"
          className="crm-button crm-button--secondary"
          onClick={() => navigate(`/dashboard/bots/${id}/analytics`)}
        >
          Открыть аналитику
        </button>
      </div>
    </section>
  );
}
