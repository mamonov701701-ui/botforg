import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  getMyScenarios,
  updateScenario,
  useScenarioInBot,
  type Scenario,
} from '../../../api/scenarios';
import { getBots, type Bot } from '../../../api/bot';
import { toast } from '../../../utils/toast';

export default function ScenarioDetailPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();
  const id = Number(scenarioId);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [usingInBot, setUsingInBot] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadScenario() {
      if (!Number.isFinite(id)) return;
      try {
        setLoading(true);
        const [all, botsData] = await Promise.all([getMyScenarios(), getBots()]);
        const data = all.find(item => item.id === id) || null;
        setScenario(data);
        setBots(botsData.items || []);
        setEditName(data?.name || '');
        setEditDescription(data?.description || '');
      } finally {
        setLoading(false);
      }
    }
    loadScenario();
  }, [id]);

  const usageCount = scenario?.usage_bots_count || 0;
  const usageLabel = usageCount > 0 ? `Используется в ${usageCount} ботах` : 'Не используется';

  const handleSaveMeta = async () => {
    if (!scenario) return;
    if (!editName.trim()) {
      toast.error('Название сценария обязательно');
      return;
    }
    try {
      setSaving(true);
      const updated = await updateScenario(scenario.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setScenario(updated);
      toast.success('Сценарий обновлён');
    } catch (error: any) {
      toast.error(error?.message || 'Не удалось обновить сценарий');
    } finally {
      setSaving(false);
    }
  };

  const handleUseInBot = async () => {
    if (!scenario) return;
    if (!selectedBotId) {
      toast.error('Выберите бота');
      return;
    }
    try {
      setUsingInBot(true);
      await useScenarioInBot(scenario.id, selectedBotId);
      toast.success('Сценарий добавлен в бота как копия');
    } catch (error: any) {
      toast.error(error?.message || 'Не удалось добавить сценарий в бота');
    } finally {
      setUsingInBot(false);
    }
  };

  return (
    <DashboardPage
      title={scenario?.name || 'Сценарий'}
      subtitle="Карточка самостоятельного сценария и его использование в ботах"
    >
      <Card>
        {loading ? (
          <p>Загрузка...</p>
        ) : !scenario ? (
          <p>Сценарий не найден</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ marginBottom: 0 }}>Основное</h3>
            <p>
              Тип: <strong>{scenario.is_main ? 'Основной' : 'Дополнительный'}</strong>
            </p>
            <p>
              Обновлён: <strong>{new Date(scenario.updated_at).toLocaleString('ru-RU')}</strong>
            </p>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Название</span>
              <input
                className="crm-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Описание</span>
              <textarea
                className="crm-input"
                rows={3}
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            </label>
            <h3 style={{ marginBottom: 0, marginTop: 10 }}>Использование</h3>
            <p>
              <strong>{usageLabel}</strong>
            </p>
            <p style={{ color: 'var(--text-muted)' }}>
              Сценарий добавляется в бота как копия. Оригинал в "Моих сценариях" не изменяется.
            </p>
            <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
              <select
                className="crm-input"
                value={selectedBotId || ''}
                onChange={e => setSelectedBotId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Выберите бота для использования</option>
                {bots.map(bot => (
                  <option key={bot.id} value={bot.id}>
                    {bot.title || `Бот #${bot.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate(`/editor/scenario/${scenario.id}`)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'linear-gradient(180deg, #f0d060 0%, #d4af37 100%)',
                  color: '#101218',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Редактировать сценарий
              </button>
              <button
                type="button"
                onClick={handleSaveMeta}
                disabled={saving}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Сохранение...' : 'Сохранить основное'}
              </button>
              <button
                type="button"
                onClick={handleUseInBot}
                disabled={usingInBot || !selectedBotId}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: usingInBot || !selectedBotId ? 'not-allowed' : 'pointer',
                }}
              >
                {usingInBot ? 'Добавление...' : 'Использовать в боте'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/scenarios')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                К списку сценариев
              </button>
            </div>
          </div>
        )}
      </Card>
    </DashboardPage>
  );
}
