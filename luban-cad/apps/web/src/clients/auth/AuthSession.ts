/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 会话层（移植自 apps/web features/auth/services/auth/client.ts 的
 * login/refresh/单飞逻辑，按 web-next 架构适配）：
 * - 存储收敛为 sessionStorage 单键 `luban-next-auth`（旧应用 tokens/user 双键
 *   + 同源 cookie 镜像 + localStorage 清尾，全部不移植——cookie 镜像的 WS
 *   鉴权职责在新架构由 startViewer 的 token query 参数承担，见 Task 7）；
 * - 错误统一 ApiClientError（旧 AuthError/裸 Error 不再出口）；
 * - getStoredAuth 不做过期自动清场（旧实现 expiresAt 过期即清+返回 null，
 *   会吞掉「过期→单飞刷新」路径——过期裁决收敛在 getValidAccessToken）。
 * - 存储姿态裁决见 spec §2「裁决（2026-10-21，终审 I7）」：access+refresh
 *   同键持久化 sessionStorage，不采纳 access 单独内存化。
 */

import { env } from '@config/env.js';
import { ApiClientError } from '../http/ApiClientError.js';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

/** sessionStorage `luban-next-auth` 的存储形状（brief 钉死项）。 */
export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  /** 绝对过期时刻（epoch ms）。 */
  expiresAt: number;
  user: AuthUser;
}

/** hub 登录/刷新响应的 user 段：`{id,email,name}` 为主形态，
 * 兼容旧后端 firstName/lastName/photo 拼装（移植自 convertUser）。 */
interface BackendUser {
  id: string | number;
  email: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photo?: { path?: string } | null;
}

interface TokenResponse {
  token: string;
  refreshToken: string;
  /** 绝对过期时刻（epoch ms）；缺席按 15 分钟兜底（与旧 client.ts 一致）。 */
  tokenExpires?: number;
}

// ============================================================================
// Constants
// ============================================================================

const SESSION_KEY = 'luban-next-auth';
/** 过期前缓冲：5 分钟内即视为将过期（移植自旧 isTokenExpiringSoon）。 */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
/** tokenExpires 缺席时的兜底有效期：15 分钟（移植自旧 client.ts）。 */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

// ============================================================================
// User Conversion
// ============================================================================

function convertUser(backendUser: BackendUser): AuthUser {
  const name = backendUser.name?.trim()
    || [backendUser.firstName, backendUser.lastName]
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim()
    || backendUser.email
    || 'Unknown';
  return {
    id: String(backendUser.id),
    email: backendUser.email ?? '',
    name,
    avatar: backendUser.photo?.path,
  };
}

// ============================================================================
// Single-flight Refresh State（brief 钉死项：模块级 refreshPromise）
// ============================================================================

let refreshPromise: Promise<string> | null = null;

function toSessionExpiredError(status: number, message: string): ApiClientError {
  return new ApiClientError({
    status,
    code: 'AUTH_SESSION_EXPIRED',
    i18nKey: 'common.errors.sessionExpired',
    message,
  });
}

// ============================================================================
// AuthSession
// ============================================================================

export class AuthSession {
  // ---- Storage ----

  /** 读会话。损坏 JSON / 键缺席返回 null；**不做**过期裁决（见模块头注）。 */
  public static getStoredAuth(): StoredAuth | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredAuth;
    } catch {
      return null;
    }
  }

  public static storeAuth(auth: StoredAuth): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth));
  }

  public static clearAuth(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ---- API ----

  /** 登录：`POST ${hubUrl}/auth/email/login` `{email,password}`，成功即落会话
   * （端点对齐旧应用 client.ts:203 实测——brief 的 `/auth/login` 为缺陷，
   * 控制器 R7 裁定采纳）。 */
  public static async login(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${env.hubUrl}/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new ApiClientError({
        status: response.status,
        code: 'AUTH_LOGIN_FAILED',
        i18nKey: 'common.errors.loginFailed',
        message: body.message ?? `Login failed (status ${response.status})`,
        retryAfterSeconds: AuthSession.parseRetryAfter(response),
      });
    }

    const data = await response.json() as TokenResponse & { user: BackendUser };
    const user = convertUser(data.user);
    AuthSession.storeAuth({
      accessToken: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.tokenExpires || Date.now() + DEFAULT_TTL_MS,
      user,
    });
    return user;
  }

  /** 注册：`POST ${hubUrl}/auth/email/register` `{email,password,firstName,lastName}`
   * （端点对齐旧应用 client.ts register）。错误语义同 login：非 2xx 抛
   * ApiClientError，429 取 Retry-After-auth 头透出 retryAfterSeconds。
   * 成功（2xx，**不解析 body**——真实后端注册成功返回 204 No Content 空体，
   * 空体 `.json()` 会抛 SyntaxError）后直接转 login(email, password) 落会话，
   * 返回类型与 login 同（注册即登录，跳转 /documents 后姿态一致；
   * 「先注册后登录」两段式对齐旧应用 client.ts:250-272）。 */
  public static async register(email: string, password: string, firstName: string, lastName: string): Promise<AuthUser> {
    const response = await fetch(`${env.hubUrl}/auth/email/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new ApiClientError({
        status: response.status,
        code: 'AUTH_REGISTER_FAILED',
        i18nKey: 'common.errors.registerFailed',
        message: body.message ?? `Registration failed (status ${response.status})`,
        retryAfterSeconds: AuthSession.parseRetryAfter(response),
      });
    }

    // 注册成功即登录（旧应用姿态）；204 空体无 token 可落，会话由 login 段建立。
    return AuthSession.login(email, password);
  }

  /** 登出：`POST ${hubUrl}/auth/logout`，头 `Authorization: Bearer <accessToken>`
   * + 体 `{accessToken, refreshToken}`（端点/头/体姿态对齐旧应用
   * client.ts:277-293 实测）。请求错误（网络与 HTTP 非 2xx，fetch 本身
   * 不抛 4xx/5xx，故 try/catch 只罩网络层）静默吞——旧实现同款
   * 「Ignore errors during logout」；**无论成败都 clearAuth()**（finally），
   * 调用方随后跳 /login。 */
  public static async logout(): Promise<void> {
    const stored = AuthSession.getStoredAuth();
    try {
      if (stored?.accessToken) {
        await fetch(`${env.hubUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // HTTP 头大小写不敏感；Bearer 装载 accessToken（对齐旧实现）
            'Authorization': `Bearer ${stored.accessToken}`,
          },
          body: JSON.stringify({ accessToken: stored.accessToken, refreshToken: stored.refreshToken }),
        });
      }
    } catch {
      // 登出请求失败不阻断清场（旧应用姿态）
    } finally {
      AuthSession.clearAuth();
    }
  }

  /** 找回密码：`POST ${hubUrl}/auth/forgot/password` `{email}`。错误语义同
   * login/register：非 2xx 抛 ApiClientError（429 取 Retry-After-auth 头
   * 透出 retryAfterSeconds）；成功无落会话（重置态在服务端邮件流）。 */
  public static async forgotPassword(email: string): Promise<void> {
    const response = await fetch(`${env.hubUrl}/auth/forgot/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new ApiClientError({
        status: response.status,
        code: 'AUTH_FORGOT_PASSWORD_FAILED',
        i18nKey: 'common.errors.forgotPasswordFailed',
        message: body.message ?? `Forgot password failed (status ${response.status})`,
        retryAfterSeconds: AuthSession.parseRetryAfter(response),
      });
    }
  }

  /** 429 限流头解析（login/register/forgotPassword 三处共用）：@nestjs/throttler
   * 命名桶经 Retry-After-auth 头返回剩余封锁秒数（Fetch Headers.get 大小写
   * 不敏感，'retry-after-auth' 同一命中）；头缺席或非有限数返回 undefined。 */
  private static parseRetryAfter(response: Response): number | undefined {
    const retryAfterHeader = response.headers.get('Retry-After-auth');
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
    return retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds
      : undefined;
  }

  /**
   * 取可用 access token：未登录返回空串（core-common AuthorizationClient
   * 契约）；将过期（含已过期）走单飞刷新；失败清场并抛 ApiClientError。
   */
  public static async getValidAccessToken(): Promise<string> {
    const stored = AuthSession.getStoredAuth();
    if (!stored) return '';
    if (stored.expiresAt >= Date.now() + EXPIRY_BUFFER_MS) return stored.accessToken;
    return AuthSession.refreshSingleFlight();
  }

  // ---- Single-flight Refresh ----

  /** 并发共享同一 in-flight Promise；终态（含失败）后复位。 */
  private static refreshSingleFlight(): Promise<string> {
    refreshPromise ??= AuthSession.doRefresh().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  /**
   * 刷新：`POST ${hubUrl}/auth/refresh`，头 `Authorization: Bearer <refreshToken>`
   * （后端 AuthGuard('jwt-refresh') fromAuthHeaderAsBearerToken()——缺此头恒 401，
   * 移植自旧 refreshToken() 的关键注释）+ 体 `{refreshToken}`。
   * 失败路径（网络错误/HTTP 错误/畸形 200 体）：统一 clearAuth() 后抛
   * ApiClientError（HTTP 错误透传真实 status，其余归 401）。
   */
  private static async doRefresh(): Promise<string> {
    const stored = AuthSession.getStoredAuth();
    if (!stored?.refreshToken) {
      AuthSession.clearAuth();
      throw toSessionExpiredError(401, 'No refresh token in stored session');
    }

    try {
      const response = await fetch(`${env.hubUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // HTTP 头大小写不敏感；Bearer 装载的是 refreshToken 而非 accessToken
          'Authorization': `Bearer ${stored.refreshToken}`,
        },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });
      if (!response.ok) {
        throw toSessionExpiredError(response.status, `Token refresh failed (status ${response.status})`);
      }

      const data = await response.json() as TokenResponse;
      if (!data.token || !data.refreshToken) {
        throw toSessionExpiredError(401, 'Token refresh response missing token fields');
      }

      // 刷新期间可能并发 login 覆写了会话：只在仍持有会话时保留其 user，
      // 用响应的新 token 三元组覆写（旧实现「保留 user」语义的等价移植）
      const user = AuthSession.getStoredAuth()?.user ?? stored.user;
      AuthSession.storeAuth({
        accessToken: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.tokenExpires || Date.now() + DEFAULT_TTL_MS,
        user,
      });
      return data.token;
    } catch (error) {
      AuthSession.clearAuth();
      if (error instanceof ApiClientError) throw error;
      throw toSessionExpiredError(401, `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
