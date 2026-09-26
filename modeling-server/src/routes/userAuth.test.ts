/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for user auth routes (profile / password / forgot / reset).
 * These routes forward to imodelhub-services (HUB) and MUST NOT fake success:
 * the HUB contract is PATCH /auth/me (profile+password), POST /auth/forgot/password,
 * POST /auth/reset/password — verified against imodelhub-services auth.controller.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';

// userAuth.ts loads config.ts at module scope; config exits when secrets are missing.
vi.hoisted(() => {
  process.env.BACKEND_API_KEY ??= 'a'.repeat(32);
  process.env.WEBAGENT_API_KEY ??= 'b'.repeat(32);
  process.env.CSRF_SECRET ??= 'c'.repeat(32);
  process.env.IMODELHUB_ADMIN_EMAIL ??= 'admin@test.local';
  process.env.IMODELHUB_ADMIN_PASSWORD ??= 'd'.repeat(16);
});

const HUB_BASE = 'http://hub.test:4000';
const realFetch = global.fetch;

let server: Server;
let baseUrl: string;
let hubCalls: Array<{ url: string; method: string; body?: string; headers: Record<string, string> }>;

function mockHub(responses: Array<{ match: (url: string, method: string) => boolean; status: number; body?: unknown }>) {
  hubCalls = [];
  const stub = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (!url.startsWith(HUB_BASE)) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
    );
    hubCalls.push({ url, method, body: init?.body as string | undefined, headers });
    const hit = responses.find((r) => r.match(url, method));
    if (!hit) return new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 500 });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  };
  vi.stubGlobal('fetch', stub);
}

async function startApp() {
  const { createUserAuthRouter, notFoundHandler } = await import('./userAuth.js');
  const app = express();
  app.use(express.json());
  app.use(createUserAuthRouter({ hubBaseUrl: HUB_BASE }));
  app.use(notFoundHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function call(path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, init);
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await startApp();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const AUTH = { Authorization: 'Bearer valid-token' };

const meOk = {
  match: (u: string, m: string) => u === `${HUB_BASE}/auth/me` && m === 'GET',
  status: 200,
  body: { id: 7, email: 'u@x.com', firstName: 'Ada', lastName: 'Lovelace' },
};

describe('PUT /api/users/profile', () => {
  it('forwards PATCH to HUB /auth/me with firstName/lastName and maps the updated user', async () => {
    mockHub([
      meOk,
      {
        match: (u, m) => u === `${HUB_BASE}/auth/me` && m === 'PATCH',
        status: 200,
        body: { id: 7, email: 'u@x.com', firstName: 'Grace', lastName: 'Hopper' },
      },
    ]);

    const res = await call('/api/users/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Grace Hopper' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.success).toBe(true);
    expect(data.user).toEqual({ id: '7', email: 'u@x.com', name: 'Grace Hopper' });

    const patch = hubCalls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`${HUB_BASE}/auth/me`);
    expect(JSON.parse(patch!.body!)).toEqual({ firstName: 'Grace', lastName: 'Hopper' });
    expect(patch?.headers.authorization).toBe('Bearer valid-token');
  });

  it('surfaces HUB rejection instead of faking success', async () => {
    mockHub([
      meOk,
      {
        match: (u, m) => u === `${HUB_BASE}/auth/me` && m === 'PATCH',
        status: 422,
        body: { status: 422, errors: { firstName: 'mustBeNotEmpty' } },
      },
    ]);

    const res = await call('/api/users/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Grace Hopper' }),
    });

    expect(res.ok).toBe(false);
    const data = (await res.json()) as Record<string, any>;
    expect(data.success).toBeUndefined();
    expect(data.error).toBeDefined();
  });

  it('rejects without an authorization header', async () => {
    mockHub([meOk]);
    const res = await call('/api/users/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X Y' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/users/password', () => {
  const putPassword = () =>
    call('/api/users/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ currentPassword: 'old-secret', newPassword: 'new-secret' }),
    });

  it('forwards PATCH to HUB /auth/me with oldPassword/password', async () => {
    mockHub([
      meOk,
      { match: (u, m) => u === `${HUB_BASE}/auth/me` && m === 'PATCH', status: 200, body: { id: 7 } },
    ]);

    const res = await putPassword();

    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, any>).success).toBe(true);
    const patch = hubCalls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`${HUB_BASE}/auth/me`);
    expect(JSON.parse(patch!.body!)).toEqual({ oldPassword: 'old-secret', password: 'new-secret' });
  });

  it('maps HUB incorrectOldPassword to 401, never simulates success', async () => {
    mockHub([
      meOk,
      {
        match: (u, m) => u === `${HUB_BASE}/auth/me` && m === 'PATCH',
        status: 422,
        body: { status: 422, errors: { oldPassword: 'incorrectOldPassword' } },
      },
    ]);

    const res = await putPassword();

    expect(res.status).toBe(401);
    expect(((await res.json()) as Record<string, any>).error).toBe('Current password is incorrect');
  });

  it('reports 502 when HUB is unreachable', async () => {
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.startsWith(HUB_BASE)) throw new Error('hub down');
      return realFetch(input, init);
    });

    const res = await putPassword();
    expect(res.status).toBe(502);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('forwards to HUB POST /auth/forgot/password with {email}', async () => {
    mockHub([{ match: (u, m) => u === `${HUB_BASE}/auth/forgot/password` && m === 'POST', status: 204 }]);

    const res = await postJson('/api/auth/forgot-password', { email: 'u@x.com' });

    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, any>).success).toBe(true);
    const call_ = hubCalls.find((c) => c.url.includes('/auth/forgot/password'));
    expect(call_?.method).toBe('POST');
    expect(JSON.parse(call_!.body!)).toEqual({ email: 'u@x.com' });
  });

  it('returns generic success on unknown email (anti-enumeration)', async () => {
    mockHub([
      {
        match: (u, m) => u === `${HUB_BASE}/auth/forgot/password` && m === 'POST',
        status: 422,
        body: { status: 422, errors: { email: 'emailNotExists' } },
      },
    ]);

    const res = await postJson('/api/auth/forgot-password', { email: 'ghost@x.com' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, any>).success).toBe(true);
  });

  it('reports 502 when HUB is unreachable (no blanket fake success)', async () => {
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith(HUB_BASE)) throw new Error('hub down');
      return realFetch(input, init);
    });

    const res = await postJson('/api/auth/forgot-password', { email: 'u@x.com' });
    expect(res.status).toBe(502);
  });
});

describe('POST /api/auth/reset-password', () => {
  const reset = () => postJson('/api/auth/reset-password', { token: 'abc', newPassword: 'new-secret' });

  it('maps token/newPassword to HUB {hash, password} on /auth/reset/password', async () => {
    mockHub([{ match: (u, m) => u === `${HUB_BASE}/auth/reset/password` && m === 'POST', status: 204 }]);

    const res = await reset();

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, any>;
    expect(data.success).toBe(true);
    expect((data as any).message).not.toContain('simulated');
    const call_ = hubCalls.find((c) => c.url.includes('/auth/reset/password'));
    expect(JSON.parse(call_!.body!)).toEqual({ hash: 'abc', password: 'new-secret' });
  });

  it('maps HUB invalidHash to 401 Invalid or expired token', async () => {
    mockHub([
      {
        match: (u, m) => u === `${HUB_BASE}/auth/reset/password` && m === 'POST',
        status: 422,
        body: { status: 422, errors: { hash: 'invalidHash' } },
      },
    ]);

    const res = await reset();
    expect(res.status).toBe(401);
    expect(((await res.json()) as Record<string, any>).error).toBe('Invalid or expired token');
  });
});

describe('notFoundHandler', () => {
  it('returns a real 404 with an error body for unknown paths', async () => {
    mockHub([]);
    const res = await call('/definitely/not/a/route');
    expect(res.status).toBe(404);
    expect(((await res.json()) as Record<string, any>).error).toBe('Not found');
  });
});
