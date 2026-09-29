import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('reactflow', () => ({
  Handle: ({ id, type, style }: { id: string; type: string; style?: React.CSSProperties }) => (
    <span data-testid={`handle-${type}-${id}`} data-right={style?.right} />
  ),
  Position: { Top: 'top', Right: 'right' },
}));

import {
  CustomBlockNodeContent,
  customBlockNodeLayout,
} from '@/features/editorV2/CustomBlockNodeContent';

function routes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: index === 0 ? 'success' : `route_${index + 1}`,
    label: index === 0 ? 'Успех' : `Очень длинное отображаемое название маршрута ${index + 1}`,
  }));
}

describe('CustomBlockNodeContent layout', () => {
  it.each([1, 7, 15, 32])('keeps title and %i output rows in separate measured zones', count => {
    const layout = customBlockNodeLayout(count);
    const { container } = render(
      <CustomBlockNodeContent
        title="Очень длинное название кастомного блока, которое не должно пересекаться"
        icon="🧩"
        inputCount={1}
        routes={routes(count)}
      />
    );

    expect(screen.getByTestId('custom-block-title-zone')).toHaveStyle({
      height: `${layout.headerHeight}px`,
    });
    expect(
      screen.getByTitle('Очень длинное название кастомного блока, которое не должно пересекаться')
    ).toHaveStyle({
      overflow: 'hidden',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      whiteSpace: 'normal',
      WebkitLineClamp: '2',
    });
    expect(screen.getByTestId('custom-block-routes-zone')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-route-key]')).toHaveLength(count);
    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-success')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-success')).toHaveAttribute(
      'data-right',
      String(layout.outputHandleRight)
    );
    expect(Math.abs(layout.outputHandleRight)).toBeGreaterThanOrEqual(19.4);
    expect(layout.minHeight).toBe(108 + count * 32);
    expect(layout.routesOffset).toBeGreaterThan(0);
  });

  it('shows a short title without applying single-line truncation', () => {
    render(<CustomBlockNodeContent title="Короткий блок" inputCount={1} routes={routes(1)} />);
    expect(screen.getByTitle('Короткий блок')).toHaveTextContent('Короткий блок');
    expect(screen.getByTitle('Короткий блок')).toHaveStyle({ whiteSpace: 'normal' });
  });

  it('renders a terminal contract without an output zone', () => {
    render(<CustomBlockNodeContent title="Финиш" inputCount={0} routes={[]} />);
    expect(screen.queryByTestId('custom-block-routes-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/handle-/)).not.toBeInTheDocument();
    expect(customBlockNodeLayout(0).minHeight).toBe(84);
  });
});
