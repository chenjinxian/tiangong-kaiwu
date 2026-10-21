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

/** 带 Bearer 的认证 fetch：token 经 AuthSession 单飞刷新（过期自愈）。 */
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
    throw new Error(`hub request failed (status ${response.status})`);
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
