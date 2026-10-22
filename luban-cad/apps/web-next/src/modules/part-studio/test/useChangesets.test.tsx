// src/modules/part-studio/test/useChangesets.test.tsx
//
// M4 Task 7（brief Step 1）：版本历史数据源 hook（react-query）——
//  1) queryKey 契约：['part-studio', 'changesets', iModelId]（M2 documentsKeys
//     同族前缀风格；推送成功后宿主按前缀失效即刷新）；
//  2) 启用门控：iModelId=null（连接未就绪/路由缺参）不发起查询，changesets
//     恒为数组（调用方免 undefined 分支防御）；
//  3) 成功映射：官方 Changeset[] 直通出口；isLoading 仅首载为真；
//  4) 错误暴露：error 原样上抛（ApiErrorMessage 由消费面板渲染）。
//
// 定位：hook 行为验收层；ImodelsClient 模块级 mock（零真实请求）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listChangesets: vi.fn() }));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    listChangesets = mocks.listChangesets;
  },
}));

import { useChangesets } from '../hooks/useChangesets.js';

const CHANGESETS = [
  { id: 'cs-2', index: 2, description: '加圆角', displayName: 'cs2', pushDateTime: '2026-10-20T09:00:00Z' },
  { id: 'cs-1', index: 1, description: '初始特征', displayName: 'cs1', pushDateTime: '2026-10-19T09:00:00Z' },
];

/** 手动闸门：promise 的 resolve 由用例掌控（断言 pending 期出口形状）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChangesets（M4 Task 7）', () => {
  it('queryKey 契约：[\'part-studio\', \'changesets\', iModelId]；成功出口收拢数组', async () => {
    const deferredResult = deferred<typeof CHANGESETS>();
    mocks.listChangesets.mockReturnValueOnce(deferredResult.promise);
    const { client, wrapper } = createWrapper();

    const { result } = renderHook(() => useChangesets('im-1'), { wrapper });

    // 首载在途：isLoading 真 + changesets 恒数组。
    expect(result.current.isLoading).toBe(true);
    expect(result.current.changesets).toEqual([]);

    deferredResult.resolve(CHANGESETS);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.changesets).toEqual(CHANGESETS);
    expect(result.current.error).toBeNull();
    expect(mocks.listChangesets).toHaveBeenCalledWith('im-1');

    // queryKey 契约（前缀失效锚点）：缓存中可按该 key 命中本查询。
    expect(client.getQueryCache().find({ queryKey: ['part-studio', 'changesets', 'im-1'] })).toBeDefined();
  });

  it('iModelId=null：门控不发起查询（连接未就绪不空转）', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChangesets(null), { wrapper });

    expect(mocks.listChangesets).not.toHaveBeenCalled();
    expect(result.current.changesets).toEqual([]);
  });

  it('错误暴露：queryFn reject → error 出口（不吞不映射）', async () => {
    const deferredResult = deferred<never>();
    mocks.listChangesets.mockReturnValueOnce(deferredResult.promise);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useChangesets('im-1'), { wrapper });
    // 先见 loading（查询在途、handler 已挂）再 reject，免 unhandled rejection。
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    deferredResult.reject(new Error('boom'));

    await waitFor(() => expect(result.current.error).toMatchObject({ message: 'boom' }));
    expect(result.current.changesets).toEqual([]);
  });
});
