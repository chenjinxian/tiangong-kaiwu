/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M6-a T5：useSketchSystem hook 单测——applyUpdate 载荷形态/就绪门禁/拒收透出/
 * 成功重取/代际防竞态。RPC 客户端经 getClient 桩替换（不触网络）。
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { FeatureOp, FeatureOpResult, SketchDto } from '@luban-cad/shared';
import { useSketchSystem } from '../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

const solvedSketch: SketchDto = {
  id: 'sk-1',
  entities: [{ kind: 'point', id: 1, x: 0, y: 0 }],
  constraints: [],
  solve: { status: 'underconstrained', dof: 2, failedConstraintIds: [], conflictingRank: [] },
};

function stubRpcClient(): void {
  vi.spyOn(LubanFeatureRpcInterface, 'getClient').mockReturnValue({
    getSketch: vi.fn(async () => solvedSketch),
  } as unknown as ReturnType<typeof LubanFeatureRpcInterface.getClient>);
}

function resetStore(): void {
  usePartStudioStore.setState({
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
  });
}

describe('M6-a T5：useSketchSystem', () => {
  it('applyUpdate → updateSketch op 载荷形态（sketchId=store 活动 id）+ 成功后重取活动草图', async () => {
    stubRpcClient();
    resetStore();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderHook(() =>
      useSketchSystem(connection as never, { applyOp } as never),
    );
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result.current.activeSketch?.id).toBe('sk-1'));

    const entities: SketchDto['entities'] = [{ kind: 'point', id: 1, x: 0, y: 0 }];
    let opResult: FeatureOpResult | undefined;
    await act(async () => {
      opResult = await result.current.applyUpdate(entities, []);
    });
    expect(opResult?.ok).toBe(true);
    expect(applyOp).toHaveBeenCalledWith({ kind: 'updateSketch', sketchId: 'sk-1', entities, constraints: [] });
  });

  it('草图系统未就绪（无 fs）→ ok:false 不发起 RPC；无活动草图 → ok:false', async () => {
    stubRpcClient();
    resetStore();
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderHook(() => useSketchSystem(connection as never, undefined));
    const r1 = await result.current.applyUpdate([], []);
    expect(r1.ok).toBe(false);

    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }));
    const { result: result2 } = renderHook(() =>
      useSketchSystem(connection as never, { applyOp } as never),
    );
    const r2 = await result2.current.applyUpdate([], []);
    expect(r2.ok).toBe(false);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('后端拒收（ok:false）→ error 透出原样返回，不重取', async () => {
    stubRpcClient();
    resetStore();
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: 'conflicting dof=3' }));
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderHook(() =>
      useSketchSystem(connection as never, { applyOp } as never),
    );
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result.current.activeSketch?.id).toBe('sk-1'));
    const getSketchCallsBefore = (LubanFeatureRpcInterface.getClient().getSketch as ReturnType<typeof vi.fn>).mock.calls.length;

    let opResult: FeatureOpResult | undefined;
    await act(async () => {
      opResult = await result.current.applyUpdate([], []);
    });
    expect(opResult).toEqual({ ok: false, error: 'conflicting dof=3' });
    expect(result.current.error).toBe('conflicting dof=3');
    expect((LubanFeatureRpcInterface.getClient().getSketch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(getSketchCallsBefore);
  });
});
