/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 自有 JWT 的授权客户端（spec §2：后端非 Bentley IMS OIDC，auth-clients 的
 * OAuth 流不适用；本类把 AuthSession 会话接入 iTwin/官方客户端的
 * `AuthorizationClient` 注入点）。
 */

import { AuthSession } from './AuthSession.js';
import { ApiClientError } from '../http/ApiClientError.js';

/**
 * 结构镜像 `@itwin/core-common` 的 `AuthorizationClient`（`AccessToken` 在
 * @itwin/core-bentley 中就是 `string` 类型别名，故本接口与该接口逐成员兼容）。
 * web-next 尚未引入 @itwin/core-common 依赖（Task 7 的 viewer-next 才 link:），
 * 待引入后把本镜像替换为真包 import 即可，类体零改动。
 */
interface AuthorizationClient {
  getAccessToken(): Promise<string>;
}

export class LubanAuthorizationClient implements AuthorizationClient {
  /** 委托 getValidAccessToken：将过期自动单飞刷新。出口两钉死（M3-T1，终审 I6）：
   * - 统一加 `Bearer ` 前缀——iTwin RPC / tile 请求头直接消费本返回值，
   *   裸 token 会被后端 fromAuthHeaderAsBearerToken() 恒拒；
   * - 空 token（未登录/会话已清）短路抛 ApiClientError(401, AUTH_SESSION_EXPIRED)，
   *   不把裸空串漏进请求头。 */
  public async getAccessToken(): Promise<string> {
    const token = await AuthSession.getValidAccessToken();
    if (!token) {
      throw new ApiClientError({
        status: 401,
        code: 'AUTH_SESSION_EXPIRED',
        i18nKey: 'common.errors.sessionExpired',
        message: 'No valid access token (session missing or cleared)',
      });
    }
    return `Bearer ${token}`;
  }
}
