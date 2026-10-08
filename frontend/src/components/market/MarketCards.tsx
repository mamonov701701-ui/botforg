import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ClipboardList, LayoutTemplate, Star, UsersRound, Workflow } from 'lucide-react';
import './market-cards.css';

export type MarketVisualKind = 'template' | 'scenario' | 'custom-block' | 'order' | 'performer';

const visualLabels: Record<MarketVisualKind, string> = {
  template: 'Шаблон',
  scenario: 'Сценарий',
  'custom-block': 'Кастомный блок',
  order: 'Заказ',
  performer: 'Исполнитель',
};
const visualIcons = {
  template: LayoutTemplate,
  scenario: Workflow,
  'custom-block': Boxes,
  order: ClipboardList,
  performer: UsersRound,
};

export function MarketTypeVisual({ kind }: { kind: MarketVisualKind }) {
  const Icon = visualIcons[kind];
  return (
    <div className="bf-market-card__visual" aria-label={visualLabels[kind]}>
      <Icon aria-hidden="true" className="bf-market-card__icon" />
      <span className="bf-market-card__type">{visualLabels[kind]}</span>
    </div>
  );
}

export function MarketGrid({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="bf-market-catalog" data-testid={testId}>
      <div className="bf-market-grid">{children}</div>
    </div>
  );
}

export function MarketCatalogCard({
  kind,
  title,
  description,
  href,
  author,
  meta,
  rating,
  ratingCount,
  priceLabel,
  free,
  action,
  testId,
  itemId,
  badge,
}: {
  kind: MarketVisualKind;
  title: string;
  description?: string | null;
  href: string;
  author?: string | null;
  meta?: ReactNode;
  rating?: number | null;
  ratingCount?: number | null;
  priceLabel?: string;
  free?: boolean;
  action: ReactNode;
  testId?: string;
  itemId?: number;
  badge?: string;
}) {
  return (
    <article className="bf-market-card" data-testid={testId} data-item-id={itemId}>
      <div className="bf-market-card__visual-wrap">
        <MarketTypeVisual kind={kind} />
        {badge && <span className="bf-market-card__badge">{badge}</span>}
      </div>
      <div className="bf-market-card__body">
        <Link to={href} className="bf-market-card__title" title={title}>
          {title}
        </Link>
        <p className="bf-market-card__description">
          {description || 'Описание пока не добавлено.'}
        </p>
        {author && <p className="bf-market-card__author">Автор: {author}</p>}
        {meta && <p className="bf-market-card__meta">{meta}</p>}
        {rating != null && (
          <p className="bf-market-card__rating">
            <Star size={14} aria-hidden="true" /> {rating} ({ratingCount ?? 0})
          </p>
        )}
        <div className="bf-market-card__footer">
          {priceLabel && (
            <strong className={`bf-market-card__price${free ? ' is-free' : ''}`}>
              {priceLabel}
            </strong>
          )}
          <div className="bf-market-card__action">{action}</div>
        </div>
      </div>
    </article>
  );
}

export function MarketManagementCard({
  kind = 'template',
  title,
  children,
  action,
  testId,
}: {
  kind?: MarketVisualKind;
  title: string;
  children?: ReactNode;
  action: ReactNode;
  testId?: string;
}) {
  return (
    <article className="bf-market-card bf-market-card--management" data-testid={testId}>
      <div className="bf-market-card__visual-wrap">
        <MarketTypeVisual kind={kind} />
      </div>
      <div className="bf-market-card__body">
        <h3 className="bf-market-card__title" title={title}>
          {title}
        </h3>
        <div className="bf-market-management-card__details">{children}</div>
        <div className="bf-market-card__footer">
          <div className="bf-market-card__action">{action}</div>
        </div>
      </div>
    </article>
  );
}

export function MarketStickyToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="bf-market-sticky-toolbar" data-testid="market-sticky-toolbar">
      {children}
    </div>
  );
}
