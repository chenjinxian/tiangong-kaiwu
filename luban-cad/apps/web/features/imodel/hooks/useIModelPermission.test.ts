/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIModelPermission, determineEditorMode } from './useIModelPermission.js';
import * as authClientModule from '../../auth/services/auth/client.js';

// Mock the auth client
vi.mock('../../auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('determineEditorMode', () => {
  it('should return readonly when permission is null', () => {
    expect(determineEditorMode(null)).toBe('readonly');
  });

  it('should return editable when canEdit is true', () => {
    const permission = {
      iModelId: 'test-id',
      userId: 'user-1',
      role: 'editor' as const,
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: false,
        canShare: false,
        canAdmin: false,
      },
    };
    expect(determineEditorMode(permission)).toBe('editable');
  });

  it('should return readonly when canEdit is false', () => {
    const permission = {
      iModelId: 'test-id',
      userId: 'user-1',
      role: 'viewer' as const,
      permissions: {
        canView: true,
        canEdit: false,
        canDelete: false,
        canShare: false,
        canAdmin: false,
      },
    };
    expect(determineEditorMode(permission)).toBe('readonly');
  });
});

describe('useIModelPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authClientModule.getValidAccessToken).mockResolvedValue('mock-token');
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: null, iModelId: null })
    );

    expect(result.current.permission).toBeNull();
    expect(result.current.role).toBe('none');
    expect(result.current.mode).toBe('readonly');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch permission successfully', async () => {
    const mockPermission = {
      iModelId: 'imodel-1',
      userId: 'user-1',
      role: 'editor',
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: false,
        canShare: false,
        canAdmin: false,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockPermission,
    });

    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.permission).toEqual(mockPermission);
    expect(result.current.role).toBe('editor');
    expect(result.current.mode).toBe('editable');
    expect(result.current.error).toBeNull();
  });

  it('should handle 404 by defaulting to editable (local deployment)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.permission).toEqual({
      iModelId: 'imodel-1',
      userId: 'current-user',
      role: 'owner',
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canShare: true,
        canAdmin: true,
      },
    });
    expect(result.current.mode).toBe('editable');
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    // Should default to editable on error (local deployment)
    expect(result.current.permission).toEqual({
      iModelId: 'imodel-1',
      userId: 'current-user',
      role: 'owner',
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canShare: true,
        canAdmin: true,
      },
    });
  });

  it('should handle authentication error', async () => {
    vi.mocked(authClientModule.getValidAccessToken).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('should not fetch when disabled', async () => {
    renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1', enabled: false })
    );

    // Wait a bit to ensure no fetch is made
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should refetch when called', async () => {
    const mockPermission = {
      iModelId: 'imodel-1',
      userId: 'user-1',
      role: 'editor',
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: false,
        canShare: false,
        canAdmin: false,
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockPermission,
    });

    const { result } = renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should use correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() =>
      useIModelPermission({ iTwinId: 'itwin-1', iModelId: 'imodel-1' })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toContain('/itwins/itwin-1/imodels/imodel-1/permission');
    expect(callArgs[1]).toMatchObject({
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('should update when iTwinId or iModelId changes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        iModelId: 'imodel-1',
        userId: 'user-1',
        role: 'viewer',
        permissions: { canView: true, canEdit: false, canDelete: false, canShare: false, canAdmin: false },
      }),
    });

    const { result, rerender } = renderHook(
      (props) => useIModelPermission(props),
      { initialProps: { iTwinId: 'itwin-1', iModelId: 'imodel-1' } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Change props
    rerender({ iTwinId: 'itwin-2', iModelId: 'imodel-2' });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Check second call uses new IDs
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/itwins/itwin-2/imodels/imodel-2/permission');
  });
});
