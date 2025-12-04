export interface SelectOptionObject {
  value: string;
  label: string;
}

export type SelectOption = string | SelectOptionObject;

export interface BlockConfigField {
  name: string;
  type:
    | 'string'
    | 'text'
    | 'number'
    | 'boolean'
    | 'select'
    | 'multiselect'
    | 'json'
    | 'image'
    | 'file'
    | 'datetime'
    | 'duration'
    | 'scenario_select' // Выбор сценария из списка
    | 'node_select' // Выбор блока внутри сценария
    | 'button_list' // Список кнопок для сообщений
    | 'media_upload'; // Загрузка медиа-файла или URL
  label: string;
  required: boolean;
  default?: any;
  options?: SelectOption[];
  description?: string;
  placeholder?: string;
  dependsOn?: {
    field: string;
    value: any;
    invert?: boolean; // Инвертировать условие (показывать когда НЕ равно)
  };
  isAdvanced?: boolean; // Показывать в секции "Расширенные настройки"
}

export interface BlockCatalogItem {
  id: string;
  title: string;
  category: 'basic' | 'business' | 'service' | 'system' | 'ai' | 'custom';
  description: string;
  icon: string;
  color: string;
  planAccess: ('free' | 'pro' | 'enterprise')[];
  permissions: ('owner' | 'admin' | 'manager_template' | 'developer' | 'support' | 'viewer')[];
  configSchema: BlockConfigField[];
}

export type PlanType = 'free' | 'pro' | 'enterprise';
export type RoleType = 'owner' | 'admin' | 'manager_template' | 'developer' | 'support' | 'viewer';
