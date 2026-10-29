/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents 模块私有 REST 出口（Task 5）：收藏 add/remove 走 hub 裸 REST。
 * 官方 `@itwin/itwins-client` 只有 `queryFavoritesAsync`（列表）没有收藏变更
 * 端点（lib/esm/iTwinsAccessProps.d.ts 实证）——add/remove 端点姿态照
 * 旧应用 apps/web shared/services/itwins/client.ts（POST/DELETE
 * `/itwins/favorites/:id`，经 vite 代理 /itwins → hub :5400）。
 */

import { env } from '@config/env.js';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ApiClientError, parseRetryAfterSeconds } from '@clients/http/ApiClientError.js';

/** 带 Bearer 的认证 fetch：token 经 AuthSession 单飞刷新（过期自愈）。
 * 非 2xx 统一抛 ApiClientError（M3-T1，终审 I2 收口）——QueryErrorBridge
 * 只分流 ApiClientError 的 401，裸 Error 会让收藏面 401 失明（不走刷新重放）。
 * M4-T8 T1-①：429/Retry-After 分支透出 retryAfterSeconds（限流等待文案数据源）。 */
async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await AuthSession.getValidAccessToken();
  const response = await fetch(`${env.hubUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
    throw new ApiClientError({
      status: response.status,
      code: body.code,
      message: body.message ?? `hub request failed (status ${response.status})`,
      retryAfterSeconds: parseRetryAfterSeconds(response),
    });
  }
  return response;
}

/** 收藏项目（POST /itwins/favorites/:id）。 */
export async function addToFavorites(iTwinId: string): Promise<void> {
  await hubFetch(`/itwins/favorites/${iTwinId}`, { method: 'POST' });
}

/** 取消收藏（DELETE /itwins/favorites/:id）。 */
export async function removeFromFavorites(iTwinId: string): Promise<void> {
  await hubFetch(`/itwins/favorites/${iTwinId}`, { method: 'DELETE' });
}
