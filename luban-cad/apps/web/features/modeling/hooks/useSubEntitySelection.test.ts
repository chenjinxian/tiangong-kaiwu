/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSubEntitySelection } from './useSubEntitySelection';
import { IModelConnection } from '@itwin/core-frontend';

describe('useSubEntitySelection', () => {
  const mockIModel = {
    selectionSet: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  } as unknown as IModelConnection;

  it('should initialize with empty selection', () => {
    const { result } = renderHook(() => useSubEntitySelection(mockIModel));
    expect(result.current.selectedFaces).toEqual([]);
    expect(result.current.selectedEdges).toEqual([]);
    expect(result.current.selectedVertices).toEqual([]);
  });

  it('should track face selection', () => {
    const { result } = renderHook(() => useSubEntitySelection(mockIModel));

    act(() => {
      result.current.selectFace('face-1');
    });

    expect(result.current.selectedFaces).toContain('face-1');
    expect(result.current.selectionCount).toBe(1);
  });

  it('should allow multi-select with modifier key', () => {
    const { result } = renderHook(() => useSubEntitySelection(mockIModel));

    act(() => {
      result.current.selectFace('face-1', { multiSelect: true });
      result.current.selectFace('face-2', { multiSelect: true });
    });

    expect(result.current.selectedFaces).toHaveLength(2);
  });

  it('should clear selection', () => {
    const { result } = renderHook(() => useSubEntitySelection(mockIModel));

    act(() => {
      result.current.selectFace('face-1');
      result.current.clearSelection();
    });

    expect(result.current.selectedFaces).toEqual([]);
    expect(result.current.selectionCount).toBe(0);
  });
});
