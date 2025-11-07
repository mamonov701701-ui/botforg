import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  MessageCircle,
  Settings,
  Pause,
  Play,
  Edit,
  Copy,
  Trash2,
  Plus,
  Users,
  Bot,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';

interface Bot {
  id: string;
  name: string;
  channel: 'telegram' | 'whatsapp';
  status: 'active' | 'paused' | 'error';
  usersCount: number;
  messagesCount: number;
  updatedAt: Date;
  icon?: string;
}

interface BotCardProps {
  bot: Bot;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAction: (action: string, botId: string) => void;
}

function BotCard({ bot, isSelected, onSelect, onAction }: BotCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();

  const channelIcons = {
    telegram: Smartphone,
    whatsapp: MessageCircle,
  };

  const statusColors = {
    active: { bg: '#10b98120', color: '#10b981', label: 'Активен' },
    paused: { bg: '#f59e0b20', color: '#f59e0b', label: 'Приостановлен' },
    error: { bg: '#ef444420', color: '#ef4444', label: 'Ошибка' },
  };

  const formatDate = (date: Date) => {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  const canEdit = hasAccessToAction(user?.role, 'bot_edit');
  const canDelete = hasAccessToAction(user?.role, 'bot_delete');
  const canStartStop = hasAccessToAction(user?.role, 'bot_start_stop');

  return (
    <Card hoverable>
      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(bot.id)}
          style={{
            width: '18px',
            height: '18px',
            cursor: 'pointer',
            accentColor: 'var(--primary)',
          }}
        />

        {/* Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            background: 'rgba(255, 210, 76, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Bot size={28} style={{ color: 'var(--primary)' }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {bot.name}
            </h3>
            {React.createElement(channelIcons[bot.channel], {
              size: 16,
              style: { color: 'var(--primary)' },
            })}
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Users size={14} /> {bot.usersCount}
            </span>
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <MessageCircle size={14} /> {bot.messagesCount}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                background: statusColors[bot.status].bg,
                color: statusColors[bot.status].color,
              }}
            >
              {statusColors[bot.status].label}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Обновлён {formatDate(bot.updatedAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: '36px',
              height: '36px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ⋮
          </button>

          {menuOpen && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10,
                }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '40px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '180px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 20,
                }}
              >
                {canEdit && (
                  <button
                    onClick={() => {
                      onAction('settings', bot.id);
                      setMenuOpen(false);
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
                      transition: 'background 0.2s',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Settings size={16} /> Настройки
                  </button>
                )}
                {canStartStop && (
                  <button
                    onClick={() => {
                      onAction(bot.status === 'active' ? 'pause' : 'start', bot.id);
                      setMenuOpen(false);
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
                      transition: 'background 0.2s',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {bot.status === 'active' ? (
                      <>
                        <Pause size={16} /> Приостановить
                      </>
                    ) : (
                      <>
                        <Play size={16} /> Запустить
                      </>
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      onAction('editor', bot.id);
                      setMenuOpen(false);
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
                      transition: 'background 0.2s',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Edit size={16} /> Открыть редактор
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      onAction('duplicate', bot.id);
                      setMenuOpen(false);
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
                      transition: 'background 0.2s',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Copy size={16} /> Дублировать
                  </button>
                )}
                {canDelete && (
                  <>
                    <div
                      style={{
                        height: '1px',
                        background: 'var(--border)',
                        margin: '8px 0',
                      }}
                    />
                    <button
                      onClick={() => {
                        onAction('delete', bot.id);
                        setMenuOpen(false);
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
                        transition: 'background 0.2s',
                        color: 'var(--error)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Trash2 size={16} /> Удалить
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function BotsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'error'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'telegram' | 'whatsapp'>('all');
  const [selectedBots, setSelectedBots] = useState<string[]>([]);

  // Моковые данные (позже заменить на API)
  const mockBots: Bot[] = [
    {
      id: '1',
      name: 'Поддержка магазина',
      channel: 'telegram',
      status: 'active',
      usersCount: 342,
      messagesCount: 1520,
      updatedAt: new Date(Date.now() - 1000 * 60 * 30),
    },
    {
      id: '2',
      name: 'Бот-консультант',
      channel: 'whatsapp',
      status: 'paused',
      usersCount: 128,
      messagesCount: 890,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
    {
      id: '3',
      name: 'Бронирование столиков',
      channel: 'telegram',
      status: 'error',
      usersCount: 67,
      messagesCount: 234,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
  ];

  // Фильтрация
  const filteredBots = mockBots.filter(bot => {
    if (statusFilter !== 'all' && bot.status !== statusFilter) return false;
    if (channelFilter !== 'all' && bot.channel !== channelFilter) return false;
    if (searchQuery && !bot.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleSelectAll = () => {
    if (selectedBots.length === filteredBots.length) {
      setSelectedBots([]);
    } else {
      setSelectedBots(filteredBots.map(bot => bot.id));
    }
  };

  const handleSelectBot = (id: string) => {
    setSelectedBots(prev =>
      prev.includes(id) ? prev.filter(botId => botId !== id) : [...prev, id]
    );
  };

  const handleBotAction = (action: string, botId: string) => {
    console.log(`Action: ${action}, Bot ID: ${botId}`);
    // TODO: Реализовать действия
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action}, Selected: ${selectedBots}`);
    // TODO: Реализовать массовые действия
  };

  const canCreate = hasAccessToAction(user?.role, 'bot_create');

  return (
    <DashboardPage
      title="Мои боты"
      subtitle={`Всего ботов: ${filteredBots.length}`}
      actions={
        canCreate ? (
          <button
            onClick={() => navigate('/dashboard/bots/new')}
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
      <Card style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Поиск */}
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />

          {/* Фильтр по статусу */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">Все статусы</option>
            <option value="active">Активен</option>
            <option value="paused">Приостановлен</option>
            <option value="error">Ошибка</option>
          </select>

          {/* Фильтр по каналу */}
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as any)}
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">Все каналы</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </Card>

      {/* Массовые действия */}
      {selectedBots.length > 0 && (
        <Card style={{ marginBottom: '24px', background: 'var(--primary-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 600 }}>Выбрано: {selectedBots.length}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleBulkAction('start')}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <Play size={14} /> Запустить
              </button>
              <button
                onClick={() => handleBulkAction('pause')}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <Pause size={14} /> Приостановить
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--error-border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: 'var(--error)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <Trash2 size={14} /> Удалить
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Список ботов */}
      {filteredBots.length === 0 ? (
        <EmptyState
          icon="🤖"
          title="Ботов пока нет"
          description="Создайте своего первого бота, чтобы начать работу"
          action={
            canCreate
              ? {
                  label: 'Создать бота',
                  onClick: () => navigate('/dashboard/bots/new'),
                }
              : undefined
          }
        />
      ) : (
        <>
          {/* Выбрать все */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                width: 'fit-content',
              }}
            >
              <input
                type="checkbox"
                checked={selectedBots.length === filteredBots.length}
                onChange={handleSelectAll}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: 'var(--primary)',
                }}
              />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>Выбрать все</span>
            </label>
          </div>

          {/* Карточки ботов */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                isSelected={selectedBots.includes(bot.id)}
                onSelect={handleSelectBot}
                onAction={handleBotAction}
              />
            ))}
          </div>
        </>
      )}
    </DashboardPage>
  );
}
