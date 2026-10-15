/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwins Client with Enhanced Error Handling
 * Wraps the official @itwin/itwins-client with better error handling
 */

import {
  type ITwin,
  ITwinsAccessClient,
  ITwinSubClass,
} from '@itwin/itwins-client';
import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';
import { fetchWithAuth, ApiError as ITwinsApiError } from '../../api/httpClient.js';

// 向后兼容导出：instanceof 语义不变（同类别名）
export { ApiError as ITwinsApiError } from '../../api/httpClient.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

// ============================================================================
// 列表翻页聚合（Sync S2）：后端列表默认 $top=10（clamp ≤200）且满页时给
// _links.next（绝对 URL）——首页直接要 $top=200，仍有 next 则裸跟绝对 URL，
// 硬帽 5 跳防失控环（200×6≈1200 条上界）。
// ============================================================================

const LIST_PAGE_SIZE = 200;
const MAX_FOLLOW_PAGES = 5;

interface ITwinsPage {
  iTwins?: ITwin[];
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 后端线格式字面 _links
  _links?: { next?: { href?: string } };
}

/** 聚合跟页：沿首页响应体的 _links.next.href 续取，至多 cap 跳 */
async function followNextLinks(
  firstPage: ITwinsPage,
  cap: number = MAX_FOLLOW_PAGES,
): Promise<ITwin[]> {
  const items: ITwin[] = [...(firstPage.iTwins ?? [])];
  let next = firstPage._links?.next?.href;
  for (let followed = 0; next && followed < cap; followed += 1) {
    // next 已是绝对 URL：传 baseUrl='' 让 fetchWithAuth 原样使用（仍带 Bearer/401 刷新）
    const response = await fetchWithAuth(next, { baseUrl: '' });
    const page = (await response.json()) as ITwinsPage;
    items.push(...(page.iTwins ?? []));
    next = page._links?.next?.href;
  }
  return items;
}

/**
 * Get a single iTwin by ID with proper 404 handling
 * Falls back to raw fetch if SDK returns generic error
 */
export async function getITwin(iTwinId: string): Promise<ITwin> {
  try {
    // Use fetchWithAuth which handles token refresh automatically
    const response = await fetchWithAuth(`/itwins/${iTwinId}`);
    const data = await response.json();

    // Backend returns { iTwin: { ... } }
    if (data.iTwin) {
      return data.iTwin;
    }

    // Fallback if response format is different
    return data;
  } catch (error) {
    if (error instanceof ITwinsApiError) {
      throw error;
    }

    // Handle SDK errors that don't provide status codes
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for common error patterns
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      throw new ITwinsApiError(`iTwin with id ${iTwinId} not found`, 404, 'NotFound');
    }
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new ITwinsApiError('Unauthorized', 401, 'Unauthorized');
    }

    throw new ITwinsApiError(errorMessage, 500);
  }
}

/**
 * Query iTwins with proper error handling
 */
export async function queryITwins(
  _subClass: ITwinSubClass = ITwinSubClass.Project,
  search?: string
): Promise<ITwin[]> {
  // Note: imodelhub-service stores 'subclass' as empty string, so we filter by 'class' instead
  // OData 风格 $top/$search 手工拼（URLSearchParams 会把 $ 编码成 %24，后端虽兼容但线上不直观）
  let query = `class=Project&$top=${LIST_PAGE_SIZE}`;
  if (search) {
    query += `&$search=${encodeURIComponent(search)}`;
  }

  const response = await fetchWithAuth(`/itwins?${query}`);
  const firstPage = (await response.json()) as ITwinsPage;

  return followNextLinks(firstPage);
}

/**
 * Create a new iTwin
 */
export async function createITwin(data: {
  displayName: string;
  subClass?: ITwinSubClass;
  description?: string;
}): Promise<ITwin> {
  const response = await fetchWithAuth('/itwins', {
    method: 'POST',
    body: JSON.stringify({
      displayName: data.displayName,
      // 后端 DTO 字段是小写 subclass（白名单静默剥离 subClass → DB 落空串）
      subclass: data.subClass || ITwinSubClass.Project,
      description: data.description,
    }),
  });

  const result = await response.json();
  return result.iTwin;
}

/**
 * Update an iTwin
 */
export async function updateITwin(
  iTwinId: string,
  data: {
    displayName?: string;
    description?: string;
    status?: string;
  }
): Promise<ITwin> {
  const response = await fetchWithAuth(`/itwins/${iTwinId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  const result = await response.json();
  return result.iTwin;
}

/**
 * Delete an iTwin
 */
export async function deleteITwin(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/${iTwinId}`, {
    method: 'DELETE',
  });
}

/**
 * Query favorite iTwins
 */
export async function queryFavoriteITwins(): Promise<ITwin[]> {
  const response = await fetchWithAuth(`/itwins/favorites?$top=${LIST_PAGE_SIZE}`);
  const firstPage = (await response.json()) as ITwinsPage;
  return followNextLinks(firstPage);
}

/**
 * Query recent iTwins
 */
export async function queryRecentITwins(): Promise<ITwin[]> {
  const response = await fetchWithAuth(`/itwins/recents?$top=${LIST_PAGE_SIZE}`);
  const firstPage = (await response.json()) as ITwinsPage;
  return followNextLinks(firstPage);
}

/**
 * Add iTwin to favorites
 */
export async function addToFavorites(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/favorites/${iTwinId}`, {
    method: 'POST',
  });
}

/**
 * Remove iTwin from favorites
 */
export async function removeFromFavorites(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/favorites/${iTwinId}`, {
    method: 'DELETE',
  });
}

/**
 * Add iTwin to recents
 */
export async function addToRecents(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/recents/${iTwinId}`, {
    method: 'POST',
  });
}

// ============================================================================
// Legacy SDK Client (kept for backward compatibility)
// ============================================================================

/**
 * iTwins Client instance
 * Note: ITwinsAccessClient expects the base URL including /itwins path
 */
export const iTwinsClient = new ITwinsAccessClient(`${BACKEND_URL}/itwins`);

/**
 * Get authorization token for SDK operations
 * Returns "Bearer <token>" format required by backend
 * Note: @itwin/itwins-client sends this directly as the Authorization header
 */
export async function getAuthorization(): Promise<string> {
  const token = await getValidAccessToken();
  return token ? `Bearer ${token}` : '';
}

/**
 * Re-export SDK types
 */
export { ITwinSubClass };
export type {
  ITwin,
  ITwinsQueryArg,
} from '@itwin/itwins-client';
