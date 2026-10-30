// src/modules/document-details/test/useImodels.test.tsx
//
// 终审 I3 回归：useImodels 出口新增 isFetching（react-query v5 字段）——
// isLoading(isPending) 仅首载为真，有缓存数据的 refetch 期间恒假；
// isFetching 首载与 refetch 期间恒真——详情页刷新钮旋转信号靠它
//（改接前 SvgRefresh 永不转圈）。
//
// 本文件钉死：首载 pending 期间 isFetching=true；数据到位后转 false；
// invalidate 触发 refetch 期间再度为 true（二次 pending），resolve 后回落。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ imodelsList: vi.fn() }));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    list = mocks.imodelsList;
  },
}));

// useImodels 同文件 import ItwinsClient（useDocumentDetail 用）——useImodels
// 本测试不实例化，但模块装载需可解析，照例 mock 掉。
vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    get = vi.fn();
  },
}));

import { useImodels, waitForImodelInitialized } from '../hooks/useImodels.js';

/** 官方 IModel 全量表示的测试最小形状（mapper 只读子集）。 */
const IMODELS = [
  {
    id: 'im-1',
    displayName: '楼层模型',
    name: '楼层模型',
    description: '一层平面布局',
    state: 'initialized',
    createdDateTime: '2026-10-02T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: '2026-10-19T09:00:00.0000000+00:00',
    iTwinId: 'itwin-1',
  },
  {
    id: 'im-2',
    displayName: '结构模型',
    name: '结构模型',
    description: null,
    state: 'notInitialized',
    createdDateTime: '2026-10-03T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: null,
    iTwinId: 'itwin-1',
  },
];

/** 手动闸门：promise 的 resolve 由用例掌控（模拟 refetch 在途）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useImodels isFetching（终审 I3）', () => {
  it('首载与 invalidate 触发的 refetch 期间 isFetching 恒真，落定后转假', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = deferred<typeof IMODELS>();
    const second = deferred<typeof IMODELS>();
    mocks.imodelsList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useImodels('itwin-1'), {
      wrapper: createWrapper(client),
    });

    // ① 首载在途：isFetching 真（isLoading 同真——isPending 语义）。
    expect(result.current.isFetching).toBe(true);
    expect(result.current.imodels).toEqual([]);

    // ② 首载落定：isFetching 转假，数据经 mapper 到位。
    first.resolve(IMODELS);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.imodels).toHaveLength(2);
    expect(result.current.imodels[0]).toMatchObject({ id: 'im-1', name: '楼层模型', initialized: true });

    // ③ invalidate → active query refetch：有缓存数据期间 isLoading(isPending) 恒假，
    //   isFetching 必须再度为真——刷新钮旋转信号（回归前接线 isLoading 永不转圈）。
    act(() => {
      void client.invalidateQueries({ queryKey: ['documents', 'imodels'] });
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    // refetch 在途期间旧数据保持可见（react-query 默认不清缓存）。
    expect(result.current.imodels).toHaveLength(2);

    // ④ refetch 落定：isFetching 回落，新数据换入。
    second.resolve([]);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.imodels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P2.3：B 文档创建后的初始化等待（poll GET /imodels/:id，封顶）。
// 通过注入 get/sleep 驱动真实循环（不 patch 计时器）。
// ---------------------------------------------------------------------------

function imodelWithState(state: string) {
  return {
    id: 'im-new',
    displayName: '新文档',
    name: '新文档',
    description: null,
    state,
    createdDateTime: '2026-10-30T00:00:00.0000000+00:00',
    lastChangesetPushDateTime: null,
    iTwinId: 'itwin-1',
  };
}

describe('waitForImodelInitialized（B 文档初始化轮询）', () => {
  it('notInitialized → notInitialized → initialized：轮询至 initialized 即停', async () => {
    const states = ['notInitialized', 'notInitialized', 'initialized'];
    const get = vi.fn(async () => imodelWithState(states[Math.min(get.mock.calls.length - 1, states.length - 1)]!));
    const sleep = vi.fn(async () => {});

    const result = await waitForImodelInitialized('im-new', {
      get: get as never,
      sleep,
      intervalMs: 25,
      maxAttempts: 10,
    });

    expect(result.status).toBe('initialized');
    if (result.status !== 'initialized') throw new Error('expected initialized');
    expect(result.imodel).toMatchObject({ id: 'im-new', state: 'initialized' });
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenNthCalledWith(1, 'im-new');
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(25);
  });

  it('initialized 首查即返回（不 sleep）', async () => {
    const get = vi.fn(async () => imodelWithState('initialized'));
    const sleep = vi.fn(async () => {});

    const result = await waitForImodelInitialized('im-new', { get: get as never, sleep });

    expect(result.status).toBe('initialized');
    expect(get).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('initializationFailed / missingFiles 立即终止为 failed（不是无限等待）', async () => {
    for (const state of ['initializationFailed', 'missingFiles']) {
      const get = vi.fn(async () => imodelWithState(state));
      const sleep = vi.fn(async () => {});
      const result = await waitForImodelInitialized('im-new', { get: get as never, sleep });
      expect(result.status).toBe('failed');
      if (result.status !== 'failed') throw new Error('expected failed');
      expect(result.imodel.state).toBe(state);
      expect(get).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('达到 maxAttempts 仍未 initialized → timeout（不伪造 initialized）', async () => {
    const get = vi.fn(async () => imodelWithState('notInitialized'));
    const sleep = vi.fn(async () => {});

    const result = await waitForImodelInitialized('im-new', {
      get: get as never,
      sleep,
      maxAttempts: 3,
    });

    expect(result.status).toBe('timeout');
    if (result.status !== 'timeout') throw new Error('expected timeout');
    expect(result.imodel?.state).toBe('notInitialized');
    expect(get).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('GET 失败 → error（界面承接重试，不静默吞掉）', async () => {
    const boom = new Error('hub boom');
    const get = vi.fn(async () => {
      throw boom;
    });

    const result = await waitForImodelInitialized('im-new', { get: get as never });

    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error).toBe(boom);
  });
});
