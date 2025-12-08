import React, { useState, useEffect } from 'react';
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
  Bot as BotIcon,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Tag,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction, ROLE_NAMES } from '../../../constants/roles';
import {
  getBots,
  groupBotsByProject,
  getProjectName,
  getProjectRole,
  type Bot,
} from '../../../api/bot';
import { get } from '../../../api/client';

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
              <Users size={14} /> {bot.usersCount || 0}
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
              <MessageCircle size={14} /> {bot.messagesCount || 0}
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
              Обновлён {formatDate(bot.updated_at)}
            </span>
          </div>

          {/* Пользователи бота (раскрывающийся список) */}
          {bot.usersCount > 0 && (
            <div
              style={{
                marginTop: '12px',
                borderTop: '1px solid var(--border)',
                paddingTop: '12px',
              }}
            >
              <button
                onClick={e => {
                  e.stopPropagation();
                  toggleBotExpanded(bot.id);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--text)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} />
                  Пользователи ({bot.usersCount})
                </span>
                {expandedBotId === bot.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedBotId === bot.id && botContacts[bot.id] && (
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {botContacts[bot.id].map((contact: any) => (
                    <div
                      key={contact.id}
                      style={{
                        padding: '12px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '6px',
                        }}
                      >
                        <strong>
                          {contact.name || `Пользователь ${contact.telegram_user_id}`}
                        </strong>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: contact.status === 'active' ? '#10b98120' : '#6b728020',
                            color: contact.status === 'active' ? '#10b981' : '#6b7280',
                          }}
                        >
                          {contact.status === 'active' ? 'Активен' : contact.status}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '12px',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {contact.email && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Mail size={12} /> {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={12} /> {contact.phone}
                          </span>
                        )}
                        {contact.tags && contact.tags.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Tag size={12} /> {contact.tags.map((t: any) => t.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {bot.usersCount > (botContacts[bot.id]?.length || 0) && (
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        padding: '8px',
                      }}
                    >
                      Показано {botContacts[bot.id]?.length || 0} из {bot.usersCount}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<Bot[]>([]);
  const [projects, setProjects] = useState<ReturnType<typeof groupBotsByProject>>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [selectedBots, setSelectedBots] = useState<number[]>([]);
  const [expandedBotId, setExpandedBotId] = useState<number | null>(null);
  const [botContacts, setBotContacts] = useState<Record<number, any[]>>({});

  // Загружаем боты
  useEffect(() => {
    async function loadBots() {
      try {
        setLoading(true);
        const botsData = await getBots();
        setBots(botsData.items);

        if (user) {
          const grouped = groupBotsByProject(botsData.items, user.id);
          setProjects(grouped);

          // Автоматически разворачиваем все проекты
          setExpandedProjects(new Set(grouped.map(p => p.owner_id)));
        }
      } catch (error) {
        console.error('Failed to load bots:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBots();
  }, [user]);

  // Фильтрация ботов
  const getFilteredBots = (projectBots: Bot[]) => {
    return projectBots.filter(bot => {
      if (statusFilter !== 'all' && bot.is_active !== (statusFilter === 'active')) return false;
      if (searchQuery && !bot.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  };

  const toggleProject = (ownerId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ownerId)) {
        newSet.delete(ownerId);
      } else {
        newSet.add(ownerId);
      }
      return newSet;
    });
  };

  const loadBotContacts = async (botId: number) => {
    if (botContacts[botId]) return; // Уже загружены

    try {
      const response = await get(`/bots/${botId}/contacts?page_size=10`);
      setBotContacts(prev => ({ ...prev, [botId]: response.items }));
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const toggleBotExpanded = (botId: number) => {
    if (expandedBotId === botId) {
      setExpandedBotId(null);
    } else {
      setExpandedBotId(botId);
      loadBotContacts(botId);
    }
  };

  const handleSelectBot = (id: number) => {
    setSelectedBots(prev =>
      prev.includes(id) ? prev.filter(botId => botId !== id) : [...prev, id]
    );
  };

  const handleBotAction = (action: string, botId: number) => {
    console.log(`Action: ${action}, Bot ID: ${botId}`);
    // TODO: Реализовать действия
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action}, Selected: ${selectedBots}`);
    // TODO: Реализовать массовые действия
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

  const totalBots = bots.length;
  const totalProjects = projects.length;

  const canCreate = hasAccessToAction(user?.role, 'bot_create');

  return (
    <DashboardPage
      title="Мои боты"
      subtitle={`${totalBots} ботов в ${totalProjects} ${totalProjects === 1 ? 'проекте' : 'проектах'}`}
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
            <option value="paused">Неактивен</option>
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

      {/* Список проектов с ботами */}
      {projects.length === 0 ? (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {projects.map(project => {
            const filteredProjectBots = getFilteredBots(project.bots);
            const isExpanded = expandedProjects.has(project.owner_id);

            if (filteredProjectBots.length === 0 && searchQuery) {
              return null; // Пропускаем проекты без ботов при поиске
            }

            return (
              <Card key={project.owner_id} style={{ padding: '0' }}>
                {/* Заголовок проекта */}
                <div
                  style={{
                    padding: '20px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => toggleProject(project.owner_id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: project.is_own
                          ? 'rgba(255, 210, 76, 0.2)'
                          : 'rgba(59, 130, 246, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BotIcon
                        size={20}
                        style={{
                          color: project.is_own ? 'var(--primary)' : '#3b82f6',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                        {getProjectName(project)}
                      </h3>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {!project.is_own && (
                          <>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              {project.owner_email}
                            </span>
                            {project.team_role && (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  background: 'var(--card)',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {getProjectRole(project.team_role)}
                              </span>
                            )}
                          </>
                        )}
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          {filteredProjectBots.length}{' '}
                          {filteredProjectBots.length === 1 ? 'бот' : 'ботов'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* Список ботов проекта */}
                {isExpanded && filteredProjectBots.length > 0 && (
                  <div
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {filteredProjectBots.map(bot => (
                      <div
                        key={bot.id}
                        style={{
                          padding: '16px',
                          background: 'var(--card)',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedBots.includes(bot.id)}
                          onChange={() => handleSelectBot(bot.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: 'var(--primary)',
                          }}
                        />
                        <div
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            background: 'rgba(255, 210, 76, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <BotIcon size={24} style={{ color: 'var(--primary)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                            {bot.title}
                          </h4>
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            @{bot.username}
                          </p>
                        </div>
                        <div
                          style={{
                            padding: '4px 12px',
                            background: bot.is_active
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(107, 114, 128, 0.2)',
                            color: bot.is_active ? '#10b981' : '#6b7280',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          {bot.is_active ? 'Активен' : 'Неактивен'}
                        </div>
                        <button
                          onClick={() => handleBotAction('edit', bot.id)}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Edit size={16} style={{ color: 'var(--text)' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardPage>
  );
}
