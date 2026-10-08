/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  FeatureFormModel,
  FeatureOp,
  FeatureTreeEntry,
  PreviewResult,
} from '@luban-cad/shared';
import { useFeatureSystem } from './useFeatureSystem.js';

// ---------------------------------------------------------------------------
// Programmable fake for LubanFeatureRpcInterface.getClient()
// ---------------------------------------------------------------------------
const fakeClient = vi.hoisted(() => {
  const makeTree = (): FeatureTreeEntry[] => [
    { id: 'f1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
  ];
  return {
    makeTree,
    getFeatureTree: vi.fn(async (_key: string): Promise<FeatureTreeEntry[]> => makeTree()),
    applyFeatureOp: vi.fn(async (_key: string, _op: FeatureOp, _sessionId: string) => ({ ok: true, featureId: 'f2' }) as const),
    previewFeatureOp: vi.fn(async (_key: string, _op: FeatureOp, _sessionId: string): Promise<PreviewResult> => ({ ok: true, affected: [] })),
    resolveEdgeRef: vi.fn(async (_key: string, _elementId: string, _subEntityId: number) => ({
      ok: true,
      ref: { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 3, entityId: 4 } },
    }) as const),
    getFeatureFormModel: vi.fn(async (_key: string): Promise<FeatureFormModel> => ({
      extrude: { fields: [{ name: 'distance', label: '距离', kind: 'number' }] },
      fillet: { fields: [{ name: 'radius', label: '半径', kind: 'number' }] },
    })),
    acquireWriteLease: vi.fn(async (_key: string, _sessionId: string) => ({ ok: true, holder: 'tester' }) as const),
    releaseWriteLease: vi.fn(async (_key: string, _sessionId: string): Promise<void> => undefined),
  };
});

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => fakeClient,
  },
}));

// ---------------------------------------------------------------------------
// Mock BriefcaseConnection: key + txns.onCommitted only (hook contract)
// ---------------------------------------------------------------------------
function createMockConnection({ isReadonly = false }: { isReadonly?: boolean } = {}) {
  const committedListeners = new Set<(hasPending: boolean) => void>();
  return {
    key: 'test-model.bim',
    isReadonly,
    txns: {
      onCommitted: {
        addListener: vi.fn((listener: (hasPending: boolean) => void) => {
          committedListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (hasPending: boolean) => void) => {
          committedListeners.delete(listener);
        }),
      },
    },
    emitCommitted() {
      committedListeners.forEach((listener) => listener(false));
    },
  };
}

type MockConnection = ReturnType<typeof createMockConnection>;

const renderFeatureSystem = (connection: MockConnection | undefined, opts?: { enabled?: boolean }) =>
  renderHook(() => useFeatureSystem(connection as never, opts));

describe('useFeatureSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('loads the feature tree on mount via getFeatureTree(connection.key)', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);

    expect(result.current.tree).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fakeClient.getFeatureTree).toHaveBeenCalledWith('test-model.bim');
    expect(result.current.tree).toEqual(fakeClient.makeTree());
    expect(result.current.error).toBeUndefined();
  });

  it('stays idle without a connection (no RPC, empty tree)', () => {
    const { result } = renderFeatureSystem(undefined);

    expect(result.current.tree).toEqual([]);
    expect(result.current.leaseOk).toBe(false);
    expect(fakeClient.getFeatureTree).not.toHaveBeenCalled();
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
  });

  it('acquires the write lease on mount and releases it on unmount', async () => {
    const connection = createMockConnection();

    const { result, unmount } = renderFeatureSystem(connection);

    await waitFor(() => expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(1));
    expect(fakeClient.acquireWriteLease).toHaveBeenCalledWith('test-model.bim', expect.any(String));
    expect(result.current.leaseOk).toBe(true);

    unmount();

    expect(fakeClient.releaseWriteLease).toHaveBeenCalledWith('test-model.bim', expect.any(String));
  });

  it('renews the lease every 10 seconds while enabled', async () => {
    const connection = createMockConnection();

    // Fake timers must be installed before mount so the renew interval is
    // registered against the mocked clock (setInterval is captured at effect time).
    vi.useFakeTimers();
    try {
      const { unmount } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // flush mount effects + acquire
      });
      expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not acquire the lease when opts.enabled=false, but still loads the tree', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection, { enabled: false });

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
    expect(result.current.leaseOk).toBe(false);
  });

  it('treats a readonly connection as not enabled by default', async () => {
    const connection = createMockConnection({ isReadonly: true });

    const { result } = renderFeatureSystem(connection);

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
    expect(result.current.leaseOk).toBe(false);
  });

  it('honors opts.enabled=true override on a readonly connection', async () => {
    const connection = createMockConnection({ isReadonly: true });

    renderFeatureSystem(connection, { enabled: true });

    await waitFor(() => expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(1));
  });

  it('lease rejection → leaseOk=false, tree still loads read-only', async () => {
    const connection = createMockConnection();
    fakeClient.acquireWriteLease.mockResolvedValueOnce({ ok: false, holder: 'someone-else' });

    const { result } = renderFeatureSystem(connection);

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(result.current.leaseOk).toBe(false);
  });

  it('applyOp forwards op + sessionId and refreshes the tree on success', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    const treeFetches = fakeClient.getFeatureTree.mock.calls.length;

    let applyResult: Awaited<ReturnType<typeof result.current.applyOp>> | undefined;
    await act(async () => {
      applyResult = await result.current.applyOp(op);
    });

    expect(applyResult).toEqual({ ok: true, featureId: 'f2' });
    expect(fakeClient.applyFeatureOp).toHaveBeenCalledWith('test-model.bim', op, expect.any(String));
    await waitFor(() => expect(fakeClient.getFeatureTree.mock.calls.length).toBeGreaterThan(treeFetches));
  });

  it('applyOp failure returns the error result and does not refresh', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };
    fakeClient.applyFeatureOp.mockResolvedValueOnce({ ok: false, error: '内核拒绝' });

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    const treeFetches = fakeClient.getFeatureTree.mock.calls.length;

    let applyResult: Awaited<ReturnType<typeof result.current.applyOp>> | undefined;
    await act(async () => {
      applyResult = await result.current.applyOp(op);
    });

    expect(applyResult).toEqual({ ok: false, error: '内核拒绝' });
    expect(fakeClient.getFeatureTree.mock.calls.length).toBe(treeFetches);
  });

  it('refreshes the tree when connection.txns.onCommitted fires', async () => {
    const connection = createMockConnection();

    renderFeatureSystem(connection);
    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(1));

    act(() => {
      connection.emitCommitted();
    });

    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(2));
  });

  it('unsubscribes onCommitted on unmount', async () => {
    const connection = createMockConnection();

    const { unmount } = renderFeatureSystem(connection);
    unmount();

    expect(connection.txns.onCommitted.removeListener).toHaveBeenCalled();
  });

  it('fetches formModel once per connection (not per refresh)', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.formModel).toBeDefined());
    expect(fakeClient.getFeatureFormModel).toHaveBeenCalledTimes(1);

    act(() => {
      connection.emitCommitted();
    });
    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(2));

    expect(fakeClient.getFeatureFormModel).toHaveBeenCalledTimes(1);
    expect(result.current.formModel?.extrude?.fields[0]?.name).toBe('distance');
  });

  it('previewOp forwards op + sessionId and returns the preview result', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5 } };

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));

    let preview: Awaited<ReturnType<typeof result.current.previewOp>> | undefined;
    await act(async () => {
      preview = await result.current.previewOp(op);
    });

    expect(fakeClient.previewFeatureOp).toHaveBeenCalledWith('test-model.bim', op, expect.any(String));
    expect(preview).toEqual({ ok: true, affected: [] });
  });

  it('resolveEdgeRef forwards elementId + subEntityId and returns the edge ref', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));

    let resolved: Awaited<ReturnType<typeof result.current.resolveEdgeRef>> | undefined;
    await act(async () => {
      resolved = await result.current.resolveEdgeRef('0x123', 7);
    });

    expect(fakeClient.resolveEdgeRef).toHaveBeenCalledWith('test-model.bim', '0x123', 7);
    expect(resolved?.ok).toBe(true);
    expect(resolved?.ref?.faceA).toEqual({ nodeId: 1, entityId: 2 });
  });
});
