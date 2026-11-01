// src/modules/part-studio/test/usePartStudios.test.ts
//
// B-model P2.4：Part Studio 注册表数据/写入口测试——
//  1) 读：listPartStudios(iModelKey) 纯读；排序（order/id）；A（enabled=false）
//     零 RPC、空态；无 key 停在「在途」（loaded=false，绝不当空文档）；
//     列表失败 → error + loaded（解析器不得自动 create）；
//  2) 写：create/rename/remove 先经共享 session.acquire（同一 sessionId +
//     iModelKey）→ 1.18 RPC；租约被拒 → 抛 holder 语义错误、零写调用；
//  3) 本地状态增量更新（create 追加/rename 替换/remove 过滤）；
//  4) 服务端拒绝（最后一个完整 scope）原样上抛，状态不变。

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartStudioInfo } from '@luban-cad/shared';
import type { EditorSession } from '../hooks/useEditorSession.js';
import {
  REGISTRY_LEASE_ACQUIRE_BUDGET_MS,
  usePartStudios,
} from '../hooks/usePartStudios.js';

const rpc = vi.hoisted(() => ({
  listPartStudios: vi.fn(async (_key: string): Promise<PartStudioInfo[]> => []),
  createPartStudio: vi.fn(async (_key: string, _name: string, _sessionId: string): Promise<PartStudioInfo> => {
    throw new Error('create not mocked');
  }),
  renamePartStudio: vi.fn(async (_key: string, _id: string, _name: string, _sessionId: string): Promise<PartStudioInfo> => {
    throw new Error('rename not mocked');
  }),
  deletePartStudio: vi.fn(async (_key: string, _id: string, _sessionId: string): Promise<void> => undefined),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => rpc,
  },
}));

const STUDIOS: PartStudioInfo[] = [
  { id: 'ps-2', name: 'B', order: 2, defModelId: 'd2', physModelId: 'p2' },
  { id: 'ps-1', name: 'A', order: 1, defModelId: 'd1', physModelId: 'p1' },
  { id: 'half-1', name: 'half-1', order: 0, defModelId: 'dh', physModelId: '' },
];

function makeSession(overrides: Partial<EditorSession> = {}): EditorSession {
  return {
    sessionId: 'sess-1',
    iModelKey: 'key-1',
    leaseOk: true,
    acquire: vi.fn(async () => ({ ok: true })),
    release: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks 不清实现——逐用例复位默认实现，防上一例的 mockResolvedValue 渗漏。
  rpc.listPartStudios.mockResolvedValue([]);
  rpc.createPartStudio.mockRejectedValue(new Error('create not mocked'));
  rpc.renamePartStudio.mockRejectedValue(new Error('rename not mocked'));
  rpc.deletePartStudio.mockResolvedValue(undefined);
});

describe('usePartStudios 读面', () => {
  it('mount 经 listPartStudios(iModelKey) 读取并原样采用服务端顺序（F7 不重排）', async () => {
    rpc.listPartStudios.mockResolvedValue(STUDIOS);
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(rpc.listPartStudios).toHaveBeenCalledWith('key-1');
    // F7：服务端已按 order + 分区 ECInstanceId BigInt 排序；前端不得再排。
    expect(result.current.studios.map((s) => s.id)).toEqual(['ps-2', 'ps-1', 'half-1']);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('A 模式（enabled=false）：零 registry 调用、空列表、loaded=false', async () => {
    const { result } = renderHook(() =>
      usePartStudios('itwin-1', 'im-1', makeSession(), { enabled: false }),
    );
    // 允许 effect 落定一轮。
    await act(async () => {
      await Promise.resolve();
    });
    expect(rpc.listPartStudios).not.toHaveBeenCalled();
    expect(result.current.studios).toEqual([]);
    expect(result.current.loaded).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('无连接 key：停在在途（isLoading=true、loaded=false、零 RPC）——不得判空', async () => {
    const { result } = renderHook(() =>
      usePartStudios('itwin-1', 'im-1', makeSession({ iModelKey: undefined })),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(rpc.listPartStudios).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.loaded).toBe(false);
  });

  it('R3：切换 iModelKey 后新列表失败——旧文档 studios 不对外可见', async () => {
    rpc.listPartStudios
      .mockResolvedValueOnce(STUDIOS)
      .mockRejectedValueOnce(new Error('new doc list down'));
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        usePartStudios('itwin-1', 'im-1', makeSession({ iModelKey: key })),
      { initialProps: { key: 'key-1' } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.studios).toHaveLength(3);

    rerender({ key: 'key-2' });
    await waitFor(() => expect(result.current.error).toContain('new doc list down'));
    expect(result.current.loaded).toBe(true);
    // 新 key 的失败列表不得让旧文档 studios 驱动 redirect/tabs。
    expect(result.current.studios).toEqual([]);
    expect(rpc.listPartStudios).toHaveBeenLastCalledWith('key-2');
  });

  it('列表失败：error 原文 + loaded=true（解析器可呈现错误，不自动 create）', async () => {
    rpc.listPartStudios.mockRejectedValue(new Error('registry down'));
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toContain('registry down');
    expect(result.current.isLoading).toBe(false);
  });

  it('P2.8：Invalid iModelToken 瞬时错误有界重试后成功', async () => {
    rpc.listPartStudios
      .mockRejectedValueOnce(new Error('Invalid iModelToken for RPC operation request'))
      .mockRejectedValueOnce(new Error('Invalid iModelToken for RPC operation request'))
      .mockResolvedValueOnce(STUDIOS);
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true), { timeout: 3000 });
    expect(result.current.error).toBeUndefined();
    expect(result.current.studios).toHaveLength(3);
    expect(rpc.listPartStudios).toHaveBeenCalledTimes(3);
  });

  it('P2.8：Invalid iModelToken 持续失败只重试 3 次（有界）', async () => {
    rpc.listPartStudios.mockRejectedValue(new Error('Invalid iModelToken for RPC operation request'));
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true), { timeout: 3000 });
    expect(result.current.error).toContain('Invalid iModelToken');
    expect(rpc.listPartStudios).toHaveBeenCalledTimes(3);
  });

  it('P2.8：非 Invalid iModelToken 错误不重试（一次即失败）', async () => {
    rpc.listPartStudios.mockRejectedValueOnce(new Error('registry down'));
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toContain('registry down');
    expect(rpc.listPartStudios).toHaveBeenCalledTimes(1);
  });
});

describe('usePartStudios 写方法（共享会话/租约）', () => {
  it('create：先 acquire（同 sessionId），再 createPartStudio(key,name,sessionId)，本地追加', async () => {
    const session = makeSession();
    const created: PartStudioInfo = {
      id: 'ps-new', name: 'Part Studio 1', order: 1, defModelId: 'dn', physModelId: 'pn',
    };
    rpc.createPartStudio.mockResolvedValue(created);
    // 写后 refresh 的服务端权威列表（含新条目）。
    rpc.listPartStudios.mockResolvedValueOnce([]).mockResolvedValue([created]);
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', session));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.create('Part Studio 1');
    });
    await waitFor(() => expect(result.current.studios.map((s) => s.id)).toContain('ps-new'));
    expect(session.acquire).toHaveBeenCalled();
    expect(rpc.createPartStudio).toHaveBeenCalledWith('key-1', 'Part Studio 1', 'sess-1');
    expect(result.current.studios.map((s) => s.id)).toContain('ps-new');
  });

  it('租约被他人持有：抛 holder 语义错误、零 create 调用', async () => {
    const session = makeSession({ acquire: vi.fn(async () => ({ ok: false, holder: 'other-tab' })) });
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', session));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await expect(result.current.create('X')).rejects.toThrow(/other-tab/);
    });
    expect(rpc.createPartStudio).not.toHaveBeenCalled();
  });

  it('A 模式写方法：直接拒收（notReady），零租约/零 registry 写', async () => {
    const session = makeSession();
    const { result } = renderHook(() =>
      usePartStudios('itwin-1', 'im-1', session, { enabled: false }),
    );
    await act(async () => {
      await expect(result.current.rename('ps-1', 'X')).rejects.toThrow(/上下文未就绪/);
    });
    expect(session.acquire).not.toHaveBeenCalled();
    expect(rpc.renamePartStudio).not.toHaveBeenCalled();
  });

  it('rename：透传 (key,id,name,sessionId) 并本地替换', async () => {
    rpc.listPartStudios.mockResolvedValue(STUDIOS);
    const renamed: PartStudioInfo = {
      id: 'ps-1', name: '新名', order: 1, defModelId: 'd1', physModelId: 'p1',
    };
    rpc.renamePartStudio.mockResolvedValue(renamed);
    // 写后 refresh 返回重命名后的权威列表。
    rpc.listPartStudios
      .mockResolvedValueOnce(STUDIOS)
      .mockResolvedValue([renamed, ...STUDIOS.filter((s) => s.id !== 'ps-1')]);
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.rename('ps-1', '新名');
    });
    expect(rpc.renamePartStudio).toHaveBeenCalledWith('key-1', 'ps-1', '新名', 'sess-1');
    await waitFor(() => expect(result.current.studios.find((s) => s.id === 'ps-1')?.name).toBe('新名'));
  });

  it('租约预算覆盖前页 30s 残留 TTL（35s）——重载后删除可自愈', async () => {
    const session = makeSession();
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', session));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.remove('ps-1');
    });
    expect(session.acquire).toHaveBeenCalledWith({
      budgetMs: REGISTRY_LEASE_ACQUIRE_BUDGET_MS,
      retryMs: expect.any(Number),
    });
    expect(REGISTRY_LEASE_ACQUIRE_BUDGET_MS).toBeGreaterThan(30_000);
  });

  it('remove：服务端拒绝（最后一个完整 scope）原样上抛且本地状态不变', async () => {
    rpc.listPartStudios.mockResolvedValue(STUDIOS);
    rpc.deletePartStudio.mockRejectedValue(new Error('不能删除最后一个 Part Studio'));
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const before = result.current.studios.map((s) => s.id);
    await act(async () => {
      await expect(result.current.remove('ps-1')).rejects.toThrow(/最后一个/);
    });
    expect(rpc.deletePartStudio).toHaveBeenCalledWith('key-1', 'ps-1', 'sess-1');
    expect(result.current.studios.map((s) => s.id)).toEqual(before);
  });

  it('remove 成功：本地过滤该 scope（写后权威列表同步）', async () => {
    rpc.listPartStudios
      .mockResolvedValueOnce(STUDIOS)
      .mockResolvedValue(STUDIOS.filter((s) => s.id !== 'ps-2'));
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.remove('ps-2');
    });
    await waitFor(() => expect(result.current.studios.map((s) => s.id)).toEqual(['ps-1', 'half-1']));
  });

  it('F4：写后 stale list 响应被写纪元丢弃，不得覆盖本地 create（不重复默认 scope）', async () => {
    // 首跳 list 挂起（响应将晚于 create 返回服务器空列表）；写后 refresh 取权威列表。
    let resolveStaleList!: (list: PartStudioInfo[]) => void;
    const staleList = new Promise<PartStudioInfo[]>((resolve) => {
      resolveStaleList = resolve;
    });
    const created: PartStudioInfo = {
      id: 'ps-new', name: 'Part Studio 1', order: 1, defModelId: 'dn', physModelId: 'pn',
    };
    rpc.listPartStudios
      .mockReturnValueOnce(staleList)
      .mockResolvedValue([created]);
    rpc.createPartStudio.mockResolvedValue(created);
    const { result } = renderHook(() => usePartStudios('itwin-1', 'im-1', makeSession()));
    await act(async () => {
      await result.current.create('Part Studio 1');
    });
    expect(result.current.studios.map((s) => s.id)).toContain('ps-new');
    // 晚到的旧 list（create 之前处理的空结果）不得清掉本地 create。
    await act(async () => {
      resolveStaleList([]);
      await Promise.resolve();
    });
    expect(result.current.studios.map((s) => s.id)).toContain('ps-new');
    // 写后 refresh 已重取服务端权威列表。
    await waitFor(() => expect(rpc.listPartStudios.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
