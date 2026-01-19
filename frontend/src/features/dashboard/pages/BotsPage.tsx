import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Pause,
  Play,
  Edit,
  Trash2,
  Plus,
  Users,
  Bot as BotIcon,
  Search,
  Layers,
  CheckCircle,
  XCircle,
  MoreVertical,
  X,
  ExternalLink,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { getBots, toggleBotStatus, deleteBot, updateBot, type Bot } from '../../../api/bot';
import { toast } from '../../../utils/toast';
import NewBotModal from '../../editorV2/NewBotModal';

// Модальное окно редактирования бота
interface EditBotModalProps {
  bot: Bot;
  onClose: () => void;
  onSave: (botId: number, data: { title: string; description?: string }) => Promise<void>;
}

function EditBotModal({ bot, onClose, onSave }: EditBotModalProps) {
  const [title, setTitle] = useState(bot.title);
  const [description, setDescription] = useState(bot.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Название бота обязательно');
      return;
    }
    try {
      setSaving(true);
      await onSave(bot.id, { title: title.trim(), description: description.trim() || undefined });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          border: '2px solid var(--primary)',
          boxShadow: '0 8px 32px rgba(255, 210, 76, 0.15), 0 0 0 1px rgba(255, 210, 76, 0.1)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div
            style={{
              padding: '12px',
              background: 'rgba(255, 210, 76, 0.15)',
              borderRadius: '12px',
            }}
          >
            <Edit size={24} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
              Редактировать бота
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              @{bot.username}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            Название *
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Название бота"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)')}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            Описание
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Описание бота (необязательно)"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              resize: 'vertical',
              minHeight: '100px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)')}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              opacity: saving || !title.trim() ? 0.6 : 1,
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BotsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<Bot[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showNewBotModal, setShowNewBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Загружаем боты
  useEffect(() => {
    async function loadBots() {
      try {
        setLoading(true);
        const botsData = await getBots();
        setBots(botsData.items);
      } catch (error) {
        console.error('Failed to load bots:', error);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  const canCreate = hasAccessToAction(user?.role, 'bot_create');
  const canEdit = hasAccessToAction(user?.role, 'bot_edit');

  // Фильтрация ботов
  const filteredBots = bots.filter(bot => {
    // Поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        bot.title.toLowerCase().includes(query) ||
        bot.username.toLowerCase().includes(query) ||
        (bot.description && bot.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Фильтр по статусу
    if (filter === 'active') return bot.is_active;
    if (filter === 'inactive') return !bot.is_active;

    return true;
  });

  const handleSaveBot = async (botId: number, data: { title: string; description?: string }) => {
    const updated = await updateBot(botId, data);
    setBots(prevBots =>
      prevBots.map(b =>
        b.id === botId ? { ...b, title: updated.title, description: updated.description } : b
      )
    );
    toast.success('Бот обновлён');
  };

  const handleToggleStatus = async (bot: Bot) => {
    try {
      const updated = await toggleBotStatus(bot.id, !bot.is_active);
      setBots(prevBots =>
        prevBots.map(b => (b.id === bot.id ? { ...b, is_active: updated.is_active } : b))
      );
      toast.success(updated.is_active ? 'Бот запущен' : 'Бот остановлен');
    } catch (error: any) {
      toast.error(error.message || 'Не удалось изменить статус');
    }
  };

  const handleDeleteBot = async (bot: Bot) => {
    if (window.confirm(`Удалить бота "${bot.title}"? Это действие необратимо.`)) {
      try {
        await deleteBot(bot.id);
        setBots(prevBots => prevBots.filter(b => b.id !== bot.id));
        toast.success('Бот удалён');
      } catch (error: any) {
        toast.error(error.message || 'Не удалось удалить бота');
      }
    }
  };

  if (loading) {
    return (
      <DashboardPage title="Мои боты" subtitle="Загрузка...">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid var(--border)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title="Мои боты"
      subtitle={`Всего ботов: ${bots.length}`}
      actions={
        canCreate ? (
          <button
            onClick={() => setShowNewBotModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--primary-hover)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Plus size={18} />
            Создать бота
          </button>
        ) : undefined
      }
    >
      {/* Фильтры и поиск */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Поиск */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '400px' }}>
          <Search
            size={20}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Поиск ботов..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Фильтр по статусу */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { key: 'all', label: 'Все', icon: Layers, count: bots.length },
            {
              key: 'active',
              label: 'Активные',
              icon: CheckCircle,
              count: bots.filter(b => b.is_active).length,
            },
            {
              key: 'inactive',
              label: 'Неактивные',
              icon: XCircle,
              count: bots.filter(b => !b.is_active).length,
            },
          ].map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as 'all' | 'active' | 'inactive')}
              style={{
                padding: '8px 16px',
                background: filter === key ? 'rgba(255, 210, 76, 0.2)' : 'var(--card)',
                color: filter === key ? 'var(--primary)' : 'var(--text-muted)',
                border: filter === key ? '1px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={16} />
              {label}
              <span
                style={{
                  background: filter === key ? 'var(--primary)' : 'var(--border)',
                  color: filter === key ? '#000' : 'var(--text-muted)',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Список ботов */}
      {filteredBots.length === 0 ? (
        <EmptyState
          icon={BotIcon}
          title={searchQuery ? 'Ботов не найдено' : 'Ботов пока нет'}
          description={
            searchQuery
              ? 'Попробуйте изменить поисковый запрос'
              : 'Создайте своего первого бота, чтобы начать работу'
          }
          action={
            !searchQuery && canCreate
              ? { label: 'Создать бота', onClick: () => setShowNewBotModal(true) }
              : undefined
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredBots.map(bot => (
            <Card
              key={bot.id}
              hoverable
              style={{ position: 'relative', zIndex: menuOpenId === bot.id ? 100 : 1 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    onClick={() => navigate(`/editor/${bot.id}`)}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '8px',
                      background: bot.is_active
                        ? 'rgba(255, 210, 76, 0.1)'
                        : 'rgba(107, 114, 128, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <BotIcon
                      size={24}
                      style={{ color: bot.is_active ? 'var(--primary)' : '#6b7280' }}
                    />
                  </div>
                  <div
                    onClick={() => navigate(`/editor/${bot.id}`)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <h3
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {bot.title}
                    </h3>
                    <p
                      style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}
                    >
                      @{bot.username}
                    </p>
                    {bot.description && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          margin: 0,
                        }}
                      >
                        {bot.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Статистика */}
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Users size={14} /> {bot.usersCount || 0} пользователей
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <MessageCircle size={14} /> {bot.messagesCount || 0} сообщений
                  </span>
                </div>

                {/* Теги */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      background: bot.is_active
                        ? 'rgba(34, 197, 94, 0.2)'
                        : 'rgba(107, 114, 128, 0.2)',
                      color: bot.is_active ? '#22c55e' : '#6b7280',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {bot.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                  <span
                    style={{
                      padding: '4px 8px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#3b82f6',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    Telegram
                  </span>
                </div>
              </div>

              {/* Кнопка меню действий */}
              {canEdit && (
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === bot.id ? null : bot.id);
                    }}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <MoreVertical size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  {menuOpenId === bot.id && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '36px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '8px',
                          minWidth: '180px',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                          zIndex: 20,
                        }}
                      >
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setEditingBot(bot);
                            setMenuOpenId(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Edit size={16} /> Редактировать
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/editor/${bot.id}`);
                            setMenuOpenId(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <ExternalLink size={16} /> Открыть редактор
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleStatus(bot);
                            setMenuOpenId(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {bot.is_active ? (
                            <>
                              <Pause size={16} /> Остановить
                            </>
                          ) : (
                            <>
                              <Play size={16} /> Запустить
                            </>
                          )}
                        </button>
                        <div
                          style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}
                        />
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteBot(bot);
                            setMenuOpenId(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={16} /> Удалить
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Модальное окно создания бота */}
      <NewBotModal
        isOpen={showNewBotModal}
        onClose={() => setShowNewBotModal(false)}
        onBotCreated={botId => {
          getBots().then(data => {
            setBots(data.items);
          });
          navigate(`/editor/${botId}`);
        }}
      />

      {/* Модальное окно редактирования бота */}
      {editingBot && (
        <EditBotModal bot={editingBot} onClose={() => setEditingBot(null)} onSave={handleSaveBot} />
      )}
    </DashboardPage>
  );
}
