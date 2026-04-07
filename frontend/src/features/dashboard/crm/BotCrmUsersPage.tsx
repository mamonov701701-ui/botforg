import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmListUsers,
  crmListTags,
  type CrmUserListItem,
  type CrmTagDef,
} from '../../../api/botCrm';
import { getChannelLabel } from '../../../utils/uiLabels';

export default function BotCrmUsersPage() {
  const { botId } = useParams<{ botId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = Number(botId);
  const [items, setItems] = useState<CrmUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [activeSince, setActiveSince] = useState('');
  const [activeUntil, setActiveUntil] = useState('');
  const [tagOptions, setTagOptions] = useState<CrmTagDef[]>([]);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    try {
      const res = await crmListUsers(id, {
        page,
        page_size: pageSize,
        q: q.trim() || undefined,
        channel: channel.trim() || undefined,
        tag_keys: tagFilter.trim() || undefined,
        active_since: activeSince ? new Date(activeSince).toISOString() : undefined,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить пользователей');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [id, page, pageSize, q, channel, tagFilter, activeSince, activeUntil]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    crmListTags(id)
      .then(setTagOptions)
      .catch(() => setTagOptions([]));
  }, [id]);

  useEffect(() => {
    const t = searchParams.get('tag');
    if (t) {
      setTagFilter(t);
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardPage title="" subtitle="">
      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              placeholder="Имя, телефон, email…"
              value={q}
              onChange={e => {
                setQ(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '10px 12px 10px 38px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Канал
            </label>
            <select
              value={channel}
              onChange={e => {
                setChannel(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                minWidth: 140,
              }}
            >
              <option value="">Все</option>
              <option value="telegram">{getChannelLabel('telegram')}</option>
              <option value="whatsapp">{getChannelLabel('whatsapp')}</option>
              <option value="webchat">{getChannelLabel('webchat')}</option>
              <option value="max">{getChannelLabel('max')}</option>
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Тег
            </label>
            <select
              value={tagFilter}
              onChange={e => {
                setTagFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                minWidth: 160,
              }}
            >
              <option value="">Все</option>
              {tagOptions.map(t => (
                <option key={t.id} value={t.key}>
                  {t.label || t.key}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Активность с
            </label>
            <input
              type="datetime-local"
              value={activeSince}
              onChange={e => {
                setActiveSince(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Активность по
            </label>
            <input
              type="datetime-local"
              value={activeUntil}
              onChange={e => {
                setActiveUntil(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--primary)',
              background: 'rgba(255, 210, 76, 0.15)',
              color: 'var(--primary)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Обновить
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        ) : items.length === 0 ? (
          <div
            style={{
              padding: '14px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text-muted)',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Здесь отображаются данные пользователей из реальных каналов. Ответы из предпросмотра
            сюда не сохраняются.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Имя
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Канал
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Телефон
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Email
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Теги
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Активность
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Сценарий
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Блок
                  </th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    Создан
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/dashboard/bots/${id}/crm/users/${row.id}`)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <td style={{ padding: '10px 8px', color: 'var(--text)', fontWeight: 500 }}>
                      {row.display_name}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{getChannelLabel(row.channel)}</td>
                    <td style={{ padding: '10px 8px' }}>{row.phone || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>{row.email || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {row.tags?.length
                        ? row.tags.map(t => (
                            <span
                              key={t.key}
                              style={{
                                display: 'inline-block',
                                marginRight: 4,
                                marginBottom: 4,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: t.color ? `${t.color}33` : 'var(--border)',
                                fontSize: 11,
                              }}
                            >
                              {t.label || t.key}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {row.last_message_at
                        ? new Date(row.last_message_at).toLocaleString('ru-RU')
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {row.current_scenario_name ||
                        (row.current_scenario_id != null ? `#${row.current_scenario_id}` : '—')}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {row.current_block_label ||
                        (row.current_block_id != null ? `#${row.current_block_id}` : '—')}
                    </td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {total} записей · стр. {page} / {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Card>
    </DashboardPage>
  );
}
