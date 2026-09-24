/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock React Query - must be before imports
const mockInvalidateQueries = vi.fn();
const mockQueryFn = vi.fn();
const mockMutateFn = vi.fn();

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn((options) => ({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
      ...options,
    })),
    useMutation: vi.fn((options) => ({
      mutate: mockMutateFn,
      isPending: false,
      error: null,
      ...options,
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
  };
});

// Mock briefcase API
const mockAcquire = vi.fn();
const mockRelease = vi.fn();
const mockGetByImodel = vi.fn();
const mockList = vi.fn();

vi.mock('../services/briefcases/client.js', () => ({
  briefcaseApi: {
    acquire: (...args: any[]) => mockAcquire(...args),
    release: (...args: any[]) => mockRelease(...args),
    getByImodel: (...args: any[]) => mockGetByImodel(...args),
    list: (...args: any[]) => mockList(...args),
  },
}));

// Import after mocks
import { useBriefcase, useBriefcaseList, useReleaseDialog } from './useBriefcase.js';

describe('useReleaseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with closed state', () => {
    const { result } = renderHook(() => useReleaseDialog());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('should open dialog', async () => {
    const { result } = renderHook(() => useReleaseDialog());

    await act(async () => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('should open dialog with pending changes', async () => {
    const { result } = renderHook(() => useReleaseDialog());

    await act(async () => {
      result.current.open(true);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.hasPendingChanges).toBe(true);
  });

  it('should close dialog', async () => {
    const { result } = renderHook(() => useReleaseDialog());

    await act(async () => {
      result.current.open(true);
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.hasPendingChanges).toBe(true);
  });

  it('should handle multiple open/close cycles', async () => {
    const { result } = renderHook(() => useReleaseDialog());

    await act(async () => {
      result.current.open(false);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.hasPendingChanges).toBe(false);

    await act(async () => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      result.current.open(true);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.hasPendingChanges).toBe(true);
  });
});

describe('useBriefcaseList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return briefcase list query', () => {
    const { result } = renderHook(() => useBriefcaseList());

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeNull();
  });

  it('should accept status filter option', () => {
    const { result } = renderHook(() => useBriefcaseList({ status: 'active' }));

    expect(result.current).toBeDefined();
  });
});

describe('useBriefcase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquire.mockResolvedValue({
      id: 'briefcase-1',
      briefcaseId: 1,
      imodelId: 'imodel-1',
      status: 'active',
      acquiredAt: new Date().toISOString(),
      changesetIndex: 0,
    });
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useBriefcase('imodel-1'));

    expect(result.current.briefcase).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canEdit).toBe(false);
    expect(typeof result.current.acquire).toBe('function');
    expect(typeof result.current.release).toBe('function');
  });

  it('should expose acquire function', () => {
    const { result } = renderHook(() => useBriefcase('imodel-1'));

    expect(typeof result.current.acquire).toBe('function');
  });

  it('should expose release function', () => {
    const { result } = renderHook(() => useBriefcase('imodel-1'));

    expect(typeof result.current.release).toBe('function');
  });

  it('should have correct loading states', () => {
    const { result } = renderHook(() => useBriefcase('imodel-1'));

    expect(typeof result.current.isAcquiring).toBe('boolean');
    expect(typeof result.current.isReleasing).toBe('boolean');
  });

  it('should not auto acquire when autoAcquire is false', () => {
    renderHook(() => useBriefcase('imodel-1', { autoAcquire: false }));
    // Should not call acquire automatically
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('should accept autoAcquire option without errors', () => {
    const { result } = renderHook(() => useBriefcase('imodel-1', { autoAcquire: true }));
    expect(result.current).toBeDefined();
  });
});
