import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MarketCatalogCard,
  MarketGrid,
  MarketManagementCard,
  MarketStickyToolbar,
} from '@/components/market/MarketCards';

describe('Responsive Market UI Standard', () => {
  it.each([
    ['template', 'Шаблон'],
    ['scenario', 'Сценарий'],
    ['custom-block', 'Кастомный блок'],
    ['order', 'Заказ'],
    ['performer', 'Исполнитель'],
  ] as const)('uses one catalog card structure for %s', (kind, label) => {
    render(
      <MemoryRouter>
        <MarketGrid>
          <MarketCatalogCard
            kind={kind}
            title="Товар"
            description="Описание"
            href="/market/items/1"
            author="Автор"
            meta="Категория"
            priceLabel="БЕСПЛАТНО"
            free
            action={<button type="button">Открыть</button>}
          />
        </MarketGrid>
      </MemoryRouter>
    );
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByRole('article').className).toContain('bf-market-card');
    expect(screen.getByRole('link', { name: 'Товар' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть' })).toBeTruthy();
    expect(screen.getByText('БЕСПЛАТНО')).toBeTruthy();
    expect(document.querySelector('.bf-market-grid')).toBeTruthy();
  });

  it('keeps management cards compact and search in a reusable sticky toolbar', () => {
    render(
      <>
        <MarketStickyToolbar>
          <input aria-label="Поиск" />
        </MarketStickyToolbar>
        <div className="bf-market-management-grid">
          <MarketManagementCard title="Размещение" action={<button>Управлять</button>}>
            <p>Связанный блок: QA User Block</p>
            <p>Точная версия: v1</p>
          </MarketManagementCard>
        </div>
      </>
    );
    expect(screen.getByTestId('market-sticky-toolbar').className).toBe('bf-market-sticky-toolbar');
    expect(screen.getByRole('article').className).toContain('bf-market-card--management');
    expect(screen.getByRole('article').querySelector('.bf-market-card__visual')).toBeTruthy();
    expect(screen.getByRole('article').querySelector('.bf-market-card__footer')).toBeTruthy();
    expect(screen.getByText('Связанный блок: QA User Block')).toBeTruthy();
  });

  it('defines container-based 2/3/4/5/6 columns and readable mobile controls', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/market/market-cards.css'),
      'utf8'
    );
    expect(css).toMatch(/container: market-catalog \/ inline-size/);
    for (const [width, columns] of [
      [0, 2],
      [600, 3],
      [900, 4],
      [1200, 5],
      [1500, 6],
    ]) {
      const section =
        width === 0
          ? css
          : css.slice(css.indexOf(`@container market-catalog (min-width: ${width}px)`));
      expect(section).toContain(`repeat(${columns}, minmax(0, 1fr))`);
    }
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('position: sticky');
    expect(css).toContain('min-width: 0');
  });

  it('declares the device-width viewport so mobile container queries use real layout width', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(
      /<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/>/
    );
  });
});
