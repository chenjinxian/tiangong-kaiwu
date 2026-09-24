/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CSRF Protection Middleware
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_TOKEN_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_COOKIE_NAME = 'csrf-token';

/**
 * Generate a new CSRF token using HMAC
 */
export function generateCsrfToken(): string {
  return crypto
    .createHmac('sha256', CSRF_TOKEN_SECRET)
    .update(`${Date.now()}-${crypto.randomBytes(16).toString('hex')}`)
    .digest('hex');
}

/**
 * CSRF middleware for Express
 * - Generates token for GET requests
 * - Validates token for state-changing requests (POST, PUT, DELETE, PATCH)
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for webhook endpoints (called by webhook-agent, not browsers)
  if (req.path === '/api/webhook/events') {
    next();
    return;
  }

  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate and set CSRF token for GET requests
    if (req.method === 'GET') {
      const token = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be accessible by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      res.setHeader('X-CSRF-Token', token);
    }
    next();
    return;
  }

  // Validate CSRF token for state-changing requests
  const token = (req.headers['x-csrf-token'] as string) || req.body?._csrf;
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!token || !cookieToken || token !== cookieToken) {
    res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID',
    });
    return;
  }

  next();
}

/**
 * Get the current CSRF token from request cookies
 */
export function getCsrfToken(req: Request): string | undefined {
  return req.cookies?.[CSRF_COOKIE_NAME];
}
