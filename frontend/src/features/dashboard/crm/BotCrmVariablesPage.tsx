import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmListVariableDefs,
  crmCreateVariable,
  crmPatchVariable,
  crmVariableUsage,
  validateSnakeKey,
  type CrmVariableDef,
  type CrmVariableUsageRef,
} from '../../../api/botCrm';
import { getVariableDataTypeLabel } from '../../../utils/uiLabels';

export default function BotCrmVariablesPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const [rows, setRows] = useState<CrmVariableDef[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [usage, setUsage] = useState<CrmVariableUsageRef[] | null>(null);
  const [usageTitle, setUsageTitle] = useState('');
  const [modal, setModal] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [dtype, setDtype] = useState('string');

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    try {
      const data = await crmListVariableDefs(id, showArchived);
      setRows(data);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  }, [id, showArchived]);

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
      await crmCreateVariable(id, {
        key: key.trim(),
        label: label.trim() || undefined,
        data_type: dtype,
      });
      toast.success('Создано');
      setModal(false);
      setKey('');
      setLabel('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Не создано');
    }
  };

  const toggleArchive = async (row: CrmVariableDef) => {
    if (row.is_system) {
      toast.error('Системные переменные не архивируются');
      return;
    }
    try {
      await crmPatchVariable(id, row.key, { is_archived: !row.is_archived });
      load();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  };

  const openUsage = async (row: CrmVariableDef) => {
    try {
      const u = await crmVariableUsage(id, row.key);
      setUsage(u);
      setUsageTitle(row.key);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    }
  };

  return (
    <DashboardPage title="">
      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            alignItems: 'center',
          }}
        >
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            Показать архивные
          </label>
          <button
            type="button"
            onClick={() => setModal(true)}
            style={{
              marginLeft: 'auto',
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--primary)',
              background: 'rgba(255,210,76,0.15)',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Новая переменная
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
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Тип данных</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Системная</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>в блоках</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Обновлено</th>
                <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>
                    <code>{r.key}</code>
                    {r.is_archived ? (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24' }}>
                        в архиве
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>{r.label || '—'}</td>
                  <td style={{ padding: 8 }}>{getVariableDataTypeLabel(r.data_type)}</td>
                  <td style={{ padding: 8 }}>{r.is_system ? 'да' : ''}</td>
                  <td style={{ padding: 8 }}>{r.used_in_blocks_count}</td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                    {new Date(r.updated_at).toLocaleString('ru-RU')}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => openUsage(r)}
                      title="Где используется"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        cursor: 'pointer',
                        marginRight: 8,
                      }}
                    >
                      <Eye size={16} style={{ verticalAlign: 'middle' }} />
                    </button>
                    {!r.is_system ? (
                      <button
                        type="button"
                        onClick={() => toggleArchive(r)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {r.is_archived ? 'Вернуть' : 'Архив'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {usage !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setUsage(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 20,
              maxWidth: 560,
              width: '100%',
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Использование «{usageTitle}»</h3>
            {usage.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Не найдено в настройках блоков ctor.</p>
            ) : (
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {usage.map(u => (
                  <li key={`${u.block_id}`} style={{ marginBottom: 8 }}>
                    <strong>{u.scenario_name}</strong> · {u.block_type}
                    {u.block_name ? ` · ${u.block_name}` : ''}
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {' '}
                      (block #{u.block_id})
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setUsage(null)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                cursor: 'pointer',
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

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
            <h3 style={{ marginTop: 0 }}>Новая переменная</h3>
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
              Тип
              <select
                value={dtype}
                onChange={e => setDtype(e.target.value)}
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
              >
                <option value="string">{getVariableDataTypeLabel('string')}</option>
                <option value="number">{getVariableDataTypeLabel('number')}</option>
                <option value="boolean">{getVariableDataTypeLabel('boolean')}</option>
                <option value="datetime">{getVariableDataTypeLabel('datetime')}</option>
                <option value="json">{getVariableDataTypeLabel('json')}</option>
              </select>
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
    </DashboardPage>
  );
}
