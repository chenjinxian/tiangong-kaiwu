/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * access-control（权限判定）数据层客户端（M5 Task 3）：权限查询的统一封装——
 *
 * - iTwin 级权限（官方 `@itwin/access-control-client` `AccessControlClient`）：
 *   构造时以 `env.hubUrl` + `/accesscontrol/itwins` 实例化（hub 的 SDK 兼容
 *   路由挂在 `accesscontrol/itwins/*`——nginx/vite 同前缀代理，与 ItwinsClient
 *   的 `/itwins`、ImodelsClient 的 `/imodels` 同口径）；每个方法先经
 *   `AuthSession.getValidAccessToken()` 取 token（懒回调/直接取由 SDK 形状
 *   决定），官方把 token 字符串原样写进 authorization 头，故统一加 Bearer
 *   前缀（hub 对裸 jwt 头恒 401，M2 Task 8 实测）；官方
 *   `AccessControlAPIResponse<T> { data?, status, error? }` 统一解包：error
 *   或 status>=400 映射为 ApiClientError（status/code/i18nKey 三元组契约）；
 * - iModel 级我的权限（官方 `@itwin/imodels-client-management`
 *   `userPermissions.get`，即 imodels-v2 `GET /imodels/{id}/permissions`）：
 *   官方 access-control 客户端 v2.3.1（旧应用同款）与 v4.4.1（上游 HEAD）
 *   均无 iModel 级方法——该查询在官方 API 家族中归属 iModels API（仓库
 *   docs/api-specs/access-control-v2.json 亦无 iModel 路由），故经官方
 *   imodels SDK 消费（Bentley 云语义含「iModel 级未配置时回落 iTwin 级
 *   配置」；hub 实现暂无回落，非 creator 无显式授权者恒
 *   `[imodels_webview]`——hub backlog 挂账，见 task-3-report 勘误段）；
 *   authorization 走官方 v6 懒回调
 *   `{ scheme: 'Bearer', token }`（每次发请求都调），错误经
 *   `isIModelsApiError` 映射为 ApiClientError（ImodelsClient 同姿态）；
 * - 两路均返回权限字符串数组（官方 string 枚举值直通，如
 *   `imodels_write`/`imodels_manage`），语义裁决（→ editable/readonly）归
 *   usePermissions（旧 useIModelPermission.determineEditorMode 移植位），
 *   数据层不夹带裁决。
 *
 * 前缀注：web-next vite 代理已有 `/accesscontrol`（对照 deploy/
 * default.conf.template 九前缀清单，本任务无需补代理）。
 */

import { AccessControlClient as ItwinAccessControlClient } from '@itwin/access-control-client';
import type { AccessControlAPIResponse } from '@itwin/access-control-client';
import { IModelsClient, isIModelsApiError } from '@itwin/imodels-client-management';
import type { AuthorizationCallback } from '@itwin/imodels-client-management';
import { env } from '@config/env.js';
import { AuthSession } from '../auth/AuthSession.js';
import { ApiClientError } from '../http/ApiClientError.js';

/** 权限裁决出口（editable/readonly 二值；裁决逻辑归 usePermissions——数据层只定词表）。 */
export type PermissionMode = 'editable' | 'readonly';

export class AccessControlClient {
  /** 官方 access-control 客户端（iTwin 级权限面）。 */
  private readonly accessClient: ItwinAccessControlClient;
  /** 官方 imodels 客户端（iModel 级我的权限；仅用 userPermissions 操作面）。 */
  private readonly imodelsClient: IModelsClient;

  public constructor() {
    // hub 的 SDK 兼容路由挂在 /accesscontrol/itwins/*（iTwin 级我的权限=
    // GET /accesscontrol/itwins/:id/permissions，imodelhub AccessControlController
    // 实测同名路由；与 ItwinsClient 的 `${hubUrl}/itwins` 同口径——根路径 base
    // 会打到 NestJS 信息根路由）。
    this.accessClient = new ItwinAccessControlClient(`${env.hubUrl}/accesscontrol/itwins`);
    this.imodelsClient = new IModelsClient({ api: { baseUrl: `${env.hubUrl}/imodels` } });
  }

  /**
   * iTwin 级：当前身份在指定 iTwin 的权限列表（官方
   * `permissions.getITwinPermissionsAsync`）。
   */
  public async getITwinPermissions(iTwinId: string): Promise<string[]> {
    const accessToken = await this.bearerToken();
    const response = await this.accessClient.permissions.getITwinPermissionsAsync(accessToken, iTwinId);
    return this.unwrap(response);
  }

  /**
   * iModel 级：当前用户的 iModel 权限（旧 useIModelPermission 调用面的官方
   * SDK 通道——官方语义自带 iTwin 级配置回落，单查询即完整裁决源）。
   */
  public async getMyIModelPermissions(iModelId: string): Promise<string[]> {
    return this.invoke(async () => {
      const userPermissions = await this.imodelsClient.userPermissions.get({
        authorization: this.authorization(),
        iModelId,
      });
      return userPermissions.permissions;
    });
  }

  // ---- authorization / 错误裁决 ----

  /**
   * 官方 access-control SDK 的 accessToken 字符串原样进 authorization 头
   * （BaseClient.getRequestOptions）——iTwin.js AccessToken 惯例带 scheme：
   * hub 对裸 jwt 头恒 401（M2 Task 8 实测），封装层统一加 Bearer 前缀。
   */
  private async bearerToken(): Promise<string> {
    return `Bearer ${await AuthSession.getValidAccessToken()}`;
  }

  /** 官方 imodels SDK 懒回调：每次发请求都会调它（逐请求取新 token）。 */
  private authorization(): AuthorizationCallback {
    return async () => {
      const token = await AuthSession.getValidAccessToken();
      return { scheme: 'Bearer', token };
    };
  }

  /** 官方 IModelsError → ApiClientError 三元组；其余错误原样上抛。 */
  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isIModelsApiError(error)) {
        throw new ApiClientError({
          status: error.statusCode ?? 500,
          code: 'IMODELS_REQUEST_FAILED',
          message: error.message,
        });
      }
      throw error;
    }
  }

  /** AccessControlAPIResponse 解包：error/status>=400 裁决为 ApiClientError。 */
  private unwrap<T>(response: AccessControlAPIResponse<T>): T {
    if (response.error || response.status >= 400) {
      throw new ApiClientError({
        status: response.status,
        code: 'ACCESS_CONTROL_REQUEST_FAILED',
        message: response.error?.message,
      });
    }
    if (response.data === undefined) {
      throw new ApiClientError({
        status: response.status,
        code: 'ACCESS_CONTROL_EMPTY_RESPONSE',
        message: 'access-control response missing data',
      });
    }
    return response.data;
  }
}
