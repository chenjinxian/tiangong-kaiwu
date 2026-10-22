/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 数据层统一错误（spec §2：状态码 / 业务码 / i18n key 三元组）。
 * clients/* 与 modules/* 的错误呈现都以本类为契约：
 * status 供 QueryCache 全局分流（401 → 刷新会话、5xx → toast），
 * i18nKey 供就地呈现，code 供遥测/业务分支。
 */

/** 错误形状（brief 钉死项 `{ status, code?, i18nKey }`，message 仅作调试透传）。 */
export interface ApiClientErrorOptions {
  status: number;
  code?: string;
  i18nKey?: string;
  message?: string;
  /** 限流剩余封锁秒数（如登录 429 的 Retry-After-auth 头透出），供 UI 等待文案。 */
  retryAfterSeconds?: number;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly i18nKey: string;
  public readonly retryAfterSeconds?: number;

  constructor(options: ApiClientErrorOptions) {
    super(options.message ?? `API request failed (status ${options.status})`);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.i18nKey = options.i18nKey ?? 'common.errors.apiRequestFailed';
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * 429 限流头解析（M4-T8 收 M3 终审 T1-①：hubFetch 分支透出）：
 * `Retry-After-auth`（@nestjs/throttler 命名桶头，AuthSession 私有同名
 * 解析同口径）优先，标准 `Retry-After` 兜底；头缺席或非有限数返回
 * undefined（字段照常缺席，UI 等待文案按无值分支呈现）。
 */
export function parseRetryAfterSeconds(response: Response): number | undefined {
  for (const header of ['Retry-After-auth', 'Retry-After']) {
    const value = response.headers.get(header);
    const seconds = value ? Number.parseInt(value, 10) : undefined;
    if (seconds !== undefined && Number.isFinite(seconds)) return seconds;
  }
  return undefined;
}
