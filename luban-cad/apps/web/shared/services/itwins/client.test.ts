/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorization, iTwinsClient, ITwinSubClass } from './client.js';
import * as authClient from '../../../features/auth/services/auth/client.js';
import {
  createITwin,
  queryFavoriteITwins,
  queryITwins,
  queryRecentITwins,
} from './client.js';
import { fetchWithAuth } from '../../api/httpClient.js';

// Mock the auth client
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

// Mock fetchWithAuth（保留 ApiError 真身，instanceof 语义不变）
vi.mock('../../api/httpClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/httpClient.js')>();
  return { ...actual, fetchWithAuth: vi.fn() };
});

describe('iTwins Client', () => {
  const mockGetValidAccessToken = vi.mocked(authClient.getValidAccessToken);
  const mockFetchWithAuth = vi.mocked(fetchWithAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockReset();
  });

  describe('getAuthorization', () => {
    it('should return Bearer token format when authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-token-123');

      const result = await getAuthorization();

      expect(result).toBe('Bearer test-token-123');
      expect(mockGetValidAccessToken).toHaveBeenCalled();
    });

    it('should return empty string when not authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('');

      const result = await getAuthorization();

      expect(result).toBe('');
    });

    it('should handle null token gracefully', async () => {
      mockGetValidAccessToken.mockResolvedValue(null as unknown as string);

      const result = await getAuthorization();

      // The function concatenates 'Bearer ' with whatever token it gets
      expect(typeof result).toBe('string');
    });
  });

  describe('iTwinsClient', () => {
    it('should be exported as a singleton instance', () => {
      expect(iTwinsClient).toBeDefined();
    });

    it('should be an instance of ITwinsAccessClient', () => {
      // The client should have the _baseUrl property indicating it's an ITwinsAccessClient
      expect(iTwinsClient).toHaveProperty('_baseUrl');
    });
  });

  describe('ITwinSubClass', () => {
    it('should be re-exported from SDK', () => {
      expect(ITwinSubClass).toBeDefined();
    });

    it('should have Project subclass', () => {
      expect(ITwinSubClass.Project).toBeDefined();
    });
  });

  // ==========================================================================
  // Sync S2：契约正名 + 列表翻页
  // ==========================================================================

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  function itwinPage(ids: string[], nextHref?: string): Response {
    return jsonResponse({
      iTwins: ids.map((id) => ({ id, displayName: `t-${id}` })),
      ...(nextHref ? { _links: { next: { href: nextHref } } } : {}),
    });
  }

  describe('createITwin（Sync S2 契约正名）', () => {
    it('POST body 用小写 subclass（后端 DTO 白名单静默剥离 subClass）', async () => {
      mockFetchWithAuth.mockResolvedValue(jsonResponse({ iTwin: { id: 't1' } }, 201));

      await createITwin({ displayName: 'Demo', subClass: ITwinSubClass.Project });

      expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetchWithAuth.mock.calls[0];
      expect(String(url)).toBe('/itwins');
      const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(body.displayName).toBe('Demo');
      expect(body.subclass).toBe(ITwinSubClass.Project);
      expect(body.subClass).toBeUndefined();
    });
  });

  describe('列表翻页（Sync S2）', () => {
    const NEXT_HREF = 'https://hub.example.com/itwins?$skip=200&$top=200';

    it('queryITwins 带 $top=200 并跟随 _links.next 聚合；次页无 next 不再续跳', async () => {
      mockFetchWithAuth
        .mockResolvedValueOnce(itwinPage(['a', 'b'], NEXT_HREF))
        .mockResolvedValueOnce(itwinPage(['c']));

      const result = await queryITwins(ITwinSubClass.Project);

      expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
      expect(mockFetchWithAuth).toHaveBeenCalledTimes(2);
      const [firstUrl] = mockFetchWithAuth.mock.calls[0];
      expect(String(firstUrl)).toContain('$top=200');
      // 跟页：裸绝对 URL + 空 base（防二次拼接前缀）
      const [secondUrl, secondInit] = mockFetchWithAuth.mock.calls[1];
      expect(String(secondUrl)).toBe(NEXT_HREF);
      expect((secondInit as { baseUrl?: string } | undefined)?.baseUrl).toBe('');
    });

    it('翻页硬帽 5 跳（_links.next 失控环时封顶）', async () => {
      for (let i = 0; i < 8; i += 1) {
        mockFetchWithAuth.mockResolvedValueOnce(itwinPage([`p${i}`], NEXT_HREF));
      }

      const result = await queryITwins(ITwinSubClass.Project);

      expect(mockFetchWithAuth).toHaveBeenCalledTimes(6); // 首页 + 5 跳
      expect(result).toHaveLength(6);
    });

    it('queryFavoriteITwins 同样跟页聚合', async () => {
      mockFetchWithAuth
        .mockResolvedValueOnce(itwinPage(['f1'], 'https://hub.example.com/itwins/favorites?$skip=200&$top=200'))
        .mockResolvedValueOnce(itwinPage(['f2']));

      const result = await queryFavoriteITwins();

      expect(result.map((t) => t.id)).toEqual(['f1', 'f2']);
      expect(mockFetchWithAuth).toHaveBeenCalledTimes(2);
      expect(String(mockFetchWithAuth.mock.calls[0][0])).toContain('$top=200');
    });

    it('queryRecentITwins 同样跟页聚合', async () => {
      mockFetchWithAuth
        .mockResolvedValueOnce(itwinPage(['r1'], 'https://hub.example.com/itwins/recents?$skip=200&$top=200'))
        .mockResolvedValueOnce(itwinPage(['r2']));

      const result = await queryRecentITwins();

      expect(result.map((t) => t.id)).toEqual(['r1', 'r2']);
      expect(mockFetchWithAuth).toHaveBeenCalledTimes(2);
      expect(String(mockFetchWithAuth.mock.calls[0][0])).toContain('$top=200');
    });
  });
});
