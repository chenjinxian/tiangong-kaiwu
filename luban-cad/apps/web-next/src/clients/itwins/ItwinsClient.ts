/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwin（项目）数据层客户端（Task 2）：对官方 `@itwin/itwins-client`
 * `ITwinsAccessClient` 的薄封装——
 * - 构造时以 `env.hubUrl`（本地 imodelhub :5400）+ `/itwins` 前缀实例化
 *   官方客户端（hub SDK 兼容路由布局；与 ImodelsClient `/imodels` 同口径）；
 * - 每个方法先经 `AuthSession.getValidAccessToken()` 取 token（过期单飞
 *   刷新逻辑在 AuthSession 内部），再调官方方法；
 * - 官方 `ITwinsAPIResponse<T> { data?, status, error? }` 统一解包：
 *   `error` 或 `status >= 400` 映射为 ApiClientError（status/code/i18nKey
 *   三元组契约，spec §2），无 data 的删除语义（204）单独放行。
 */

import { ITwinsAccessClient } from '@itwin/itwins-client';
import type { ITwin, ITwinsAPIResponse } from '@itwin/itwins-client';
import { env } from '@config/env.js';
import { AuthSession } from '../auth/AuthSession.js';
import { ApiClientError } from '../http/ApiClientError.js';
import type { CreateItwinInput, ListItwinsParams, UpdateItwinInput } from './types.js';

export class ItwinsClient {
  private readonly accessClient: ITwinsAccessClient;

  public constructor() {
    // hub 的 SDK 兼容路由挂在 /itwins/*（列表=GET /itwins、收藏=/itwins/
    // favorites、最近=/itwins/recents——M2 Task 8 对 :5400 实测根路径 base
    // 会打到 NestJS 信息根路由、/favorites 404）；与 ImodelsClient 的
    // `${env.hubUrl}/imodels` 同口径。
    this.accessClient = new ITwinsAccessClient(`${env.hubUrl}/itwins`);
  }

  /** 项目列表（分页可选；官方 queryAsync）。 */
  public async list(params?: ListItwinsParams): Promise<ITwin[]> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.queryAsync(accessToken, undefined, params);
    return this.unwrap(response);
  }

  /** 单个项目详情。 */
  public async get(id: string): Promise<ITwin> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.getAsync(accessToken, id);
    return this.unwrap(response);
  }

  /** 新建项目。 */
  public async create(input: CreateItwinInput): Promise<ITwin> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.createiTwin(accessToken, input as ITwin);
    return this.unwrap(response);
  }

  /** 更新项目（增量字段）。 */
  public async update(id: string, input: UpdateItwinInput): Promise<ITwin> {
    const accessToken = await this.bearerToken();
    // 官方签名收全量 ITwin，但其 API 语义为增量更新——入参即 Partial<ITwin>。
    const response = await this.accessClient.updateiTwin(accessToken, id, input as ITwin);
    return this.unwrap(response);
  }

  /** 删除项目（官方 204 No Content 无 data，不放行解包）。 */
  public async delete(id: string): Promise<void> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.deleteiTwin(accessToken, id);
    this.assertOk(response);
  }

  /** 收藏项目列表。 */
  public async listFavorites(): Promise<ITwin[]> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.queryFavoritesAsync(accessToken);
    return this.unwrap(response);
  }

  /** 最近访问项目列表。 */
  public async listRecents(): Promise<ITwin[]> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.queryRecentsAsync(accessToken);
    return this.unwrap(response);
  }

  /**
   * 官方 SDK 的 accessToken 字符串原样进 authorization 头（BaseClient.
   * getRequestOptions）——iTwin.js AccessToken 惯例带 scheme：hub 对裸
   * jwt 头恒 401（M2 Task 8 实测），封装层统一加 Bearer 前缀（与
   * ImodelsClient `{ scheme: 'Bearer', token }`、内部 fetchers 同口径）。
   */
  private async bearerToken(): Promise<string> {
    return `Bearer ${await AuthSession.getValidAccessToken()}`;
  }

  // ---- ITwinsAPIResponse 统一裁决 ----

  /** 错误/status>=400 裁决为 ApiClientError（data 阶段不裁决）。 */
  private assertOk(response: ITwinsAPIResponse<unknown>): void {
    if (response.error || response.status >= 400) {
      throw new ApiClientError({
        status: response.status,
        code: 'ITWINS_REQUEST_FAILED',
        message: response.error?.message,
      });
    }
  }

  /** 解包 data：先过 assertOk，再要求 data 在场（204 删除语义不走本路径）。 */
  private unwrap<T>(response: ITwinsAPIResponse<T>): T {
    this.assertOk(response);
    if (response.data === undefined) {
      throw new ApiClientError({
        status: response.status,
        code: 'ITWINS_EMPTY_RESPONSE',
        message: 'itwins response missing data',
      });
    }
    return response.data;
  }
}
