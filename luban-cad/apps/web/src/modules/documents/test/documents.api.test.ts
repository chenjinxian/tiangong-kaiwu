// src/modules/documents/test/documents.api.test.ts
//
// M4 Task 8（M3 终审挂账清偿 T1-①）：hubFetch 429/Retry-After 分支透出
// retryAfterSeconds（ApiClientError 既有字段，hub 裸 REST 出口此前未填）——
//  documents.api（收藏）认 Retry-After-auth（@nestjs/throttler 命名桶头，
//  AuthSession.parseRetryAfter 同口径）；share.api（成员/角色）认标准
//  Retry-After。无头/非有限数 → 字段缺席（undefined）。
//
// 定位：clients 层错误契约验收；fetch 全局 stub（零真实请求），AuthSession
// 模块级 mock（token 通道不参与断言）。

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: { getValidAccessToken: vi.fn().mockResolvedValue('tok') },
}));

import { addToFavorites } from '../internal/documents.api.js';
import { listUserMembers } from '../internal/share.api.js';
import { ApiClientError } from '@clients/http/ApiClientError.js';

function response429(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ message: 'too many requests' }), {
    status: 429,
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M4-T8 T1-①：hubFetch 透出 retryAfterSeconds', () => {
  it('documents.api：Retry-After-auth 头 → ApiClientError.retryAfterSeconds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response429({ 'Retry-After-auth': '720' })));
    const err = await addToFavorites('itwin-1').catch((e: unknown) => e as ApiClientError);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).status).toBe(429);
    expect((err as ApiClientError).retryAfterSeconds).toBe(720);
  });

  it('share.api：标准 Retry-After 头 → 透出；无头 → 字段缺席', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response429({ 'Retry-After': '42' })));
    const err = await listUserMembers('itwin-1').catch((e: unknown) => e as ApiClientError);
    expect((err as ApiClientError).retryAfterSeconds).toBe(42);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response429({})));
    const noHeader = await listUserMembers('itwin-1').catch((e: unknown) => e as ApiClientError);
    expect((noHeader as ApiClientError).retryAfterSeconds).toBeUndefined();
  });
});
