import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function BotWorkspaceScenariosPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();

  return (
    <section className="crm-card" style={{ padding: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Сценарии бота</h2>
      <p className="crm-muted" style={{ marginTop: 8 }}>
        Управление сценариями выполняется в редакторе конкретного бота.
      </p>
      <button type="button" className="crm-button" onClick={() => navigate(`/editor/${botId}`)}>
        Открыть редактор сценариев
      </button>
    </section>
  );
}
