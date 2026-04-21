import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { crmOverview, type CrmOverview } from '../../../api/botCrm';

export default function BotWorkspaceAnalyticsPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const [overview, setOverview] = useState<CrmOverview | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    crmOverview(id, 'prod')
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [id]);

  return (
    <section className="bot-card" style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="bot-section-title">Аналитика бота</h2>
        <p className="bot-section-lead">
          Ключевые показатели по реальным данным CRM без смешивания с preview.
        </p>
      </div>
      <div className="bot-card-grid">
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">Новые</div>
          <div className="bot-card-value">{overview?.new_contacts_7d ?? 0}</div>
        </div>
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">Активные</div>
          <div className="bot-card-value">{overview?.active_contacts_7d ?? 0}</div>
        </div>
        <div className="bot-card bot-card--compact">
          <div className="bot-card-label">Спящие</div>
          <div className="bot-card-value">{overview?.sleeping_contacts_30d ?? 0}</div>
        </div>
      </div>
      <p className="bot-section-lead" style={{ marginTop: 0 }}>
        Ключевые показатели по реальным данным CRM без смешивания с preview.
      </p>
    </section>
  );
}
