/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 全站唯一认证 fetch 封装（P0 Task1）。
 * 行为口径迁移自 shared/services/itwins/client.ts 原 fetchWithAuth：
 * Bearer 注入 / 401 刷新并重试一次 / 官方错误包络 {error:{code,message}} 优先、
 * 回落旧包络顶层 message / 403 统一文案（页面经 showToast(error.message) 上浮）。
 */
import { getValidAccessToken, refreshAccessToken } from '../../features/auth/services/auth/client.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  public get isNotFound(): boolean { return this.statusCode === 404; }
  public get isUnauthorized(): boolean { return this.statusCode === 401; }
  public get isForbidden(): boolean { return this.statusCode === 403; }
}

export interface FetchWithAuthOptions extends RequestInit {
  /** 覆盖 base；默认 '' = 同源反代（VITE_IMODELHUB_URL 未配置） */
  baseUrl?: string;
}

export async function fetchWithAuth(
  path: string,
  options: FetchWithAuthOptions = {},
  retryCount = 0,
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new ApiError('No authentication token', 401);
  }

  const { baseUrl, ...init } = options;
  const base = baseUrl ?? (import.meta.env.VITE_IMODELHUB_URL || '');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (response.status === 401 && retryCount === 0) {
    try {
      await refreshAccessToken();
      return await fetchWithAuth(path, options, retryCount + 1);
    } catch {
      throw new ApiError('Authentication failed', 401, 'Unauthorized');
    }
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
      message?: string;
      code?: string;
    };
    const message = errorData.error?.message ?? errorData.message ?? `HTTP ${response.status}`;
    throw new ApiError(
      response.status === 403 ? '无权限访问该资源' : message,
      response.status,
      errorData.error?.code ?? errorData.code,
    );
  }

  return response;
}
