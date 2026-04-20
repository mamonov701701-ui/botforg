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
    <section className="crm-card" style={{ padding: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Аналитика бота</h2>
      <p className="crm-muted" style={{ marginTop: 8 }}>
        Ключевые показатели по реальным данным CRM без смешивания с preview.
      </p>
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
            Новые за 7 дней
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>{overview?.new_contacts_7d ?? 0}</div>
        </div>
        <div className="crm-card" style={{ padding: 12 }}>
          <div className="crm-muted" style={{ fontSize: 12 }}>
            Активные за 7 дней
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>{overview?.active_contacts_7d ?? 0}</div>
        </div>
        <div className="crm-card" style={{ padding: 12 }}>
          <div className="crm-muted" style={{ fontSize: 12 }}>
            Спящие 30 дней
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>
            {overview?.sleeping_contacts_30d ?? 0}
          </div>
        </div>
      </div>
    </section>
  );
}
