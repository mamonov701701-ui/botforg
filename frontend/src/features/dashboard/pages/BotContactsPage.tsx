/**
 * Страница для просмотра пользователей бота (контактов)
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  Mail,
  Phone,
  Tag,
  Calendar,
  ArrowLeft,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { get } from '../../../api/client';

interface BotContact {
  id: number;
  public_id: number;
  telegram_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  status: string;
  entry_point: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  last_interaction_at: string | null;
  created_at: string;
  tags: Array<{ id: number; name: string; color: string | null }>;
}

interface BotContactListResponse {
  total: number;
  items: BotContact[];
}

const statusLabels: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  unsubscribed: 'Отписался',
  banned: 'Заблокирован',
};

const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#10b98120', color: '#10b981' },
  inactive: { bg: '#6b728020', color: '#6b7280' },
  unsubscribed: { bg: '#f59e0b20', color: '#f59e0b' },
  banned: { bg: '#ef444420', color: '#ef4444' },
};

export default function BotContactsPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<BotContact[]>([]);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  useEffect(() => {
    if (botId && user) {
      loadContacts();
    }
  }, [botId, user, searchQuery, statusFilter, page]);

  const loadContacts = async () => {
    if (!botId) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      if (statusFilter !== 'all') {
        params.append('status_filter', statusFilter);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response: BotContactListResponse = await get(
        `/bots/${botId}/contacts?${params.toString()}`
      );

      setContacts(response.items);
      setTotal(response.total);
    } catch (error: any) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Никогда';
    const date = new Date(dateString);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  return (
    <DashboardPage title="Пользователи бота" subtitle={`Всего контактов: ${total}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Кнопка назад */}
        <button
          onClick={() => navigate('/dashboard/bots')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: '14px',
            width: 'fit-content',
          }}
        >
          <ArrowLeft size={16} />
          Назад к ботам
        </button>

        {/* Фильтры и поиск */}
        <Card>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <Search
                size={18}
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
                placeholder="Поиск по имени, email, телефону..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
              <option value="unsubscribed">Отписались</option>
              <option value="banned">Заблокированные</option>
            </select>
          </div>
        </Card>

        {/* Список контактов */}
        {loading ? (
          <Card>
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Загрузка...
            </div>
          </Card>
        ) : contacts.length === 0 ? (
          <Card>
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Контакты не найдены
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  style={{
                    padding: '16px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--card)',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Аватар */}
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(59, 130, 246, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <User size={24} style={{ color: '#3b82f6' }} />
                  </div>

                  {/* Информация */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '8px',
                      }}
                    >
                      <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                        {contact.name || `Пользователь ${contact.telegram_user_id}`}
                      </h3>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: statusColors[contact.status]?.bg || '#6b728020',
                          color: statusColors[contact.status]?.color || '#6b7280',
                        }}
                      >
                        {statusLabels[contact.status] || contact.status}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '16px',
                        marginBottom: '8px',
                      }}
                    >
                      {contact.email && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <Mail size={14} />
                          {contact.email}
                        </div>
                      )}
                      {contact.phone && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <Phone size={14} />
                          {contact.phone}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Calendar size={14} />
                        {formatDate(contact.last_interaction_at)}
                      </div>
                    </div>

                    {/* Теги */}
                    {contact.tags.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          marginBottom: '8px',
                        }}
                      >
                        {contact.tags.map(tag => (
                          <span
                            key={tag.id}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 500,
                              background: tag.color ? `${tag.color}20` : 'rgba(59, 130, 246, 0.2)',
                              color: tag.color || '#3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Tag size={12} />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* UTM-метки */}
                    {(contact.utm_source || contact.utm_campaign || contact.entry_point) && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {contact.entry_point && <span>Вход: {contact.entry_point}</span>}
                        {contact.utm_source && <span>Источник: {contact.utm_source}</span>}
                        {contact.utm_campaign && <span>Кампания: {contact.utm_campaign}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Пагинация */}
            {total > pageSize && (
              <div
                style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}
              >
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: page === 1 ? 'var(--card)' : 'transparent',
                    color: page === 1 ? 'var(--text-muted)' : 'var(--text)',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Назад
                </button>
                <span style={{ padding: '8px 16px', color: 'var(--text-muted)' }}>
                  Страница {page} из {Math.ceil(total / pageSize)}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: page >= Math.ceil(total / pageSize) ? 'var(--card)' : 'transparent',
                    color:
                      page >= Math.ceil(total / pageSize) ? 'var(--text-muted)' : 'var(--text)',
                    cursor: page >= Math.ceil(total / pageSize) ? 'not-allowed' : 'pointer',
                  }}
                >
                  Вперед
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardPage>
  );
}
