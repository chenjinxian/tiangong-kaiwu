/**
 * JWT termination for the /api face — mirrors modeling-server wsAuth.ts:
 * the same three token shapes, the same hub /auth/me validation with a
 * 60-second in-memory cache, and fail-closed semantics ('unavailable' → 503,
 * never pass through).
 */

import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';

/**
 * Auth cookie name shared with the frontend auth client (luban-cad
 * `features/auth/services/auth/client.ts`, which mirrors its storage payload
 * into a same-origin cookie on login/refresh).
 */
export const AUTH_COOKIE_NAME = 'luban_cad_auth';

/**
 * Extract the access token from the Cookie header. The cookie value is the
 * URI-encoded JSON auth payload written by the FE auth client; the token is
 * read from `accessToken` (or the nested `tokens.accessToken` shape).
 */
export function extractTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!pair) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(pair.slice(AUTH_COOKIE_NAME.length + 1))) as {
      accessToken?: unknown;
      tokens?: { accessToken?: unknown };
    };
    const token = payload.accessToken ?? payload.tokens?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Extract a Bearer token from an HTTP request. Supports the exact three
 * shapes accepted by the MS WebSocket verifier / RPC guard:
 *   - Authorization header (preferred)
 *   - luban_cad_auth cookie (same-origin browser connections attach it automatically)
 *   - ?token= query parameter (fallback)
 */
export function extractToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookieToken = extractTokenFromCookie(req.headers.cookie);
  if (cookieToken) return cookieToken;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const queryToken = url.searchParams.get('token');
  return queryToken && queryToken.length > 0 ? queryToken : null;
}

/**
 * Outcome of validating a token against the hub auth endpoint.
 * 'unavailable' is distinct from 'invalid' so callers fail closed with a 503
 * instead of a 401 when the auth service itself is down.
 */
export type TokenValidationResult = 'valid' | 'invalid' | 'unavailable';

/**
 * Validate a token against the imodelhub-services /auth/me endpoint, caching
 * results briefly. Factory form keeps the cache/URL injectable for tests.
 */
export function createTokenValidator(
  authUrl: string,
  cacheTtlMs = 60_000,
  timeoutMs = 5_000,
): (token: string) => Promise<TokenValidationResult> {
  const cache = new Map<string, { valid: boolean; expiresAt: number }>();

  // Purge expired cache entries periodically.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }, Math.max(cacheTtlMs, 1_000));
  sweeper.unref();

  return async function validateToken(token: string): Promise<TokenValidationResult> {
    const cached = cache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.valid ? 'valid' : 'invalid';
    }
    try {
      const res = await fetch(authUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const valid = res.ok;
      cache.set(token, { valid, expiresAt: Date.now() + cacheTtlMs });
      return valid ? 'valid' : 'invalid';
    } catch {
      return 'unavailable';
    }
  };
}
