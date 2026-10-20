/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * useIModelImage（RW4-P3-T3-1）：iModel 缩略图认证加载 hook（useITwinImage 同构件）。
 *
 * 数据流：
 *   GET /imodels/:id/thumbnail（认证）→ {downloadUrl,size} 元数据
 *   → downloadUrl 二段取图（本 hub 的 Azurite 绝对地址 http://localhost:10000/... 改走
 *     `/azurite/...` 同源代理，照 CreateIModelWorkflow 的 convertToProxyUrl 先例）
 *   → blob → URL.createObjectURL。
 *   无图（downloadUrl:null）/404/失败一律回 null，组件层回退 SvgItem 占位。
 *
 * 缓存/回收契约与 useITwinImage 一致：objectURL 归 react-query 缓存条目所有
 *（imageQueryCleanup.ts 统一回收）。
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchWithAuth } from '../api/httpClient.js';
import { queryKeys } from '../../app/providers/QueryProvider.js';
import { logger } from '../lib/logger.js';
import { registerImageCacheCleanup } from './imageQueryCleanup.js';

interface IModelThumbnailPayload {
  downloadUrl?: string | null;
  size?: string;
}

// 图片不常变：与 iTwin 缩略图同档
const IMAGE_STALE_TIME = 30 * 60 * 1000;
const IMAGE_GC_TIME = 60 * 60 * 1000;

function isImageQueryKey(key: readonly unknown[]): boolean {
  return key[0] === 'iModels' && key[1] === 'image';
}

/** Azurite 绝对地址 → dev server `/azurite` 同源代理（CORS 规避，先例同 CreateIModelWorkflow） */
function toSameOriginImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' && parsed.port === '10000') {
      return `/azurite${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * 加载 iModel 缩略图，返回可作 <img src> 的 objectURL；
 * 未加载 / 无图 / 失败返回 null（调用方回退 SvgItem 占位）。
 */
export function useIModelImage(iModelId: string | null | undefined): string | null {
  const queryClient = useQueryClient();

  useEffect(() => {
    registerImageCacheCleanup(queryClient, 'iModels.image', isImageQueryKey);
  }, [queryClient]);

  const query = useQuery({
    queryKey: queryKeys.iModels.image(iModelId ?? null),
    queryFn: async (): Promise<string | null> => {
      if (!iModelId) return null;
      try {
        const response = await fetchWithAuth(`/imodels/${iModelId}/thumbnail`);
        const payload = (await response.json()) as IModelThumbnailPayload;
        if (!payload.downloadUrl) return null;

        const imageResponse = await fetch(toSameOriginImageUrl(payload.downloadUrl));
        if (!imageResponse.ok) return null;
        return URL.createObjectURL(await imageResponse.blob());
      } catch (error) {
        // 多数新 iModel 尚无缩略图（404 / downloadUrl:null）——静默回退；其余失败 warn 一次
        if (!(error instanceof ApiError && error.isNotFound)) {
          logger.warn(
            `useIModelImage: 缩略图加载失败 (${iModelId})`,
            error instanceof Error ? error : undefined,
          );
        }
        return null;
      }
    },
    enabled: !!iModelId,
    staleTime: IMAGE_STALE_TIME,
    gcTime: IMAGE_GC_TIME,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return query.data ?? null;
}
