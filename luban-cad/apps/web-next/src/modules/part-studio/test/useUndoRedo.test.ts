// src/modules/part-studio/test/useUndoRedo.test.ts
//
// M4 Task 4：撤销/重做/保存状态机（BriefcaseTxns 标准通道）单元测试——
//  1) 连接就绪引导：isUndoPossible/isRedoPossible/hasPendingTxns 三查询落位
//     canUndo/canRedo/hasUnsavedChanges；
//  2) 事件驱动刷新：onCommitted(hasPendingTxns) 直接落布尔 + 触发重查询；
//     onAfterUndoRedo（undo/redo 清空场景）触发重查询；
//  3) undo()/redo() 走 IModelApp.tools.run('Undo'/'Redo')——内置工具，事务语义
//     由 core 管理（控制器裁定：禁止旧自造 UndoManager 通道）；
//  4) saveChanges 代理 connection.saveChanges；connection null 全链 no-op；
//  5) 卸载摘除监听（事件不再触发重查询）。
//
// mock 口径：@itwin/core-frontend 仅替 IModelApp.tools.run（真实 core 模块参与）；
// BriefcaseConnection/BriefcaseTxns 以最小形状替身注入（事件桩 = BeEvent 兼容
// 的最小 addListener 面），不启动查看器/IPC。

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';

const coreMocks = vi.hoisted(() => ({
  toolsRun: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

vi.mock('@itwin/core-frontend', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    IModelApp: {
      ...(actual.IModelApp as object),
      tools: { run: coreMocks.toolsRun },
    },
  };
});

import { useUndoRedo } from '../hooks/useUndoRedo.js';

/** BeEvent 兼容最小事件桩（addListener 返回退订函数 + raise 直发）。 */
function makeEvent<A extends unknown[] = []>() {
  const listeners = new Set<(...args: A) => void>();
  return {
    addListener: (fn: (...args: A) => void): (() => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    raise: (...args: A): void => {
      for (const fn of [...listeners]) fn(...args);
    },
    listenerCount: (): number => listeners.size,
  };
}

type TxnsStub = {
  isUndoPossible: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  isRedoPossible: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  hasPendingTxns: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  onCommit: ReturnType<typeof makeEvent>;
  onCommitted: ReturnType<typeof makeEvent<[boolean, number]>>;
  onAfterUndoRedo: ReturnType<typeof makeEvent<[boolean]>>;
  onChangesPushed: ReturnType<typeof makeEvent<[unknown]>>;
};

/** txns 替身：全 false 缺省（干净 briefcase），用例按需覆写。 */
function makeTxns(): TxnsStub {
  return {
    isUndoPossible: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    isRedoPossible: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    hasPendingTxns: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    onCommit: makeEvent(),
    onCommitted: makeEvent<[boolean, number]>(),
    onAfterUndoRedo: makeEvent<[boolean]>(),
    onChangesPushed: makeEvent<[unknown]>(),
  };
}

/** 连接替身：saveChanges 可覆写（保存代理断言用）。 */
function makeConnection(txns: TxnsStub = makeTxns()) {
  return {
    key: 'briefcase-key',
    txns,
    saveChanges: vi.fn<(description?: string) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as BriefcaseConnection & { saveChanges: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  coreMocks.toolsRun.mockReset().mockResolvedValue(true);
});

describe('useUndoRedo（BriefcaseTxns 标准通道）', () => {
  it('连接就绪引导：三查询落位 canUndo/canRedo/hasUnsavedChanges', async () => {
    const txns = makeTxns();
    txns.isUndoPossible.mockResolvedValue(true);
    txns.hasPendingTxns.mockResolvedValue(true);
    const connection = makeConnection(txns);

    const { result } = renderHook(() => useUndoRedo(connection));

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
    });
    expect(result.current.canRedo).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(txns.isUndoPossible).toHaveBeenCalledTimes(1);
    expect(txns.isRedoPossible).toHaveBeenCalledTimes(1);
    expect(txns.hasPendingTxns).toHaveBeenCalledTimes(1);
  });

  it('connection null：全 false 且 undo/redo/save 全链 no-op', async () => {
    const { result } = renderHook(() => useUndoRedo(null));

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
    expect(result.current.canRedo).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(false);
    await act(async () => {
      await result.current.undo();
      await result.current.redo();
      await result.current.saveChanges();
    });
    expect(coreMocks.toolsRun).not.toHaveBeenCalled();
  });

  it('onCommitted(hasPendingTxns)：布尔直落 + 触发重查询', async () => {
    const txns = makeTxns();
    txns.hasPendingTxns.mockResolvedValue(true);
    txns.isUndoPossible.mockResolvedValue(true);
    const connection = makeConnection(txns);
    const { result } = renderHook(() => useUndoRedo(connection));

    await waitFor(() => {
      expect(result.current.hasUnsavedChanges).toBe(true);
    });
    const queriesBefore = txns.isUndoPossible.mock.calls.length;

    // 保存完成后：pending 清零 + undo 仍可能（保存不改撤销栈）。
    txns.hasPendingTxns.mockResolvedValue(false);
    act(() => {
      txns.onCommitted.raise(false, Date.now());
    });

    await waitFor(() => {
      expect(result.current.hasUnsavedChanges).toBe(false);
    });
    expect(txns.isUndoPossible.mock.calls.length).toBeGreaterThan(queriesBefore);
  });

  it('onCommit（提交前置事件）：hasUnsavedChanges 置 true', async () => {
    const connection = makeConnection();
    const { result } = renderHook(() => useUndoRedo(connection));

    await waitFor(() => {
      expect(txnsOf(connection)).toBeTruthy();
    });
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => {
      txnsOf(connection).onCommit.raise();
    });
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it('onAfterUndoRedo：触发重查询（undo 清空后 canUndo 翻 false）', async () => {
    const txns = makeTxns();
    txns.isUndoPossible.mockResolvedValue(true);
    const connection = makeConnection(txns);
    const { result } = renderHook(() => useUndoRedo(connection));

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
    });

    // undo 到栈底：isUndoPossible 翻 false → 事件触发重查询后状态跟上。
    txns.isUndoPossible.mockResolvedValue(false);
    txns.isRedoPossible.mockResolvedValue(true);
    act(() => {
      txns.onAfterUndoRedo.raise(true);
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
    expect(result.current.canRedo).toBe(true);
  });

  it('undo()/redo()：走 IModelApp.tools.run 内置工具（忙等防重入）', async () => {
    const connection = makeConnection();
    const { result } = renderHook(() => useUndoRedo(connection));

    await act(async () => {
      await result.current.undo();
    });
    await act(async () => {
      await result.current.redo();
    });
    expect(coreMocks.toolsRun).toHaveBeenCalledWith('Undo');
    expect(coreMocks.toolsRun).toHaveBeenCalledWith('Redo');
  });

  it('saveChanges：代理 connection.saveChanges 并翻转 isSaving', async () => {
    const connection = makeConnection();
    const { result } = renderHook(() => useUndoRedo(connection));

    let resolveSave!: () => void;
    (connection.saveChanges as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = result.current.saveChanges('test description');
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => {
      resolveSave();
      await savePromise;
    });
    expect(result.current.isSaving).toBe(false);
    expect(connection.saveChanges).toHaveBeenCalledWith('test description');
  });

  it('卸载：摘除 txns 监听（事件不再触发重查询）', async () => {
    const txns = makeTxns();
    const connection = makeConnection(txns);
    const { unmount } = renderHook(() => useUndoRedo(connection));

    await waitFor(() => {
      expect(txns.isUndoPossible).toHaveBeenCalled();
    });
    const queriesBefore = txns.isUndoPossible.mock.calls.length;

    unmount();
    act(() => {
      txns.onCommitted.raise(true, Date.now());
      txns.onAfterUndoRedo.raise(false);
    });
    expect(txns.isUndoPossible.mock.calls.length).toBe(queriesBefore);
  });

  it('换连接：重挂监听并按新连接重引导（旧连接事件不再生效）', async () => {
    const txnsA = makeTxns();
    txnsA.isUndoPossible.mockResolvedValue(true);
    const connectionA = makeConnection(txnsA);
    const { result, rerender } = renderHook(
      ({ conn }: { conn: BriefcaseConnection | null }) => useUndoRedo(conn),
      { initialProps: { conn: connectionA } },
    );

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
    });

    const txnsB = makeTxns();
    const connectionB = makeConnection(txnsB);
    rerender({ conn: connectionB });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
    expect(txnsB.isUndoPossible).toHaveBeenCalled();

    // 旧连接事件不再驱动状态。
    const queriesB = txnsB.isUndoPossible.mock.calls.length;
    act(() => {
      txnsA.onAfterUndoRedo.raise(false);
    });
    expect(txnsB.isUndoPossible.mock.calls.length).toBe(queriesB);
  });
});

/** 取连接替身的 txns 桩（事件断言用）。 */
function txnsOf(connection: BriefcaseConnection): TxnsStub {
  return (connection as unknown as { txns: TxnsStub }).txns;
}
