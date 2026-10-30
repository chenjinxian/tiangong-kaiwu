/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M6-a T5：useSketchSystem hook 单测——applyUpdate 载荷形态/就绪门禁/拒收透出/
 * 成功重取/代际防竞态。M6-b T5 增 applyConstraintValue（updateSketchConstraint
 * 通道）载荷与门禁口径。RPC 客户端经 getClient 桩替换（不触网络）。
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

/** B-model v1.17：hook 经 useWorkspaceRef 读路由 `?model=`——必须在 Router 内渲染。 */
const LEGACY_PATH = '/documents/twin-1/im-1';

function routerWrapper(path: string) {
  // 本文件是 .ts（非 .tsx）：以 createElement 组 Router 壳，不引 JSX。
  return ({ children }: { children?: React.ReactNode }): React.JSX.Element =>
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/documents/:iTwinId/:iModelId',
          element: React.createElement(React.Fragment, null, children),
        }),
      ),
    );
}

function renderSketchSystem(
  connection: unknown,
  fs: Parameters<typeof useSketchSystem>[1],
  path: string = LEGACY_PATH,
) {
  return renderHook(() => useSketchSystem(connection as never, fs), { wrapper: routerWrapper(path) });
}

describe('M6-a T5：useSketchSystem', () => {
  it('applyUpdate → updateSketch op 载荷形态（sketchId=store 活动 id）+ 成功后重取活动草图', async () => {
    stubRpcClient();
    resetStore();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderSketchSystem(connection, { applyOp } as never);
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
    const { result } = renderSketchSystem(connection, undefined);
    const r1 = await result.current.applyUpdate([], []);
    expect(r1.ok).toBe(false);

    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }));
    const { result: result2 } = renderSketchSystem(connection, { applyOp } as never);
    const r2 = await result2.current.applyUpdate([], []);
    expect(r2.ok).toBe(false);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('M6-b T5：applyConstraintValue → updateSketchConstraint op 载荷（sketchId+constraintId+value）+ 成功后重取', async () => {
    stubRpcClient();
    resetStore();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderSketchSystem(connection, { applyOp } as never);
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result.current.activeSketch?.id).toBe('sk-1'));
    const callsBefore = (LubanFeatureRpcInterface.getClient().getSketch as ReturnType<typeof vi.fn>).mock.calls.length;

    let opResult: FeatureOpResult | undefined;
    await act(async () => {
      opResult = await result.current.applyConstraintValue(6, 12);
    });
    expect(opResult?.ok).toBe(true);
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateSketchConstraint',
      sketchId: 'sk-1',
      constraintId: 6,
      value: 12,
    });
    // 成功 → refresh 重取（后端改值重解算后的新现场）。
    expect((LubanFeatureRpcInterface.getClient().getSketch as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThan(callsBefore);
  });

  it('M6-b T5：applyConstraintValue 就绪门禁/拒收透出与 applyUpdate 同口径', async () => {
    stubRpcClient();
    resetStore();
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    // 无 fs → ok:false 不发起 RPC。
    const { result } = renderSketchSystem(connection, undefined);
    const r1 = await result.current.applyConstraintValue(6, 12);
    expect(r1.ok).toBe(false);

    // 拒收 → 原样返回不重取。
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: 'radius must be positive' }));
    const { result: result2 } = renderSketchSystem(connection, { applyOp } as never);
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result2.current.activeSketch?.id).toBe('sk-1'));
    let opResult: FeatureOpResult | undefined;
    await act(async () => {
      opResult = await result2.current.applyConstraintValue(7, -1);
    });
    expect(opResult).toEqual({ ok: false, error: 'radius must be positive' });
    expect(result2.current.error).toBe('radius must be positive');
  });

  it('后端拒收（ok:false）→ error 透出原样返回，不重取', async () => {
    stubRpcClient();
    resetStore();
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: 'conflicting dof=3' }));
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderSketchSystem(connection, { applyOp } as never);
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

  // ── B-model v1.17：Part Studio scope（路由 ?model=） ──────────────────────

  it('?model= 在场：getSketch 携带 Part Studio scope', async () => {
    stubRpcClient();
    resetStore();
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderSketchSystem(connection, undefined, '/documents/twin-1/im-1?model=ps-1');
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result.current.activeSketch?.id).toBe('sk-1'));
    expect(LubanFeatureRpcInterface.getClient().getSketch).toHaveBeenCalledWith('conn-1', 'sk-1', 'ps-1');
  });

  it('legacy 路由（无 ?model=）getSketch 省略 scope 实参（旧调用 arity 钉死）', async () => {
    stubRpcClient();
    resetStore();
    const connection = { key: 'conn-1', txns: { onCommitted: { addListener: vi.fn(), removeListener: vi.fn() } } };
    const { result } = renderSketchSystem(connection, undefined);
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await waitFor(() => expect(result.current.activeSketch?.id).toBe('sk-1'));
    const calls = (LubanFeatureRpcInterface.getClient().getSketch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]).toHaveLength(2);
  });
});
