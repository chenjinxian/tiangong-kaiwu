/**
 * ADR-0020 S2：Part Studio 变量表只读 hook。
 *
 * 覆盖：未启用/无连接 → 不发读面；读成功；读取失败保留原值 + error；
 * onCommitted / onAfterUndoRedo 刷新；scope 参数透传。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { VariableDto } from '@luban-cad/shared';

const rpc = vi.hoisted(() => ({ getVariables: vi.fn() }));

vi.mock('@luban-cad/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@luban-cad/shared')>()),
  LubanFeatureRpcInterface: { getClient: () => rpc },
}));

import { usePartStudioVariables } from '../hooks/usePartStudioVariables.js';

interface FakeEvent {
  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
  fire: () => void;
}

function makeEvent(): FakeEvent {
  const listeners = new Set<() => void>();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    fire: () => { for (const listener of [...listeners]) listener(); },
  };
}

function makeConnection(key = 'briefcase-key'): {
  connection: BriefcaseConnection;
  committed: FakeEvent;
  undoRedo: FakeEvent;
} {
  const committed = makeEvent();
  const undoRedo = makeEvent();
  return {
    connection: { key, txns: { onCommitted: committed, onAfterUndoRedo: undoRedo } } as unknown as BriefcaseConnection,
    committed,
    undoRedo,
  };
}

const VARIABLES: VariableDto[] = [
  { id: 'v1', name: 'width', expression: '10', type: 'length' },
];

describe('usePartStudioVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.getVariables.mockResolvedValue(VARIABLES);
  });

  it('未启用（草图未激活）/无连接：返回 [] 且不发读面', async () => {
    const { connection } = makeConnection();
    const disabled = renderHook(() => usePartStudioVariables(connection, 'ps-1', false));
    await waitFor(() => expect(disabled.result.current.loading).toBe(false));
    expect(disabled.result.current.variables).toEqual([]);
    expect(disabled.result.current.scopeActive).toBe(false);
    expect(rpc.getVariables).not.toHaveBeenCalled();

    const noConnection = renderHook(() => usePartStudioVariables(undefined, 'ps-1', true));
    await waitFor(() => expect(noConnection.result.current.loading).toBe(false));
    expect(noConnection.result.current.variables).toEqual([]);
    expect(noConnection.result.current.scopeActive).toBe(false);
    expect(rpc.getVariables).not.toHaveBeenCalled();
  });

  it('启用：读变量表（scope 参数透传）并返回变量', async () => {
    const { connection } = makeConnection();
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-1', true));
    await waitFor(() => expect(result.current.variables).toEqual(VARIABLES));
    expect(rpc.getVariables).toHaveBeenCalledWith('briefcase-key', 'ps-1');
    expect(result.current.error).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('scope 缺省：只传 connectionKey（legacy 读面语义）', async () => {
    const { connection } = makeConnection();
    renderHook(() => usePartStudioVariables(connection, undefined, true));
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledWith('briefcase-key'));
  });

  it('读取失败：保留原值并暴露 error（不 throw、不阻塞草图）', async () => {
    const { connection } = makeConnection();
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-1', true));
    await waitFor(() => expect(result.current.variables).toEqual(VARIABLES));

    rpc.getVariables.mockRejectedValueOnce(new Error('变量表损坏'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.variables).toEqual(VARIABLES);
    expect(result.current.error).toBe('变量表损坏');
  });

  it('onCommitted / onAfterUndoRedo → 刷新（变量变更/撤销重做）', async () => {
    const { connection, committed, undoRedo } = makeConnection();
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-1', true));
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledTimes(1));

    rpc.getVariables.mockResolvedValueOnce([{ id: 'v1', name: 'width', expression: '20' }]);
    await act(async () => {
      committed.fire();
    });
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.variables[0]?.expression).toBe('20'));

    rpc.getVariables.mockResolvedValueOnce(VARIABLES);
    await act(async () => {
      undoRedo.fire();
    });
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.variables[0]?.expression).toBe('10'));
  });

  it('禁用后清空变量（草图退出不残留旧表）', async () => {
    const { connection } = makeConnection();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePartStudioVariables(connection, 'ps-1', enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.variables).toEqual(VARIABLES));
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.variables).toEqual([]));
  });
});

// ── ADR-0020 S3b review P1-1：scope 切换 stale 表不得暴露 ───────────────────
describe('usePartStudioVariables scope 标签（P1-1）', () => {
  const A: VariableDto[] = [{ id: 'a1', name: 'alpha', expression: '1' }];
  const B: VariableDto[] = [{ id: 'b1', name: 'beta', expression: '2' }];

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.getVariables.mockResolvedValue(VARIABLES);
  });

  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  }

  it('scope 切换瞬间清空旧表并 loading；新 scope 回包落位后才暴露', async () => {
    const { connection } = makeConnection();
    rpc.getVariables.mockResolvedValueOnce(A);
    const { result, rerender } = renderHook(
      ({ ps }: { ps: string }) => usePartStudioVariables(connection, ps, true),
      { initialProps: { ps: 'ps-A' } },
    );
    await waitFor(() => expect(result.current.variables).toEqual(A));

    const pendingB = deferred<VariableDto[]>();
    rpc.getVariables.mockImplementationOnce(() => pendingB.promise);
    rerender({ ps: 'ps-B' });
    // 切换后立即：旧表不可见、loading=true（即使 getVariables 尚未 resolve）。
    expect(result.current.variables).toEqual([]);
    expect(result.current.loading).toBe(true);

    pendingB.resolve(B);
    await waitFor(() => expect(result.current.variables).toEqual(B));
    expect(result.current.loading).toBe(false);
  });

  it('旧 scope 在途时切换：旧表不暴露；新读按队列在其后落位', async () => {
    const { connection } = makeConnection();
    const pendingA = deferred<VariableDto[]>();
    const pendingB = deferred<VariableDto[]>();
    rpc.getVariables
      .mockImplementationOnce(() => pendingA.promise)
      .mockImplementationOnce(() => pendingB.promise);
    const { result, rerender } = renderHook(
      ({ ps }: { ps: string }) => usePartStudioVariables(connection, ps, true),
      { initialProps: { ps: 'ps-A' } },
    );
    // A 在途；切到 B：旧表立即不可见（B 读与 A 可并发，epoch 只让 B 落位）。
    rerender({ ps: 'ps-B' });
    expect(result.current.variables).toEqual([]);
    expect(result.current.loading).toBe(true);

    pendingA.resolve(A);
    // A 的回包落地：仍不得暴露给 B；随后 B 的读开始。
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledTimes(2));
    expect(result.current.variables).toEqual([]);
    expect(result.current.loading).toBe(true);

    pendingB.resolve(B);
    await waitFor(() => expect(result.current.variables).toEqual(B));
    expect(result.current.loading).toBe(false);
  });

  it('ready 门：落位前 false；成功后 true；读取失败 false（P2-1）', async () => {
    const { connection } = makeConnection();
    const pending = deferred<VariableDto[]>();
    rpc.getVariables.mockImplementationOnce(() => pending.promise);
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-A', true));
    expect(result.current.ready).toBe(false);
    expect(result.current.scopeActive).toBe(true);
    expect(result.current.loading).toBe(true);
    pending.resolve(A);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.variables).toEqual(A);
    rpc.getVariables.mockRejectedValueOnce(new Error('读失败'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBe('读失败');
  });

  it('refresh 可靠等待最新读（B 先发起；A 迟到回包忽略，P3-1）', async () => {
    const { connection } = makeConnection();
    rpc.getVariables.mockResolvedValueOnce(A);
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-A', true));
    await waitFor(() => expect(result.current.variables).toEqual(A));

    const first = deferred<VariableDto[]>();
    const second = deferred<VariableDto[]>();
    rpc.getVariables
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const firstRefresh = result.current.refresh();
    const secondRefresh = result.current.refresh();
    // 两次读都在任何回包 resolve 之前发起（B 不被 A 阻塞）。
    await waitFor(() => expect(rpc.getVariables).toHaveBeenCalledTimes(3));

    // B 先落位并完成；A 的读仍在途。
    second.resolve(B);
    await act(async () => { await secondRefresh; });
    await waitFor(() => expect(result.current.variables).toEqual(B));
    expect(result.current.variables).toEqual(B);

    // A 迟到回包被 epoch 丢弃：仍是 B；firstRefresh 正常完成返回。
    first.resolve(A);
    await act(async () => { await firstRefresh; });
    expect(result.current.variables).toEqual(B);
    expect(result.current.loading).toBe(false);
  });

  it('同一 scope 刷新失败保留原值（不跨 scope 混用）', async () => {
    const { connection } = makeConnection();
    rpc.getVariables.mockResolvedValueOnce(A);
    const { result } = renderHook(() => usePartStudioVariables(connection, 'ps-A', true));
    await waitFor(() => expect(result.current.variables).toEqual(A));
    rpc.getVariables.mockRejectedValueOnce(new Error('读失败'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.variables).toEqual(A);
    expect(result.current.error).toBe('读失败');
  });
});
