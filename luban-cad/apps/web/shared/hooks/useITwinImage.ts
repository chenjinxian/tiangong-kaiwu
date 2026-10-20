/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * useITwinImage（RW4-P2-T2-1）：iTwin 缩略图认证加载 hook。
 *
 * 数据流（照 ITwinDetail 下载先例的 fetchWithAuth→blob→objectURL 模式）：
 *   GET /itwins/:id/image —— 本 hub 返回 JSON 清单 [{id,url,type}]（url 为
 *   `/files/:filename` 相对路径，走带 JWT 的 FilesLocalController 下载口）
 *   → 取首个 url 认证下载（baseUrl='' 原样同源）→ blob → URL.createObjectURL。
 *   若端点直出二进制（content-type image/*，官方形态兼容）则单段流直取。
 *
 * 缓存/回收契约：
 * - react-query 缓存（queryKey 含 id），staleTime 拉长（图片不常变）；
 * - objectURL 所有权在查询缓存：缓存条目移除（gc / removeQueries）时 revoke，
 *   组件卸载不回收——Table 与详情侧栏会同时消费同一 objectURL，逐组件 revoke
 *   会把别人的 <img> 踩成破图；
 * - 404 / 空清单 / 失败一律回 null，组件层回退 SvgProject 占位，不打断列表渲染。
 */

import { useEffect } from 'react';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchWithAuth } from '../api/httpClient.js';
import { queryKeys } from '../../app/providers/QueryProvider.js';
import { logger } from '../lib/logger.js';

/** GET /itwins/:id/image 清单项（本 hub 形态；官方形态为带 _links 的元数据，url 字段兼容） */
export interface ITwinImageDescriptor {
  id?: string;
  url?: string;
  type?: string;
}

type ImageListPayload = ITwinImageDescriptor[] | { images?: ITwinImageDescriptor[] };

// 图片不常变：比列表（5min）拉长一档
const IMAGE_STALE_TIME = 30 * 60 * 1000;
const IMAGE_GC_TIME = 60 * 60 * 1000;

function isImageQueryKey(key: readonly unknown[]): boolean {
  return key[0] === 'itwins' && key[1] === 'image';
}

// 每个 QueryClient 只挂一次缓存监听（WeakMap 防重复订阅）
const cleanupRegistered = new WeakMap<QueryClient, boolean>();

function asBlobUrl(data: unknown): string | null {
  return typeof data === 'string' && data.startsWith('blob:') ? data : null;
}

function registerImageCacheCleanup(client: QueryClient): void {
  if (cleanupRegistered.has(client)) return;
  cleanupRegistered.set(client, true);
  // queryHash → 上一次安装的 objectURL。refetch 成功会**替换** state.data（无 removed 事件），
  // 若不在此回收，每次 itwins.* 广域 invalidate（改名/删除/收藏）都会泄漏全部缩略图。
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

    // updated（数据替换 / 状态刷新）：旧 URL 与当前不同即回收
    const previous = installed.get(hash);
    if (previous && previous !== current) {
      URL.revokeObjectURL(previous);
    }
    if (current) installed.set(hash, current);
    else installed.delete(hash);
  });
}

/**
 * 加载 iTwin 缩略图，返回可作 <img src> 的 objectURL；
 * 未加载 / 无图 / 失败返回 null（调用方回退 SvgProject 占位）。
 */
export function useITwinImage(iTwinId: string | null | undefined): string | null {
  const queryClient = useQueryClient();

  useEffect(() => {
    registerImageCacheCleanup(queryClient);
  }, [queryClient]);

  const query = useQuery({
    queryKey: queryKeys.itwins.image(iTwinId ?? null),
    queryFn: async (): Promise<string | null> => {
      if (!iTwinId) return null;
      try {
        const response = await fetchWithAuth(`/itwins/${iTwinId}/image`);
        const contentType = response.headers.get('content-type') ?? '';

        if (contentType.includes('application/json')) {
          // 本 hub 形态：JSON 清单 → 首个 url 二段下载
          const payload = (await response.json()) as ImageListPayload;
          const list = Array.isArray(payload) ? payload : (payload.images ?? []);
          const firstUrl = list.find(
            (img) => typeof img?.url === 'string' && img.url.length > 0,
          )?.url;
          if (!firstUrl) return null;

          // 清单 url 为相对路径（/files/...）：baseUrl='' 原样同源取（仍带 Bearer/401 刷新）
          const imageResponse = await fetchWithAuth(firstUrl, { baseUrl: '' });
          return URL.createObjectURL(await imageResponse.blob());
        }

        // 兼容二进制直出形态
        return URL.createObjectURL(await response.blob());
      } catch (error) {
        // 404 静默回退（多数项目无自定义图）；其余失败 warn 一次便于排障
        if (!(error instanceof ApiError && error.isNotFound)) {
          logger.warn(
            `useITwinImage: 缩略图加载失败 (${iTwinId})`,
            error instanceof Error ? error : undefined,
          );
        }
        return null;
      }
    },
    enabled: !!iTwinId,
    staleTime: IMAGE_STALE_TIME,
    gcTime: IMAGE_GC_TIME,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return query.data ?? null;
}
