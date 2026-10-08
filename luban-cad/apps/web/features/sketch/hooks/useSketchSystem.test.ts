/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  FeatureOp,
  FeatureOpResult,
  SketchConstraintDto,
  SketchDto,
  SketchEntityDto,
  SketchSummaryDto,
} from '@luban-cad/shared';
import { useSketchSystem } from './useSketchSystem.js';
import type { UseFeatureSystem } from '../../editor/hooks/useFeatureSystem.js';

// ---------------------------------------------------------------------------
// Programmable fake for LubanFeatureRpcInterface.getClient()
// ---------------------------------------------------------------------------
const fakeClient = vi.hoisted(() => {
  const makeSketch = (id: string): SketchDto => ({
    id,
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ],
    constraints: [{ kind: 'distance', id: 10, refs: [1, 2], value: 10 }],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
  });
  const makeSummaries = (): SketchSummaryDto[] => [
    { id: 'sk-1', entityCount: 3, constraintCount: 1 },
    { id: 'sk-2', entityCount: 2, constraintCount: 0 },
  ];
  return {
    makeSketch,
    makeSummaries,
    getSketch: vi.fn(async (_key: string, sketchId: string): Promise<SketchDto | undefined> => makeSketch(sketchId)),
    listSketches: vi.fn(async (_key: string): Promise<SketchSummaryDto[]> => makeSummaries()),
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
function createMockConnection() {
  const committedListeners = new Set<(hasPending: boolean) => void>();
  return {
    key: 'test-model.bim',
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

// The hook only touches fs.applyOp; mock just that member.
type MockFs = Pick<UseFeatureSystem, 'applyOp'>;
const createMockFs = (): MockFs => ({
  applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-new' })),
});

const renderSketchSystem = (connection: MockConnection | undefined, fs?: MockFs) =>
  renderHook(() => useSketchSystem(connection as never, fs as never));

const openAndSettle = async (connection: MockConnection, fs: MockFs, id: string) => {
  const rendered = renderSketchSystem(connection, fs);
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  await act(async () => {
    await rendered.result.current.openSketch(id);
  });
  return rendered;
};

describe('useSketchSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads sketch summaries on mount via listSketches(connection.key)', async () => {
    const connection = createMockConnection();

    const { result } = renderSketchSystem(connection, createMockFs());

    expect(result.current.sketches).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fakeClient.listSketches).toHaveBeenCalledWith('test-model.bim');
    expect(result.current.sketches).toEqual(fakeClient.makeSummaries());
    expect(result.current.error).toBeUndefined();
  });

  it('stays idle without a connection (no RPC, empty state)', () => {
    const { result } = renderSketchSystem(undefined, undefined);

    expect(result.current.sketches).toEqual([]);
    expect(result.current.activeSketch).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(fakeClient.listSketches).not.toHaveBeenCalled();
    expect(fakeClient.getSketch).not.toHaveBeenCalled();
  });

  it('openSketch fetches via getSketch and exposes the solve state', async () => {
    const connection = createMockConnection();

    const { result } = await openAndSettle(connection, createMockFs(), 'sk-1');

    expect(fakeClient.getSketch).toHaveBeenCalledWith('test-model.bim', 'sk-1');
    expect(result.current.activeSketch).toEqual(fakeClient.makeSketch('sk-1'));
    expect(result.current.activeSketch?.solve.status).toBe('ok');
    expect(result.current.error).toBeUndefined();
  });

  it('openSketch switches the active sketch', async () => {
    const connection = createMockConnection();
    const { result } = renderSketchSystem(connection, createMockFs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openSketch('sk-1');
    });
    expect(result.current.activeSketch?.id).toBe('sk-1');

    await act(async () => {
      await result.current.openSketch('sk-2');
    });
    expect(fakeClient.getSketch).toHaveBeenCalledWith('test-model.bim', 'sk-2');
    expect(result.current.activeSketch).toEqual(fakeClient.makeSketch('sk-2'));
  });

  it('openSketch with a missing sketch clears activeSketch without error', async () => {
    const connection = createMockConnection();
    fakeClient.getSketch.mockResolvedValueOnce(undefined);

    const { result } = await openAndSettle(connection, createMockFs(), 'sk-missing');

    expect(result.current.activeSketch).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('closeSketch clears the active sketch', async () => {
    const connection = createMockConnection();
    const { result } = await openAndSettle(connection, createMockFs(), 'sk-1');
    expect(result.current.activeSketch).toBeDefined();

    act(() => {
      result.current.closeSketch();
    });

    expect(result.current.activeSketch).toBeUndefined();
  });

  it('applyUpdate forwards an updateSketch op and refreshes the active sketch on success', async () => {
    const connection = createMockConnection();
    const fs = createMockFs();
    const { result } = await openAndSettle(connection, fs, 'sk-1');
    const sketchFetches = fakeClient.getSketch.mock.calls.length;
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 5, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ];
    const constraints: SketchConstraintDto[] = [{ kind: 'distance', id: 10, refs: [1, 2], value: 5 }];

    let applyResult: FeatureOpResult | undefined;
    await act(async () => {
      applyResult = await result.current.applyUpdate(entities, constraints);
    });

    expect(fs.applyOp).toHaveBeenCalledWith({ kind: 'updateSketch', sketchId: 'sk-1', entities, constraints });
    expect(applyResult).toEqual({ ok: true, featureId: 'sk-new' });
    await waitFor(() => expect(fakeClient.getSketch.mock.calls.length).toBeGreaterThan(sketchFetches));
    expect(result.current.activeSketch).toEqual(fakeClient.makeSketch('sk-1'));
    expect(result.current.error).toBeUndefined();
  });

  it('applyUpdate failure surfaces the error state and returns the result without refetching', async () => {
    const connection = createMockConnection();
    const fs = createMockFs();
    const { result } = await openAndSettle(connection, fs, 'sk-1');
    const sketchFetches = fakeClient.getSketch.mock.calls.length;
    fs.applyOp.mockResolvedValueOnce({ ok: false, error: '欠约束 dof=2：实体 [3]' });

    let applyResult: FeatureOpResult | undefined;
    await act(async () => {
      applyResult = await result.current.applyUpdate([], []);
    });

    expect(applyResult).toEqual({ ok: false, error: '欠约束 dof=2：实体 [3]' });
    expect(result.current.error).toBe('欠约束 dof=2：实体 [3]');
    expect(fakeClient.getSketch.mock.calls.length).toBe(sketchFetches);
  });

  it('applyUpdate without an open sketch rejects without calling fs.applyOp', async () => {
    const connection = createMockConnection();
    const fs = createMockFs();
    const { result } = renderSketchSystem(connection, fs);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let applyResult: FeatureOpResult | undefined;
    await act(async () => {
      applyResult = await result.current.applyUpdate([], []);
    });

    expect(applyResult?.ok).toBe(false);
    expect(typeof (applyResult as { error?: string }).error).toBe('string');
    expect(fs.applyOp).not.toHaveBeenCalled();
  });

  it('createSketch forwards an insertSketch op and opens the new sketch by returned featureId', async () => {
    const connection = createMockConnection();
    const fs = createMockFs();
    const { result } = renderSketchSystem(connection, fs);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const listFetches = fakeClient.listSketches.mock.calls.length;
    const entities: SketchEntityDto[] = [{ kind: 'point', id: 1, x: 0, y: 0 }];
    const constraints: SketchConstraintDto[] = [];

    let createResult: FeatureOpResult | undefined;
    await act(async () => {
      createResult = await result.current.createSketch(entities, constraints);
    });

    expect(fs.applyOp).toHaveBeenCalledWith({ kind: 'insertSketch', entities, constraints });
    expect(createResult).toEqual({ ok: true, featureId: 'sk-new' });
    expect(fakeClient.getSketch).toHaveBeenCalledWith('test-model.bim', 'sk-new');
    expect(result.current.activeSketch).toEqual(fakeClient.makeSketch('sk-new'));
    await waitFor(() => expect(fakeClient.listSketches.mock.calls.length).toBeGreaterThan(listFetches));
    expect(result.current.error).toBeUndefined();
  });

  it('createSketch failure surfaces the error state and returns the result without opening', async () => {
    const connection = createMockConnection();
    const fs = createMockFs();
    const { result } = renderSketchSystem(connection, fs);
    await waitFor(() => expect(result.current.loading).toBe(false));
    fs.applyOp.mockResolvedValueOnce({ ok: false, error: '冲突约束 [10, 11]' });

    let createResult: FeatureOpResult | undefined;
    await act(async () => {
      createResult = await result.current.createSketch([], []);
    });

    expect(createResult).toEqual({ ok: false, error: '冲突约束 [10, 11]' });
    expect(result.current.error).toBe('冲突约束 [10, 11]');
    expect(fakeClient.getSketch).not.toHaveBeenCalled();
  });

  it('mutations without a feature system return an error result', async () => {
    const connection = createMockConnection();
    const { result } = renderSketchSystem(connection, undefined);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let applyResult: FeatureOpResult | undefined;
    let createResult: FeatureOpResult | undefined;
    await act(async () => {
      applyResult = await result.current.applyUpdate([], []);
      createResult = await result.current.createSketch([], []);
    });

    expect(applyResult?.ok).toBe(false);
    expect(createResult?.ok).toBe(false);
    expect((applyResult as { error?: string }).error).toContain('特征系统');
  });

  it('refetches the active sketch when connection.txns.onCommitted fires', async () => {
    const connection = createMockConnection();
    const { result } = await openAndSettle(connection, createMockFs(), 'sk-1');
    const sketchFetches = fakeClient.getSketch.mock.calls.length;

    act(() => {
      connection.emitCommitted();
    });

    await waitFor(() => expect(fakeClient.getSketch.mock.calls.length).toBeGreaterThan(sketchFetches));
    expect(fakeClient.getSketch).toHaveBeenLastCalledWith('test-model.bim', 'sk-1');
  });

  it('a refresh in flight must not clobber a newer openSketch (stale-clobber race)', async () => {
    const connection = createMockConnection();
    const { result } = await openAndSettle(connection, createMockFs(), 'sk-1');
    expect(result.current.activeSketch?.id).toBe('sk-1');

    // Gate the next getSketch so the onCommitted-triggered refresh stays in flight.
    let releaseRefresh!: (sketch: SketchDto) => void;
    const refreshGate = new Promise<SketchDto>((resolve) => {
      releaseRefresh = resolve;
    });
    fakeClient.getSketch.mockReturnValueOnce(refreshGate);

    const callsBefore = fakeClient.getSketch.mock.calls.length;
    act(() => {
      connection.emitCommitted();
    });
    // Wait for the refresh to actually be in flight (its gated getSketch was issued).
    await waitFor(() => expect(fakeClient.getSketch.mock.calls.length).toBe(callsBefore + 1));
    expect(fakeClient.getSketch).toHaveBeenLastCalledWith('test-model.bim', 'sk-1');

    // Switch sketch while the refresh is still awaiting the gate.
    await act(async () => {
      await result.current.openSketch('sk-2');
    });
    expect(result.current.activeSketch?.id).toBe('sk-2');

    // The stale refresh resolves late: list still lands, activeSketch must not revert to sk-1.
    await act(async () => {
      releaseRefresh(fakeClient.makeSketch('sk-1'));
    });
    expect(result.current.activeSketch?.id).toBe('sk-2');
    expect(result.current.sketches).toEqual(fakeClient.makeSummaries());
  });

  it('a refresh in flight must not clobber closeSketch (stale-clobber race)', async () => {
    const connection = createMockConnection();
    const { result } = await openAndSettle(connection, createMockFs(), 'sk-1');

    let releaseRefresh!: (sketch: SketchDto) => void;
    const refreshGate = new Promise<SketchDto>((resolve) => {
      releaseRefresh = resolve;
    });
    fakeClient.getSketch.mockReturnValueOnce(refreshGate);

    const callsBefore = fakeClient.getSketch.mock.calls.length;
    act(() => {
      connection.emitCommitted();
    });
    await waitFor(() => expect(fakeClient.getSketch.mock.calls.length).toBe(callsBefore + 1));
    expect(fakeClient.getSketch).toHaveBeenLastCalledWith('test-model.bim', 'sk-1');

    act(() => {
      result.current.closeSketch();
    });
    expect(result.current.activeSketch).toBeUndefined();

    // The stale refresh resolves late: activeSketch must stay cleared, list still lands.
    await act(async () => {
      releaseRefresh(fakeClient.makeSketch('sk-1'));
    });
    expect(result.current.activeSketch).toBeUndefined();
    expect(result.current.sketches).toEqual(fakeClient.makeSummaries());
  });

  it('a late openSketch resolution superseded by a newer open is discarded', async () => {
    const connection = createMockConnection();

    // Gate the first open so the second open supersedes it while in flight.
    let releaseFirst!: (sketch: SketchDto) => void;
    const firstGate = new Promise<SketchDto>((resolve) => {
      releaseFirst = resolve;
    });
    fakeClient.getSketch.mockReturnValueOnce(firstGate);

    const { result } = renderSketchSystem(connection, createMockFs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstOpen!: Promise<void>;
    await act(async () => {
      firstOpen = result.current.openSketch('sk-1');
    });
    await waitFor(() => expect(fakeClient.getSketch).toHaveBeenCalledWith('test-model.bim', 'sk-1'));

    await act(async () => {
      await result.current.openSketch('sk-2');
    });
    expect(result.current.activeSketch?.id).toBe('sk-2');

    // Release the stale sk-1 resolution: it must be discarded, not clobber sk-2.
    await act(async () => {
      releaseFirst(fakeClient.makeSketch('sk-1'));
      await firstOpen;
    });
    expect(result.current.activeSketch?.id).toBe('sk-2');
  });

  it('unsubscribes onCommitted on unmount', () => {
    const connection = createMockConnection();

    const { unmount } = renderSketchSystem(connection, createMockFs());
    unmount();

    expect(connection.txns.onCommitted.removeListener).toHaveBeenCalled();
  });

  it('listSketches failure surfaces the error state and clears loading', async () => {
    const connection = createMockConnection();
    fakeClient.listSketches.mockRejectedValueOnce(new Error('后端不可用'));

    const { result } = renderSketchSystem(connection, createMockFs());

    await waitFor(() => expect(result.current.error).toBe('后端不可用'));
    expect(result.current.loading).toBe(false);
    expect(result.current.sketches).toEqual([]);
  });
});
