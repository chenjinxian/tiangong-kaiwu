// src/clients/auth/test/LubanAuthorizationClient.test.ts
//
// M3-T1（终审 I6）：LubanAuthorizationClient 出口契约两钉死：
// ① token 存在 → 返回 `Bearer <token>`（iTwin RPC / tile 请求头直接消费，
//    裸 token 会被后端 fromAuthHeaderAsBearerToken() 恒拒）；
// ② 空 token（未登录/会话已清）→ 短路抛 ApiClientError(401,
//    AUTH_SESSION_EXPIRED)，不把裸空串漏进请求头。
//

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getValidAccessTokenMock = vi.fn<() => Promise<string>>();
vi.mock('../AuthSession.js', () => ({
  AuthSession: { getValidAccessToken: () => getValidAccessTokenMock() },
}));

import { LubanAuthorizationClient } from '../LubanAuthorizationClient.js';

describe('LubanAuthorizationClient', () => {
  beforeEach(() => { getValidAccessTokenMock.mockReset(); });

  it('token 存在时返回 `Bearer <token>`', async () => {
    getValidAccessTokenMock.mockResolvedValue('jwt-abc');
    await expect(new LubanAuthorizationClient().getAccessToken()).resolves.toBe('Bearer jwt-abc');
  });

  it('空 token 短路抛 ApiClientError(401, AUTH_SESSION_EXPIRED)', async () => {
    getValidAccessTokenMock.mockResolvedValue('');
    await expect(new LubanAuthorizationClient().getAccessToken()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 401,
      code: 'AUTH_SESSION_EXPIRED',
    });
  });
});
