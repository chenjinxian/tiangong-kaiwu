/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSolidModeling } from './useSolidModeling.js';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import type { ElementGeometryResultProps } from '@itwin/editor-common';

// Mock OpenCloudRpcInterface
vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: {
    getClient: vi.fn(),
  },
}));

describe('useSolidModeling', () => {
  const mockRpcClient = {
    startEditCommand: vi.fn(),
    finishEditCommand: vi.fn(),
    callEditMethod: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(OpenCloudRpcInterface.getClient).mockReturnValue(mockRpcClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      expect(result.current.isProcessing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.lastResult).toBeUndefined();
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      // Trigger an error first
      vi.mocked(mockRpcClient.callEditMethod).mockRejectedValue(new Error('Test error'));
      vi.mocked(mockRpcClient.startEditCommand).mockRejectedValue(new Error('Test error'));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: [{ subEntity: { type: 1, id: 1, index: 0 } }],
          radius: 0.1,
        });
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('blendEdges', () => {
    const mockEdges = [
      { subEntity: { type: 1 as const, id: 1, index: 0 } },
      { subEntity: { type: 1 as const, id: 2, index: 0 } },
    ];

    const mockResult: ElementGeometryResultProps = {
      elementId: '0x20000000001',
      graphic: new Uint8Array([1, 2, 3]),
    };

    it('should successfully blend edges with default options', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      let blendResult: ElementGeometryResultProps | undefined;
      await act(async () => {
        blendResult = await result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.1,
        });
      });

      expect(result.current.isProcessing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.lastResult).toEqual(mockResult);
      expect(blendResult).toEqual(mockResult);

      expect(mockRpcClient.startEditCommand).toHaveBeenCalledWith('solidModeling', 'test-key');
      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'blendEdges',
        'element-1',
        expect.objectContaining({
          edges: [{ type: 1, id: 1, index: 0 }, { type: 1, id: 2, index: 0 }],
          radii: 0.1,
          propagateSmooth: true,
        }),
        expect.objectContaining({
          wantGraphic: true,
          chordTolerance: 0.001,
          requestId: 'blendEdges:element-1',
          writeChanges: true,
        })
      );
      expect(mockRpcClient.finishEditCommand).toHaveBeenCalled();
    });

    it('should handle custom options', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.5,
          propagateSmooth: false,
        }, {
          chordTolerance: 0.05,
          wantRange: true,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'blendEdges',
        'element-1',
        expect.objectContaining({
          radii: 0.5,
          propagateSmooth: false,
        }),
        expect.objectContaining({
          chordTolerance: 0.05,
          wantRange: true,
        })
      );
    });

    it('should set isProcessing during operation', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10))
      );
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      act(() => {
        result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.1,
        });
      });

      expect(result.current.isProcessing).toBe(true);

      await waitFor(() => expect(result.current.isProcessing).toBe(false));
    });

    it('should handle RPC not available error', async () => {
      vi.mocked(OpenCloudRpcInterface.getClient).mockReturnValue(null);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.1,
        });
      });

      expect(result.current.error).toBe('OpenCloudRpc not available');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.lastResult).toBeUndefined();
    });

    it('should handle blend operation failure', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockRejectedValue(new Error('Blend failed'));
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.1,
        });
      });

      expect(result.current.error).toBe('Blend failed');
      expect(result.current.isProcessing).toBe(false);
      expect(mockRpcClient.finishEditCommand).toHaveBeenCalled();
    });

    it('should handle finishEditCommand failure after error', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockRejectedValue(new Error('Blend failed'));
      vi.mocked(mockRpcClient.finishEditCommand).mockRejectedValue(new Error('Finish failed'));

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: mockEdges,
          radius: 0.1,
        });
      });

      // Should still report the original error, not the finish error
      expect(result.current.error).toBe('Blend failed');
    });
  });

  describe('chamferEdges', () => {
    const mockEdges = [
      { subEntity: { type: 1 as const, id: 1, index: 0 } },
    ];

    const mockResult: ElementGeometryResultProps = {
      elementId: '0x20000000001',
    };

    it.each([
      { mode: 1 as const, length: 0.1, expectedValues1: 0.1, expectedValues2: undefined, desc: 'Length mode' },
      { mode: 2 as const, distanceLeft: 0.1, distanceRight: 0.2, expectedValues1: 0.1, expectedValues2: 0.2, desc: 'Distances mode' },
      { mode: 3 as const, distanceLeft: 0.1, angle: 0.785, expectedValues1: 0.1, expectedValues2: 0.785, desc: 'DistanceAngle mode' },
      { mode: 4 as const, angle: 0.785, distanceRight: 0.2, expectedValues1: 0.785, expectedValues2: 0.2, desc: 'AngleDistance mode' },
    ])('should handle $desc correctly', async ({ mode, expectedValues1, expectedValues2, ...params }) => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.chamferEdges('element-1', {
          edges: mockEdges,
          mode,
          ...params,
        } as any);
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'chamferEdges',
        'element-1',
        expect.objectContaining({
          mode,
          values1: expectedValues1,
          values2: expectedValues2,
        }),
        expect.anything()
      );
    });

    it('should use default values when params are not provided', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.chamferEdges('element-1', {
          edges: mockEdges,
          mode: 1,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'chamferEdges',
        'element-1',
        expect.objectContaining({
          values1: 0.01,
          propagateSmooth: true,
        }),
        expect.anything()
      );
    });

    it('should handle RPC error', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockRejectedValue(new Error('Chamfer failed'));
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.chamferEdges('element-1', {
          edges: mockEdges,
          mode: 1,
        });
      });

      expect(result.current.error).toBe('Chamfer failed');
    });
  });

  describe('hollowFaces', () => {
    const mockFaces = [
      { subEntity: { type: 0 as const, id: 1, index: 0 } },
      { subEntity: { type: 0 as const, id: 2, index: 0 } },
    ];

    const mockResult: ElementGeometryResultProps = {
      elementId: '0x20000000001',
    };

    it('should successfully hollow faces with default thickness', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.hollowFaces('element-1', {
          faces: mockFaces,
          shellThickness: 0.1,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'hollowFaces',
        'element-1',
        expect.objectContaining({
          defaultDistance: 0.1,
          faces: [{ type: 0, id: 1, index: 0 }, { type: 0, id: 2, index: 0 }],
          distances: [0.1, 0.1],
        }),
        expect.anything()
      );
    });

    it('should use faceThickness when provided', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue(mockResult);
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.hollowFaces('element-1', {
          faces: mockFaces,
          shellThickness: 0.1,
          faceThickness: 0.05,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'hollowFaces',
        'element-1',
        expect.objectContaining({
          defaultDistance: 0.1,
          distances: [0.05, 0.05],
        }),
        expect.anything()
      );
    });

    it('should handle RPC error', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockRejectedValue(new Error('Hollow failed'));
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.hollowFaces('element-1', {
          faces: mockFaces,
          shellThickness: 0.1,
        });
      });

      expect(result.current.error).toBe('Hollow failed');
    });
  });

  describe('edge cases', () => {
    it('should handle empty edges array', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue({});
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: [],
          radius: 0.1,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'blendEdges',
        'element-1',
        expect.objectContaining({ edges: [] }),
        expect.anything()
      );
    });

    it('should handle empty faces array', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue({});
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.hollowFaces('element-1', {
          faces: [],
          shellThickness: 0.1,
        });
      });

      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'hollowFaces',
        'element-1',
        expect.objectContaining({ faces: [], distances: [] }),
        expect.anything()
      );
    });

    it('should handle unknown chamfer mode gracefully', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockResolvedValue(undefined);
      vi.mocked(mockRpcClient.callEditMethod).mockResolvedValue({});
      vi.mocked(mockRpcClient.finishEditCommand).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.chamferEdges('element-1', {
          edges: [{ subEntity: { type: 1 as const, id: 1, index: 0 } }],
          mode: 99 as any,
        });
      });

      // Should default to length mode
      expect(mockRpcClient.callEditMethod).toHaveBeenCalledWith(
        'chamferEdges',
        'element-1',
        expect.objectContaining({
          mode: 99,
          values1: 0.01,
        }),
        expect.anything()
      );
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockRpcClient.startEditCommand).mockRejectedValue('String error');

      const { result } = renderHook(() => useSolidModeling({ iModelKey: 'test-key' }));

      await act(async () => {
        await result.current.blendEdges('element-1', {
          edges: [{ subEntity: { type: 1 as const, id: 1, index: 0 } }],
          radius: 0.1,
        });
      });

      expect(result.current.error).toBe('String error');
    });
  });
});
