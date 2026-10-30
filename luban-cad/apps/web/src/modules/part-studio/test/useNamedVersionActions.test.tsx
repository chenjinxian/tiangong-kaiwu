// src/modules/part-studio/test/useNamedVersionActions.test.tsx
//
// B-model P0 Task 5（brief Step 1）：保存版本动作 hook——「命名当前 changeset」
// 的两条路径契约：
//  1) 有未保存变更：先 connection.pushChanges(draft.name) 把本地 Txns 打包上
//     hub，再用返回的 changeset id 创建 Named Version（不另拉列表）；
//  2) 干净态（无未保存变更）：取 listChangesets 中 index 最大者创建 Named
//     Version，不 push（顶栏保存版本在干净态也可命名当前 changeset）；
//  3) connection 缺席：拒绝且不发起任何创建（诚实拒收，不静默）；
//  4) push 失败：不创建 Named Version，错误原样上抛（终审 I2 补例）。
//
// 定位：hook 行为验收层；ImodelsClient 模块级 mock（零真实请求），
// react-query QueryClientProvider 真参与（失效键契约可经缓存观测）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';

const mocks = vi.hoisted(() => ({
  createNamedVersion: vi.fn(),
  listChangesets: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    createNamedVersion = mocks.createNamedVersion;
    listChangesets = mocks.listChangesets;
  },
}));

import { useNamedVersionActions } from '../hooks/useNamedVersionActions.js';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('useNamedVersionActions', () => {
  it('有未保存变更：先 pushChanges，再用返回的 changeset id 创建 Named Version', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ index: 2, id: 'cs-2' });
    const connection = { pushChanges } as unknown as BriefcaseConnection;
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', connection, true),
      { wrapper },
    );

    await act(async () => {
      await result.current.createNamedVersion({ name: 'V1', description: 'first' });
    });

    expect(pushChanges).toHaveBeenCalledWith('V1');
    expect(mocks.createNamedVersion).toHaveBeenCalledWith('im-1', {
      name: 'V1',
      description: 'first',
      changesetId: 'cs-2',
    });
    expect(mocks.listChangesets).not.toHaveBeenCalled();
  });

  it('无未保存变更：取最新 changeset 创建 Named Version，不 push', async () => {
    const pushChanges = vi.fn();
    const connection = { pushChanges } as unknown as BriefcaseConnection;
    mocks.listChangesets.mockResolvedValue([
      { id: 'cs-1', index: 1 },
      { id: 'cs-3', index: 3 },
      { id: 'cs-2', index: 2 },
    ]);
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', connection, false),
      { wrapper },
    );

    await act(async () => {
      await result.current.createNamedVersion({ name: 'V1' });
    });

    expect(pushChanges).not.toHaveBeenCalled();
    expect(mocks.createNamedVersion).toHaveBeenCalledWith('im-1', {
      name: 'V1',
      changesetId: 'cs-3',
    });
  });

  it('push 失败：不创建 Named Version，错误原样上抛（对话框就地承接）', async () => {
    const pushChanges = vi.fn().mockRejectedValue(new Error('push boom'));
    const connection = { pushChanges } as unknown as BriefcaseConnection;
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', connection, true),
      { wrapper },
    );

    await expect(
      result.current.createNamedVersion({ name: 'V1' }),
    ).rejects.toThrow('push boom');

    expect(pushChanges).toHaveBeenCalledWith('V1');
    expect(mocks.createNamedVersion).not.toHaveBeenCalled();
  });

  it('connection 缺席时拒绝，不发起创建', async () => {
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', undefined, true),
      { wrapper },
    );
    await expect(
      result.current.createNamedVersion({ name: 'V1' }),
    ).rejects.toThrow('连接未就绪');
    expect(mocks.createNamedVersion).not.toHaveBeenCalled();
  });
});
