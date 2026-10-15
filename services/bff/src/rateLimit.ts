/**
 * In-memory token-bucket rate limiter (per client IP).
 * One bucket per IP: capacity `max`, refilling linearly over `windowMs`.
 * Deliberately process-local — BFF v1 runs as a single replica; a
 * multi-replica deployment must move to Redis (same as MS rateLimiter note).
 */

import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
}

export function createRateLimiter({ max, windowMs }: RateLimiterOptions) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = max / windowMs;

  // Evict idle buckets so long-running processes don't leak memory.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, bucket] of buckets) {
      if (bucket.lastRefillAt < cutoff) buckets.delete(ip);
    }
  }, Math.min(windowMs, 60_000));
  sweeper.unref();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let bucket = buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: max, lastRefillAt: now };
      buckets.set(ip, bucket);
    }

    bucket.tokens = Math.min(max, bucket.tokens + (now - bucket.lastRefillAt) * refillPerMs);
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) {
      const retryAfterSec = Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: { code: 'RateLimitExceeded', message: 'Too many requests, slow down' },
      });
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}
