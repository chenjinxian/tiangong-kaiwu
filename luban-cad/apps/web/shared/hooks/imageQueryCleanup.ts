/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 认证图片 query 缓存 objectURL 回收器（RW4-P3-T3-1，由 useITwinImage 抽出复用）。
 *
 * 所有权契约（P2 评审定案）：objectURL 归 react-query 缓存条目所有——缓存条目移除
 *（gc / removeQueries）或 refetch 替换 data 时回收；组件卸载不回收（同一 URL 可能被
 * 多个组件同时消费）。每个 QueryClient × 注册 id 只挂一次监听（WeakMap 防重复订阅）。
 */

import type { QueryClient } from '@tanstack/react-query';

const cleanupRegistered = new WeakMap<QueryClient, Set<string>>();

function asBlobUrl(data: unknown): string | null {
  return typeof data === 'string' && data.startsWith('blob:') ? data : null;
}

/**
 * 为某个图片 query 族注册缓存级 objectURL 回收。
 * @param client react-query 客户端
 * @param registrationId 注册标识（同一 client 只注册一次）
 * @param isImageQueryKey 判定该缓存条目是否属于此图片族
 */
export function registerImageCacheCleanup(
  client: QueryClient,
  registrationId: string,
  isImageQueryKey: (key: readonly unknown[]) => boolean,
): void {
  let registered = cleanupRegistered.get(client);
  if (!registered) {
    registered = new Set<string>();
    cleanupRegistered.set(client, registered);
  }
  if (registered.has(registrationId)) return;
  registered.add(registrationId);

  // queryHash → 上一次安装的 objectURL。refetch 成功会替换 state.data（无 removed 事件），
  // 若不在此回收，每次广域 invalidate 都会泄漏全部缩略图。
  const installed = new Map<string, string>();

  client.getQueryCache().subscribe((event) => {
    if (!isImageQueryKey(event.query.queryKey)) return;
    const hash = event.query.queryHash;
    const current = asBlobUrl(event.query.state.data);

    if (event.type === 'removed') {
      if (current) URL.revokeObjectURL(current);
      installed.delete(hash);
      return;
    }

    const previous = installed.get(hash);
    if (previous && previous !== current) {
      URL.revokeObjectURL(previous);
    }
    if (current) installed.set(hash, current);
    else installed.delete(hash);
  });
}
