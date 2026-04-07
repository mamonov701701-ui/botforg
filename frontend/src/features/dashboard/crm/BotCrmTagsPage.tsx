import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Trash2 } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmListTags,
  crmCreateTag,
  crmPatchTag,
  crmDeleteTag,
  validateSnakeKey,
  type CrmTagDef,
} from '../../../api/botCrm';

export default function BotCrmTagsPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const [rows, setRows] = useState<CrmTagDef[]>([]);
  const [modal, setModal] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [editRow, setEditRow] = useState<CrmTagDef | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    try {
      setRows(await crmListTags(id));
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const err = validateSnakeKey(key);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await crmCreateTag(id, {
        key: key.trim(),
        label: label.trim() || undefined,
        color: color || undefined,
      });
      toast.success('Тег создан');
      setModal(false);
      setKey('');
      setLabel('');
      setColor('#6b7280');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    try {
      await crmPatchTag(id, editRow.key, {
        label: label.trim() || undefined,
        color: color || undefined,
      });
      toast.success('Сохранено');
      setEditRow(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  };

  const remove = async (row: CrmTagDef) => {
    if (row.users_count > 0) {
      toast.error('Сначала снимите тег с пользователей');
      return;
    }
    if (!window.confirm(`Удалить тег «${row.key}»?`)) return;
    try {
      await crmDeleteTag(id, row.key);
      toast.success('Удалено');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Нельзя удалить');
    }
  };

  return (
    <DashboardPage title="">
      <Card>
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => {
              setKey('');
              setLabel('');
              setColor('#6b7280');
              setModal(true);
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--primary)',
              background: 'rgba(255,210,76,0.15)',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Новый тег
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                  Системное имя
                </th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Название</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Цвет</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                  Пользователей
                </th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Обновлено</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>
                    <code>{r.key}</code>
                  </td>
                  <td style={{ padding: 8 }}>{r.label || '—'}</td>
                  <td style={{ padding: 8 }}>
                    {r.color ? (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: r.color,
                          verticalAlign: 'middle',
                          border: '1px solid var(--border)',
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: 8 }}>{r.users_count}</td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                    {new Date(r.updated_at).toLocaleString('ru-RU')}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/dashboard/bots/${id}/crm/users?tag=${encodeURIComponent(r.key)}`)
                      }
                      title="Пользователи с тегом"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        cursor: 'pointer',
                        marginRight: 8,
                      }}
                    >
                      <Users size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditRow(r);
                        setLabel(r.label || '');
                        setColor(r.color || '#6b7280');
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        marginRight: 8,
                      }}
                    >
                      Правка
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={r.users_count > 0}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: r.users_count > 0 ? 'not-allowed' : 'pointer',
                        opacity: r.users_count > 0 ? 0.45 : 1,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Новый тег</h3>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
              Системное имя (для конструктора)
              <input
                value={key}
                onChange={e => setKey(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
              Название
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 16 }}>
              Цвет
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ display: 'block', marginTop: 8 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModal(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={create}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--primary)',
                  background: 'rgba(255,210,76,0.15)',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Тег «{editRow.key}»</h3>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
              Название
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 16 }}>
              Цвет
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ display: 'block', marginTop: 8 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveEdit}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--primary)',
                  background: 'rgba(255,210,76,0.15)',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
