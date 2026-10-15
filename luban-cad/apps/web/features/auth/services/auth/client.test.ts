/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Auth client tests: the same-origin cookie mirror that the modeling-server
 * WebSocket upgrade reads (wsAuth extractTokenFromCookie), and the wire
 * contract with the local imodelhub services (refresh/forgot/reset).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredAuth,
  forgotPassword,
  refreshToken,
  resetPassword,
  storeAuth,
  type AuthTokens,
  type User,
} from './client.js';

const user: User = { id: 'u1', email: 'a@b.c', name: 'A B', plan: 'free' };
const tokens: AuthTokens = {
  accessToken: 'jwt-fe',
  refreshToken: 'r',
  expiresIn: 900,
  expiresAt: Date.now() + 900_000,
};

describe('auth cookie mirror', () => {
  let cookieWrites: string[];
  const realCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');

  beforeEach(() => {
    cookieWrites = [];
    // Capture document.cookie writes — jsdom's getter hides attributes
    // (path/SameSite), and the exact attribute string is what we assert on.
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieWrites.map((w) => w.split(';')[0]).join('; '),
      set: (value: string) => { cookieWrites.push(value); },
    });
  });

  afterEach(() => {
    delete (document as unknown as { cookie?: unknown }).cookie;
    if (realCookie) Object.defineProperty(Document.prototype, 'cookie', realCookie);
    sessionStorage.clear();
    localStorage.clear();
  });

  it('storeAuth mirrors the access-token subset into a same-origin cookie', () => {
    storeAuth(user, tokens, false);

    // Only { accessToken, expiresAt } — the refresh token must never be
    // readable from document.cookie (modeling-server wsAuth reads
    // payload.accessToken from this flat shape).
    const cookiePayload = { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
    expect(cookieWrites).toContainEqual(
      `luban_cad_auth=${encodeURIComponent(JSON.stringify(cookiePayload))}; path=/; SameSite=Lax`,
    );
    expect(cookieWrites.some((w) => w.includes('refreshToken'))).toBe(false);
  });

  it('clearStoredAuth expires the cookie mirror', () => {
    storeAuth(user, tokens, false);
    cookieWrites.length = 0;

    clearStoredAuth();

    expect(cookieWrites.some((w) => w.startsWith('luban_cad_auth=;') && w.includes('Max-Age=0'))).toBe(true);
  });
});

describe('auth hub wire contract', () => {
  type FetchCall = { url: string; init?: RequestInit };
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ token: 'jwt-new', refreshToken: 'r-new', tokenExpires: Date.now() + 900_000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function header(name: string): string | null {
    return new Headers(calls[0].init?.headers).get(name);
  }

  function body(): Record<string, unknown> {
    return JSON.parse(calls[0].init?.body as string) as Record<string, unknown>;
  }

  it('refreshToken sends the refresh token as a Bearer Authorization header', async () => {
    const tokens = await refreshToken('r-old');

    expect(calls[0].url).toContain('/auth/refresh');
    expect(calls[0].init?.method).toBe('POST');
    // Backend guards POST /auth/refresh with AuthGuard('jwt-refresh') reading
    // fromAuthHeaderAsBearerToken() — without this header the refresh is a
    // guaranteed 401.
    expect(header('authorization')).toBe('Bearer r-old');
    expect(body()).toEqual({ refreshToken: 'r-old' });
    expect(tokens.accessToken).toBe('jwt-new');
    expect(tokens.refreshToken).toBe('r-new');
  });

  it('forgotPassword POSTs to /auth/forgot/password', async () => {
    await forgotPassword({ email: 'a@b.c' });

    expect(calls[0].url).toContain('/auth/forgot/password');
    expect(calls[0].url).not.toContain('/auth/forgot-password');
    expect(calls[0].init?.method).toBe('POST');
    expect(body()).toEqual({ email: 'a@b.c' });
  });

  it('resetPassword POSTs to /auth/reset/password with {hash,password}', async () => {
    await resetPassword({ token: 't-1', newPassword: 'p-1' });

    expect(calls[0].url).toContain('/auth/reset/password');
    expect(calls[0].url).not.toContain('/auth/reset-password');
    expect(calls[0].init?.method).toBe('POST');
    // Backend DTO is { hash, password } — the legacy token/newPassword field
    // names are rejected client-side of the wire by this mapping.
    expect(body()).toEqual({ hash: 't-1', password: 'p-1' });
    expect(Object.prototype.hasOwnProperty.call(body(), 'token')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body(), 'newPassword')).toBe(false);
  });
});
