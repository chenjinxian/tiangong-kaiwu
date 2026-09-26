/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Service-account JWT client for imodelhub-services (official routes are
 * JWT-guarded; the agent authenticates like any API client).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = global.fetch;
let calls: Array<{ url: string; method: string; body?: string; headers: Record<string, string> }>;

beforeEach(() => {
  process.env.IMODELHUB_URL = 'http://hub.test:4000';
  process.env.AZURITE_ACCOUNT_KEY = 'k'.repeat(64);
  process.env.WEBHOOK_SECRET = 's'.repeat(32);
  process.env.IMODELHUB_API_KEY = 'h'.repeat(32);
  process.env.BACKEND_API_KEY = 'b'.repeat(32);
  process.env.WEBAGENT_API_KEY = 'w'.repeat(32);
  process.env.IMODELHUB_ADMIN_EMAIL = 'svc@test.local';
  process.env.IMODELHUB_ADMIN_PASSWORD = 'p'.repeat(16);
  calls = [];
  vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (!url.startsWith('http://hub.test:4000')) return realFetch(input, init);
    calls.push({
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      body: init?.body as string | undefined,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    });
    return new Response(JSON.stringify({ token: 'jwt-1', tokenExpires: Date.now() + 3600_000 }), { status: 200 });
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HubAuthClient', () => {
  it('logs in once and caches the token for subsequent calls', async () => {
    vi.resetModules();
    const { hubAuth } = await import('./hubAuthClient.js');

    const t1 = await hubAuth.getAccessToken();
    const t2 = await hubAuth.getAccessToken();

    expect(t1).toBe('Bearer jwt-1');
    expect(t2).toBe('Bearer jwt-1');
    expect(calls.filter((c) => c.url.endsWith('/auth/email/login'))).toHaveLength(1);
  });

  it('posts credentials to the official login route', async () => {
    vi.resetModules();
    const { hubAuth } = await import('./hubAuthClient.js');
    await hubAuth.getAccessToken();

    const login = calls.find((c) => c.url.endsWith('/auth/email/login'));
    expect(login?.method).toBe('POST');
    expect(JSON.parse(login!.body!)).toEqual({ email: 'svc@test.local', password: 'p'.repeat(16) });
  });
});
