// src/modules/part-studio/test/useFeatureSystem.test.ts
//
// M4 Task 5：特征系统中枢 hook 单元测试——旧应用
// apps/web/features/editor/hooks/useFeatureSystem.test.ts 的**子集移植**
//（延后面 previewOp/resolveEdgeRef/resolveFaceRef/formModel 的四组用例不随迁，
// 与 hook 同步登记于特征对话框增强 backlog）。断言面：
//  - 读树：mount 经 getFeatureTree(connection.key)；无连接 idle 零 RPC；
//  - 写租约：mount acquire → leaseOk=true、10s renew、unmount release；
//    opts.enabled=false / readonly 连接不申请但读树不受阻；拒收 → leaseOk=false；
//  - applyOp：成功转发 op+sessionId 且 refresh；失败仅回错误结果不 refresh；
//    陈旧租约自愈（有限重试得手再派发）；被持续持有则越 35s 预算报 holder 不派发；
//  - 事件：txns.onCommitted 触发 refresh；unmount 退订。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FeatureOp, FeatureOpResult, FeatureTreeEntry } from '@luban-cad/shared';
import { useFeatureSystem } from '../hooks/useFeatureSystem.js';

// ---------------------------------------------------------------------------
// LubanFeatureRpcInterface.getClient() 可编程替身（本版子集四方法）
// ---------------------------------------------------------------------------
const fakeClient = vi.hoisted(() => {
  const makeTree = (): FeatureTreeEntry[] => [
    { id: 'f1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
  ];
  return {
    makeTree,
    getFeatureTree: vi.fn(async (_key: string): Promise<FeatureTreeEntry[]> => makeTree()),
    // 返回型宽化到契约联合（旧源 as const 字面量型在 mockResolvedValueOnce 改写
    // 拒收分支时与 strict tsc 相抵——web-next build 门含 tsc --noEmit 全量测）。
    applyFeatureOp: vi.fn(async (_key: string, _op: FeatureOp, _sessionId: string): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f2' })),
    acquireWriteLease: vi.fn(async (_key: string, _sessionId: string): Promise<{ ok: boolean; holder?: string }> => ({ ok: true, holder: 'tester' })),
    releaseWriteLease: vi.fn(async (_key: string, _sessionId: string): Promise<void> => undefined),
  };
});

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => fakeClient,
  },
}));

// ---------------------------------------------------------------------------
// BriefcaseConnection 替身：key + isReadonly + txns.onCommitted（hook 契约面）
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

describe('useFeatureSystem（旧 useFeatureSystem.ts 子集移植）', () => {
  beforeEach(() => {
    // resetAllMocks（非 clearAllMocks）：clear 只清调用记录，不清实现——
    // 「租约被持续持有」用例的 mockImplementation（永拒）会跨用例泄漏。
    // vitest 2+ 语义：reset 回到 vi.fn(impl) 的初始实现（基础替身不受损）。
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('mount 经 getFeatureTree(connection.key) 读树', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);

    expect(result.current.tree).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fakeClient.getFeatureTree).toHaveBeenCalledWith('test-model.bim');
    expect(result.current.tree).toEqual(fakeClient.makeTree());
    expect(result.current.error).toBeUndefined();
  });

  it('无连接保持 idle（零 RPC、空树、leaseOk=false）', () => {
    const { result } = renderFeatureSystem(undefined);

    expect(result.current.tree).toEqual([]);
    expect(result.current.leaseOk).toBe(false);
    expect(fakeClient.getFeatureTree).not.toHaveBeenCalled();
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
  });

  it('mount 申请写租约（leaseOk=true），unmount 释放', async () => {
    const connection = createMockConnection();

    const { result, unmount } = renderFeatureSystem(connection);

    await waitFor(() => expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(1));
    expect(fakeClient.acquireWriteLease).toHaveBeenCalledWith('test-model.bim', expect.any(String));
    expect(result.current.leaseOk).toBe(true);

    unmount();

    expect(fakeClient.releaseWriteLease).toHaveBeenCalledWith('test-model.bim', expect.any(String));
  });

  it('enabled 期间每 10s 续租', async () => {
    const connection = createMockConnection();

    // Fake timers 必须先于 mount 安装，renew interval 才落在被 mock 的时钟上
    //（setInterval 在 effect 时刻即被捕获）。
    vi.useFakeTimers();
    try {
      const { unmount } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // 冲刷 mount effects + 首次 acquire
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

  it('opts.enabled=false 不申请租约，但读树不受阻', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection, { enabled: false });

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
    expect(result.current.leaseOk).toBe(false);
  });

  it('readonly 连接默认不 enabled（不申请租约）', async () => {
    const connection = createMockConnection({ isReadonly: true });

    const { result } = renderFeatureSystem(connection);

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
    expect(result.current.leaseOk).toBe(false);
  });

  it('readonly 连接上 opts.enabled=true 覆盖生效', async () => {
    const connection = createMockConnection({ isReadonly: true });

    renderFeatureSystem(connection, { enabled: true });

    await waitFor(() => expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(1));
  });

  it('租约被拒 → leaseOk=false，读树照常（只读降级不阻断）', async () => {
    const connection = createMockConnection();
    fakeClient.acquireWriteLease.mockResolvedValueOnce({ ok: false, holder: 'someone-else' });

    const { result } = renderFeatureSystem(connection);

    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));
    expect(result.current.leaseOk).toBe(false);
  });

  it('applyOp 转发 op + sessionId，成功后自动 refresh', async () => {
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

  it('applyOp 失败仅回错误结果，不 refresh', async () => {
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

  it('applyOp 自愈陈旧租约：预取被拒 → 有限重试得手 → 派发 op', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };

    // Fake timers 先于 mount 安装（renew 范式），mount 初始 acquire 在 advance(0) 内冲刷
    vi.useFakeTimers();
    try {
      const { result } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // op 前预取第一次被陈旧租约拒（mockResolvedValueOnce 恰好落在 applyOp 的首个预取上）
      fakeClient.acquireWriteLease.mockResolvedValueOnce({ ok: false, holder: 'stale-page' });

      let applyResult: Awaited<ReturnType<typeof result.current.applyOp>> | undefined;
      await act(async () => {
        const pending = result.current.applyOp(op).then((r) => {
          applyResult = r;
        });
        await vi.advanceTimersByTimeAsync(2_100); // 跨过 2s 重试间隔
        await pending;
      });

      expect(applyResult).toEqual({ ok: true, featureId: 'f2' });
      expect(fakeClient.applyFeatureOp).toHaveBeenCalledWith('test-model.bim', op, expect.any(String));
    } finally {
      vi.useRealTimers();
    }
  });

  it('applyOp 租约被持续持有时有限重试后报 holder，且不派发 op', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };

    vi.useFakeTimers();
    try {
      const { result } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fakeClient.acquireWriteLease.mockImplementation(async () => ({ ok: false, holder: 'live-editor' }));

      let applyResult: Awaited<ReturnType<typeof result.current.applyOp>> | undefined;
      await act(async () => {
        const pending = result.current.applyOp(op).then((r) => {
          applyResult = r;
        });
        await vi.advanceTimersByTimeAsync(40_000); // 越过 35s 预算上限
        await pending;
      });

      expect(applyResult).toEqual({ ok: false, error: '写租约被 live-editor 持有' });
      expect(fakeClient.applyFeatureOp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('txns.onCommitted 触发 refresh（外部 changeset 亦刷新）', async () => {
    const connection = createMockConnection();

    renderFeatureSystem(connection);
    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(1));

    act(() => {
      connection.emitCommitted();
    });

    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(2));
  });

  it('unmount 退订 onCommitted', async () => {
    const connection = createMockConnection();

    const { unmount } = renderFeatureSystem(connection);
    unmount();

    expect(connection.txns.onCommitted.removeListener).toHaveBeenCalled();
  });
});
