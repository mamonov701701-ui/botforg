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
    | 'media_upload' // Загрузка медиа-файла или URL
    | 'media_list'; // Список медиа-файлов (несколько)
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
  /** Скрыть в библиотеке (не отдаётся с бэкенда при true) */
  disabled?: boolean;
  source?: 'system' | 'custom';
  stableBlockId?: string;
  blockVersionId?: number;
  version?: number;
  lifecycleStatus?: 'draft' | 'published' | 'archived';
  runtimeBlockId?: string;
  passport?: Record<string, unknown>;
  userGuide?: Record<string, unknown>;
}

export interface CustomBlockDraftPayload {
  title: string;
  description: string;
  purpose: string;
  when_to_use: string;
  category: string;
  inputs: Record<string, unknown>[];
  outputs: Record<string, unknown>[];
  config_schema: BlockConfigField[];
  connection_rules: Record<string, unknown>;
  runtime_compatibility: string;
  simulator_compatibility: boolean;
  supported_channels: string[];
  limitations: string[];
  examples: string[];
  user_guide: Record<string, unknown>;
  internal_code?: string;
  runtime_definition: Record<string, unknown>;
}

export interface CustomBlockVersion {
  id: number;
  stable_block_id: string;
  owner_user_id: number;
  version: number;
  parent_version_id?: number | null;
  status: 'draft' | 'published' | 'archived';
  status_label: 'Черновик' | 'Опубликован' | 'Архив';
  title: string;
  description: string;
  category: string;
  passport: Record<string, any>;
  user_guide: Record<string, any>;
  runtime_kind: string;
  runtime_definition: Record<string, any>;
  validation_result?: { valid: boolean; errors: string[]; warnings: string[] } | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  archived_at?: string | null;
}

export type PlanType = 'free' | 'pro' | 'enterprise';
export type RoleType = 'owner' | 'admin' | 'manager_template' | 'developer' | 'support' | 'viewer';

export type { MessageButtonAction, MessageFlowButton } from '../utils/messageButton';
