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
    expect(rpc.getVariables).not.toHaveBeenCalled();

    const noConnection = renderHook(() => usePartStudioVariables(undefined, 'ps-1', true));
    await waitFor(() => expect(noConnection.result.current.loading).toBe(false));
    expect(noConnection.result.current.variables).toEqual([]);
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
