import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmListTags,
  crmCreateTag,
  crmPatchTag,
  crmDeleteTag,
  validateTagKey,
  type CrmTagDef,
} from '../../../api/botCrm';
import { useCrmDataScope } from './CrmDataScopeContext';

export default function BotCrmTagsPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const { showMode } = useCrmDataScope();
  const [rows, setRows] = useState<CrmTagDef[]>([]);
  const [modal, setModal] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [editRow, setEditRow] = useState<CrmTagDef | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    try {
      setRows(await crmListTags(id, showMode));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  }, [id, showMode]);

  useEffect(() => {
    load();
  }, [load]);

  const goContactsWithTag = (tagKey: string) => {
    navigate(
      `/dashboard/bots/${id}/crm/contacts?tag=${encodeURIComponent(tagKey)}&show=${showMode}`
    );
  };

  const create = async () => {
    const err = validateTagKey(key);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    try {
      await crmPatchTag(
        id,
        editRow.key,
        {
          label: label.trim() || undefined,
          color: color || undefined,
        },
        showMode
      );
      toast.success('Сохранено');
      setEditRow(null);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const remove = async (row: CrmTagDef) => {
    if (row.users_count > 0) {
      toast.error('Сначала снимите тег с контактов');
      return;
    }
    if (!window.confirm(`Удалить тег «${row.key}»?`)) return;
    try {
      await crmDeleteTag(id, row.key);
      toast.success('Удалено');
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Нельзя удалить';
      toast.error(msg);
    }
  };

  return (
    <DashboardPage title="">
      <Card className="crm-panel" padding="22px 24px">
        <div className="crm-page-toolbar">
          <p className="crm-hint" style={{ margin: 0, flex: '1 1 200px' }}>
            Справочник тегов. Нажмите строку — откроется список{' '}
            <Link to={`/dashboard/bots/${id}/crm/contacts`} className="crm-inline-link">
              контактов
            </Link>{' '}
            с этим тегом; назначение на человека — в карточке контакта.
          </p>
          <button
            type="button"
            className="crm-btn crm-btn--primary"
            onClick={() => {
              setKey('');
              setLabel('');
              setColor('#6b7280');
              setModal(true);
            }}
          >
            Новый тег
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="crm-empty">
            <p className="crm-empty__title">Тегов пока нет</p>
            <p className="crm-empty__text">
              Создайте первый тег — он появится в сценариях и карточках контактов.
            </p>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Контактов</th>
                  <th>Обновлено в справочнике</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="crm-row-click" onClick={() => goContactsWithTag(r.key)}>
                    <td>
                      <code>{r.key}</code>
                    </td>
                    <td>{r.label?.trim() ? r.label : null}</td>
                    <td>{r.users_count}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.updated_at).toLocaleString('ru-RU')}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="crm-inline-actions">
                        <button
                          type="button"
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          onClick={() => {
                            setEditRow(r);
                            setLabel(r.label || '');
                            setColor(r.color || '#6b7280');
                          }}
                        >
                          Правка
                        </button>
                        <button
                          type="button"
                          className="crm-icon-btn"
                          onClick={() => remove(r)}
                          disabled={r.users_count > 0}
                          title={r.users_count > 0 ? 'Сначала снимите тег с контактов' : 'Удалить'}
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <div className="crm-modal-root" role="presentation">
          <div className="crm-modal" role="dialog">
            <h3 className="crm-modal__title">Новый тег</h3>
            <div className="crm-form-field">
              <span className="crm-label">Код (латиница, для сценария)</span>
              <input className="crm-input" value={key} onChange={e => setKey(e.target.value)} />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Название</span>
              <input className="crm-input" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Цвет</span>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{
                  width: 48,
                  height: 36,
                  padding: 0,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              />
            </div>
            <div className="crm-modal-actions">
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => setModal(false)}
              >
                Отмена
              </button>
              <button type="button" className="crm-btn crm-btn--primary" onClick={create}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="crm-modal-root" role="presentation">
          <div className="crm-modal" role="dialog">
            <h3 className="crm-modal__title">Тег «{editRow.key}»</h3>
            <div className="crm-form-field">
              <span className="crm-label">Название</span>
              <input className="crm-input" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Цвет</span>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{
                  width: 48,
                  height: 36,
                  padding: 0,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              />
            </div>
            <div className="crm-modal-actions">
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => setEditRow(null)}
              >
                Отмена
              </button>
              <button type="button" className="crm-btn crm-btn--primary" onClick={saveEdit}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
