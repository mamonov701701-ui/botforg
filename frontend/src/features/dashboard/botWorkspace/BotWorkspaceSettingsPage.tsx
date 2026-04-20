import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBot, toggleBotStatus, updateBot, type Bot } from '../../../api/bot';
import { toast } from '../../../utils/toast';

export default function BotWorkspaceSettingsPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const [bot, setBot] = useState<Bot | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getBot(id)
      .then(data => {
        setBot(data);
        setTitle(data.title);
        setDescription(data.description || '');
      })
      .catch(() => setBot(null));
  }, [id]);

  const handleSave = async () => {
    if (!bot || !title.trim()) return;
    try {
      setSaving(true);
      const updated = await updateBot(bot.id, {
        title: title.trim(),
        description: description.trim(),
      });
      setBot(updated);
      toast.success('Настройки бота сохранены');
    } catch {
      toast.error('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!bot) return;
    try {
      const updated = await toggleBotStatus(bot.id, !bot.is_active);
      setBot(updated);
      toast.success(updated.is_active ? 'Бот запущен' : 'Бот остановлен');
    } catch {
      toast.error('Не удалось изменить статус бота');
    }
  };

  return (
    <section className="crm-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Настройки бота</h2>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Название</span>
        <input value={title} onChange={e => setTitle(e.target.value)} className="crm-input" />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Описание</span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="crm-input"
          rows={4}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="crm-button" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button type="button" className="crm-button crm-button--secondary" onClick={handleToggle}>
          {bot?.is_active ? 'Остановить бота' : 'Запустить бота'}
        </button>
      </div>
    </section>
  );
}
