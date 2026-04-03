import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ValidationModal from '@/features/editorV2/ValidationModal';
import { useValidationStore } from '@/stores/validationStore';
import { useScenarioDiagnosticsStore } from '@/stores/scenarioDiagnosticsStore';
import { useScenarioStore } from '@/stores/scenarioStore';

describe('ValidationModal navigation', () => {
  beforeEach(() => {
    useValidationStore.getState().clearValidation();
    useScenarioDiagnosticsStore.getState().setDiagnostics([]);
    useScenarioStore.setState({
      currentScenarioId: 1,
      currentState: {
        id: 1,
        name: 'S',
        icon: 'X',
        nodes: [
          {
            id: 'node-42',
            type: 'default',
            position: { x: 0, y: 0 },
            data: { blockId: 'message', title: 'Привет', settings: {} },
          },
        ],
        edges: [],
        isDirty: false,
        hasValidationErrors: true,
      },
    } as any);
  });

  it('calls onNavigateToNode with blockId when consistency row is clicked', () => {
    const onNavigateToNode = vi.fn();
    useScenarioDiagnosticsStore.getState().setDiagnostics([
      {
        severity: 'error',
        blockId: 'node-42',
        code: 'MissingOutgoingEdge',
        message: 'Нет выхода',
      },
    ]);

    render(
      <ValidationModal isOpen onClose={() => undefined} onNavigateToNode={onNavigateToNode} />
    );

    const btn = screen.getByText('На схему →').closest('button');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onNavigateToNode).toHaveBeenCalledWith('node-42');
  });
});
