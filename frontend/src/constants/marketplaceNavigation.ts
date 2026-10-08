export type MarketSectionId =
  | 'templates'
  | 'scenarios'
  | 'custom-blocks'
  | 'customers'
  | 'freelancers';

export const MARKET_SECTION_TABS: { id: MarketSectionId; label: string }[] = [
  { id: 'templates', label: 'Шаблоны' },
  { id: 'scenarios', label: 'Сценарии' },
  { id: 'custom-blocks', label: 'Кастомные блоки' },
  { id: 'customers', label: 'Заказчики' },
  { id: 'freelancers', label: 'Исполнители' },
];

export const MARKETPLACE_CATEGORIES = [
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'support', label: 'Поддержка' },
  { id: 'automation', label: 'Автоматизация' },
  { id: 'marketing', label: 'Маркетинг' },
  { id: 'other', label: 'Другое' },
] as const;

export function marketplaceCategoryLabel(category: string | null | undefined): string {
  return MARKETPLACE_CATEGORIES.find(item => item.id === category)?.label || 'Другое';
}

export function isCurrentCustomBlockOffer(item: {
  commercial_mode: string;
  access_policy: string;
  price_amount?: string | number | null;
  price_currency?: string | null;
}): boolean {
  return (
    (item.commercial_mode === 'free' && item.access_policy === 'self_install') ||
    (item.commercial_mode === 'paid' &&
      item.access_policy === 'explicit_grant' &&
      Number(item.price_amount) > 0 &&
      !!item.price_currency)
  );
}

export function marketplacePriceLabel(
  amount: string | number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || !currency) return '';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

export function marketSectionPath(section: MarketSectionId): string {
  if (section === 'custom-blocks') return '/market/custom-blocks';
  if (section === 'templates') return '/market';
  return `/market?section=${section}`;
}
