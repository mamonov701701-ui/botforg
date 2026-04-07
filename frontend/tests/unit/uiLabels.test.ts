import { describe, it, expect } from 'vitest';
import { getMessageFormatLabel, getVariableDataTypeLabel, getChannelLabel } from '@/utils/uiLabels';

describe('uiLabels', () => {
  it('returns russian labels for message formats', () => {
    expect(getMessageFormatLabel('Plain')).toBe('Обычный текст');
    expect(getMessageFormatLabel('Markdown')).toBe('Форматированный текст (Markdown)');
    expect(getMessageFormatLabel('HTML')).toBe('HTML-код (для разработчиков)');
  });

  it('returns russian labels for variable data types', () => {
    expect(getVariableDataTypeLabel('string')).toBe('Текст');
    expect(getVariableDataTypeLabel('number')).toBe('Число');
    expect(getVariableDataTypeLabel('datetime')).toBe('Дата и время');
    expect(getVariableDataTypeLabel('json')).toBe('Структура данных (JSON)');
  });

  it('returns user-friendly channel labels', () => {
    expect(getChannelLabel('telegram')).toBe('Telegram');
    expect(getChannelLabel('whatsapp')).toBe('WhatsApp');
    expect(getChannelLabel('webchat')).toBe('Веб-чат');
    expect(getChannelLabel('max')).toBe('MAX');
  });
});
