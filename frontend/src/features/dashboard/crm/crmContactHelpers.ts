import {
  crmListUsers,
  type CrmEnvironmentFilter,
  type CrmUserListItem,
  type CrmUserListSort,
} from '../../../api/botCrm';

const MAX_ROWS = 2500;

/** Значение для фильтра «без статуса диалога» (совпадает с query `dialog`). */
export const SESSION_FILTER_NONE = '__none__';

/** Загрузка всех строк списка (постранично, с ограничением) для фильтров и сводок без новых API. */
export async function fetchAllContactRows(
  botId: number,
  params: {
    q?: string;
    channel?: string;
    tag_keys?: string;
    active_since?: string;
    active_until?: string;
    contact_status?: string;
    session_status?: string;
    has_phone?: boolean;
    has_email?: boolean;
    sort?: CrmUserListSort;
    environment: CrmEnvironmentFilter;
  }
): Promise<CrmUserListItem[]> {
  const out: CrmUserListItem[] = [];
  let page = 1;
  let total = Infinity;
  while (out.length < total && out.length < MAX_ROWS && page <= 50) {
    const res = await crmListUsers(botId, {
      ...params,
      page,
      page_size: 100,
    });
    total = res.total;
    out.push(...res.items);
    if (res.items.length === 0) break;
    page += 1;
  }
  return out;
}

export function aggregateSessionStatusCounts(rows: CrmUserListItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (r.session_status || '—').trim() || '—';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** Сводка по полю CtorBotUser.status (сценарий «Статус» / CRM). */
export function aggregateContactStatusCounts(rows: CrmUserListItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (r.contact_status || 'active').trim() || 'active';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
