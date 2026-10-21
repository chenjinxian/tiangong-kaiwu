/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 自有 JWT 的授权客户端（spec §2：后端非 Bentley IMS OIDC，auth-clients 的
 * OAuth 流不适用；本类把 AuthSession 会话接入 iTwin/官方客户端的
 * `AuthorizationClient` 注入点）。
 */

import { AuthSession } from './AuthSession.js';

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
  /** 委托 getValidAccessToken：将过期自动单飞刷新，未登录返回空串。 */
  public async getAccessToken(): Promise<string> {
    return AuthSession.getValidAccessToken();
  }
}
