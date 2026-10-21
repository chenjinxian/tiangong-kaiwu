// src/clients/auth/test/AuthSession.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../AuthSession.js';

const HUB = 'http://localhost:5400';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function tokenPayload(expOffsetSec: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSec };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

describe('AuthSession', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('login 成功存会话并返回用户', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      token: tokenPayload(900), refreshToken: 'r1', tokenExpires: Date.now() + 900_000,
      user: { id: '3', email: 't@e.com', name: 'Test User' },
    })));
    const user = await AuthSession.login('t@e.com', 'pw');
    expect(user.name).toBe('Test User');
    expect(AuthSession.getStoredAuth()?.refreshToken).toBe('r1');
  });

  it('过期时单飞刷新：并发 3 请求只发 1 次 /auth/refresh', async () => {
    AuthSession.storeAuth({
      accessToken: tokenPayload(-10), refreshToken: 'r-old',
      expiresAt: Date.now() - 10_000, user: { id: '3', email: 't@e.com', name: 'T' },
    });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({
          token: tokenPayload(900), refreshToken: 'r-new', tokenExpires: Date.now() + 900_000,
        }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([AuthSession.getValidAccessToken(), AuthSession.getValidAccessToken(), AuthSession.getValidAccessToken()]);
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    // 回归钉死：刷新请求必须带 `Authorization: Bearer <stored refreshToken>`——
    // 后端 AuthGuard('jwt-refresh') fromAuthHeaderAsBearerToken() 缺此头恒 401，
    // 历史「missing header → permanent 401」回归即此断言兜底。
    expect((refreshCalls[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer r-old' });
    expect(AuthSession.getStoredAuth()?.refreshToken).toBe('r-new');
  });

  it('刷新失败清场并抛 ApiClientError(401)', async () => {
    AuthSession.storeAuth({
      accessToken: tokenPayload(-10), refreshToken: 'r-dead',
      expiresAt: Date.now() - 10_000, user: { id: '3', email: 't@e.com', name: 'T' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 401 }, 401)));
    await expect(AuthSession.getValidAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(AuthSession.getStoredAuth()).toBeNull();
  });

  it('登录 429：携带 Retry-After-auth 头时错误透出 retryAfterSeconds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Too many requests' }),
      { status: 429, headers: { 'content-type': 'application/json', 'Retry-After-auth': '720' } },
    )));
    await expect(AuthSession.login('t@e.com', 'pw')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 720,
    });
  });

  // 终审 C-A 回归钉死：真实后端注册成功返回 204 No Content 空体——register
  // 成功分支不得解析 body（空体 .json() 抛 SyntaxError），应直接转 login 落会话。
  it('register 成功（204 空体）不解析 body，直接走 login 落会话', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/email/register')) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(jsonResponse({
        token: tokenPayload(900), refreshToken: 'r-reg', tokenExpires: Date.now() + 900_000,
        user: { id: '7', email: 't@e.com', name: 'Reg User' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = await AuthSession.register('t@e.com', 'pw', 'Reg', 'User');
    expect(user.name).toBe('Reg User');
    expect(AuthSession.getStoredAuth()?.refreshToken).toBe('r-reg');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('/auth/email/register'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('/auth/email/login'))).toHaveLength(1);
  });
});
