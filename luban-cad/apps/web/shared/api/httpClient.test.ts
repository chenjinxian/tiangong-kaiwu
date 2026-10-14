import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import { fetchWithAuth, ApiError } from './httpClient.js';
import { getValidAccessToken, refreshAccessToken } from '../../features/auth/services/auth/client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.mocked(getValidAccessToken).mockResolvedValue('token-1');
  vi.mocked(refreshAccessToken).mockResolvedValue(null);
  mockFetch.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('fetchWithAuth', () => {
  it('注入 Bearer 头并使用默认 hub base', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await fetchWithAuth('/itwins');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/itwins');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('无 token 抛 401 ApiError', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('');
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ statusCode: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('官方错误包络 {error:{message}} 优先，回落顶层 message', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'X', message: '官方消息' }, message: '旧消息' }), { status: 400 }),
    );
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: '官方消息', code: 'X' });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: '旧消息' }), { status: 400 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: '旧消息' });
  });

  it('403 统一改写文案', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));
    const err = await fetchWithAuth('/itwins').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('无权限访问该资源');
    expect((err as ApiError).isForbidden).toBe(true);
  });

  it('401 刷新 token 后重试一次，刷新失败抛 401', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await fetchWithAuth('/itwins');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('expired'));
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ statusCode: 401, code: 'Unauthorized' });
  });

  it('非 JSON 错误体不崩溃，回落 HTTP 状态码文案', async () => {
    mockFetch.mockResolvedValue(new Response('not json', { status: 500 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: 'HTTP 500' });
  });
});
