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

const inputErrorStyle: React.CSSProperties = {
  border: '1px solid rgba(239, 68, 68, 0.55)',
};

const variableHintInputStyle: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  background: 'rgba(59, 130, 246, 0.12)',
};

const animatedSectionBase: React.CSSProperties = {
  transition: 'opacity 160ms ease, transform 160ms ease',
  transformOrigin: 'top',
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
  const hasTemplateVariable = (value: string): boolean => /\{\{[^{}]+\}\}/.test(value);
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

  useEffect(() => {
    if (isReadOnly) return;
    if (!s.mode) {
      onSettingsPatch({ mode: 'tag', tagAction: 'add' });
      return;
    }
    if (s.mode === 'tag' && !s.tagAction) {
      onSettingsPatch({ tagAction: 'add' });
    }
  }, [isReadOnly, onSettingsPatch, s.mode, s.tagAction]);

  const showTagInput = mode === 'tag' && (s.tagAction === 'add' || s.tagAction === 'remove');
  const showStatusInput = mode === 'status' && s.statusAction === 'set';
  const showFieldNameInput = mode === 'field';
  const showFieldValueInput = mode === 'field' && s.fieldAction === 'set';

  const tagRequiredMissing = showTagInput && !s.tag.trim();
  const statusRequiredMissing = showStatusInput && !s.status.trim();
  const fieldRequiredMissing = showFieldNameInput && !s.fieldKey.trim();
  const fieldValueRequiredMissing = showFieldValueInput && !s.fieldValue.trim();

  const handleModeChange = (nextMode: string) => {
    if (nextMode === 'tag') {
      onSettingsPatch({
        mode: 'tag',
        tagAction: 'add',
        statusAction: null,
        fieldAction: null,
        tag: '',
        status: '',
        fieldKey: '',
        fieldValue: '',
      });
      return;
    }
    if (nextMode === 'status') {
      onSettingsPatch({
        mode: 'status',
        tagAction: null,
        statusAction: null,
        fieldAction: null,
        tag: '',
        status: '',
        fieldKey: '',
        fieldValue: '',
      });
      return;
    }
    if (nextMode === 'field') {
      onSettingsPatch({
        mode: 'field',
        tagAction: null,
        statusAction: null,
        fieldAction: null,
        tag: '',
        status: '',
        fieldKey: '',
        fieldValue: '',
      });
      return;
    }
    onSettingsPatch({
      mode: null,
      tagAction: null,
      statusAction: null,
      fieldAction: null,
      tag: '',
      status: '',
      fieldKey: '',
      fieldValue: '',
    });
  };

  const handleTagActionChange = (nextAction: string) => {
    if (nextAction === 'add' || nextAction === 'remove') {
      onSettingsPatch({ tagAction: nextAction, status: '', fieldValue: '' });
      return;
    }
    onSettingsPatch({ tagAction: null, status: '', fieldValue: '' });
  };

  const handleStatusActionChange = (nextAction: string) => {
    if (nextAction === 'set') {
      onSettingsPatch({ statusAction: 'set', fieldValue: '' });
      return;
    }
    if (nextAction === 'clear') {
      onSettingsPatch({ statusAction: 'clear', status: '', fieldValue: '' });
      return;
    }
    onSettingsPatch({ statusAction: null, status: '', fieldValue: '' });
  };

  const handleFieldActionChange = (nextAction: string) => {
    if (nextAction === 'set') {
      onSettingsPatch({ fieldAction: 'set', status: '' });
      return;
    }
    if (nextAction === 'clear') {
      onSettingsPatch({ fieldAction: 'clear', fieldValue: '', status: '' });
      return;
    }
    onSettingsPatch({ fieldAction: null, fieldValue: '', status: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={labelStyle}>Что изменить?</div>
        <select
          style={inputStyle}
          disabled={isReadOnly}
          value={mode}
          onChange={e => handleModeChange(e.target.value)}
        >
          <option value="">— выберите —</option>
          <option value="tag">Тег</option>
          <option value="status">Статус</option>
          <option value="field">Поле пользователя</option>
        </select>
      </div>

      {(mode === 'tag' || mode === 'status' || mode === 'field') && (
        <div>
          <div style={labelStyle}>Действие</div>
          {mode === 'tag' && (
            <select
              style={inputStyle}
              disabled={isReadOnly}
              value={s.tagAction || ''}
              onChange={e => handleTagActionChange(e.target.value)}
            >
              <option value="">— выберите —</option>
              <option value="add">Добавить</option>
              <option value="remove">Удалить</option>
            </select>
          )}
          {mode === 'status' && (
            <select
              style={inputStyle}
              disabled={isReadOnly}
              value={s.statusAction || ''}
              onChange={e => handleStatusActionChange(e.target.value)}
            >
              <option value="">— выберите —</option>
              <option value="set">Установить</option>
              <option value="clear">Сбросить</option>
            </select>
          )}
          {mode === 'field' && (
            <select
              style={inputStyle}
              disabled={isReadOnly}
              value={s.fieldAction || ''}
              onChange={e => handleFieldActionChange(e.target.value)}
            >
              <option value="">— выберите —</option>
              <option value="set">Записать</option>
              <option value="clear">Очистить</option>
            </select>
          )}
        </div>
      )}

      <div
        style={{
          minHeight: showFieldNameInput ? 72 : 0,
          ...animatedSectionBase,
          opacity: showFieldNameInput ? 1 : 0,
          transform: showFieldNameInput ? 'translateY(0)' : 'translateY(-4px)',
          pointerEvents: showFieldNameInput ? 'auto' : 'none',
        }}
      >
        {showFieldNameInput && (
          <div>
            <div style={labelStyle}>Поле</div>
            <input
              type="text"
              style={{
                ...inputStyle,
                ...(fieldRequiredMissing ? inputErrorStyle : {}),
                ...(hasTemplateVariable(s.fieldKey) ? variableHintInputStyle : {}),
              }}
              placeholder="email, phone, name"
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
          </div>
        )}
      </div>

      <div
        style={{
          minHeight: showTagInput || showStatusInput || showFieldValueInput ? 72 : 0,
          ...animatedSectionBase,
          opacity: showTagInput || showStatusInput || showFieldValueInput ? 1 : 0,
          transform:
            showTagInput || showStatusInput || showFieldValueInput
              ? 'translateY(0)'
              : 'translateY(-4px)',
          pointerEvents: showTagInput || showStatusInput || showFieldValueInput ? 'auto' : 'none',
        }}
      >
        {(showTagInput || showStatusInput || showFieldValueInput) && (
          <div>
            <div style={labelStyle}>
              {showTagInput ? 'Тег' : showStatusInput ? 'Статус' : 'Новое значение'}
            </div>
            <input
              type="text"
              style={{
                ...inputStyle,
                ...(tagRequiredMissing || statusRequiredMissing || fieldValueRequiredMissing
                  ? inputErrorStyle
                  : {}),
                ...(hasTemplateVariable(
                  showTagInput ? s.tag : showStatusInput ? s.status : s.fieldValue
                )
                  ? variableHintInputStyle
                  : {}),
              }}
              placeholder={
                showTagInput
                  ? 'VIP, interested, paid'
                  : showStatusInput
                    ? 'lead, active, blocked'
                    : '{{input}}, test@mail.com, Иван'
              }
              value={showTagInput ? s.tag : showStatusInput ? s.status : s.fieldValue}
              disabled={isReadOnly}
              list={showTagInput && crmTags.length > 0 ? 'action-block-tag-datalist' : undefined}
              aria-label={showTagInput ? 'Тег' : showStatusInput ? 'Статус' : 'Новое значение'}
              onChange={e => {
                const next = e.target.value;
                if (showTagInput) onSettingsPatch({ tag: next });
                else if (showStatusInput) onSettingsPatch({ status: next });
                else onSettingsPatch({ fieldValue: next });
              }}
            />
            {showTagInput && crmTags.length > 0 && (
              <datalist id="action-block-tag-datalist">
                {crmTags.map(t => (
                  <option key={t.key} value={t.key} label={t.label ?? undefined} />
                ))}
              </datalist>
            )}
            {showFieldValueInput && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                Можно указать текст или переменную, например {'{{input}}'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
