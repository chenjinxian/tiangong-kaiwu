/*-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useConflictDetection } from './useConflictDetection.js';
import { OpenCloudRpcInterface } from '@open-cloud-cad/shared';

// Mock the RPC interface
vi.mock('@open-cloud-cad/shared', async () => {
  const actual = await vi.importActual<typeof import('@open-cloud-cad/shared')>('@open-cloud-cad/shared');
  return {
    ...actual,
    OpenCloudRpcInterface: {
      getClient: vi.fn(),
    },
  };
});

describe('useConflictDetection', () => {
  const mockDetectConflicts = vi.fn();
  const mockResolveConflicts = vi.fn();
  const mockHasLocalChanges = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (OpenCloudRpcInterface.getClient as ReturnType<typeof vi.fn>).mockReturnValue({
      detectConflicts: mockDetectConflicts,
      resolveConflicts: mockResolveConflicts,
      hasLocalChanges: mockHasLocalChanges,
    });
  });

  it('should initialize with null detection result', () => {
    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    expect(result.current.detectionResult).toBeNull();
    expect(result.current.isDetecting).toBe(false);
    expect(result.current.isResolving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should detect conflicts successfully', async () => {
    const mockResult = {
      hasConflicts: true,
      totalConflicts: 2,
      conflicts: [
        {
          id: 'conflict-1',
          elementId: '0x1',
          type: 'modify-modify' as const,
          localVersion: { elementId: '0x1', className: 'Test', code: 'TEST-001', properties: {} },
          remoteVersion: { elementId: '0x1', className: 'Test', code: 'TEST-001', properties: {} },
          isResolved: false,
        },
      ],
      summary: { modifyModify: 1, deleteModify: 0, modifyDelete: 0, addAdd: 0 },
      targetChangesetId: 'change-2',
      currentChangesetId: 'change-1',
    };

    mockDetectConflicts.mockResolvedValueOnce(mockResult);

    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    await result.current.detectConflicts('change-2');

    await waitFor(() => {
      expect(result.current.detectionResult).toEqual(mockResult);
      expect(result.current.isDetecting).toBe(false);
    });

    expect(mockDetectConflicts).toHaveBeenCalledWith({
      iModelId: 'test-imodel',
      briefcaseId: 1,
      targetChangesetId: 'change-2',
    });
  });

  it('should handle conflict detection error', async () => {
    const error = new Error('Network error');
    mockDetectConflicts.mockRejectedValueOnce(error);

    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    await result.current.detectConflicts('change-2');

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.isDetecting).toBe(false);
    });
  });

  it('should resolve conflicts successfully', async () => {
    mockResolveConflicts.mockResolvedValueOnce({
      success: true,
      resolvedCount: 2,
    });

    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    const resolutions = { 'conflict-1': 'local' as const, 'conflict-2': 'remote' as const };
    const resolveResult = await result.current.resolveConflicts(resolutions);

    expect(resolveResult).toEqual({ success: true, resolvedCount: 2 });
    expect(mockResolveConflicts).toHaveBeenCalledWith({
      iModelId: 'test-imodel',
      briefcaseId: 1,
      resolutions,
    });
  });

  it('should check local changes', async () => {
    mockHasLocalChanges.mockResolvedValueOnce(true);

    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    const hasChanges = await result.current.hasLocalChanges();

    expect(hasChanges).toBe(true);
    expect(mockHasLocalChanges).toHaveBeenCalledWith('test-imodel', 1);
  });

  it('should clear detection state', async () => {
    mockDetectConflicts.mockResolvedValueOnce({
      hasConflicts: false,
      totalConflicts: 0,
      conflicts: [],
      summary: { modifyModify: 0, deleteModify: 0, modifyDelete: 0, addAdd: 0 },
      targetChangesetId: 'change-2',
      currentChangesetId: 'change-1',
    });

    const { result } = renderHook(() =>
      useConflictDetection({ iModelId: 'test-imodel', briefcaseId: 1 })
    );

    await result.current.detectConflicts('change-2');
    await waitFor(() => expect(result.current.detectionResult).not.toBeNull());

    result.current.clearDetection();

    await waitFor(() => {
      expect(result.current.detectionResult).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
