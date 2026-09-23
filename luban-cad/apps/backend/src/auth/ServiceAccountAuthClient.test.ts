import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceAccountAuthClient } from './ServiceAccountAuthClient.js';

describe('ServiceAccountAuthClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exists', () => {
    const client = new ServiceAccountAuthClient({
      loginUrl: 'http://localhost:4000/auth/email/login',
      email: 'admin@example.com',
      password: 'secret',
    });
    expect(client).toBeDefined();
  });

  it('logs in on first getAccessToken call', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'eyJhbGciOiJIUzI1NiIs.test',
        tokenExpires: Date.now() + 3600000, // 1 hour
      }),
    } as Response);

    const client = new ServiceAccountAuthClient({
      loginUrl: 'http://localhost:4000/auth/email/login',
      email: 'admin@example.com',
      password: 'secret',
    });

    const token = await client.getAccessToken();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/auth/email/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    });
    expect(token).toBe('Bearer eyJhbGciOiJIUzI1NiIs.test');
  });

  it('returns cached token if still valid', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'eyJhbGciOiJIUzI1NiIs.first',
        tokenExpires: Date.now() + 3600000, // 1 hour from now
      }),
    } as Response);

    const client = new ServiceAccountAuthClient({
      loginUrl: 'http://localhost:4000/auth/email/login',
      email: 'admin@example.com',
      password: 'secret',
    });

    // First call - should login
    const token1 = await client.getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(token1).toBe('Bearer eyJhbGciOiJIUzI1NiIs.first');

    // Second call - should use cache, not call fetch again
    const token2 = await client.getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(1); // still 1
    expect(token2).toBe(token1);
  });

  it('throws on login failure', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const client = new ServiceAccountAuthClient({
      loginUrl: 'http://localhost:4000/auth/email/login',
      email: 'admin@example.com',
      password: 'wrong-password',
    });

    await expect(client.getAccessToken()).rejects.toThrow('Service account login failed: 401');
  });

  it('refreshes token before expiration', async () => {
    const mockFetch = vi.mocked(global.fetch);

    // First login response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'eyJhbGciOiJIUzI1NiIs.first',
        tokenExpires: Date.now() + 120000, // 2 minutes from now
      }),
    } as Response);

    const client = new ServiceAccountAuthClient({
      loginUrl: 'http://localhost:4000/auth/email/login',
      email: 'admin@example.com',
      password: 'secret',
      refreshBufferMs: 60000, // 60s buffer
    });

    // First call - should login
    await client.getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance time by 70 seconds (now 50s until expiry, within buffer)
    vi.advanceTimersByTime(70000);

    // Second login response (refresh)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'eyJhbGciOiJIUzI1NiIs.second',
        tokenExpires: Date.now() + 120000,
      }),
    } as Response);

    // Second call - should refresh (within buffer)
    const token2 = await client.getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(token2).toBe('Bearer eyJhbGciOiJIUzI1NiIs.second');
  });
});
