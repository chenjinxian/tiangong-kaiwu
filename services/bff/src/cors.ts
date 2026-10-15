/**
 * CORS single point.
 *
 * Production is same-origin behind nginx (browser sends no Origin on
 * same-origin requests — those pass straight through). This middleware only
 * answers cross-origin browser traffic: a small dev-origin whitelist
 * (vite dev server) with credentials, plus preflight handling. Upstream
 * access-control-* headers are stripped by the proxy so this is the one
 * place that owns CORS policy.
 */

import type { NextFunction, Request, Response } from 'express';

export function createCors(allowedOrigins: string[]) {
  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;
    const allowed = origin !== undefined && allowedOrigins.includes(origin);

    if (allowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      const requestedHeaders = req.headers['access-control-request-headers'];
      res.setHeader(
        'Access-Control-Allow-Headers',
        typeof requestedHeaders === 'string' ? requestedHeaders : 'Authorization,Content-Type',
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }

    next();
  };
}
