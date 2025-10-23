import { BRAND_AMBER, DANGER_RED } from '../../ui/tokens';

export const TYPE_BORDER = {
  default: BRAND_AMBER,
  start: '#4A90E2',
  message: '#4A90E2',
  action: '#2ECC71',
  condition: '#9B59B6',
  api: '#00BCD4',
  end: DANGER_RED,
} as const;
