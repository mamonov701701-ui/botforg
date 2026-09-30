import type { CustomBlockVersion } from '../types/blocks';

export const reviewStateLabel = (state?: CustomBlockVersion['review_state']) =>
  ({
    draft: 'Черновик',
    admin_review_pending: 'На проверке',
    approved: 'Одобрен',
    needs_changes: 'Нужны изменения',
    rejected: 'Отклонён',
    security_review_failed: 'Проверка безопасности недоступна',
  })[state || 'draft'];

export const reviewDecisionLabel = (decision: string) =>
  ({ approve: 'Одобрено', needs_changes: 'Нужны изменения', reject: 'Отклонено' })[decision] ||
  'Решение администратора';

export const reviewEventLabel = (event: string) =>
  ({
    review_submitted: 'Отправлено на проверку',
    automated_validation_completed: 'Автоматическая проверка завершена',
    automated_validation_failed: 'Автоматическая проверка не пройдена',
    ai_security_review_created: 'Отчёт проверки безопасности подготовлен',
    ai_security_review_failed: 'Проверка безопасности недоступна',
    admin_review_pending: 'Передано администратору',
    admin_approve: 'Одобрено администратором',
    admin_needs_changes: 'Администратор запросил изменения',
    admin_reject: 'Отклонено администратором',
    review_invalidated: 'Проверка сброшена после изменения версии',
    publish_completed: 'Версия опубликована',
  })[event] || 'Событие процесса проверки';

export const reviewActorLabel = (actor: string) =>
  ({ author: 'Автор', admin: 'Администратор', system: 'Система' })[actor] || 'Система';

export const securityReportLabel = (item: CustomBlockVersion) => {
  const report = item.latest_security_report;
  if (!report) return 'Отчёт ещё не сформирован.';
  if (report.status === 'failed')
    return 'Проверка безопасности недоступна. Публикация заблокирована.';
  return item.review_state === 'admin_review_pending'
    ? 'Предварительная проверка безопасности завершена. Требуется решение администратора.'
    : 'Предварительная проверка безопасности завершена.';
};

export const primaryVersionStatusLabel = (item: CustomBlockVersion) => {
  if (item.status !== 'draft') return item.status_label;
  return reviewStateLabel(item.review_state);
};
