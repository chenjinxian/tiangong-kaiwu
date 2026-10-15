/**
 * BFF v1 express app wiring.
 *
 * Face ownership (nginx routes only these to the BFF):
 *   /health        liveness/readiness (exempt from rate limiting — docker healthcheck)
 *   /api/*         modeling-server face with JWT termination (guard → proxy)
 *   /itwins /imodels /auth /accesscontrol /webhooks /users /files /oauth /.well-known
 *                  imodelhub (HUB) nine-prefix passthrough — no termination, verbatim proxy
 *
 * NOT proxied here (nginx sends them straight to MS): /ws, /ipc — WebSocket
 * long connections; WS token revalidation is a registered P1 gap (RW1 plan).
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { BffConfig } from './config.js';
import { createTokenValidator, extractToken } from './auth.js';
import { createCors } from './cors.js';
import { createRateLimiter } from './rateLimit.js';
import { createProxyHandler } from './proxy.js';

/** HUB prefix set (spec §2) — must stay in sync with deploy/default.conf.template. */
export const HUB_PREFIXES = [
  '/itwins',
  '/imodels',
  '/auth',
  '/accesscontrol',
  '/webhooks',
  '/users',
  '/files',
  '/oauth',
  '/.well-known',
] as const;

export function createApp(config: BffConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx: honor X-Forwarded-For for client IP (rate limit per real client).
  app.set('trust proxy', true);

  const validateToken = createTokenValidator(config.authUrl, config.authCacheTtlMs);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
  });

  app.use(createCors(config.allowedOrigins));
  app.use(createRateLimiter({ max: config.rateLimitMax, windowMs: config.rateLimitWindowMs }));

  // ---- /api face: JWT termination, then proxy to modeling-server ----
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    let token: string | null = null;
    try {
      token = extractToken(req);
    } catch {
      // Malformed request metadata must never become a pass-through.
    }
    if (!token) {
      res.status(401).json({
        error: { code: 'Unauthorized', message: 'Missing authentication token' },
      });
      return;
    }
    const result = await validateToken(token);
    if (result === 'valid') {
      next();
      return;
    }
    if (result === 'unavailable') {
      res.status(503).json({
        error: { code: 'AuthServiceUnavailable', message: 'Authentication service unavailable' },
      });
      return;
    }
    res.status(401).json({
      error: { code: 'Unauthorized', message: 'Invalid or expired token' },
    });
  });
  app.use('/api', createProxyHandler(config.msUpstream));

  // ---- HUB nine prefixes: verbatim passthrough (no termination) ----
  const hubProxy = createProxyHandler(config.hubUpstream);
  for (const prefix of HUB_PREFIXES) {
    app.use(prefix, hubProxy);
  }

  // Nothing else is the BFF's face.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NotFound', message: 'Unknown BFF route' } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Upstream connect failures surface here from the proxy (fetch rejection).
    res.status(502).json({ error: { code: 'BadGateway', message: 'Upstream request failed' } });
  });

  return app;
}
