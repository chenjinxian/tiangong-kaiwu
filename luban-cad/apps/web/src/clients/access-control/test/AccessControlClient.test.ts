// src/clients/access-control/test/AccessControlClient.test.ts
//
// M5 Task 3 失败测试先行（brief Step 1）：mock 两个官方 SDK，断言三件事——
//  1) 调用形状：官方 `@itwin/access-control-client` `AccessControlClient` 以
//     `${env.hubUrl}/accesscontrol/itwins` 实例化（hub 的 SDK 兼容路由挂在
//     `accesscontrol/itwins/*`——nginx/vite 同前缀代理，M2 Task 8 口径）；
//     iModel 级我的权限走官方 `@itwin/imodels-client-management`
//     `userPermissions.get({ authorization, iModelId })`（GET
//     /imodels/:id/permissions——官方 access-control 客户端 v2/v4 均无
//     iModel 级方法，该查询官方归属 imodels-v2 API，见实现头注）；
//  1b) authorization 懒回调：每次请求经 AuthSession.getValidAccessToken 取
//     token——access-control SDK 收 "Bearer <jwt>" 字符串（原样进
//     authorization 头）、imodels SDK 收 `{ scheme: 'Bearer', token }`；
//  2) 返回映射：AccessControlAPIResponse { data?, status, error? } 与
//     UserPermissions { permissions } 解包；error/status>=400 / IModelsError
//     映射为 ApiClientError（status 三元组契约，itwins/imodels 封装同姿态）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@config/env.js';
import { AuthSession } from '../../auth/AuthSession.js';
import { ApiClientError } from '../../http/ApiClientError.js';
import { AccessControlClient } from '../AccessControlClient.js';

// ---- 官方客户端 mock（vi.hoisted：factory 提升后仍可引用） ----
const official = vi.hoisted(() => ({
  accessControlCtor: vi.fn(),
  imodelsCtor: vi.fn(),
  getITwinPermissionsAsync: vi.fn(),
  userPermissionsGet: vi.fn(),
}));

vi.mock('@itwin/access-control-client', () => ({
  AccessControlClient: class MockAccessControlClient {
    public constructor(url?: string) {
      official.accessControlCtor(url);
    }
    public get permissions() {
      return {
        getITwinPermissionsAsync: official.getITwinPermissionsAsync,
      };
    }
  },
}));

// importOriginal 保留 isIModelsApiError 真实现——错误映射测试走真类型守卫
//（与 ImodelsClient.test 同款 mock 口径）。
vi.mock('@itwin/imodels-client-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@itwin/imodels-client-management')>();
  return {
    ...actual,
    IModelsClient: class MockIModelsClient {
      public constructor(options?: unknown) {
        official.imodelsCtor(options);
      }
      public get userPermissions() {
        return {
          get: official.userPermissionsGet,
        };
      }
    },
  };
});

const TOKEN = 'tok-1';
/** access-control SDK 边界形态：accessToken 字符串原样进 authorization 头。 */
const BEARER_TOKEN = `Bearer ${TOKEN}`;

beforeEach(() => {
  vi.spyOn(AuthSession, 'getValidAccessToken').mockResolvedValue(TOKEN);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('AccessControlClient（官方 access-control + imodels SDK 封装）', () => {
  it('构造函数：access-control 客户端以 `${env.hubUrl}/accesscontrol/itwins`、imodels 客户端以 `${env.hubUrl}/imodels` 实例化', () => {
    new AccessControlClient();
    expect(official.accessControlCtor).toHaveBeenCalledWith(`${env.hubUrl}/accesscontrol/itwins`);
    expect(official.imodelsCtor).toHaveBeenCalledWith({ api: { baseUrl: `${env.hubUrl}/imodels` } });
  });

  it('getITwinPermissions(iTwinId)：getITwinPermissionsAsync(Bearer token, iTwinId)，解包 data', async () => {
    const data = ['itwins_webview', 'imodels_manage'];
    official.getITwinPermissionsAsync.mockResolvedValue({ data, status: 200 });
    const client = new AccessControlClient();

    await expect(client.getITwinPermissions('twin-1')).resolves.toEqual(data);
    expect(official.getITwinPermissionsAsync).toHaveBeenCalledWith(BEARER_TOKEN, 'twin-1');
  });

  it('getITwinPermissions：官方 error/status>=400 → ApiClientError（status 透传）', async () => {
    official.getITwinPermissionsAsync.mockResolvedValue({
      status: 403,
      error: { code: 'InsufficientPermissions', message: 'no access' },
    });
    const client = new AccessControlClient();

    await expect(client.getITwinPermissions('twin-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      message: 'no access',
    });
    await expect(client.getITwinPermissions('twin-1')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('getMyIModelPermissions(iModelId)：官方 userPermissions.get({ authorization, iModelId })，懒回调取 Bearer token，解包 permissions', async () => {
    const permissions = ['imodels_webview', 'imodels_read', 'imodels_write'];
    official.userPermissionsGet.mockResolvedValue({ permissions });
    const client = new AccessControlClient();

    await expect(client.getMyIModelPermissions('im-1')).resolves.toEqual(permissions);
    expect(official.userPermissionsGet).toHaveBeenCalledTimes(1);

    // 官方 v6 形状：操作参数对象 + authorization 懒回调——回调在官方客户端每次
    // 发请求时被调；调回调才取 token（懒求值），并包 { scheme: 'Bearer', token }。
    expect(AuthSession.getValidAccessToken).not.toHaveBeenCalled();
    const params = official.userPermissionsGet.mock.calls[0]?.[0] as {
      iModelId: string;
      authorization: () => Promise<{ scheme: string; token: string }>;
    };
    expect(params.iModelId).toBe('im-1');
    await expect(params.authorization()).resolves.toEqual({ scheme: 'Bearer', token: TOKEN });
    expect(AuthSession.getValidAccessToken).toHaveBeenCalledTimes(1);
  });

  it('getMyIModelPermissions：官方 IModelsError（403 无访问）→ ApiClientError', async () => {
    official.userPermissionsGet.mockRejectedValue({
      code: 'Unauthorized',
      statusCode: 403,
      message: 'You do not have permission to access this iModel',
    });
    const client = new AccessControlClient();

    await expect(client.getMyIModelPermissions('im-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      message: 'You do not have permission to access this iModel',
    });
  });

  it('getMyIModelPermissions：非官方错误（网络层等）原样上抛（不吞不映射）', async () => {
    official.userPermissionsGet.mockRejectedValue(new Error('network down'));
    const client = new AccessControlClient();

    await expect(client.getMyIModelPermissions('im-1')).rejects.toThrow('network down');
  });
});
