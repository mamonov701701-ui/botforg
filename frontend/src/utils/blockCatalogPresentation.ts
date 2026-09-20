import type { BlockCatalogItem, BlockConfigField } from '../types/blocks';
import { mergeClientCatalogBlocks } from '../constants/clientCatalogMerge';
import {
  BLOCK_GUIDE_RU,
  LEARNING_BLOCK_TEASER,
  LEARNING_BLOCK_TITLE,
} from '../pages/features/blockGuideRu';
import {
  BLOCK_CONNECTION_CONTRACT,
  CANONICAL_BLOCK_CODES,
  LEGACY_BLOCK_ALIASES,
} from './blockContracts';

export const BLOCK_CATEGORY_LABELS: Record<BlockCatalogItem['category'], string> = {
  basic: 'Базовые',
  business: 'Бизнес',
  service: 'Сервисы и связь',
  system: 'Системные',
  ai: 'Искусственный интеллект',
  custom: 'Расширения',
};

const FIELD_TYPE_LABELS: Record<BlockConfigField['type'], string> = {
  string: 'Короткий текст',
  text: 'Текст сообщения',
  number: 'Число',
  boolean: 'Переключатель',
  select: 'Выбор варианта',
  multiselect: 'Выбор нескольких вариантов',
  json: 'Набор правил',
  image: 'Изображение',
  file: 'Файл',
  datetime: 'Дата и время',
  duration: 'Продолжительность',
  scenario_select: 'Выбор сценария',
  node_select: 'Выбор шага сценария',
  button_list: 'Кнопки',
  media_upload: 'Медиафайл',
  media_list: 'Медиафайлы',
};

const USER_HIDDEN_LEGACY_IDS = new Set(['variable', 'action']);

const FIELD_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  message: {
    text: 'Текст сообщения',
    buttons: 'Кнопки',
    mediaType: 'Тип медиа',
    mediaList: 'Медиафайлы',
    parseMode: 'Форматирование текста',
  },
  input: {
    question_text: 'Текст вопроса',
    variable_key: 'Имя переменной',
    variable_label: 'Название переменной',
    placeholder: 'Подсказка в поле ввода',
    trim: 'Убирать пробелы по краям',
    validation: 'Правила проверки',
    error_message: 'Сообщение об ошибке',
  },
  condition: {
    variable: 'Значение для проверки',
    conditionKey: 'Дополнительный источник',
    operator: 'Условие сравнения',
    value: 'Значение для сравнения',
  },
  set_variable: {
    key: 'Имя переменной',
    value: 'Значение',
    value_type: 'Тип значения',
    interpolation: 'Подставлять значения переменных',
    overwrite: 'Разрешить перезапись',
  },
};

export function blockFieldTypeLabel(type: BlockConfigField['type']): string {
  return FIELD_TYPE_LABELS[type] || 'Параметр';
}

export function blockFieldDisplayLabel(blockId: string, field: BlockConfigField): string {
  return FIELD_LABEL_OVERRIDES[blockId]?.[field.name] || field.label;
}

export function blockDisplayTitle(block: BlockCatalogItem): string {
  return LEARNING_BLOCK_TITLE[block.id] || block.title;
}

export function blockSummary(block: BlockCatalogItem): string {
  return LEARNING_BLOCK_TEASER[block.id] || block.description;
}

export function userVisibleBlocks(blocks: BlockCatalogItem[]): BlockCatalogItem[] {
  return mergeClientCatalogBlocks(blocks).filter(
    block => !USER_HIDDEN_LEGACY_IDS.has(block.id) && !block.disabled
  );
}

export function blockHasGuide(blockId: string): boolean {
  return Boolean(BLOCK_GUIDE_RU[blockId]);
}

export function blockContractClassification(blockId: string): string {
  if ((CANONICAL_BLOCK_CODES as readonly string[]).includes(blockId)) return 'Канонический';
  if (Object.prototype.hasOwnProperty.call(LEGACY_BLOCK_ALIASES, blockId)) {
    return 'Совместимость со старыми сценариями';
  }
  return 'Вне базового контракта 7.6A';
}

export function blockContractSummary(blockId: string): string {
  const contract = BLOCK_CONNECTION_CONTRACT[blockId];
  if (!contract) return 'Специальный контракт; подробности определяются реализацией блока.';
  const incoming = contract.incomingMax === null ? 'без ограничения' : String(contract.incomingMax);
  const outgoing = contract.outgoingMax === null ? 'без ограничения' : String(contract.outgoingMax);
  return `Входящие связи: ${incoming}. Исходящие связи: ${outgoing}. ${contract.terminal ? 'Завершает ветку.' : 'Не завершает ветку.'}`;
}
