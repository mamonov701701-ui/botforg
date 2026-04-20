/** Человекочитаемые подписи типов блоков для CRM «Где встречается». */

const MAP: Record<string, string> = {
  start: 'Начало',
  message: 'Сообщение',
  input: 'Ввод',
  wait: 'Ожидание',
  condition: 'Выбор / условие',
  action: 'Данные пользователя',
  variable: 'Переменная',
  go_to_scenario: 'Переход в сценарий',
  node: 'Блок',
};

export function crmBlockTypeLabel(blockType: string): string {
  const t = (blockType || '').trim();
  if (!t) return 'Блок';
  const k = t.toLowerCase();
  return MAP[k] || t;
}
