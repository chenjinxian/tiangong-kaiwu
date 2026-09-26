/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Security Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rateLimiter,
  authRateLimiter,
  sanitizeInput,
  securityAudit,
} from './security.js';
import { NextFunction, Request, Response } from 'express';

// security.ts imports logger.ts, which loads config.ts at module scope;
// config exits when secrets are missing.
vi.hoisted(() => {
  process.env.BACKEND_API_KEY ??= 'a'.repeat(32);
  process.env.WEBAGENT_API_KEY ??= 'b'.repeat(32);
  process.env.CSRF_SECRET ??= 'c'.repeat(32);
  process.env.IMODELHUB_ADMIN_EMAIL ??= 'admin@test.local';
  process.env.IMODELHUB_ADMIN_PASSWORD ??= 'd'.repeat(16);
});

describe('security middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      method: 'POST',
      url: '/api/test',
      headers: {},
      body: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    nextFn = vi.fn() as unknown as NextFunction;
  });

  describe('rateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = rateLimiter(60000, 5); // 5 requests per minute
      const req1 = { ...mockReq, ip: '1.1.1.1' };

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        limiter(req1 as Request, mockRes as Response, nextFn);
      }

      expect(nextFn).toHaveBeenCalledTimes(5);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('blocks requests over limit', () => {
      const limiter = rateLimiter(60000, 2); // 2 requests per minute
      const req1 = { ...mockReq, ip: '2.2.2.2' };

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        limiter(req1 as Request, mockRes as Response, nextFn);
      }

      expect(nextFn).toHaveBeenCalledTimes(2);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: expect.any(Number),
        })
      );
    });

    it('resets counter after window expires', async () => {
      const limiter = rateLimiter(10, 1); // 1 request per 10ms
      const req1 = { ...mockReq, ip: '3.3.3.3' };

      limiter(req1 as Request, mockRes as Response, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(1);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      limiter(req1 as Request, mockRes as Response, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(2);
    });

    it('tracks different IPs separately', () => {
      const limiter = rateLimiter(60000, 1);

      // First IP
      const req1 = { ...mockReq, ip: '192.168.1.1' };
      limiter(req1 as Request, mockRes as Response, nextFn);

      // Second IP (should still be allowed)
      const req2 = { ...mockReq, ip: '192.168.1.2' };
      limiter(req2 as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('authRateLimiter', () => {
    it('uses stricter limits', () => {
      const limiter = authRateLimiter();
      const req1 = { ...mockReq, ip: '4.4.4.4' };

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        limiter(req1 as Request, mockRes as Response, nextFn);
      }
      expect(nextFn).toHaveBeenCalledTimes(5);

      // 6th should be blocked
      limiter(req1 as Request, mockRes as Response, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });

  describe('sanitizeInput', () => {
    it('sanitizes HTML in body strings', () => {
      mockReq.body = {
        name: '<script>alert("xss")</script>',
        description: 'Normal text',
      };

      sanitizeInput(mockReq as Request, mockRes as Response, nextFn);

      expect(mockReq.body.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(mockReq.body.description).toBe('Normal text');
      expect(nextFn).toHaveBeenCalled();
    });

    it('sanitizes nested objects', () => {
      mockReq.body = {
        user: {
          name: '<img src=x onerror=alert(1)>',
          bio: "It's a test",
        },
      };

      sanitizeInput(mockReq as Request, mockRes as Response, nextFn);

      expect(mockReq.body.user.name).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(mockReq.body.user.bio).toBe('It&#x27;s a test');
    });

    it('handles arrays', () => {
      mockReq.body = {
        items: ['<b>test</b>', 'normal'],
      };

      sanitizeInput(mockReq as Request, mockRes as Response, nextFn);

      expect(mockReq.body.items[0]).toBe('&lt;b&gt;test&lt;/b&gt;');
      expect(mockReq.body.items[1]).toBe('normal');
    });

    it('skips non-object bodies', () => {
      mockReq.body = 'string body';
      sanitizeInput(mockReq as Request, mockRes as Response, nextFn);
      expect(mockReq.body).toBe('string body');
      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('securityAudit', () => {
    it('logs suspicious URL patterns', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockReq.url = '/api/test<script>';

      securityAudit(mockReq as Request, mockRes as Response, nextFn);

      expect(consoleSpy).toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('logs suspicious user agents', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockReq.headers = { 'user-agent': 'Bot<script>alert(1)</script>' };

      securityAudit(mockReq as Request, mockRes as Response, nextFn);

      expect(consoleSpy).toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('does not log normal requests', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      securityAudit(mockReq as Request, mockRes as Response, nextFn);

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
