import { contacts } from './contacts';
import { fields } from './fields';
import { tags } from './tags';
import { statuses } from './statuses';
import { overview } from './overview';

export { contacts, fields, tags, statuses, overview };

export const crmKnowledgeEntities = {
  overview,
  contacts,
  fields,
  tags,
  statuses,
} as const;

export type CrmKnowledgeKey = keyof typeof crmKnowledgeEntities;

export { CRM_AGENT_RULES_RU } from './agentInstructions';
