/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Auth client storage tests: the same-origin cookie mirror that the
 * modeling-server WebSocket upgrade reads (wsAuth extractTokenFromCookie).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStoredAuth, storeAuth, type AuthTokens, type User } from './client.js';

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
