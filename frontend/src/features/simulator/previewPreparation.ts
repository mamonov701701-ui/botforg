import type { Node } from 'reactflow';
import type { RunStepResult } from './scenarioRunner';

export function previewPreparationFailure(
  nodes: Node[],
  handleIssues: string[],
  stepResult: RunStepResult | null | undefined
): string | null {
  const context = stepResult?.context;
  if (!context) {
    return 'Не удалось запустить предпросмотр сценария: не удалось построить состояние выполнения.';
  }
  if (context.history.length > 0) return null;

  // An empty history is expected before the server executes a Custom Block and
  // for silent terminal/wait paths. It is not a graph-validation failure.
  if (
    stepResult.stopReason === '__custom_server__' ||
    stepResult.pendingWaitMs != null ||
    context.currentNodeId == null
  ) {
    return null;
  }

  const current = nodes.find(node => node.id === context.currentNodeId);
  const title = String(current?.data?.title || current?.data?.label || context.currentNodeId);
  if (handleIssues.length > 0) {
    return `Не удалось запустить предпросмотр. Проблемная связь: ${handleIssues[0]}.`;
  }
  if (stepResult.stopReason) {
    return `Не удалось запустить предпросмотр. Блок «${title}»: ${stepResult.stopReason}.`;
  }
  return null;
}

export function previewHandleCompatibilityNotice(handleIssues: string[]): string | null {
  if (handleIssues.length === 0) return null;
  const details = handleIssues.slice(0, 3).join('; ');
  return `Часть связей была подстроена под текущий редактор: ${details}.`;
}

const CUSTOM_PREVIEW_ERROR_MESSAGES: Record<string, string> = {
  runner_feature_disabled:
    'Безопасное выполнение кастомных блоков не включено в Backend (бэкенде).',
  runner_url_missing: 'Backend (бэкенд) не получил адрес Development Runner (раннера разработки).',
  runner_connection_refused:
    'Development Runner запущен не на каноническом адресе или не принимает соединение.',
  runner_unavailable:
    'Сервис безопасного выполнения недоступен. Убедитесь, что Development Runner запущен.',
  runner_authentication_failed:
    'Сервис безопасного выполнения настроен неверно. Обратитесь к администратору.',
  timeout: 'Кастомный блок превысил допустимое время выполнения.',
  resource_limit: 'Кастомный блок превысил допустимые лимиты ресурсов.',
  policy_violation: 'Выполнение кастомного блока остановлено политикой безопасности.',
  runtime_error: 'Код JavaScript завершился с ошибкой.',
  invalid_output: 'Код JavaScript вернул некорректный результат или неизвестный маршрут.',
  validation_error: 'Спецификация выполнения версии кастомного блока некорректна.',
  authorization_error: 'Точная версия кастомного блока недоступна для выполнения.',
};

export function customPreviewErrorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  return (
    CUSTOM_PREVIEW_ERROR_MESSAGES[code] ||
    'Кастомный блок не выполнился в безопасной среде предпросмотра.'
  );
}
