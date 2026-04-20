import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
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
import { crmBlockTypeLabel } from './crmBlockLabels';
import { useCrmDataScope } from './CrmDataScopeContext';

function isUnusedField(r: CrmVariableDef): boolean {
  const blocks = r.used_in_blocks_count ?? 0;
  const scenarios = r.used_in_scenarios_count ?? 0;
  const withData = r.contacts_with_value_count ?? 0;
  return blocks === 0 && scenarios === 0 && withData === 0;
}

export default function BotCrmFieldsPage() {
  const { botId } = useParams<{ botId: string }>();
  const id = Number(botId);
  const { showMode } = useCrmDataScope();
  const [rows, setRows] = useState<CrmVariableDef[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [usageByKey, setUsageByKey] = useState<Record<string, CrmVariableUsageRef[] | 'loading'>>(
    {}
  );
  const [modal, setModal] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [dtype, setDtype] = useState('string');

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    try {
      const data = await crmListVariableDefs(id, showArchived, showMode);
      setRows(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  }, [id, showArchived, showMode]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(
    () => (showAllFields ? rows : rows.filter(r => !isUnusedField(r))),
    [rows, showAllFields]
  );

  const create = async () => {
    const err = validateSnakeKey(key);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await crmCreateVariable(
        id,
        {
          key: key.trim(),
          label: label.trim() || undefined,
          data_type: dtype,
        },
        showMode
      );
      toast.success('Поле создано');
      setModal(false);
      setKey('');
      setLabel('');
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не создано';
      toast.error(msg);
    }
  };

  const toggleArchive = async (row: CrmVariableDef) => {
    if (row.is_system) {
      toast.error('Служебные поля нельзя убрать в архив');
      return;
    }
    try {
      await crmPatchVariable(id, row.key, { is_archived: !row.is_archived }, showMode);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const toggleUsageRow = async (row: CrmVariableDef) => {
    if (expandedKey === row.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(row.key);
    if (usageByKey[row.key] !== undefined && usageByKey[row.key] !== 'loading') return;
    setUsageByKey(prev => ({ ...prev, [row.key]: 'loading' }));
    try {
      const u = await crmVariableUsage(id, row.key);
      setUsageByKey(prev => ({ ...prev, [row.key]: u }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
      setUsageByKey(prev => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      setExpandedKey(null);
    }
  };

  const usageBlocks = (key: string): CrmVariableUsageRef[] | null => {
    const v = usageByKey[key];
    if (v === 'loading' || v === undefined) return null;
    return v;
  };

  const usageByScenario = (usage: CrmVariableUsageRef[]) => {
    const m = new Map<string, CrmVariableUsageRef[]>();
    for (const u of usage) {
      const k = u.scenario_name?.trim() || 'Сценарий';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(u);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  };

  return (
    <DashboardPage title="">
      <Card className="crm-panel" padding="22px 24px">
        <div className="crm-page-toolbar">
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 20px', alignItems: 'center' }}
          >
            <label className="crm-checkbox-row">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
              />
              Показать архивные
            </label>
            <div className="crm-segment" role="group" aria-label="Фильтр полей">
              <button
                type="button"
                className={`crm-segment__btn ${!showAllFields ? 'crm-segment__btn--active' : ''}`}
                onClick={() => setShowAllFields(false)}
              >
                Только используемые
              </button>
              <button
                type="button"
                className={`crm-segment__btn ${showAllFields ? 'crm-segment__btn--active' : ''}`}
                onClick={() => setShowAllFields(true)}
              >
                Все поля
              </button>
            </div>
          </div>
          <button type="button" className="crm-btn crm-btn--primary" onClick={() => setModal(true)}>
            Новое поле
          </button>
        </div>

        <p className="crm-hint" style={{ marginBottom: 18 }}>
          Справочник полей: использование на сценах редактора, сколько контактов с непустым
          значением. Редактирование значений у человека — в{' '}
          <Link to={`/dashboard/bots/${id}/crm/contacts`} className="crm-inline-link">
            Контактах
          </Link>{' '}
          и в карточке контакта.
        </p>

        {rows.length === 0 ? (
          <div className="crm-empty">
            <p className="crm-empty__title">Пока нет полей</p>
            <p className="crm-empty__text">
              Создайте поле или включите «Показать архивные», если записи уже были в архиве.
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="crm-empty">
            <p className="crm-empty__title">Нет используемых полей</p>
            <p className="crm-empty__text">
              Все поля сейчас без блоков, сценариев и данных. Переключите на «Все поля», чтобы
              увидеть список.
            </p>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Внутреннее имя</th>
                  <th>Тип</th>
                  <th title="Блоки на графе сценария (редактор), где встречается поле">Блоков</th>
                  <th title="Число сценариев (строки сцен), где поле используется">Сценариев</th>
                  <th title="Контакты с непустым значением поля">С данными</th>
                  <th>Обновлено в справочнике</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td>
                        <code>{r.key}</code>
                        {r.is_archived ? <span className="crm-badge--muted">в архиве</span> : null}
                      </td>
                      <td>{getVariableDataTypeLabel(r.data_type)}</td>
                      <td>{r.used_in_blocks_count}</td>
                      <td>{r.used_in_scenarios_count ?? 0}</td>
                      <td>{r.contacts_with_value_count ?? 0}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(r.updated_at).toLocaleString('ru-RU')}
                      </td>
                      <td>
                        <div className="crm-inline-actions">
                          <button
                            type="button"
                            className={`crm-icon-btn crm-fields-expand-btn ${expandedKey === r.key ? 'crm-fields-expand-btn--open' : ''}`}
                            onClick={() => toggleUsageRow(r)}
                            title="Где встречается на схеме"
                            aria-expanded={expandedKey === r.key}
                          >
                            <ChevronRight size={16} strokeWidth={2} />
                          </button>
                          {!r.is_system ? (
                            <button
                              type="button"
                              className="crm-icon-btn crm-icon-btn--quiet"
                              onClick={() => toggleArchive(r)}
                              title={r.is_archived ? 'Вернуть из архива' : 'Убрать в архив'}
                              aria-label={r.is_archived ? 'Вернуть из архива' : 'Убрать в архив'}
                            >
                              {r.is_archived ? (
                                <ArchiveRestore size={16} strokeWidth={2} />
                              ) : (
                                <Archive size={16} strokeWidth={2} />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expandedKey === r.key ? (
                      <tr className="crm-fields-usage-row">
                        <td colSpan={7}>
                          <div className="crm-fields-usage-inner">
                            {usageBlocks(r.key) === null ? (
                              <p className="crm-muted" style={{ margin: '8px 0' }}>
                                Загрузка…
                              </p>
                            ) : usageBlocks(r.key)!.length === 0 ? (
                              <p className="crm-muted" style={{ margin: '8px 0' }}>
                                В блоках сценария не найдено.
                              </p>
                            ) : (
                              usageByScenario(usageBlocks(r.key)!).map(([scenName, items]) => (
                                <div key={scenName} style={{ marginBottom: 16 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
                                    Сценарий: {scenName}
                                  </div>
                                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                                    {items.map(u => (
                                      <li
                                        key={`${u.scenario_id}-${u.block_id}`}
                                        style={{ marginBottom: 8 }}
                                      >
                                        {crmBlockTypeLabel(u.block_type)}
                                        {u.block_name ? ` «${u.block_name}»` : ''}
                                        <span className="crm-muted" style={{ fontSize: 12 }}>
                                          {' '}
                                          (узел #{u.block_id})
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <div className="crm-modal-root" role="presentation">
          <div className="crm-modal" role="dialog">
            <h3 className="crm-modal__title">Новое поле</h3>
            <div className="crm-form-field">
              <span className="crm-label">Внутреннее имя (латиница)</span>
              <input className="crm-input" value={key} onChange={e => setKey(e.target.value)} />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Название для людей</span>
              <input className="crm-input" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div className="crm-form-field">
              <span className="crm-label">Тип</span>
              <select className="crm-select" value={dtype} onChange={e => setDtype(e.target.value)}>
                <option value="string">{getVariableDataTypeLabel('string')}</option>
                <option value="number">{getVariableDataTypeLabel('number')}</option>
                <option value="boolean">{getVariableDataTypeLabel('boolean')}</option>
                <option value="datetime">{getVariableDataTypeLabel('datetime')}</option>
                <option value="json">{getVariableDataTypeLabel('json')}</option>
              </select>
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
    </DashboardPage>
  );
}
