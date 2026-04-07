export type MessageFormatValue = 'Plain' | 'Markdown' | 'HTML';
export type VariableDataTypeValue =
  | 'string'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'phone'
  | 'email'
  | 'date';
export type ChannelValue = 'telegram' | 'whatsapp' | 'webchat' | 'max';

export function getMessageFormatLabel(value: MessageFormatValue): string {
  switch (value) {
    case 'Plain':
      return 'Обычный текст';
    case 'Markdown':
      return 'Форматированный текст (Markdown)';
    case 'HTML':
      return 'HTML-код (для разработчиков)';
    default:
      return 'Обычный текст';
  }
}

export function getVariableDataTypeLabel(value: string): string {
  const v = (value || '').toLowerCase() as VariableDataTypeValue;
  switch (v) {
    case 'string':
      return 'Текст';
    case 'number':
      return 'Число';
    case 'boolean':
      return 'Да / Нет';
    case 'datetime':
      return 'Дата и время';
    case 'json':
      return 'Структура данных (JSON)';
    case 'phone':
      return 'Телефон';
    case 'email':
      return 'Email';
    case 'date':
      return 'Дата';
    default:
      return value || 'Текст';
  }
}

export function getChannelLabel(value: string): string {
  const v = (value || '').toLowerCase() as ChannelValue;
  switch (v) {
    case 'telegram':
      return 'Telegram';
    case 'whatsapp':
      return 'WhatsApp';
    case 'webchat':
      return 'Веб-чат';
    case 'max':
      return 'MAX';
    default:
      return value || '—';
  }
}
