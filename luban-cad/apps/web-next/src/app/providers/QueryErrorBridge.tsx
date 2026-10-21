// src/app/providers/QueryErrorBridge.tsx
//
// M2 Task 1 前置三件套之二：QueryCache 全局 401 桥。
// 接法（对齐 v5 官方全局回调形态）：AppProviders 构造 QueryClient 时以
// createQueryErrorBridgeCache() 为 queryCache；onError 分流 ApiClientError
// 401 → AuthSession.getValidAccessToken()（模块级 refreshPromise 单飞去重）
// → 原 query.fetch() 重放；刷新或重放任一失败 → clearAuth() + 跳 /login。
//
// 重放守卫（模块级 Set<queryHash>）：重放期间同一 query 若再次 401（fetch
// 的 catch 会同步再触发 onError 并起新刷新链），命中在飞集合即直接忽略，
// 交由在飞链路的 catch 清场——否则「刷新成功但资源端持续 401」会无限嵌套
// 重放。终态（成败皆然）后从集合移除，不影响该 query 的下一轮正常重放。

import { QueryCache, type Query } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ApiClientError } from '@clients/http/ApiClientError.js';

/** 在飞重放的 queryHash 集合（去重/防嵌套循环，见模块头注）。 */
const replayingQueryHashes = new Set<string>();

/** onError 本体：401 → 单飞刷新 → 重放；失败清场跳 /login。导出以便测试直挂。
 * query 形参类型对齐 QueryCacheConfig.onError 的签名（TError=unknown）。 */
export function handleQueryBridgeError(error: unknown, query: Query<unknown, unknown, unknown>): void {
  if (!(error instanceof ApiClientError) || error.status !== 401) return;
  if (replayingQueryHashes.has(query.queryHash)) return;
  replayingQueryHashes.add(query.queryHash);
  void AuthSession.getValidAccessToken()
    .then(() => query.fetch())
    .catch(() => {
      AuthSession.clearAuth();
      window.location.href = '/login';
    })
    .finally(() => {
      replayingQueryHashes.delete(query.queryHash);
    });
}

/** 供 AppProviders 内联进 QueryClient 构造的 401 桥 QueryCache。 */
export function createQueryErrorBridgeCache(): QueryCache {
  return new QueryCache({ onError: handleQueryBridgeError });
}
