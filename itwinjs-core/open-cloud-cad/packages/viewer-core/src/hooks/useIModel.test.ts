/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for useIModel hook
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIModel, type UseIModelOptions } from './useIModel.js';
import { CheckpointConnection } from '@itwin/core-frontend';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  CheckpointConnection: {
    openRemote: vi.fn(),
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelApp: {
    initialized: true,
  },
}));

vi.mock('@itwin/core-common', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelVersion: {
    latest: () => ({ type: 'latest' }),
    asOfChangeSet: (id: string) => ({ type: 'changeset', id }),
  },
}));

describe('useIModel', () => {
  const defaultOptions: UseIModelOptions = {
    iTwinId: 'test-itwin-id',
    iModelId: 'test-imodel-id',
  };

  beforeEach(() => {
    // Default: never-resolving promise keeps the hook in loading state
    vi.mocked(CheckpointConnection.openRemote).mockReturnValue(new Promise(() => {}) as any);
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useIModel(defaultOptions));

    // openRemote never resolves — hook stays in loading state
    expect(result.current.iModel).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.reload).toBe('function');
  });

  it('should handle missing required props', () => {
    const { result } = renderHook(() => useIModel({
      iTwinId: '',
      iModelId: '',
    }));

    // Should not attempt to load if props are missing
    expect(result.current.iModel).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
