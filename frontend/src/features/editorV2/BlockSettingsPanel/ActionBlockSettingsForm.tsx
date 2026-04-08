import React, { useEffect, useState } from 'react';
import {
  crmListTags,
  crmListVariableDefs,
  type CrmTagDef,
  type CrmVariableDef,
} from '../../../api/botCrm';
import { normalizeActionSettings } from '../../../utils/actionBlock';

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: '#e5e7eb',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#e2e8f0',
  outline: 'none',
  fontSize: 13,
  boxSizing: 'border-box',
};

interface Props {
  settings: Record<string, unknown>;
  onSettingsPatch: (patch: Record<string, unknown>) => void;
  isReadOnly: boolean;
  platformBotId?: number | null;
}

export const ActionBlockSettingsForm: React.FC<Props> = ({
  settings,
  onSettingsPatch,
  isReadOnly,
  platformBotId = null,
}) => {
  const [crmTags, setCrmTags] = useState<CrmTagDef[]>([]);
  const [crmFields, setCrmFields] = useState<CrmVariableDef[]>([]);

  useEffect(() => {
    if (!platformBotId) {
      setCrmTags([]);
      setCrmFields([]);
      return;
    }
    let cancelled = false;
    Promise.allSettled([crmListTags(platformBotId), crmListVariableDefs(platformBotId)]).then(
      res => {
        if (cancelled) return;
        const tags = res[0].status === 'fulfilled' ? res[0].value : [];
        const fields = res[1].status === 'fulfilled' ? res[1].value : [];
        setCrmTags(Array.isArray(tags) ? tags : []);
        setCrmFields(Array.isArray(fields) ? fields : []);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [platformBotId]);

  const s = normalizeActionSettings(settings);
  const mode = s.mode || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
        Изменяет теги, статус и данные профиля пользователя
      </div>

      <div>
        <div style={labelStyle}>Что изменить</div>
        <select
          style={inputStyle}
          disabled={isReadOnly}
          value={mode}
          onChange={e => {
            const v = e.target.value;
            if (v === 'tag' || v === 'status' || v === 'field') onSettingsPatch({ mode: v });
            else onSettingsPatch({ mode: null });
          }}
        >
          <option value="">— выберите —</option>
          <option value="tag">Тег</option>
          <option value="status">Статус</option>
          <option value="field">Поле пользователя</option>
        </select>
      </div>

      {mode === 'tag' && (
        <div>
          <div style={labelStyle}>Действие</div>
          <select
            style={inputStyle}
            disabled={isReadOnly}
            value={s.tagAction || ''}
            onChange={e => onSettingsPatch({ tagAction: e.target.value || null })}
          >
            <option value="">— выберите —</option>
            <option value="add">Добавить тег</option>
            <option value="remove">Удалить тег</option>
          </select>
          <div style={{ ...labelStyle, marginTop: 12 }}>Тег</div>
          <input
            type="text"
            style={inputStyle}
            placeholder="Ключ тега (например vip)"
            value={s.tag}
            disabled={isReadOnly}
            list={crmTags.length > 0 ? 'action-block-tag-datalist' : undefined}
            onChange={e => onSettingsPatch({ tag: e.target.value })}
          />
          {crmTags.length > 0 && (
            <datalist id="action-block-tag-datalist">
              {crmTags.map(t => (
                <option key={t.key} value={t.key} label={t.label ?? undefined} />
              ))}
            </datalist>
          )}
        </div>
      )}

      {mode === 'status' && (
        <div>
          <div style={labelStyle}>Действие</div>
          <select
            style={inputStyle}
            disabled={isReadOnly}
            value={s.statusAction || ''}
            onChange={e => onSettingsPatch({ statusAction: e.target.value || null })}
          >
            <option value="">— выберите —</option>
            <option value="set">Установить статус</option>
            <option value="clear">Очистить статус</option>
          </select>
          {s.statusAction === 'set' && (
            <>
              <div style={{ ...labelStyle, marginTop: 12 }}>Статус</div>
              <input
                type="text"
                style={inputStyle}
                placeholder="Например: active"
                value={s.status}
                disabled={isReadOnly}
                onChange={e => onSettingsPatch({ status: e.target.value })}
              />
            </>
          )}
        </div>
      )}

      {mode === 'field' && (
        <div>
          <div style={labelStyle}>Действие</div>
          <select
            style={inputStyle}
            disabled={isReadOnly}
            value={s.fieldAction || ''}
            onChange={e => onSettingsPatch({ fieldAction: e.target.value || null })}
          >
            <option value="">— выберите —</option>
            <option value="set">Записать значение</option>
            <option value="clear">Очистить поле</option>
          </select>
          <div style={{ ...labelStyle, marginTop: 12 }}>Поле</div>
          <input
            type="text"
            style={inputStyle}
            placeholder="Например: city"
            value={s.fieldKey}
            disabled={isReadOnly}
            list={crmFields.length > 0 ? 'action-block-field-datalist' : undefined}
            onChange={e => onSettingsPatch({ fieldKey: e.target.value })}
          />
          {crmFields.length > 0 && (
            <datalist id="action-block-field-datalist">
              {crmFields.map(f => (
                <option key={f.id} value={f.key} label={f.label ?? undefined} />
              ))}
            </datalist>
          )}
          {s.fieldAction === 'set' && (
            <>
              <div style={{ ...labelStyle, marginTop: 12 }}>Значение</div>
              <input
                type="text"
                style={inputStyle}
                placeholder="Например: Москва"
                value={s.fieldValue}
                disabled={isReadOnly}
                onChange={e => onSettingsPatch({ fieldValue: e.target.value })}
              />
            </>
          )}
        </div>
      )}

      <div>
        <div style={labelStyle}>Короткий текст в чат</div>
        <input
          type="text"
          style={inputStyle}
          placeholder="Необязательно. Например: Сохранено"
          value={s.message}
          disabled={isReadOnly}
          onChange={e => onSettingsPatch({ message: e.target.value })}
        />
        <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
          Необязательно. Если заполнено, бот отправит короткое сообщение после действия.
        </div>
      </div>
    </div>
  );
};
