/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSelection } from './useSelection.js';

// Mock iTwin.js core-frontend
const mockRemoveListener = vi.fn();
const mockEmptyAll = vi.fn();

const createMockIModel = (initialIds: string[] = []) => ({
  selectionSet: {
    elements: new Set(initialIds),
    onChanged: {
      addListener: vi.fn(() => mockRemoveListener),
    },
    emptyAll: mockEmptyAll,
  },
});

describe('useSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty selection when iModel is null', () => {
    const { result } = renderHook(() => useSelection(null));

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('should initialize with current selection', () => {
    const mockIModel = createMockIModel(['element-1', 'element-2']);

    const { result } = renderHook(() => useSelection(mockIModel as any));

    expect(result.current.selectedIds.has('element-1')).toBe(true);
    expect(result.current.selectedIds.has('element-2')).toBe(true);
    expect(result.current.count).toBe(2);
  });

  it('should subscribe to selection changes', () => {
    const mockIModel = createMockIModel();

    renderHook(() => useSelection(mockIModel as any));

    expect(mockIModel.selectionSet.onChanged.addListener).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const mockIModel = createMockIModel();

    const { unmount } = renderHook(() => useSelection(mockIModel as any));

    unmount();

    expect(mockRemoveListener).toHaveBeenCalled();
  });

  it('should update selection when selection changes', async () => {
     
    let changeListener: Function | null = null;
    const mockIModel = {
      selectionSet: {
        elements: new Set(['initial']),
        onChanged: {
          addListener: vi.fn((listener) => {
            changeListener = listener;
            return mockRemoveListener;
          }),
        },
        emptyAll: mockEmptyAll,
      },
    };

    const { result } = renderHook(() => useSelection(mockIModel as any));

    expect(result.current.selectedIds.has('initial')).toBe(true);

    // Simulate selection change
    mockIModel.selectionSet.elements = new Set(['new-1', 'new-2']);

    act(() => {
      changeListener?.({} as any);
    });

    await waitFor(() => {
      expect(result.current.selectedIds.has('new-1')).toBe(true);
      expect(result.current.selectedIds.has('new-2')).toBe(true);
      expect(result.current.selectedIds.has('initial')).toBe(false);
      expect(result.current.count).toBe(2);
    });
  });

  it('should clear selection when iModel becomes null', () => {
    const mockIModel = createMockIModel(['element-1']);

    const { result, rerender } = renderHook(
      ({ iModel }) => useSelection(iModel as any),
      { initialProps: { iModel: mockIModel } }
    );

    expect(result.current.count).toBe(1);

    rerender({ iModel: null });

    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('should call emptyAll when clear is invoked', () => {
    const mockIModel = createMockIModel(['element-1', 'element-2']);

    const { result } = renderHook(() => useSelection(mockIModel as any));

    act(() => {
      result.current.clear();
    });

    expect(mockEmptyAll).toHaveBeenCalled();
  });

  it('should not throw when clear is called without iModel', () => {
    const { result } = renderHook(() => useSelection(null));

    expect(() => {
      act(() => {
        result.current.clear();
      });
    }).not.toThrow();
  });

  it('should re-subscribe when iModel changes', () => {
    const mockIModel1 = createMockIModel(['a']);
    const mockIModel2 = createMockIModel(['b']);

    const { rerender } = renderHook(
      ({ iModel }) => useSelection(iModel as any),
      { initialProps: { iModel: mockIModel1 } }
    );

    expect(mockIModel1.selectionSet.onChanged.addListener).toHaveBeenCalled();

    rerender({ iModel: mockIModel2 });

    expect(mockRemoveListener).toHaveBeenCalled();
    expect(mockIModel2.selectionSet.onChanged.addListener).toHaveBeenCalled();
  });
});
