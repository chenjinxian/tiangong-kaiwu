/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * WebSocket Authentication Middleware
 * Validates JWT tokens during WebSocket upgrade handshake.
 */

import { IncomingMessage } from 'http';
import { URL } from 'url';
import { logger } from '../utils/logger.js';

const IMODELHUB_URL = process.env.IMODELHUB_URL || 'http://localhost:4000';

/** Cache validated tokens to avoid hitting the auth service on every connection. */
const tokenCache = new Map<string, { valid: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Extract the Bearer token from a WebSocket upgrade request.
 * Supports:
 *   - Authorization header (preferred)
 *   - ?token= query parameter (fallback for WebSocket clients that can't set headers)
 */
function extractToken(req: IncomingMessage): string | null {
  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to query parameter
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    return queryToken;
  }

  return null;
}

/**
 * Validate a token against the imodelhub-services auth endpoint.
 * Results are cached briefly to reduce load.
 */
async function validateToken(token: string): Promise<boolean> {
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.valid;
  }

  try {
    const res = await fetch(`${IMODELHUB_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    const valid = res.ok;
    tokenCache.set(token, { valid, expiresAt: Date.now() + CACHE_TTL_MS });
    return valid;
  } catch (err) {
    logger.warn(`WebSocket auth: failed to validate token: ${err}`);
    return false;
  }
}

/**
 * Purge expired cache entries periodically.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) {
      tokenCache.delete(key);
    }
  }
}, 60_000).unref();

/**
 * Express-ws verifyClient function.
 * Returns true to accept, false (or throws) to reject the WebSocket upgrade.
 *
 * Usage: `{ verifyClient: createWsVerifyClient() }` passed to `enableWs()`.
 */
export function createWsVerifyClient(): (info: { req: IncomingMessage }) => Promise<boolean> {
  return async ({ req }: { req: IncomingMessage }): Promise<boolean> => {
    const token = extractToken(req);

    if (!token) {
      logger.warn('WebSocket connection rejected: no auth token');
      return false;
    }

    const valid = await validateToken(token);
    if (!valid) {
      logger.warn('WebSocket connection rejected: invalid token');
      return false;
    }

    return true;
  };
}

/**
 * Verify a single WebSocket upgrade request.
 * For use in the server 'upgrade' event handler.
 */
export async function verifyWsUpgrade(req: IncomingMessage): Promise<boolean> {
  const token = extractToken(req);

  if (!token) {
    logger.warn('WebSocket upgrade rejected: no auth token');
    return false;
  }

  return validateToken(token);
}
