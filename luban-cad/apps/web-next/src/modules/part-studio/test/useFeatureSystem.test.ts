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
//
// M5 Task 1（P0 呈现链修复批）追加断言面：
//  - D-T9-6：txns.onAfterUndoRedo 触发 refresh（反转事务不发 onCommitted——
//    M4 终审 MS 日志实证；官方双订口径 BriefcaseConnection.ts:124-128）；
//  - T5-①：慢响应纪元守卫——首个 getFeatureTree 悬挂，第二次 refresh 先返回
//    新树，放行首响应后被纪元丢弃（树仍为新树，loading 落定 false）；
//  - 超时兜底：applyFeatureOp / getFeatureTree 永悬挂 → FEATURE_OP_TIMEOUT_MS
//   (15s) 后超时 reject/置 error（RPC 悬挂不再永久 busy）。
// M5 发布窗（B2 只读写门禁）追加断言面：
//  - readonly 连接 applyOp 前置拒收（零租约获取零派发，i18n 只读错误）；
//  - 同页双会话（StrictMode 双挂载）readonly 下 applyOp 即返——不进租约获取
//    等待环、会话间零租约竞争（B2 aria-busy 40-65s 现场的 hook 级回归钉）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { BodyInfo, FeatureOp, FeatureOpResult, FeatureTreeEntry } from '@luban-cad/shared';
import { FEATURE_OP_TIMEOUT_MS, useFeatureSystem } from '../hooks/useFeatureSystem.js';

// ---------------------------------------------------------------------------
// LubanFeatureRpcInterface.getClient() 可编程替身（本版子集五方法；M-A3.2a 增 getBodies）
// ---------------------------------------------------------------------------
const fakeClient = vi.hoisted(() => {
  const makeTree = (): FeatureTreeEntry[] => [
    { id: 'f1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
  ];
  const makeBodies = (): BodyInfo[] => [
    { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' },
  ];
  return {
    makeTree,
    makeBodies,
    getFeatureTree: vi.fn(async (_key: string): Promise<FeatureTreeEntry[]> => makeTree()),
    // B6 M-A3.2a：body 读面（与树同刷新）。
    getBodies: vi.fn(async (_key: string): Promise<BodyInfo[]> => makeBodies()),
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
// BriefcaseConnection 替身：key + isReadonly + txns.onCommitted/onAfterUndoRedo
//（hook 契约面；M5-T1 增订 onAfterUndoRedo——D-T9-6）
// ---------------------------------------------------------------------------
function createMockConnection({ isReadonly = false }: { isReadonly?: boolean } = {}) {
  const committedListeners = new Set<(hasPending: boolean) => void>();
  const undoRedoListeners = new Set<(isUndo: boolean) => void>();
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
      onAfterUndoRedo: {
        addListener: vi.fn((listener: (isUndo: boolean) => void) => {
          undoRedoListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (isUndo: boolean) => void) => {
          undoRedoListeners.delete(listener);
        }),
      },
    },
    emitCommitted() {
      committedListeners.forEach((listener) => listener(false));
    },
    emitAfterUndoRedo(isUndo = true) {
      undoRedoListeners.forEach((listener) => listener(isUndo));
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

  // ── M5 发布窗（B2 只读写门禁，hook 层防御纵深）──────────────────────────
  // B2 现场：hub 权限缺陷致 E2E Seed 仅 webview → briefcase readonly（isReadonly）
  // 打开，UI 门缺位时写 op 被放行进租约获取等待环（服务端租约表不校验 readonly，
  // 双会话互持 → 35s 预算耗尽，aria-busy 40-65s）。hook 层门：readonly 下
  // applyOp 前置拒收，零租约 IPC 零派发。

  it('B2 只读写门禁：readonly 连接 applyOp 前置拒收（零租约获取零派发，i18n 只读错误）', async () => {
    const connection = createMockConnection({ isReadonly: true });
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.tree).toEqual(fakeClient.makeTree()));

    let applyResult: Awaited<ReturnType<typeof result.current.applyOp>> | undefined;
    await act(async () => {
      applyResult = await result.current.applyOp(op);
    });

    expect(applyResult).toEqual({
      ok: false,
      error: '只读会话（iModel 权限不含写或已切仅查看模式）：不可执行特征写操作',
    });
    expect(fakeClient.acquireWriteLease).not.toHaveBeenCalled();
    expect(fakeClient.applyFeatureOp).not.toHaveBeenCalled();
  });

  it('B2 现场复刻：同页双会话（readonly，StrictMode 双挂载）——applyOp 即返不进租约环，会话间零租约竞争', async () => {
    const connection = createMockConnection({ isReadonly: true });
    const op: FeatureOp = { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10 } };
    // 服务端租约表不校验 readonly（B2 自首④）：enabled 覆盖的租约生命周期照常
    // 动作（裁决归调用方），两会话各自 acquire——正是 B2「互持租约互卡」的土壤。
    fakeClient.acquireWriteLease.mockImplementation(async () => ({ ok: false, holder: 'twin-session' }));

    const first = renderHook(() => useFeatureSystem(connection as never, { enabled: true }), {
      wrapper: React.StrictMode,
    });
    const second = renderHook(() => useFeatureSystem(connection as never, { enabled: true }), {
      wrapper: React.StrictMode,
    });
    // 租约生命周期动作全部落定（StrictMode 双挂载 acquire+release+acquire）。
    await waitFor(() => expect(fakeClient.acquireWriteLease.mock.calls.length).toBeGreaterThanOrEqual(2));
    const leaseCallsBeforeApply = fakeClient.acquireWriteLease.mock.calls.length;

    let applyResult: Awaited<ReturnType<typeof second.result.current.applyOp>> | undefined;
    const startedAt = Date.now();
    await act(async () => {
      applyResult = await second.result.current.applyOp(op);
    });
    const elapsedMs = Date.now() - startedAt;

    // 前置拒收：即返（真时钟下 <5s；门禁缺位则 2s 一跳 × 35s 预算必超）+
    // 零新增租约获取（不与 twin-session 竞争）+ 零派发。
    expect(elapsedMs).toBeLessThan(5_000);
    expect(applyResult?.ok).toBe(false);
    expect((applyResult as { error: string }).error).toContain('只读会话');
    expect(fakeClient.acquireWriteLease.mock.calls.length).toBe(leaseCallsBeforeApply);
    expect(fakeClient.applyFeatureOp).not.toHaveBeenCalled();

    first.unmount();
    second.unmount();
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

  it('StrictMode 双挂载：acquire→release→acquire 无双租约泄漏（disposed 哨兵挡迟到回包；T5 交接挂单）', async () => {
    const connection = createMockConnection();
    // 第一次 acquire（首个挂载 effect）挂起不落定；第二次（StrictMode 重挂）即成。
    let releaseFirst!: (value: { ok: boolean; holder?: string }) => void;
    fakeClient.acquireWriteLease.mockImplementation(async (_key: string, _sessionId: string) => {
      if (fakeClient.acquireWriteLease.mock.calls.length === 1) {
        return new Promise<{ ok: boolean; holder?: string }>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return { ok: true, holder: 'self' };
    });

    // main.tsx 以 StrictMode 包壳：挂载→清理→再挂载。同 hook 实例同 sessionId
    //（useRef 跨 StrictMode 重挂保留）——acquire 两次、release 一次（首个 effect
    // 的 cleanup），服务端语义=同 sessionId 幂等刷新 TTL，无第二个租约泄漏。
    const { result, unmount } = renderHook(() => useFeatureSystem(connection as never), {
      wrapper: React.StrictMode,
    });

    await waitFor(() => expect(fakeClient.acquireWriteLease).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fakeClient.releaseWriteLease).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.leaseOk).toBe(true));

    // 首个挂载的迟到回包此刻才落定（拟拒收）：disposed 哨兵必须挡下，不得把
    // 二次挂载已得的 leaseOk=true 翻回 false。
    await act(async () => {
      releaseFirst({ ok: false, holder: 'stale-page' });
      await Promise.resolve();
    });
    expect(result.current.leaseOk).toBe(true);

    unmount();
    // 真卸载：二次挂载 effect 的 cleanup 再 release（两次清理各对应一次 effect 运行）。
    expect(fakeClient.releaseWriteLease).toHaveBeenCalledTimes(2);
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

  // ── M5-T1（P0 呈现链修复批）──────────────────────────────────────────────

  it('D-T9-6：txns.onAfterUndoRedo 触发 refresh（反转事务不发 onCommitted，双订口径）', async () => {
    const connection = createMockConnection();

    const { result, unmount } = renderFeatureSystem(connection);
    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(1));

    act(() => {
      connection.emitAfterUndoRedo(true);
    });

    await waitFor(() => expect(fakeClient.getFeatureTree).toHaveBeenCalledTimes(2));

    unmount();
    expect(connection.txns.onAfterUndoRedo.removeListener).toHaveBeenCalled();
  });

  // ── B6 M-A3.2a：body 读面（getBodies 与树同刷新）──────────────────────────

  it('mount 经 getBodies(connection.key) 读 body 读面（bodies/bodiesLoaded 就绪）', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);

    expect(result.current.bodies).toEqual([]);
    expect(result.current.bodiesLoaded).toBe(false);
    await waitFor(() => expect(result.current.bodiesLoaded).toBe(true));
    expect(fakeClient.getBodies).toHaveBeenCalledWith('test-model.bim');
    expect(result.current.bodies).toEqual(fakeClient.makeBodies());
    expect(result.current.bodiesError).toBeUndefined();
    expect(result.current.bodiesLoading).toBe(false);
  });

  it('onCommitted / onAfterUndoRedo 同时刷新树与 bodies（同一 refresh 通道）', async () => {
    const connection = createMockConnection();

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(fakeClient.getBodies).toHaveBeenCalledTimes(1));

    act(() => {
      connection.emitCommitted();
    });
    await waitFor(() => expect(fakeClient.getBodies).toHaveBeenCalledTimes(2));

    act(() => {
      connection.emitAfterUndoRedo(true);
    });
    await waitFor(() => expect(fakeClient.getBodies).toHaveBeenCalledTimes(3));
    expect(result.current.bodiesLoaded).toBe(true);
  });

  it('applyOp 成功后 refresh 同时重读 bodies（消费态 active=false 随树刷新落到读面）', async () => {
    const connection = createMockConnection();
    const consumed: BodyInfo[] = [
      { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' },
      { bodyKey: '0x18', name: 'Body 2', active: false, authored: true },
    ];
    fakeClient.getBodies.mockResolvedValueOnce(fakeClient.makeBodies()).mockResolvedValue(consumed);

    const { result } = renderFeatureSystem(connection);
    await waitFor(() => expect(result.current.bodiesLoaded).toBe(true));
    const before = fakeClient.getBodies.mock.calls.length;

    await act(async () => {
      await result.current.applyOp({ kind: 'deleteFeature', featureId: 'f2', targetBodyId: '0x18' });
    });

    await waitFor(() => expect(fakeClient.getBodies.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(result.current.bodies).toEqual(consumed));
  });

  it('getBodies 失败与树错误隔离：树照常落定，bodiesError 单独呈现（不翻树 error/loading）', async () => {
    const connection = createMockConnection();
    fakeClient.getBodies.mockRejectedValueOnce(new Error('getBodies boom'));

    const { result } = renderFeatureSystem(connection);

    await waitFor(() => expect(result.current.bodiesLoading).toBe(false));
    expect(result.current.tree).toEqual(fakeClient.makeTree());
    expect(result.current.error).toBeUndefined();
    expect(result.current.bodiesLoaded).toBe(false);
    expect(result.current.bodiesError).toContain('getBodies boom');
  });

  it('getBodies 超时同样落定（bodiesLoading 不永久 busy）', async () => {
    const connection = createMockConnection();
    fakeClient.getBodies.mockImplementation(() => new Promise<BodyInfo[]>(() => undefined));

    vi.useFakeTimers();
    try {
      const { result } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.bodiesLoading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(FEATURE_OP_TIMEOUT_MS);
      });
      expect(result.current.bodiesLoading).toBe(false);
      expect(result.current.bodiesError).toContain('超时');
    } finally {
      vi.useRealTimers();
    }
  });

  it('无连接：bodies 空集、bodiesLoaded=false、零 getBodies RPC', () => {
    const { result } = renderFeatureSystem(undefined);

    expect(result.current.bodies).toEqual([]);
    expect(result.current.bodiesLoaded).toBe(false);
    expect(fakeClient.getBodies).not.toHaveBeenCalled();
  });

  it('T5-①：慢响应纪元守卫——首个 getFeatureTree 悬挂，第二次 refresh 先返回新树，放行首响应后树仍为新树', async () => {
    const connection = createMockConnection();
    const newTree: FeatureTreeEntry[] = [
      { id: 'f2', featureType: 'fillet', orderKey: 2, suppressed: false, status: 0, params: {} },
    ];
    // 首个调用（mount 引导）悬挂；第二次调用（显式 refresh）返回新树。
    let releaseFirst!: (entries: FeatureTreeEntry[]) => void;
    fakeClient.getFeatureTree
      .mockImplementationOnce(
        () => new Promise<FeatureTreeEntry[]>((resolve) => { releaseFirst = resolve; }),
      )
      .mockResolvedValueOnce(newTree);

    const { result } = renderFeatureSystem(connection);
    await act(async () => {}); // 冲刷 mount effect：引导 refresh 悬挂中
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.refresh(); // 第二次：新树先落
    });
    expect(result.current.tree).toEqual(newTree);
    expect(result.current.loading).toBe(false);

    // 放行首响应：晚到的旧树必须被纪元丢弃（不得翻回 loading/覆盖新树）。
    await act(async () => {
      releaseFirst(fakeClient.makeTree());
      await new Promise((resolve) => setTimeout(resolve, 0)); // 宏任务边界保证微任务链冲刷
    });
    expect(result.current.tree).toEqual(newTree);
    expect(result.current.loading).toBe(false);
  });

  it('超时兜底：applyFeatureOp 永悬挂 → FEATURE_OP_TIMEOUT_MS 后 reject（i18n 超时错误，经既有错误面可达）', async () => {
    const connection = createMockConnection();
    const op: FeatureOp = { kind: 'deleteFeature', featureId: 'f1' };
    fakeClient.applyFeatureOp.mockImplementation(
      () => new Promise<FeatureOpResult>(() => undefined), // 永悬挂（rpc-over-ipc 挂死）
    );

    vi.useFakeTimers();
    try {
      const { result } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // 冲刷 mount 引导（读树/租约均即时落定）
      });

      let caught: unknown;
      await act(async () => {
        const pending = result.current.applyOp(op).catch((err: unknown) => { caught = err; });
        await vi.advanceTimersByTimeAsync(FEATURE_OP_TIMEOUT_MS);
        await pending;
      });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain('超时');
    } finally {
      vi.useRealTimers();
    }
  });

  it('超时兜底：getFeatureTree 永悬挂 → 超时置 error 且 loading 落定（树侧不永久 busy）', async () => {
    const connection = createMockConnection();
    fakeClient.getFeatureTree.mockImplementation(
      () => new Promise<FeatureTreeEntry[]>(() => undefined), // 永悬挂
    );

    vi.useFakeTimers();
    try {
      const { result } = renderFeatureSystem(connection);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(FEATURE_OP_TIMEOUT_MS);
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toContain('超时');
    } finally {
      vi.useRealTimers();
    }
  });
});
