import type { SimulatorMessage } from './scenarioRunner';

export type PreviewHistoryItem = SimulatorMessage;

const TECHNICAL_TRACE_MARKERS = [
  'execute_block',
  'leave_block',
  'enter_scenario',
  'trace',
  'blockid',
  'scenarioid',
];

export function getVisiblePreviewHistory(history: PreviewHistoryItem[]): PreviewHistoryItem[] {
  return history.filter(item => {
    const text = String(item.text || '').toLowerCase();
    return !TECHNICAL_TRACE_MARKERS.some(marker => text.includes(marker));
  });
}
