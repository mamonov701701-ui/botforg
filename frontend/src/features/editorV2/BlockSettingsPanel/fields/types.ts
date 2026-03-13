import { BlockConfigField } from '../../../../types/blocks';

export interface FieldProps {
  field: BlockConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  /** Текущие настройки блока — используются для зависимых/сложных полей */
  allSettings?: Record<string, any>;
  /** Сбрасывает поле к значению по умолчанию блок-схемы (если оно есть) */
  onResetToDefault?: () => void;
  /** Разрешено ли редактирование (демо-режим / read-only) */
  isReadOnly?: boolean;
}
