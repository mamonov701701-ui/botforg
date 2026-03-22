/** Русские подписи тарифов для UI (значения в сторе/API: free / pro / enterprise). */
const PLAN_LABEL_RU: Record<string, string> = {
  free: 'Бесплатный',
  pro: 'Про',
  enterprise: 'Корпоративный',
};

export function planLabelRu(plan: string): string {
  return PLAN_LABEL_RU[plan.toLowerCase()] ?? plan;
}
