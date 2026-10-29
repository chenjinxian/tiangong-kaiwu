// src/app/providers/test/QueryErrorBridge.test.tsx
//
// M3-T1：QueryErrorBridge 401 桥四用例（导出直挂 handleQueryBridgeError，
// 不经 QueryCache/React——模块头注语义的钉死测试）：
// ① 401 → 单飞刷新 → 重放原 query；
// ② 重放再 401（fetch 的 catch 同步再触发）→ 清场 + window.location.href='/login'；
// ③ 重放在飞期间同 query 再次 onError → 嵌套抑制（不起第二条刷新链）；
// ④ 非 ApiClientError（裸 Error / 非 401 的 ApiClientError）→ 忽略。
//

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { ApiClientError } from '@clients/http/ApiClientError.js';

const getValidAccessTokenMock = vi.fn<() => Promise<string>>();
const clearAuthMock = vi.fn<() => void>();
vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getValidAccessToken: () => getValidAccessTokenMock(),
    clearAuth: () => clearAuthMock(),
  },
}));

import { handleQueryBridgeError } from '../QueryErrorBridge.js';

/** 微任务冲刷：onError 链是原生 promise .then/.catch/.finally，
 * 一轮 macrotask 后必达终态。 */
function flush(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

/** 伪造 Query：桥只消费 queryHash + fetch()。 */
function makeQuery(fetchImpl?: () => Promise<unknown>): Query<unknown, unknown, unknown> {
  return {
    queryHash: 'test-query-hash',
    fetch: vi.fn(fetchImpl ?? (() => Promise.resolve())),
  } as unknown as Query<unknown, unknown, unknown>;
}

describe('QueryErrorBridge（handleQueryBridgeError）', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    getValidAccessTokenMock.mockReset();
    clearAuthMock.mockReset();
    // jsdom 不实现 navigation：以 plain object 顶替 location（writable），
    // window.location.href 赋值可截获断言；afterEach 恢复原 descriptor。
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:5300/documents' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
    });
  });

  // ① 401 → 刷新 → 重放
  it('ApiClientError 401 → 单飞刷新并重放原 query；不清场不跳登录', async () => {
    getValidAccessTokenMock.mockResolvedValue('tok-new');
    const query = makeQuery();

    handleQueryBridgeError(new ApiClientError({ status: 401 }), query);
    await flush();

    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(query.fetch).toHaveBeenCalledTimes(1);
    expect(clearAuthMock).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost:5300/documents');
  });

  // ② 重放再 401 → 清场跳 /login
  it('重放 fetch 再抛 401 → clearAuth + location.href=/login', async () => {
    getValidAccessTokenMock.mockResolvedValue('tok-new');
    const query = makeQuery(() => Promise.reject(new ApiClientError({ status: 401 })));

    handleQueryBridgeError(new ApiClientError({ status: 401 }), query);
    await flush();

    expect(query.fetch).toHaveBeenCalledTimes(1);
    expect(clearAuthMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/login');
  });

  // ③ 嵌套抑制：在飞重放期间同 queryHash 再次 onError → 忽略
  it('重放在飞期间同一 query 再 401 → 嵌套抑制（刷新仍只一次）', async () => {
    let resolveRefresh!: (token: string) => void;
    getValidAccessTokenMock.mockReturnValue(new Promise<string>((resolve) => { resolveRefresh = resolve; }));
    const query = makeQuery();

    handleQueryBridgeError(new ApiClientError({ status: 401 }), query);
    handleQueryBridgeError(new ApiClientError({ status: 401 }), query);
    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1);

    resolveRefresh('tok-new');
    await flush();

    expect(query.fetch).toHaveBeenCalledTimes(1);
    expect(clearAuthMock).not.toHaveBeenCalled();
  });

  // ④ 非 ApiClientError / 非 401 → 忽略
  it('裸 Error 与非 401 的 ApiClientError → 不刷新不重放', async () => {
    const queryA = makeQuery();
    const queryB = makeQuery();

    handleQueryBridgeError(new Error('network down'), queryA);
    handleQueryBridgeError(new ApiClientError({ status: 500 }), queryB);
    await flush();

    expect(getValidAccessTokenMock).not.toHaveBeenCalled();
    expect(queryA.fetch).not.toHaveBeenCalled();
    expect(queryB.fetch).not.toHaveBeenCalled();
    expect(clearAuthMock).not.toHaveBeenCalled();
  });
});
