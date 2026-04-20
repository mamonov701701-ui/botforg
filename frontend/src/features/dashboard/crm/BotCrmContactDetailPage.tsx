import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
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
  type CrmEnvironmentFilter,
} from '../../../api/botCrm';
import { getChannelLabel, getVariableDataTypeLabel } from '../../../utils/uiLabels';

function parseShowParam(raw: string | null): CrmEnvironmentFilter {
  if (raw === 'dev' || raw === 'prod' || raw === 'all') return raw;
  return 'prod';
}

function variableValueToEditString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function displayVariableValue(v: unknown): React.ReactNode {
  if (v == null) return <span className="crm-ellipsis">—</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const CRM_EVENT_TYPE_LABELS: Record<string, string> = {
  variable_set: 'Изменено поле',
  tag_added: 'Добавлен тег',
  tag_removed: 'Снят тег',
};

function formatCrmEventTypeLabel(eventType: string): string {
  if (CRM_EVENT_TYPE_LABELS[eventType]) return CRM_EVENT_TYPE_LABELS[eventType];
  return eventType.replace(/_/g, ' ');
}

export default function BotCrmContactDetailPage() {
  const { botId, ctorUserId } = useParams<{ botId: string; ctorUserId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bid = Number(botId);
  const uid = Number(ctorUserId);
  const showParam = searchParams.get('show') ?? searchParams.get('environment') ?? 'prod';
  const environment = parseShowParam(showParam);

  const [detail, setDetail] = useState<CrmUserDetail | null>(null);
  const [fields, setFields] = useState<CrmUserVariable[]>([]);
  const [tags, setTags] = useState<
    { id: number; key: string; label?: string | null; color?: string | null }[]
  >([]);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [tagCatalog, setTagCatalog] = useState<CrmTagDef[]>([]);

  const [fieldEditModal, setFieldEditModal] = useState<CrmUserVariable | null>(null);
  const [fieldEditValue, setFieldEditValue] = useState('');

  const [addFieldModalOpen, setAddFieldModalOpen] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldVal, setNewFieldVal] = useState('');

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalKey, setTagModalKey] = useState('');

  const reload = useCallback(async () => {
    if (!Number.isFinite(bid) || !Number.isFinite(uid)) return;
    try {
      const [d, v, t, ev] = await Promise.all([
        crmUserDetail(bid, uid, environment),
        crmUserVariables(bid, uid, environment),
        crmUserTags(bid, uid, environment),
        crmUserEvents(bid, uid, 80, 0, environment),
      ]);
      setDetail(d);
      setFields(v);
      setTags(t);
      setEvents(ev);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
      toast.error(msg);
    }
  }, [bid, uid, environment]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!Number.isFinite(bid)) return;
    crmListTags(bid)
      .then(setTagCatalog)
      .catch(() => setTagCatalog([]));
  }, [bid]);

  const openEditFieldModal = (row: CrmUserVariable) => {
    setFieldEditModal(row);
    setFieldEditValue(variableValueToEditString(row.value));
  };

  const saveFieldFromModal = async () => {
    if (!fieldEditModal) return;
    try {
      await crmSetUserVariable(bid, uid, fieldEditModal.key, fieldEditValue, environment);
      toast.success('Сохранено');
      setFieldEditModal(null);
      setFieldEditValue('');
      reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не сохранено';
      toast.error(msg);
    }
  };

  const submitNewFieldModal = async () => {
    const vk = validateSnakeKey(newFieldKey);
    if (vk) {
      toast.error(vk);
      return;
    }
    try {
      await crmSetUserVariable(bid, uid, newFieldKey.trim(), newFieldVal, environment);
      toast.success('Поле сохранено');
      setAddFieldModalOpen(false);
      setNewFieldKey('');
      setNewFieldVal('');
      reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const submitTagModal = async () => {
    if (!tagModalKey) {
      toast.error('Выберите тег');
      return;
    }
    try {
      await crmAddUserTag(bid, uid, tagModalKey.trim(), environment);
      toast.success('Тег назначен');
      setTagModalOpen(false);
      setTagModalKey('');
      reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const removeTag = async (key: string) => {
    try {
      await crmRemoveUserTag(bid, uid, key, environment);
      reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось снять тег';
      toast.error(msg);
    }
  };

  if (!detail) {
    return (
      <DashboardPage title="Контакт">
        <p className="crm-muted" style={{ padding: '32px 0' }}>
          Загрузка…
        </p>
      </DashboardPage>
    );
  }

  const dataKind = detail.environment === 'dev' ? 'Тестовые данные' : 'Реальные данные';

  return (
    <DashboardPage title="">
      <div className="crm-detail-stack">
        <button
          type="button"
          className="crm-back"
          onClick={() => navigate(`/dashboard/bots/${bid}/crm/contacts?show=${environment}`)}
        >
          <ArrowLeft size={18} strokeWidth={2} /> К списку контактов
        </button>

        <div className="crm-detail-hero">
          <h1 className="crm-h1">{detail.display_name}</h1>
          <p className="crm-lead" style={{ margin: 0 }}>
            {dataKind}
            {' · '}
            {getChannelLabel(detail.channel)} · {detail.external_user_id}
            {detail.username ? ` · @${detail.username}` : ''}
          </p>
        </div>

        <p className="crm-hint" style={{ marginBottom: 12 }}>
          Это главный экран управления данными пользователя: здесь — значения полей и тегов.
          Справочник ключей (что вообще можно хранить) настраивается в разделе{' '}
          <Link to={`/dashboard/bots/${bid}/crm/fields`} className="crm-inline-link">
            Поля
          </Link>
          .
        </p>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Основное
          </h3>
          <div className="crm-kv-pairs">
            {[
              ['Имя', detail.first_name || '—'],
              ['Фамилия', detail.last_name || '—'],
              ['Телефон', detail.phone || '—'],
              ['Почта', detail.email || '—'],
              ['Канал', getChannelLabel(detail.channel)],
              ['Внешний идентификатор', detail.external_user_id],
              ['Создан', new Date(detail.created_at).toLocaleString('ru-RU')],
              [
                'Последняя активность',
                detail.last_message_at
                  ? new Date(detail.last_message_at).toLocaleString('ru-RU')
                  : '—',
              ],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <div className="crm-kv-pairs__k">{k}</div>
                <div className="crm-kv-pairs__v">{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Статус
          </h3>
          <p className="crm-hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Текущий статус, который выставляет сценарий. Прямое изменение из CRM пока недоступно —
            поле ниже только для просмотра.
          </p>
          <div className="crm-form-field" style={{ marginBottom: 0 }}>
            <span className="crm-label">Значение (только чтение)</span>
            <input
              className="crm-input crm-input--readonly"
              readOnly
              tabIndex={-1}
              value={detail.status}
              aria-readonly
            />
          </div>
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Теги
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {tags.map(t => (
              <span
                key={t.id}
                className="crm-tag-pill"
                style={
                  t.color
                    ? {
                        background: `${t.color}28`,
                        borderColor: `${t.color}44`,
                      }
                    : undefined
                }
              >
                {t.label || t.key}
                <button type="button" aria-label="Убрать" onClick={() => removeTag(t.key)}>
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </span>
            ))}
            {tags.length === 0 ? <span className="crm-muted">Нет тегов</span> : null}
          </div>
          <div className="crm-inline-actions">
            <button
              type="button"
              className="crm-btn crm-btn--primary crm-btn--sm"
              onClick={() => {
                setTagModalKey('');
                setTagModalOpen(true);
              }}
            >
              Добавить тег
            </button>
            <span className="crm-hint" style={{ margin: 0 }}>
              Справочник ключей тегов —{' '}
              <Link to={`/dashboard/bots/${bid}/crm/tags`} className="crm-inline-link">
                раздел «Теги»
              </Link>
              .
            </span>
          </div>
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Данные контакта
          </h3>
          <p className="crm-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Фактические значения переменных у этого пользователя. Справочник полей (ключи и типы) —
            в{' '}
            <Link to={`/dashboard/bots/${bid}/crm/fields`} className="crm-inline-link">
              «Поля»
            </Link>
            ; изменение значений — через «Изменить» или «Добавить поле».
          </p>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Поле</th>
                  <th>Тип</th>
                  <th>Значение</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {fields.map(row => (
                  <tr key={row.key}>
                    <td>
                      <code>{row.key}</code>
                      {row.is_system ? (
                        <span className="crm-badge" style={{ marginLeft: 8, fontSize: 10 }}>
                          служебное
                        </span>
                      ) : null}
                    </td>
                    <td>{getVariableDataTypeLabel(row.data_type)}</td>
                    <td>{displayVariableValue(row.value)}</td>
                    <td>
                      <button
                        type="button"
                        className="crm-btn crm-btn--ghost crm-btn--sm"
                        onClick={() => openEditFieldModal(row)}
                      >
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="crm-divider-top">
            <button
              type="button"
              className="crm-btn crm-btn--primary"
              onClick={() => {
                setNewFieldKey('');
                setNewFieldVal('');
                setAddFieldModalOpen(true);
              }}
            >
              <Plus size={16} strokeWidth={2} /> Добавить поле
            </button>
          </div>
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Сессия сценария
          </h3>
          {detail.session ? (
            <div style={{ fontSize: 14, lineHeight: 1.65 }}>
              <div>
                <span className="crm-muted">Состояние</span>
                <div className="crm-detail-body" style={{ marginTop: 2 }}>
                  {detail.session.status}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="crm-muted">Сценарий</span>
                <div className="crm-detail-body" style={{ marginTop: 2, fontWeight: 500 }}>
                  {detail.session.scenario_name || `#${detail.session.scenario_id}`}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="crm-muted">Блок</span>
                <div className="crm-detail-body" style={{ marginTop: 2, fontWeight: 500 }}>
                  {detail.session.current_block_label ||
                    (detail.session.current_block_id != null
                      ? `#${detail.session.current_block_id}`
                      : '—')}
                </div>
              </div>
              <div className="crm-hint" style={{ marginTop: 14, marginBottom: 0 }}>
                Обновлено: {new Date(detail.session.updated_at).toLocaleString('ru-RU')}
              </div>
            </div>
          ) : (
            <div className="crm-empty" style={{ padding: '28px 20px' }}>
              <p className="crm-empty__title" style={{ fontSize: 15 }}>
                Нет активной сессии
              </p>
              <p className="crm-empty__text">
                Сценарий ещё не зафиксировал состояние для этого контакта.
              </p>
            </div>
          )}
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            События
          </h3>
          {events.length === 0 ? (
            <div className="crm-empty" style={{ padding: '28px 20px' }}>
              <p className="crm-empty__title" style={{ fontSize: 15 }}>
                Пока нет событий
              </p>
              <p className="crm-empty__text">Здесь появятся действия сценария по этому контакту.</p>
            </div>
          ) : (
            <ul className="crm-events-list">
              {events.map(ev => (
                <li key={ev.id}>
                  <div className="crm-events-list__title">
                    {formatCrmEventTypeLabel(ev.event_type)}
                  </div>
                  <div className="crm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {new Date(ev.created_at).toLocaleString('ru-RU')}
                    {ev.scenario_id != null ? ` · сценарий #${ev.scenario_id}` : ''}
                    {ev.block_id != null ? ` · блок #${ev.block_id}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="crm-panel" padding="22px 24px">
          <h3 className="crm-section-title" style={{ marginTop: 0 }}>
            Сообщения
          </h3>
          <p className="crm-hint" style={{ margin: 0 }}>
            История переписки в этом разделе пока не подключена.
          </p>
        </Card>
      </div>

      {fieldEditModal && (
        <div
          className="crm-modal-root"
          role="presentation"
          onClick={() => {
            setFieldEditModal(null);
            setFieldEditValue('');
          }}
        >
          <div className="crm-modal" role="dialog" onClick={e => e.stopPropagation()}>
            <h3 className="crm-modal__title">Редактировать поле</h3>
            <p className="crm-hint" style={{ marginTop: '-8px', marginBottom: 14 }}>
              <code>{fieldEditModal.key}</code>
              {' · '}
              {getVariableDataTypeLabel(fieldEditModal.data_type)}
            </p>
            <div className="crm-form-field">
              <span className="crm-label">Значение</span>
              <input
                className="crm-input"
                value={fieldEditValue}
                onChange={e => setFieldEditValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="crm-modal-actions">
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => {
                  setFieldEditModal(null);
                  setFieldEditValue('');
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--primary"
                onClick={saveFieldFromModal}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {addFieldModalOpen && (
        <div
          className="crm-modal-root"
          role="presentation"
          onClick={() => setAddFieldModalOpen(false)}
        >
          <div className="crm-modal" role="dialog" onClick={e => e.stopPropagation()}>
            <h3 className="crm-modal__title">Добавить поле</h3>
            <div className="crm-form-field">
              <span className="crm-label">Имя поля (латиница, snake_case)</span>
              <input
                className="crm-input"
                value={newFieldKey}
                onChange={e => setNewFieldKey(e.target.value)}
                placeholder="например city"
              />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Значение</span>
              <input
                className="crm-input"
                value={newFieldVal}
                onChange={e => setNewFieldVal(e.target.value)}
                placeholder="Значение"
              />
            </div>
            <div className="crm-modal-actions">
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => setAddFieldModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--primary"
                onClick={submitNewFieldModal}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {tagModalOpen && (
        <div
          className="crm-modal-root"
          role="presentation"
          onClick={() => {
            setTagModalOpen(false);
            setTagModalKey('');
          }}
        >
          <div className="crm-modal" role="dialog" onClick={e => e.stopPropagation()}>
            <h3 className="crm-modal__title">Назначить тег</h3>
            <div className="crm-form-field">
              <span className="crm-label">Тег</span>
              <select
                className="crm-select"
                value={tagModalKey}
                onChange={e => setTagModalKey(e.target.value)}
              >
                <option value="">Выберите тег…</option>
                {tagCatalog.map(t => (
                  <option key={t.id} value={t.key}>
                    {t.label || t.key}
                  </option>
                ))}
              </select>
            </div>
            <div className="crm-modal-actions">
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => {
                  setTagModalOpen(false);
                  setTagModalKey('');
                }}
              >
                Отмена
              </button>
              <button type="button" className="crm-btn crm-btn--primary" onClick={submitTagModal}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
