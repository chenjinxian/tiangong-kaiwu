/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Security Middleware
 * - Helmet security headers
 * - Rate limiting
 * - Input sanitization
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from '../utils/logger.js';

/**
 * Helmet security headers configuration
 * Configured for iTwin.js compatibility
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for iTwin.js
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// In-memory rate limit store (use Redis in production)
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const requestCounts = new Map<string, RateLimitRecord>();

/**
 * Rate limiting middleware factory
 * @param windowMs Time window in milliseconds (default: 15 minutes)
 * @param maxRequests Maximum requests per window (default: 100)
 */
export function rateLimiter(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    const record = requestCounts.get(key);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    record.count++;
    next();
  };
}

/**
 * Strict rate limiter for auth endpoints
 * Prevents brute force attacks
 */
export function authRateLimiter() {
  return rateLimiter(15 * 60 * 1000, 5); // 5 requests per 15 minutes
}

/**
 * Input sanitization middleware
 * Basic XSS prevention by escaping HTML characters
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

/**
 * Recursively sanitize object values
 */
function sanitizeObject(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      // Basic XSS prevention - escape HTML characters
      obj[key] = escapeHtml(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '&': '&amp;',
  };
  return text.replace(/[<>'"&]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Security audit log middleware
 * Logs suspicious requests for monitoring
 */
export function securityAudit(req: Request, res: Response, next: NextFunction): void {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /\.\.\//,
    /\/etc\/passwd/,
    /\/proc\/self/,
  ];

  const url = req.url || '';
  const userAgent = req.headers['user-agent'] || '';

  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(url) || pattern.test(userAgent)
  );

  if (isSuspicious) {
    logger.warn('Suspicious request detected', {
      ip: req.ip,
      url,
      method: req.method,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
