import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBotScenarios, type Scenario } from '../../../api/scenarios';

export default function BotWorkspaceScenariosPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getBotScenarios(id)
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, [id]);

  const preview = useMemo(() => scenarios.slice(0, 6), [scenarios]);

  return (
    <section className="bot-card" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h2 className="bot-section-title">Сценарии бота</h2>
        <p className="bot-section-lead">
          Управляйте сценарием бота из редактора: обновляйте основной flow и поддерживающие ветки.
        </p>
      </div>

      <div className="bot-card bot-card--compact">
        <div className="bot-card-label">Всего сценариев</div>
        <div className="bot-card-value">{scenarios.length}</div>
        <div className="bot-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="bot-btn bot-btn--primary"
            onClick={() => navigate(`/editor/${botId}`)}
          >
            Открыть редактор сценариев
          </button>
          <button
            type="button"
            className="bot-btn bot-btn--secondary"
            onClick={() => navigate('/dashboard/scenarios')}
          >
            Все сценарии
          </button>
        </div>
      </div>

      {preview.length > 0 ? (
        <div className="bot-card-grid">
          {preview.map(item => (
            <article key={item.id} className="bot-card bot-card--compact">
              <div className="bot-card-label">{item.is_main ? 'main' : 'other'}</div>
              <h3 style={{ margin: '8px 0 0', fontSize: 16 }}>{item.name}</h3>
            </article>
          ))}
        </div>
      ) : (
        <div className="bot-card bot-card--compact">
          <h3 style={{ margin: 0, fontSize: 18 }}>У вас пока нет сценариев</h3>
          <p className="bot-section-lead">Создайте первый сценарий, чтобы запустить логику бота.</p>
          <button
            type="button"
            className="bot-btn bot-btn--primary"
            onClick={() => navigate('/dashboard/scenarios')}
          >
            Создать сценарий
          </button>
        </div>
      )}

      <p className="bot-section-lead" style={{ marginTop: 0 }}>
        Ключевые действия доступны сразу в кнопках, без переходов через текстовые ссылки.
      </p>
    </section>
  );
}
