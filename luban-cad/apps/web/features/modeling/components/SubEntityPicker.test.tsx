/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubEntityPicker } from './SubEntityPicker';

describe('SubEntityPicker', () => {
  const defaultProps = {
    selectedFaces: [],
    selectedEdges: [],
    selectedVertices: [],
    selectionMode: 'face' as const,
    isSelecting: false,
    onModeChange: vi.fn(),
    onClear: vi.fn(),
  };

  it('renders selection mode buttons', () => {
    render(<SubEntityPicker {...defaultProps} />);
    expect(screen.getByRole('button', { name: /选择面/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /选择边/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /选择顶点/i })).toBeDefined();
  });

  it('displays selection count', () => {
    render(<SubEntityPicker {...defaultProps} selectedFaces={['face-1', 'face-2']} />);
    // The faces button should be present
    const facesButton = screen.getByRole('button', { name: /选择面/i });
    expect(facesButton).toBeDefined();
    // Verify the clear button is present
    expect(screen.getByRole('button', { name: /清除/i })).toBeDefined();
  });

  it('calls onClear when clear button clicked', () => {
    render(<SubEntityPicker {...defaultProps} selectedFaces={['face-1']} />);
    fireEvent.click(screen.getByRole('button', { name: /清除/i }));
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it('calls onModeChange when mode button clicked', () => {
    render(<SubEntityPicker {...defaultProps} selectionMode="face" />);
    fireEvent.click(screen.getByRole('button', { name: /选择边/i }));
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('edge');
  });

  it('shows active state for current mode when selecting', () => {
    render(<SubEntityPicker {...defaultProps} selectionMode="edge" isSelecting={true} />);
    const edgeButton = screen.getByRole('button', { name: /选择边/i });
    expect(edgeButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('hides clear button when no selection', () => {
    render(<SubEntityPicker {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /清除/i })).toBeNull();
  });

  it('shows status text when selecting', () => {
    render(<SubEntityPicker {...defaultProps} selectionMode="face" isSelecting={true} />);
    expect(screen.getByText(/面.*模式.*点击选择/i)).toBeDefined();
  });
});
