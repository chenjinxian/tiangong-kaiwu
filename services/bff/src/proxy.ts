/**
 * Zero-dependency hand-rolled reverse proxy (fetch-based).
 *
 * Ruling (RW1-T3): the BFF's proxied surface is small (one /api face plus nine
 * HUB prefix passthroughs), so instead of pulling http-proxy-middleware we
 * forward with the built-in fetch API and stream bodies both ways.
 *
 * Correctness notes:
 *   - Hop-by-hop headers are dropped; Host/Content-Length are re-derived by
 *     fetch; Accept-Encoding is stripped so upstream answers in identity and
 *     the response framing stays consistent with what we forward.
 *   - Response headers are re-streamed (chunked); upstream Content-Length /
 *     Content-Encoding / Transfer-Encoding are dropped because we cannot
 *     guarantee byte-identical framing after forwarding.
 *   - Request paths are forwarded verbatim (req.originalUrl) — no rewrite.
 */

import { Readable } from 'node:stream';
import type { NextFunction, Request, Response } from 'express';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Headers we never forward to the upstream. */
const REQUEST_STRIP = new Set([...HOP_BY_HOP, 'host', 'content-length', 'accept-encoding']);

/** Headers we never forward back to the client. */
const RESPONSE_STRIP = new Set([...HOP_BY_HOP, 'content-length', 'content-encoding']);

export function createProxyHandler(upstreamOrigin: string) {
  const upstream = new URL(upstreamOrigin).origin;

  return async function proxyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const target = new URL(req.originalUrl || req.url, upstream);

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (REQUEST_STRIP.has(key)) continue;
        if (value === undefined) continue;
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const upstreamRes = await fetch(target, {
        method: req.method,
        headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: hasBody ? (Readable.toWeb(req) as any) : undefined,
        duplex: 'half',
        redirect: 'manual',
      });

      res.status(upstreamRes.status);
      upstreamRes.headers.forEach((value, key) => {
        if (RESPONSE_STRIP.has(key)) return;
        if (key.startsWith('access-control-')) return; // CORS is owned by the BFF single point
        res.setHeader(key, value);
      });

      if (upstreamRes.body) {
        Readable.fromWeb(upstreamRes.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      next(err);
    }
  };
}
