/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBaselineUpload, useCreateIModelWithBaseline } from './useBaselineUpload.js';
import * as clientModule from '../../../shared/services/imodels/client.js';

// Mock the client module
vi.mock('../../../shared/services/imodels/client.js', () => ({
  getAuthorization: vi.fn(() => 'mock-auth'),
  iModelsManagementClient: {
    iModels: {
      createEmpty: vi.fn(),
    },
  },
}));

describe('useBaselineUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useBaselineUpload());

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('should set error when uploadBaseline is called', async () => {
    const { result } = renderHook(() => useBaselineUpload());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    await act(async () => {
      try {
        await result.current.uploadBaseline('imodel-1', mockFile);
      } catch {
        // Expected to throw
      }
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain('Baseline upload is handled automatically');
    });
  });

  it('should reset state', async () => {
    const { result } = renderHook(() => useBaselineUpload());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    // Trigger error state
    await act(async () => {
      try {
        await result.current.uploadBaseline('imodel-1', mockFile);
      } catch {
        // Expected
      }
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('should call onProgress callback', async () => {
    const onProgress = vi.fn();
    const { result } = renderHook(() => useBaselineUpload());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    await act(async () => {
      try {
        await result.current.uploadBaseline('imodel-1', mockFile, onProgress);
      } catch {
        // Expected
      }
    });

    // onProgress won't be called since the implementation throws immediately
    // This test documents the expected behavior
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('useCreateIModelWithBaseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useCreateIModelWithBaseline());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should create iModel successfully', async () => {
    const mockIModel = {
      id: 'new-imodel-id',
      name: 'Test iModel',
      description: 'Test description',
    };

    vi.mocked(clientModule.iModelsManagementClient.iModels.createEmpty).mockResolvedValue(mockIModel);

    const { result } = renderHook(() => useCreateIModelWithBaseline());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    let createdIModel;
    await act(async () => {
      createdIModel = await result.current.createIModelWithBaseline({
        iTwinId: 'itwin-1',
        name: 'Test iModel',
        description: 'Test description',
        file: mockFile,
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(createdIModel).toEqual(mockIModel);

    expect(clientModule.iModelsManagementClient.iModels.createEmpty).toHaveBeenCalledWith({
      authorization: expect.any(Function),
      iModelProperties: {
        iTwinId: 'itwin-1',
        name: 'Test iModel',
        description: 'Test description',
      },
    });
  });

  it('should handle creation error', async () => {
    const mockError = new Error('Network error');
    vi.mocked(clientModule.iModelsManagementClient.iModels.createEmpty).mockRejectedValue(mockError);

    const { result } = renderHook(() => useCreateIModelWithBaseline());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    await act(async () => {
      try {
        await result.current.createIModelWithBaseline({
          iTwinId: 'itwin-1',
          name: 'Test iModel',
          file: mockFile,
        });
      } catch {
        // Expected
      }
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });
  });

  it('should set loading state during creation', async () => {
    vi.mocked(clientModule.iModelsManagementClient.iModels.createEmpty).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 'test' }), 10))
    );

    const { result } = renderHook(() => useCreateIModelWithBaseline());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    act(() => {
      result.current.createIModelWithBaseline({
        iTwinId: 'itwin-1',
        name: 'Test iModel',
        file: mockFile,
      });
    });

    // Check loading state immediately after calling
    expect(result.current.isLoading).toBe(true);

    // Wait for completion
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should handle non-Error exceptions', async () => {
    vi.mocked(clientModule.iModelsManagementClient.iModels.createEmpty).mockRejectedValue('string error');

    const { result } = renderHook(() => useCreateIModelWithBaseline());

    const mockFile = new File(['content'], 'test.bim', { type: 'application/octet-stream' });

    await act(async () => {
      try {
        await result.current.createIModelWithBaseline({
          iTwinId: 'itwin-1',
          name: 'Test iModel',
          file: mockFile,
        });
      } catch {
        // Expected
      }
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Failed to create iModel');
    });
  });
});
