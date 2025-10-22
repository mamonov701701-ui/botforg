export interface BlockConfigField {
  name: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'image' | 'file' | 'datetime' | 'duration';
  label: string;
  required: boolean;
  default?: any;
  options?: string[];
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

