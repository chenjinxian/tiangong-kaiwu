/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Capture the options each hook passes to useQuery - must be before imports.
const useQuerySpy = vi.fn((options: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  ...options,
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (options: Record<string, unknown>) => useQuerySpy(options),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
      removeQueries: vi.fn(),
    })),
  };
});

vi.mock('../services/client.js', () => ({
  deleteIModel: vi.fn(),
  renameIModel: vi.fn(),
  copyIModel: vi.fn(),
}));

// Import after mocks
import { useIModels } from './useIModelsQuery.js';

describe('useIModels polling gate', () => {
  beforeEach(() => {
    useQuerySpy.mockClear();
  });

  it('polls every 5s by default (fallback mode)', () => {
    renderHook(() => useIModels({ iTwinId: 'itwin-1' }));

    const options = useQuerySpy.mock.calls[0][0] as { refetchInterval: unknown };
    expect(options.refetchInterval).toBe(5000);
  });

  it('disables polling while the progress stream is live', () => {
    renderHook(() => useIModels({ iTwinId: 'itwin-1', live: true }));

    const options = useQuerySpy.mock.calls[0][0] as { refetchInterval: unknown };
    expect(options.refetchInterval).toBe(false);
  });

  it('keeps the list query key stable for stream-driven invalidation', () => {
    renderHook(() => useIModels({ iTwinId: 'itwin-1', live: true }));

    const options = useQuerySpy.mock.calls[0][0] as { queryKey: readonly unknown[] };
    expect(options.queryKey).toEqual(['iModels', 'list', 'itwin-1']);
  });
});
