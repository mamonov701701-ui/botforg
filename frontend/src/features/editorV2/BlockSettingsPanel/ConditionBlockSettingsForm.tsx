import React, { useEffect, useMemo, useState } from 'react';
import type { Edge } from 'reactflow';
import type { BlockConfigField } from '../../../types/blocks';
import { useScenarioStore } from '../../../stores/scenarioStore';
import {
  collectLocalInputVariables,
  mergeVariableSuggestions,
  toUserVariableName,
} from '../../../utils/scenarioVariableSuggestions';
import {
  getEdgeConditionBranch,
  orderConditionOutgoingEdges,
  resolveConditionYesNoEdges,
} from '../../../utils/conditionBlock';
import {
  fetchVariableDefinitions,
  type VariableDefinitionItem,
} from '../../../api/botMessageTemplate';
import { FieldRenderer } from './FieldRenderer';

type ConditionSourceType = '' | 'last_input' | 'saved_answer' | 'user_tag' | 'profile_field';

interface Props {
  settings: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: unknown) => void;
  onSettingsPatch: (patch: Record<string, unknown>) => void;
  isReadOnly: boolean;
  configSchema: BlockConfigField[];
  nodeId: string;
  /** Как в блоке «Сообщение»: тот же источник определений переменных (GET /bots/:id/variable-definitions). */
  platformBotId?: number | null;
  validateField?: (field: BlockConfigField, value: unknown) => string | undefined;
}

const sectionTitle: React.CSSProperties = {
  marginBottom: 10,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#6b7280',
};

const cardStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: 'rgba(30, 41, 59, 0.5)',
  borderRadius: 8,
  border: '1px solid transparent',
};

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
};

function inferSourceType(variable: string): Exclude<ConditionSourceType, ''> {
  if (variable === 'last_input') return 'last_input';
  return 'saved_answer';
}

export const ConditionBlockSettingsForm: React.FC<Props> = ({
  settings,
  onFieldChange,
  onSettingsPatch,
  isReadOnly,
  configSchema,
  nodeId,
  platformBotId = null,
  validateField,
}) => {
  const currentNodes = useScenarioStore(state => state.currentState?.nodes ?? []);
  const currentEdges = useScenarioStore(state => state.currentState?.edges ?? []);
  const updateCurrentScenario = useScenarioStore(state => state.updateCurrentScenario);
  const localVars = useMemo(() => collectLocalInputVariables(currentNodes), [currentNodes]);
  const [backendVarDefs, setBackendVarDefs] = useState<VariableDefinitionItem[]>([]);
  const mergedVarDefs = useMemo(
    () => mergeVariableSuggestions(localVars, backendVarDefs),
    [localVars, backendVarDefs]
  );
  const allowedVariableKeys = useMemo(
    () => new Set(mergedVarDefs.map(v => v.key)),
    [mergedVarDefs]
  );
  const outgoingEdges = useMemo(
    () => currentEdges.filter(e => e.source === nodeId),
    [currentEdges, nodeId]
  );
  const sortedOutgoing = useMemo(() => orderConditionOutgoingEdges(outgoingEdges), [outgoingEdges]);
  const { yes: yesEdge, no: noEdge } = useMemo(
    () => resolveConditionYesNoEdges(outgoingEdges),
    [outgoingEdges]
  );

  const variableRaw = String(settings.variable || '').trim();
  const sourceTypeRaw = String(settings.conditionSourceType || '').trim();
  const initialSourceType: ConditionSourceType =
    sourceTypeRaw === 'last_input' ||
    sourceTypeRaw === 'saved_answer' ||
    sourceTypeRaw === 'user_tag' ||
    sourceTypeRaw === 'profile_field'
      ? sourceTypeRaw
      : inferSourceType(variableRaw);
  const [sourceType, setSourceType] = useState<ConditionSourceType>(initialSourceType);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!platformBotId) {
      setBackendVarDefs([]);
      return;
    }
    let cancelled = false;
    fetchVariableDefinitions(platformBotId)
      .then(res => {
        if (cancelled) return;
        setBackendVarDefs(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setBackendVarDefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [platformBotId]);

  const operatorField = configSchema.find(f => f.name === 'operator');
  const valueField = configSchema.find(f => f.name === 'value');
  const conditionKeyField = configSchema.find(f => f.name === 'conditionKey');

  const requiresSecondField = sourceType !== 'last_input';
  const hasSourceError = !sourceType;
  const hasVariableError = requiresSecondField && !variableRaw;
  const savedAnswerKeyUnknown =
    sourceType === 'saved_answer' && Boolean(variableRaw) && !allowedVariableKeys.has(variableRaw);
  const profileFieldUnknown =
    sourceType === 'profile_field' && Boolean(variableRaw) && !allowedVariableKeys.has(variableRaw);

  /** В основном режиме не трогаем «дополнительный ключ» в данных (оставляем пустым). */
  const mergePatch = (patch: Record<string, unknown>): Record<string, unknown> =>
    showAdvanced ? patch : { ...patch, conditionKey: '' };

  const handleSourceTypeChange = (next: ConditionSourceType) => {
    if (isReadOnly) return;
    setSourceType(next);
    if (next === 'last_input') {
      onSettingsPatch(
        mergePatch({
          conditionSourceType: next,
          variable: 'last_input',
        })
      );
      return;
    }
    onSettingsPatch(
      mergePatch({
        conditionSourceType: next,
        variable: '',
      })
    );
  };

  const handleVariableChange = (nextValue: string) => {
    if (isReadOnly) return;
    onSettingsPatch(
      mergePatch({
        conditionSourceType: sourceType,
        variable: nextValue,
      })
    );
  };

  const targetStepTitle = (targetId: string) => {
    const n = currentNodes.find(x => x.id === targetId);
    const d: any = n?.data || {};
    return String(d.title || d.blockId || targetId);
  };

  const applyConditionBranches = (yesId: string, noId: string) => {
    if (isReadOnly || !yesId || !noId || yesId === noId) return;
    const next = currentEdges.map(e => {
      if (e.source !== nodeId) return e;
      const d: Record<string, unknown> = { ...((e.data as Record<string, unknown>) || {}) };
      delete d.conditionBranch;
      if (e.id === yesId) {
        d.conditionBranch = 'true';
        return { ...e, data: d, sourceHandle: 'condition_yes' };
      }
      if (e.id === noId) {
        d.conditionBranch = 'false';
        return { ...e, data: d, sourceHandle: 'condition_no' };
      }
      return { ...e, data: d };
    });
    updateCurrentScenario(currentNodes, next);
  };

  const swapConditionBranches = () => {
    if (isReadOnly || !yesEdge || !noEdge) return;
    const next = currentEdges.map(e => {
      if (e.source !== nodeId) return e;
      const d: Record<string, unknown> = { ...((e.data as Record<string, unknown>) || {}) };
      if (e.id === yesEdge.id) {
        d.conditionBranch = 'false';
        return { ...e, data: d, sourceHandle: 'condition_no' };
      }
      if (e.id === noEdge.id) {
        d.conditionBranch = 'true';
        return { ...e, data: d, sourceHandle: 'condition_yes' };
      }
      return e;
    });
    updateCurrentScenario(currentNodes, next);
  };

  return (
    <div>
      <div style={sectionTitle}>Что сравниваем</div>
      <div style={cardStyle}>
        <div style={labelStyle}>Тип данных</div>
        <select
          value={sourceType}
          disabled={isReadOnly}
          onChange={e => handleSourceTypeChange(e.target.value as ConditionSourceType)}
          style={inputStyle}
        >
          <option value="">Выберите тип данных</option>
          <option value="last_input">Последний ответ пользователя</option>
          <option value="saved_answer">Сохранённый ответ</option>
          <option value="user_tag">Тег</option>
          <option value="profile_field">Поле профиля</option>
        </select>
        {hasSourceError && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#fca5a5' }}>
            Выберите тип данных для сравнения.
          </div>
        )}

        {sourceType === 'saved_answer' && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Какой ответ</div>
            <select
              value={allowedVariableKeys.has(variableRaw) ? variableRaw : ''}
              disabled={isReadOnly}
              onChange={e => handleVariableChange(e.target.value)}
              style={inputStyle}
            >
              <option value="">Выберите сохранённый ответ</option>
              {mergedVarDefs.map(v => (
                <option key={v.key} value={v.key}>
                  {toUserVariableName({ key: v.key, label: v.label })}
                </option>
              ))}
            </select>
            {mergedVarDefs.length === 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                Нет объявленных ответов. Добавьте блок «Ввод» или подключите каталог переменных
                бота.
              </div>
            )}
            {savedAnswerKeyUnknown && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#fca5a5' }}>
                Сохранённое имя не найдено среди объявленных ответов — выберите значение из списка.
              </div>
            )}
          </div>
        )}

        {sourceType === 'user_tag' && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Какой тег</div>
            <input
              type="text"
              value={variableRaw}
              onChange={e => handleVariableChange(e.target.value)}
              placeholder="Например: vip"
              readOnly={isReadOnly}
              style={inputStyle}
            />
          </div>
        )}

        {sourceType === 'profile_field' && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Какое поле</div>
            <select
              value={allowedVariableKeys.has(variableRaw) ? variableRaw : ''}
              onChange={e => handleVariableChange(e.target.value)}
              disabled={isReadOnly}
              style={inputStyle}
            >
              <option value="">Выберите поле профиля</option>
              {mergedVarDefs.map(v => (
                <option key={v.key} value={v.key}>
                  {toUserVariableName({ key: v.key, label: v.label })}
                </option>
              ))}
            </select>
            {profileFieldUnknown && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#fca5a5' }}>
                Поле не найдено среди объявленных — выберите значение из списка.
              </div>
            )}
          </div>
        )}

        {hasVariableError && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#fca5a5' }}>
            Выберите значение для выбранного типа данных.
          </div>
        )}
      </div>

      {operatorField && valueField && (
        <>
          <div style={sectionTitle}>Сравнение</div>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              Если условие выполняется — переход по связи с меткой «Да» (в разделе «Ветки»), иначе —
              «Нет».
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>{operatorField.label || 'Оператор'}</div>
              <FieldRenderer
                field={operatorField}
                value={settings.operator ?? operatorField.default}
                onChange={v => onFieldChange('operator', v)}
                error={validateField?.(operatorField, settings.operator)}
                allSettings={settings}
                isReadOnly={isReadOnly}
                blockId="condition"
              />
            </div>
            <div>
              <div style={labelStyle}>{valueField.label || 'Значение'}</div>
              <FieldRenderer
                field={valueField}
                value={settings.value ?? valueField.default ?? ''}
                onChange={v => onFieldChange('value', v)}
                error={validateField?.(valueField, settings.value)}
                allSettings={settings}
                isReadOnly={isReadOnly}
                blockId="condition"
              />
              <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                Для «Пусто» и «Не пусто» значение в поле не используется.
              </div>
            </div>
          </div>
        </>
      )}

      <div style={sectionTitle}>Ветки на схеме</div>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#cbd5e1', marginBottom: 10 }}>
          У каждой из <strong>двух</strong> исходящих связей явно выбрана роль: <strong>Да</strong>{' '}
          (условие выполняется) или <strong>Нет</strong> (не выполняется).
        </div>
        {sortedOutgoing.length > 2 && (
          <>
            <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 6 }}>
              У блока «Условие» может быть только 2 ветки: Да и Нет
            </div>
            <div style={{ fontSize: 12, color: '#fcd34d', marginBottom: 10 }}>
              Используются только связи с явными метками Да/Нет; лишние связи удалите.
            </div>
          </>
        )}
        {sortedOutgoing.length === 1 && (
          <div style={{ fontSize: 12, color: '#fcd34d', marginBottom: 10 }}>
            Добавьте вторую ветку (Да/Нет)
          </div>
        )}
        {outgoingEdges.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            Нет исходящих связей
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>[Да] — условие выполняется</div>
              <select
                value={yesEdge?.id ?? ''}
                disabled={isReadOnly || sortedOutgoing.length < 2}
                onChange={e => {
                  const newYes = e.target.value;
                  if (!newYes) return;
                  const curNo = noEdge?.id;
                  const newNo =
                    curNo && curNo !== newYes
                      ? curNo
                      : (sortedOutgoing.find(x => x.id !== newYes)?.id ?? '');
                  if (newNo) applyConditionBranches(newYes, newNo);
                }}
                style={inputStyle}
              >
                <option value="">Выберите связь</option>
                {sortedOutgoing.map(oe => (
                  <option key={oe.id} value={oe.id}>
                    → {targetStepTitle(oe.target)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>[Нет] — условие не выполняется</div>
              <select
                value={noEdge?.id ?? ''}
                disabled={isReadOnly || sortedOutgoing.length < 2}
                onChange={e => {
                  const newNo = e.target.value;
                  if (!newNo) return;
                  const curYes = yesEdge?.id;
                  const newYes =
                    curYes && curYes !== newNo
                      ? curYes
                      : (sortedOutgoing.find(x => x.id !== newNo)?.id ?? '');
                  if (newYes) applyConditionBranches(newYes, newNo);
                }}
                style={inputStyle}
              >
                <option value="">Выберите связь</option>
                {sortedOutgoing.map(oe => (
                  <option key={oe.id} value={oe.id}>
                    → {targetStepTitle(oe.target)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={isReadOnly || !yesEdge || !noEdge}
              onClick={swapConditionBranches}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #475569',
                background: '#1e293b',
                color: '#e2e8f0',
                cursor: isReadOnly || !yesEdge || !noEdge ? 'not-allowed' : 'pointer',
                opacity: !yesEdge || !noEdge ? 0.5 : 1,
              }}
            >
              Поменять Да и Нет местами
            </button>
            {sortedOutgoing.some(e => !getEdgeConditionBranch(e)) && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                У части связей ещё нет метки — выберите Да/Нет в списках выше (или пересохраните
                сценарий: метки проставятся автоматически для первых двух рёбер).
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: showAdvanced ? '#1a1a2e' : 'transparent',
            border: '1px solid #374151',
            borderRadius: 8,
            color: '#9ca3af',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>⚙️ Расширенные настройки</span>
          <span style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </button>

        {showAdvanced && conditionKeyField && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              Только если нужно читать значение по другому имени (редко). Иначе оставьте пустым.
            </div>
            <div style={{ ...cardStyle, marginBottom: 10 }}>
              <div style={labelStyle}>{conditionKeyField.label || conditionKeyField.name}</div>
              <FieldRenderer
                field={conditionKeyField}
                value={settings.conditionKey ?? conditionKeyField.default ?? ''}
                onChange={v => onFieldChange('conditionKey', v)}
                allSettings={settings}
                isReadOnly={isReadOnly}
                blockId="condition"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
