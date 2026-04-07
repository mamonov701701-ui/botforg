import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmUserDetail,
  crmUserVariables,
  crmSetUserVariable,
  crmUserTags,
  crmAddUserTag,
  crmRemoveUserTag,
  crmUserEvents,
  crmListTags,
  validateSnakeKey,
  type CrmUserDetail,
  type CrmUserVariable,
  type CrmEvent,
  type CrmTagDef,
} from '../../../api/botCrm';
import { getVariableDataTypeLabel } from '../../../utils/uiLabels';

export default function BotCrmUserDetailPage() {
  const { botId, ctorUserId } = useParams<{ botId: string; ctorUserId: string }>();
  const navigate = useNavigate();
  const bid = Number(botId);
  const uid = Number(ctorUserId);
  const [detail, setDetail] = useState<CrmUserDetail | null>(null);
  const [variables, setVariables] = useState<CrmUserVariable[]>([]);
  const [tags, setTags] = useState<
    { id: number; key: string; label?: string | null; color?: string | null }[]
  >([]);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [tagCatalog, setTagCatalog] = useState<CrmTagDef[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [newTagKey, setNewTagKey] = useState('');

  const reload = useCallback(async () => {
    if (!Number.isFinite(bid) || !Number.isFinite(uid)) return;
    try {
      const [d, v, t, ev] = await Promise.all([
        crmUserDetail(bid, uid),
        crmUserVariables(bid, uid),
        crmUserTags(bid, uid),
        crmUserEvents(bid, uid, 80, 0),
      ]);
      setDetail(d);
      setVariables(v);
      setTags(t);
      setEvents(ev);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки');
    }
  }, [bid, uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!Number.isFinite(bid)) return;
    crmListTags(bid)
      .then(setTagCatalog)
      .catch(() => setTagCatalog([]));
  }, [bid]);

  const startEdit = (row: CrmUserVariable) => {
    setEditingKey(row.key);
    setEditValue(row.value == null ? '' : String(row.value));
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    try {
      await crmSetUserVariable(bid, uid, editingKey, editValue);
      toast.success('Сохранено');
      setEditingKey(null);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Не сохранено');
    }
  };

  const addVariable = async () => {
    const vk = validateSnakeKey(newVarKey);
    if (vk) {
      toast.error(vk);
      return;
    }
    try {
      await crmSetUserVariable(bid, uid, newVarKey.trim(), newVarVal);
      toast.success('Переменная добавлена');
      setNewVarKey('');
      setNewVarVal('');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  };

  const removeTag = async (key: string) => {
    try {
      await crmRemoveUserTag(bid, uid, key);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Не удалось снять тег');
    }
  };

  if (!detail) {
    return (
      <DashboardPage title="Пользователь">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage title="">
      <button
        type="button"
        onClick={() => navigate(`/dashboard/bots/${bid}/crm/users`)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={18} /> К списку
      </button>

      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>{detail.display_name}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {detail.channel} · {detail.external_user_id}
        {detail.username ? ` · @${detail.username}` : ''}
      </p>

      <Card>
        <h3 style={{ marginTop: 0 }}>Основная информация</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            fontSize: 14,
          }}
        >
          {[
            ['Телефон', detail.phone || '—'],
            ['Email', detail.email || '—'],
            ['Имя', detail.first_name || '—'],
            ['Фамилия', detail.last_name || '—'],
            ['Статус', detail.status],
            ['Создан', new Date(detail.created_at).toLocaleString('ru-RU')],
            [
              'Последняя активность',
              detail.last_message_at
                ? new Date(detail.last_message_at).toLocaleString('ru-RU')
                : '—',
            ],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{k}</div>
              <div style={{ fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Текущая сессия</h3>
        {detail.session ? (
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <div>
              <strong>Статус:</strong> {detail.session.status}
            </div>
            <div>
              <strong>Сценарий:</strong>{' '}
              {detail.session.scenario_name || `#${detail.session.scenario_id}`}
            </div>
            <div>
              <strong>Блок:</strong>{' '}
              {detail.session.current_block_label ||
                (detail.session.current_block_id != null
                  ? `#${detail.session.current_block_id}`
                  : '—')}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
              Обновлено: {new Date(detail.session.updated_at).toLocaleString('ru-RU')}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Нет данных о сессии</p>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Переменные</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Ключ</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Тип</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Значение</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {variables.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>
                    <code>{row.key}</code>
                    {row.is_system ? (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                        системная
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>{getVariableDataTypeLabel(row.data_type)}</td>
                  <td style={{ padding: 8 }}>
                    {editingKey === row.key ? (
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 280,
                          padding: 6,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                    ) : (
                      <span>{row.value == null ? '—' : JSON.stringify(row.value)}</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    {editingKey === row.key ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          style={{
                            marginRight: 8,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--primary)',
                            background: 'rgba(255,210,76,0.15)',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKey(null)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        Изменить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 8px' }}>Добавить переменную</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Системное имя (например city)"
              value={newVarKey}
              onChange={e => setNewVarKey(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            />
            <input
              placeholder="Значение"
              value={newVarVal}
              onChange={e => setNewVarVal(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                flex: '1 1 200px',
              }}
            />
            <button
              type="button"
              onClick={addVariable}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--primary)',
                background: 'rgba(255,210,76,0.15)',
                color: 'var(--primary)',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Теги</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {tags.map(t => (
            <span
              key={t.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                background: t.color ? `${t.color}33` : 'var(--border)',
                fontSize: 13,
              }}
            >
              {t.label || t.key}
              <button
                type="button"
                aria-label="Снять"
                onClick={() => removeTag(t.key)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  color: 'var(--text-muted)',
                }}
              >
                <Trash2 size={14} />
              </button>
            </span>
          ))}
          {tags.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>Нет тегов</span> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            value={newTagKey}
            onChange={e => setNewTagKey(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              minWidth: 180,
            }}
          >
            <option value="">Выберите тег…</option>
            {tagCatalog.map(t => (
              <option key={t.id} value={t.key}>
                {t.label || t.key}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={async () => {
              if (!newTagKey) {
                toast.error('Выберите тег');
                return;
              }
              try {
                await crmAddUserTag(bid, uid, newTagKey.trim());
                toast.success('Тег назначен');
                setNewTagKey('');
                reload();
              } catch (e: any) {
                toast.error(e.message || 'Ошибка');
              }
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--primary)',
              background: 'rgba(255,210,76,0.15)',
              color: 'var(--primary)',
              cursor: 'pointer',
            }}
          >
            Назначить
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            или создайте тег в разделе «Теги»
          </span>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>События</h3>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Событий пока нет</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {events.map(ev => (
                <li
                  key={ev.id}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{ev.event_type}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(ev.created_at).toLocaleString('ru-RU')}
                    {ev.scenario_id != null ? ` · сценарий #${ev.scenario_id}` : ''}
                    {ev.block_id != null ? ` · блок #${ev.block_id}` : ''}
                  </div>
                  {ev.payload_json && Object.keys(ev.payload_json).length > 0 ? (
                    <pre
                      style={{
                        margin: '6px 0 0',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {JSON.stringify(ev.payload_json, null, 0)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Сообщения</h3>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          История сообщений в CRM пока недоступна (зарезервировано под интеграцию с хранилищем
          сообщений).
        </p>
      </Card>
    </DashboardPage>
  );
}
