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
