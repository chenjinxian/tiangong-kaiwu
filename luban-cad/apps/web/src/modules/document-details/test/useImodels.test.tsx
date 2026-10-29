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

import { useImodels } from '../hooks/useImodels.js';

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
