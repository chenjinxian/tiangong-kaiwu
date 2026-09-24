import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const mocks = vi.hoisted(() => {
  const mockStartEditCommand = vi.fn().mockResolvedValue(undefined);
  const mockCallEditMethod = vi.fn().mockResolvedValue(undefined);
  const mockFinishEditCommand = vi.fn().mockResolvedValue(undefined);
  const mockGetClient = vi.fn(() => ({
    startEditCommand: mockStartEditCommand,
    callEditMethod: mockCallEditMethod,
    finishEditCommand: mockFinishEditCommand,
  }));
  const mockUndoManagerUndo = vi.fn().mockResolvedValue(undefined);
  const mockUndoManagerRedo = vi.fn().mockResolvedValue(undefined);
  const mockCompressIds = vi.fn((ids: string[]) => ids.join(','));
  const mockTransformToJSON = vi.fn(() => ({ translation: { x: 1, y: 2, z: 3 } }));
  return {
    mockStartEditCommand,
    mockCallEditMethod,
    mockFinishEditCommand,
    mockGetClient,
    mockUndoManagerUndo,
    mockUndoManagerRedo,
    mockCompressIds,
    mockTransformToJSON,
  };
});

 
vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: { getClient: mocks.mockGetClient },
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: {},
  },
}));

vi.mock('../../../src/core/undo/UndoManager.js', () => ({
  undoManager: {
    undo: mocks.mockUndoManagerUndo,
    redo: mocks.mockUndoManagerRedo,
    recordOperation: vi.fn(),
  },
}));

vi.mock('@itwin/core-bentley', () => ({
  BeEvent: class { addListener = vi.fn(() => () => {}); removeListener = vi.fn(); raiseEvent = vi.fn(); },
  CompressedId64Set: { compressIds: mocks.mockCompressIds },
}));

vi.mock('@itwin/core-geometry', () => ({
  Transform: {
    createTranslationXYZ: vi.fn(() => ({ toJSON: mocks.mockTransformToJSON })),
    createOriginAndMatrix: vi.fn(() => ({ toJSON: mocks.mockTransformToJSON })),
  },
  Matrix3d: {
    createRotationAroundVector: vi.fn(() => ({})),
    createScale: vi.fn(() => ({})),
  },
  Vector3d: {
    unitX: vi.fn(() => ({})),
    unitY: vi.fn(() => ({})),
    unitZ: vi.fn(() => ({})),
  },
  Angle: {
    createRadians: vi.fn((r: number) => r),
  },
  Point3d: {
    create: vi.fn(() => ({})),
  },
}));
 

import { useEditTools } from './useEditTools';

// Helper: create a mock BriefcaseConnection
function makeConnection(elementIds: string[] = []) {
  let listener: (() => void) | null = null;
  let removeCalled = false;
  const removeFunc = (): void => { removeCalled = true; };
  const conn = {
    key: 'test-key',
    selectionSet: {
      elements: new Set(elementIds),
      onChanged: {
        addListener: vi.fn((cb: () => void) => {
          listener = cb;
          return removeFunc;
        }),
      },
      emptyAll: vi.fn(),
    },
    saveChanges: vi.fn().mockResolvedValue(undefined),
  };
  return { conn, getListener: () => listener, isRemoveCalled: () => removeCalled };
}

describe('useEditTools — selection tracking', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns selectionCount 0 when connection is null', () => {
    const { result } = renderHook(() => useEditTools({ connection: null }));
    expect(result.current.selectionCount).toBe(0);
  });

  it('returns initial selectionCount from connection.selectionSet.elements.size', () => {
    const { conn } = makeConnection(['0x1', '0x2']);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    expect(result.current.selectionCount).toBe(2);
  });

  it('updates selectionCount when onChanged fires', () => {
    const { conn, getListener } = makeConnection(['0x1']);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    act(() => {
      conn.selectionSet.elements.add('0x2');
      getListener()!();
    });
    expect(result.current.selectionCount).toBe(2);
  });

  it('unsubscribes from onChanged on unmount', () => {
    const { conn, isRemoveCalled } = makeConnection(['0x1']);
    const { unmount } = renderHook(() => useEditTools({ connection: conn as any }));
    expect(isRemoveCalled()).toBe(false);
    unmount();
    expect(isRemoveCalled()).toBe(true);
  });
});

describe('useEditTools — deleteSelected', () => {
  beforeEach(() => {
    mocks.mockStartEditCommand.mockClear();
    mocks.mockCallEditMethod.mockClear();
    mocks.mockFinishEditCommand.mockClear();
  });

  it('does nothing when connection is null', async () => {
    const { result } = renderHook(() => useEditTools({ connection: null }));
    await act(async () => { await result.current.deleteSelected(); });
    expect(mocks.mockStartEditCommand).not.toHaveBeenCalled();
  });

  it('does nothing when selection is empty', async () => {
    const { conn } = makeConnection([]);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    await act(async () => { await result.current.deleteSelected(); });
    expect(mocks.mockStartEditCommand).not.toHaveBeenCalled();
  });

  it('calls startEditCommand, callEditMethod(deleteElements), finishEditCommand, saveChanges, emptyAll', async () => {
    const { conn } = makeConnection(['0x1', '0x2']);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    await act(async () => { await result.current.deleteSelected(); });
    expect(mocks.mockStartEditCommand).toHaveBeenCalledWith('basicManipulation', 'test-key');
    expect(mocks.mockCallEditMethod).toHaveBeenCalledWith('deleteElements', expect.any(String));
    expect(mocks.mockFinishEditCommand).toHaveBeenCalled();
    expect(conn.saveChanges).toHaveBeenCalledWith('删除元素');
    expect(conn.selectionSet.emptyAll).toHaveBeenCalled();
  });

  it('calls finishEditCommand even if callEditMethod throws', async () => {
    mocks.mockCallEditMethod.mockRejectedValueOnce(new Error('rpc error'));
    const { conn } = makeConnection(['0x1']);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    await act(async () => {
      await expect(result.current.deleteSelected()).rejects.toThrow('rpc error');
    });
    expect(mocks.mockFinishEditCommand).toHaveBeenCalled();
    expect(conn.saveChanges).not.toHaveBeenCalled();
    expect(conn.selectionSet.emptyAll).not.toHaveBeenCalled();
    // isRunning must be reset to false so a subsequent call is not blocked
    mocks.mockStartEditCommand.mockClear();
    await act(async () => { await result.current.deleteSelected(); });
    expect(mocks.mockStartEditCommand).toHaveBeenCalledTimes(1);
  });
});

describe('useEditTools — applyTranslation', () => {
  beforeEach(() => {
    mocks.mockStartEditCommand.mockClear();
    mocks.mockCallEditMethod.mockClear();
    mocks.mockFinishEditCommand.mockClear();
  });

  it('does nothing when selection is empty', async () => {
    const { conn } = makeConnection([]);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    await act(async () => { await result.current.applyTranslation(1, 2, 3); });
    expect(mocks.mockStartEditCommand).not.toHaveBeenCalled();
  });

  it('calls startEditCommand, callEditMethod(transformPlacement), finishEditCommand, saveChanges; does NOT call emptyAll', async () => {
    const { conn } = makeConnection(['0x1']);
    const { result } = renderHook(() => useEditTools({ connection: conn as any }));
    await act(async () => { await result.current.applyTranslation(1, 2, 3); });
    expect(mocks.mockStartEditCommand).toHaveBeenCalledWith('basicManipulation', 'test-key');
    expect(mocks.mockCallEditMethod).toHaveBeenCalledWith('transformPlacement', expect.any(String), expect.anything());
    expect(mocks.mockFinishEditCommand).toHaveBeenCalled();
    expect(conn.saveChanges).toHaveBeenCalledWith('移动元素');
    expect(conn.selectionSet.emptyAll).not.toHaveBeenCalled();
  });
});

describe('useEditTools — undo / redo', () => {
  it('calls undoManager.undo on undo()', async () => {
    const { result } = renderHook(() => useEditTools({ connection: null }));
    await act(async () => { await result.current.undo(); });
    expect(mocks.mockUndoManagerUndo).toHaveBeenCalled();
  });

  it('calls undoManager.redo on redo()', async () => {
    const { result } = renderHook(() => useEditTools({ connection: null }));
    await act(async () => { await result.current.redo(); });
    expect(mocks.mockUndoManagerRedo).toHaveBeenCalled();
  });
});
