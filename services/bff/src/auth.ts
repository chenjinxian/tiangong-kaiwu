/**
 * JWT termination for the /api face — mirrors modeling-server wsAuth.ts:
 * the same token transports, the same hub /auth/me validation with a
 * 60-second in-memory cache, and fail-closed semantics ('unavailable' → 503,
 * never pass through).
 *
 * G1 B5a: `?token=` is denied by default (URL tokens leak via logs/history).
 * The query transport is only read when `SESSION_TOKEN_VIA_QUERY=allow`, the
 * explicit rollback window registered as EXCEPTIONS X-18.
 */

import type { IncomingMessage } from 'node:http';

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

/** Options for the single token extractor (tests / explicit call sites). */
export interface TokenTransportOptions {
  /** Omit in production so the validated BFF config is authoritative. */
  allowQueryToken?: boolean;
}

/**
 * Read a non-empty `token` query parameter without treating it as a credential.
 * Parsed from the raw request target so malformed Host headers cannot throw.
 */
export function queryTokenFromRequest(req: IncomingMessage): string | null {
  const rawUrl = req.url ?? '';
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex < 0) return null;
  // Repeated params (?token=&token=x) must not hide a usable token.
  const values = new URLSearchParams(rawUrl.slice(queryIndex + 1)).getAll('token');
  return values.find((value) => value.length > 0) ?? null;
}

/** True when the request carries a usable `?token=` (deprecated transport). */
export function hasQueryToken(req: IncomingMessage): boolean {
  return queryTokenFromRequest(req) !== null;
}

/**
 * Extract a Bearer token from an HTTP request. Accepted transports:
 *   - Authorization header (preferred)
 *   - luban_cad_auth cookie (same-origin browser connections attach it automatically)
 *   - ?token= query parameter: denied unless `allowQueryToken` is explicitly true
 */
export function extractToken(req: IncomingMessage, options: TokenTransportOptions = {}): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookieToken = extractTokenFromCookie(req.headers.cookie);
  if (cookieToken) return cookieToken;

  if (!options.allowQueryToken) return null;

  // Explicit compatibility window only: never log the token or the query.
  const queryToken = queryTokenFromRequest(req);
  if (queryToken) {
    // eslint-disable-next-line no-console
    console.warn(
      '[luban-bff] WARNING: accepted deprecated query-string token transport '
        + '(SESSION_TOKEN_VIA_QUERY=allow, EXCEPTIONS X-18)',
    );
  }
  return queryToken;
}

/**
 * Outcome of validating a token against the hub auth endpoint.
 * 'unavailable' is distinct from 'invalid' so callers fail closed with a 503
 * instead of a 401 when the auth service itself is down.
 */
export type TokenValidationResult = 'valid' | 'invalid' | 'unavailable';

/**
 * Validate a token against the imodelhub-services /auth/me endpoint.
 *
 * G1 B1.2c: `cacheTtlMs` defaults to 0 (every request re-validates, so a
 * logout/revocation is effective on the next request). When a deployment
 * explicitly opts into a positive TTL, ONLY successful validations are
 * cached; 401/invalid and 'unavailable' results are never cached. Caching a
 * negative decision could delay recovery or mask revocation.
 */
export function createTokenValidator(
  authUrl: string,
  cacheTtlMs = 0,
  timeoutMs = 5_000,
): (token: string) => Promise<TokenValidationResult> {
  // Only positive results are stored: token -> expiry epoch ms.
  const cache = new Map<string, number>();

  // Purge expired positive entries; no timer when caching is disabled.
  if (cacheTtlMs > 0) {
    const sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, expiresAt] of cache) {
        if (expiresAt <= now) cache.delete(key);
      }
    }, Math.max(cacheTtlMs, 1_000));
    sweeper.unref();
  }

  return async function validateToken(token: string): Promise<TokenValidationResult> {
    if (cacheTtlMs > 0) {
      const expiresAt = cache.get(token);
      if (expiresAt !== undefined && expiresAt > Date.now()) return 'valid';
    }
    try {
      const res = await fetch(authUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return 'invalid';
      if (cacheTtlMs > 0) cache.set(token, Date.now() + cacheTtlMs);
      return 'valid';
    } catch {
      return 'unavailable';
    }
  };
}
