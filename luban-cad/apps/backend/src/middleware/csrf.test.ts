/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CSRF Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCsrfToken, csrfMiddleware, getCsrfToken } from './csrf.js';
import { NextFunction, Request, Response } from 'express';

describe('csrf middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      headers: {},
      cookies: {},
      body: {},
    };
    mockRes = {
      cookie: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    nextFn = vi.fn() as unknown as NextFunction;
  });

  describe('generateCsrfToken', () => {
    it('generates unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // SHA-256 hex
      expect(token2).toHaveLength(64);
    });
  });

  describe('csrfMiddleware', () => {
    it('generates CSRF token for GET requests', () => {
      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'csrf-token',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        })
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-CSRF-Token', expect.any(String));
      expect(nextFn).toHaveBeenCalled();
    });

    it('skips token generation for HEAD requests', () => {
      mockReq.method = 'HEAD';
      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.cookie).not.toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();
    });

    it('validates CSRF token for POST requests', () => {
      mockReq.method = 'POST';
      mockReq.headers = { 'x-csrf-token': 'valid-token' };
      mockReq.cookies = { 'csrf-token': 'valid-token' };

      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('rejects POST without CSRF token', () => {
      mockReq.method = 'POST';
      mockReq.headers = {};
      mockReq.cookies = { 'csrf-token': 'some-token' };

      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid CSRF token',
        code: 'CSRF_INVALID',
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('rejects POST with mismatched token', () => {
      mockReq.method = 'POST';
      mockReq.headers = { 'x-csrf-token': 'token-a' };
      mockReq.cookies = { 'csrf-token': 'token-b' };

      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('accepts CSRF token from body._csrf', () => {
      mockReq.method = 'POST';
      mockReq.body = { _csrf: 'body-token' };
      mockReq.cookies = { 'csrf-token': 'body-token' };

      csrfMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('getCsrfToken', () => {
    it('returns token from cookies', () => {
      mockReq.cookies = { 'csrf-token': 'test-token' };
      expect(getCsrfToken(mockReq as Request)).toBe('test-token');
    });

    it('returns undefined if no token', () => {
      mockReq.cookies = {};
      expect(getCsrfToken(mockReq as Request)).toBeUndefined();
    });
  });
});
