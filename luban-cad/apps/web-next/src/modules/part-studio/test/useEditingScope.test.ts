// src/modules/part-studio/test/useEditingScope.test.ts
//
// M4 Task 4：GraphicalEditingScope 进入/退出 hook 单元测试——旧应用
// Editor.tsx:322-371 忠实移植的四条路径：
//  1) 正常进入：supportsGraphicalEditing → enterEditingScope → isReady；
//  2) 既有 scope 复用（connection.editingScope 在场且未 dispose）——不重复 enter；
//  3) enter 失败回查：enterEditingScope 抛错但 editingScope 已在场 → 回查复用；
//  4) 卸载退出：exit 调用且吞错。
// 另含守卫：enabled=false / connection=undefined 不进入。

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection, GraphicalEditingScope } from '@itwin/core-frontend';

import { useEditingScope } from '../hooks/useEditingScope.js';

/** 编辑作用域替身（exit 可断言）。 */
function makeScope() {
  return {
    isDisposed: false,
    exit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as GraphicalEditingScope & { exit: ReturnType<typeof vi.fn> };
}

/** 连接替身：editingScope 以 getter 暴露（用例运行中改写模拟竞态回查）。 */
function makeConnection(initialScope: GraphicalEditingScope | null = null) {
  let currentScope: GraphicalEditingScope | null = initialScope;
  return {
    key: 'briefcase-key',
    get editingScope(): GraphicalEditingScope | undefined {
      return currentScope ?? undefined;
    },
    set editingScope(scope: GraphicalEditingScope | undefined) {
      currentScope = scope ?? null;
    },
    supportsGraphicalEditing: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    enterEditingScope: vi.fn<() => Promise<GraphicalEditingScope>>().mockImplementation(async () => {
      const scope = makeScope();
      currentScope = scope;
      return scope;
    }),
  } as unknown as BriefcaseConnection & {
    supportsGraphicalEditing: ReturnType<typeof vi.fn>;
    enterEditingScope: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEditingScope（Editor.tsx:322-371 忠实移植）', () => {
  it('正常进入：supportsGraphicalEditing → enterEditingScope → isReady=true', async () => {
    const connection = makeConnection();
    const { result } = renderHook(() => useEditingScope(connection, true));

    expect(result.current.isReady).toBe(false);
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(connection.supportsGraphicalEditing).toHaveBeenCalledTimes(1);
    expect(connection.enterEditingScope).toHaveBeenCalledTimes(1);
  });

  it('既有 scope 复用：不重复 enterEditingScope', async () => {
    const existing = makeScope();
    const connection = makeConnection(existing);
    const { result } = renderHook(() => useEditingScope(connection, true));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(connection.enterEditingScope).not.toHaveBeenCalled();
  });

  it('既有 scope 已 dispose：视同不存在，重新 enter', async () => {
    const disposed = { isDisposed: true, exit: vi.fn() } as unknown as GraphicalEditingScope;
    const connection = makeConnection(disposed);
    const { result } = renderHook(() => useEditingScope(connection, true));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(connection.enterEditingScope).toHaveBeenCalledTimes(1);
  });

  it('enter 失败回查：enterEditingScope 抛错但 editingScope 已在场 → 复用不抛', async () => {
    const connection = makeConnection();
    (connection.enterEditingScope as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // 模拟竞态：后端已建 scope（回查可见），但 enter 调用本身抛错。
      (connection as { editingScope: unknown }).editingScope = makeScope();
      throw new Error('simulated enter race');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useEditingScope(connection, true));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(connection.enterEditingScope).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('enter 彻底失败：console.error 落日志且 isReady 仍放行（旧口径）', async () => {
    const connection = makeConnection();
    (connection.enterEditingScope as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('backend refused'),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useEditingScope(connection, true));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('卸载退出：exit 调用（吞错不抛）', async () => {
    const connection = makeConnection();
    const { result, unmount } = renderHook(() => useEditingScope(connection, true));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    const scope = connection.editingScope as unknown as { exit: ReturnType<typeof vi.fn> };
    unmount();
    expect(scope.exit).toHaveBeenCalledTimes(1);
  });

  it('enabled=false：不进入', () => {
    const connection = makeConnection();
    const { result } = renderHook(() => useEditingScope(connection, false));
    expect(result.current.isReady).toBe(false);
    expect(connection.enterEditingScope).not.toHaveBeenCalled();
    expect(connection.supportsGraphicalEditing).not.toHaveBeenCalled();
  });

  it('connection=undefined：不进入', () => {
    const { result } = renderHook(() => useEditingScope(undefined, true));
    expect(result.current.isReady).toBe(false);
  });

  it('connection 置空：不抛错且 ready 态不残留崩溃', async () => {
    const connection = makeConnection();
    const { result, rerender } = renderHook(
      (props: { conn: BriefcaseConnection | undefined }) => useEditingScope(props.conn, true),
      { initialProps: { conn: connection as BriefcaseConnection | undefined } },
    );
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(() => rerender({ conn: undefined })).not.toThrow();
    expect(result.current.isReady).toBe(true);
  });

  it('进入竞态后卸载：取消标志防回写（不晚置 ready）', async () => {
    const connection = makeConnection();
    let resolveEnter!: (scope: GraphicalEditingScope) => void;
    (connection.enterEditingScope as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<GraphicalEditingScope>((resolve) => {
          resolveEnter = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useEditingScope(connection, true));
    // 冲微任务：supportsGraphicalEditing 落定、enterEditingScope 已挂起。
    await act(async () => {});
    expect(connection.enterEditingScope).toHaveBeenCalledTimes(1);
    unmount();
    // 卸载后 enter 才落定：不回写状态、不触讨厌的晚置 ready。
    await act(async () => {
      resolveEnter(makeScope());
    });
    expect(result.current.isReady).toBe(false);
  });
});
