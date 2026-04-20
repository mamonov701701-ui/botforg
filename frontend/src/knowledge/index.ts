export * from './types';

export { message } from './blocks/message';
export { input } from './blocks/input';
export { choice } from './blocks/choice';
export { userData } from './blocks/user-data';
export { variable } from './blocks/variable';
export { wait } from './blocks/wait';

export { contacts } from './crm/contacts';
export { fields } from './crm/fields';
export { tags } from './crm/tags';
export { statuses } from './crm/statuses';
export { overview } from './crm/overview';
export { crmKnowledgeEntities, CRM_AGENT_RULES_RU } from './crm';

export { cabinetKnowledge } from './cabinet';
export { systemKnowledge } from './system';

import { message } from './blocks/message';
import { input } from './blocks/input';
import { choice } from './blocks/choice';
import { userData } from './blocks/user-data';
import { crmKnowledgeEntities } from './crm';

/** Единое ядро знаний по блокам сценария и CRM (для ассистента / внутренних сценариев). */
export const knowledge = {
  blocks: {
    message,
    input,
    choice,
    userData,
  },
  crm: crmKnowledgeEntities,
};
