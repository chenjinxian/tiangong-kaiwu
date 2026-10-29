// src/modules/part-studio/test/usePermissions.test.tsx
//
// M5 Task 3 失败测试先行（brief Step 1）：权限判定 hook（react-query）三态——
//  1) 加载中：isLoading 真且 mode 不可信（门禁消费方据 isLoading 关连接）；
//  2) 落定映射（旧 useIModelPermission.determineEditorMode 语义移植）：
//     imodels_write / imodels_manage → 'editable'；webview/read 或空集 →
//     'readonly'；
//  3) 错误裁决：ApiClientError 403（hub 明确拒绝）→ 'readonly'（fail-closed：
//     只读打开仍可看）；其余错误（网络抖动等）→ 'editable'
//    （旧 hook「本地部署错误兜底 editable」语义忠实移植，可用性优先）；
//  4) 门控：iModelId=null 不发起查询（路由缺参/连接未就绪不空转）；
//  5) queryKey 契约：['part-studio', 'permissions', iModelId]。
//
// 定位：hook 行为验收层；AccessControlClient 模块级 mock（零真实请求）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getMyIModelPermissions: vi.fn() }));

vi.mock('@clients/access-control/AccessControlClient.js', () => ({
  AccessControlClient: class {
    getMyIModelPermissions = mocks.getMyIModelPermissions;
  },
}));

import { ApiClientError } from '@clients/http/ApiClientError.js';
import { determinePermissionMode, usePermissions } from '../hooks/usePermissions.js';

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

describe('determinePermissionMode（旧 determineEditorMode 语义移植）', () => {
  it('imodels_write / imodels_manage → editable；webview/read → readonly；空/缺席 → readonly', () => {
    expect(determinePermissionMode(['imodels_webview', 'imodels_write'])).toBe('editable');
    expect(determinePermissionMode(['imodels_manage'])).toBe('editable');
    expect(determinePermissionMode(['imodels_webview', 'imodels_read'])).toBe('readonly');
    expect(determinePermissionMode(['imodels_webview'])).toBe('readonly');
    expect(determinePermissionMode([])).toBe('readonly');
    expect(determinePermissionMode(undefined)).toBe('readonly');
  });
});

describe('usePermissions（M5 Task 3）', () => {
  it('加载中 → isLoading 真且 mode readonly（不可信占位）；落定 editable → isLoading 假', async () => {
    const deferredResult = deferred<string[]>();
    mocks.getMyIModelPermissions.mockReturnValueOnce(deferredResult.promise);
    const { client, wrapper } = createWrapper();

    const { result } = renderHook(() => usePermissions({ iTwinId: 'itwin-1', iModelId: 'im-1' }), { wrapper });

    // 加载中：门禁态（消费方此时不得开 briefcase——旧应用竞态教训）。
    expect(result.current.isLoading).toBe(true);

    deferredResult.resolve(['imodels_webview', 'imodels_write']);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe('editable');
    expect(result.current.error).toBeNull();
    expect(mocks.getMyIModelPermissions).toHaveBeenCalledWith('im-1');

    // queryKey 契约（同族前缀风格；旧 hook 调用面双 id 入键）。
    expect(
      client.getQueryCache().find({ queryKey: ['part-studio', 'permissions', 'itwin-1', 'im-1'] }),
    ).toBeDefined();
  });

  it('落定 readonly（仅 webview）→ mode readonly', async () => {
    mocks.getMyIModelPermissions.mockResolvedValueOnce(['imodels_webview']);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePermissions({ iTwinId: 'itwin-1', iModelId: 'im-1' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe('readonly');
  });

  it('错误（非 403）→ 旧 hook 语义兜底 editable（本地部署可用性优先）+ isLoading 假', async () => {
    mocks.getMyIModelPermissions.mockRejectedValueOnce(new ApiClientError({ status: 500 }));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePermissions({ iTwinId: 'itwin-1', iModelId: 'im-1' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe('editable');
    expect(result.current.error).toBeInstanceOf(ApiClientError);
  });

  it('错误（403 明确拒绝）→ readonly（fail-closed：只读打开仍可看）', async () => {
    mocks.getMyIModelPermissions.mockRejectedValueOnce(
      new ApiClientError({ status: 403, message: 'You do not have permission to access this iModel' }),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePermissions({ iTwinId: 'itwin-1', iModelId: 'im-1' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe('readonly');
  });

  it('iModelId=null：门控不发起查询，isLoading 假（路由缺参不空转）', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePermissions({ iTwinId: null, iModelId: null }), { wrapper });

    expect(mocks.getMyIModelPermissions).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.mode).toBe('readonly');
  });
});
