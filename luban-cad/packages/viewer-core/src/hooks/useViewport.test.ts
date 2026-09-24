/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for useViewport hook
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewport } from './useViewport.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelApp: {
    viewManager: {
      addViewport: vi.fn(),
      dropViewport: vi.fn(),
    },
    tools: {
      run: vi.fn(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ScreenViewport: {
    create: vi.fn(),
  },
}));

describe('useViewport', () => {
  it('should return initial state', () => {
    const viewportRef = { current: null };
    const { result } = renderHook(() => useViewport({
      iModel: undefined,
      viewportRef,
    }));

    expect(result.current.viewport).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle missing iModel', () => {
    const viewportRef = { current: document.createElement('div') };
    const { result } = renderHook(() => useViewport({
      iModel: undefined,
      viewportRef,
    }));

    expect(result.current.viewport).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
