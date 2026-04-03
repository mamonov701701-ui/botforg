import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorValidationSummaryBar } from '@/features/editorV2/EditorValidationSummaryBar';

describe('EditorValidationSummaryBar', () => {
  it('renders error and warning counts', () => {
    render(<EditorValidationSummaryBar errorNodeCount={2} warningCount={3} />);
    expect(screen.getByText(/2 ошибки/i)).toBeInTheDocument();
    expect(screen.getByText(/3 предупреждения/i)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<EditorValidationSummaryBar errorNodeCount={1} warningCount={0} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders null when clear and showWhenClear false', () => {
    const { container } = render(
      <EditorValidationSummaryBar errorNodeCount={0} warningCount={0} />
    );
    expect(container.firstChild).toBeNull();
  });
});
