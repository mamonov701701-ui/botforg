export type UserDataMode = 'tag' | 'status' | 'field';
export type TagAction = 'add' | 'remove';
export type StatusAction = 'set' | 'clear';
export type FieldAction = 'set' | 'clear';

export interface NormalizedActionSettings {
  mode: UserDataMode | null;
  tagAction: TagAction | null;
  tag: string;
  statusAction: StatusAction | null;
  status: string;
  fieldAction: FieldAction | null;
  fieldKey: string;
  fieldValue: string;
  message: string;
}

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Совместимость: читает новую схему и legacy-настройки старого блока "Действие". */
export function normalizeActionSettings(
  settings: Record<string, unknown>
): NormalizedActionSettings {
  const modeRaw = asTrimmedString(settings.mode);
  const mode: UserDataMode | null =
    modeRaw === 'tag' || modeRaw === 'status' || modeRaw === 'field' ? modeRaw : null;

  const out: NormalizedActionSettings = {
    mode,
    tagAction: null,
    tag: asTrimmedString(settings.tag),
    statusAction: null,
    status: asTrimmedString(settings.status),
    fieldAction: null,
    fieldKey: asTrimmedString(settings.fieldKey),
    fieldValue: typeof settings.fieldValue === 'string' ? settings.fieldValue : '',
    message:
      typeof settings.message === 'string'
        ? settings.message
        : typeof settings.text === 'string'
          ? settings.text
          : '',
  };

  if (mode === 'tag') {
    const a = asTrimmedString(settings.tagAction);
    out.tagAction = a === 'add' || a === 'remove' ? a : null;
    return out;
  }

  if (mode === 'status') {
    const a = asTrimmedString(settings.statusAction);
    out.statusAction = a === 'set' || a === 'clear' ? a : null;
    return out;
  }

  if (mode === 'field') {
    const a = asTrimmedString(settings.fieldAction);
    out.fieldAction = a === 'set' || a === 'clear' ? a : null;
    return out;
  }

  // legacy: actionType + tag
  const oldActionType = asTrimmedString(settings.actionType);
  if (oldActionType === 'add_tag' || oldActionType === 'remove_tag') {
    out.mode = 'tag';
    out.tagAction = oldActionType === 'add_tag' ? 'add' : 'remove';
    return out;
  }

  // legacy: setVariable + value (+ optional text)
  const oldVar = asTrimmedString(settings.setVariable);
  if (oldVar) {
    out.mode = 'field';
    out.fieldAction = 'set';
    out.fieldKey = oldVar;
    out.fieldValue =
      typeof settings.value === 'string' ? settings.value : String(settings.value ?? '');
    return out;
  }

  return out;
}

export function actionSummaryText(s: NormalizedActionSettings): string {
  if (s.mode === 'tag') {
    if (!s.tag) return 'Действие не настроено';
    if (s.tagAction === 'remove') return `Удалить тег: ${s.tag}`;
    if (s.tagAction === 'add') return `Добавить тег: ${s.tag}`;
    return 'Действие не настроено';
  }
  if (s.mode === 'status') {
    if (s.statusAction === 'clear') return 'Очистить статус';
    if (s.statusAction === 'set' && s.status) return `Установить статус: ${s.status}`;
    return 'Действие не настроено';
  }
  if (s.mode === 'field') {
    if (!s.fieldKey) return 'Действие не настроено';
    if (s.fieldAction === 'clear') return `Очистить поле "${s.fieldKey}"`;
    if (s.fieldAction === 'set' && s.fieldValue.trim())
      return `Поле "${s.fieldKey}": ${s.fieldValue.trim()}`;
    return 'Действие не настроено';
  }
  return 'Действие не настроено';
}

export function canonicalizeActionSettings(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const s = normalizeActionSettings(settings);
  const out: Record<string, unknown> = {};
  if (s.mode) out.mode = s.mode;
  if (s.mode === 'tag') {
    if (s.tagAction) out.tagAction = s.tagAction;
    if (s.tag) out.tag = s.tag;
    // ВАЖНО: backend runtime пока ожидает legacy actionType для тегов.
    if (s.tagAction === 'add') out.actionType = 'add_tag';
    if (s.tagAction === 'remove') out.actionType = 'remove_tag';
  }
  if (s.mode === 'status') {
    if (s.statusAction) out.statusAction = s.statusAction;
    if (s.statusAction === 'set' && s.status) out.status = s.status;
  }
  if (s.mode === 'field') {
    if (s.fieldAction) out.fieldAction = s.fieldAction;
    if (s.fieldKey) out.fieldKey = s.fieldKey;
    if (s.fieldAction === 'set' && s.fieldValue.trim()) out.fieldValue = s.fieldValue;
  }
  if (s.message.trim()) out.message = s.message.trim();
  // legacy совместимость: старый runtime мог читать текст из text.
  if (s.message.trim()) out.text = s.message.trim();
  return out;
}
