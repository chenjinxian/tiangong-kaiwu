/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * useITwinImage TDD（RW4-P2-T2-1）：
 * - 认证图片两段流：GET /itwins/:id/image（JSON 清单）→ 首个 url 认证下载 → blob → objectURL
 * - 二进制直出（content-type image/*）单段流
 * - 404 / 空清单 / 非 404 失败 → null（组件回退 SvgProject 占位，不打断列表）
 * - objectURL 所有权在查询缓存：缓存条目移除（gc/removeQueries）时 revokeObjectURL；
 *   多组件共用同一 id 只发一次网络请求、卸载不互相踩断
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiError, fetchWithAuth } from '../api/httpClient.js';
import { queryKeys } from '../../app/providers/QueryProvider.js';
import { useITwinImage } from './useITwinImage.js';

// Mock auth client（fetchWithAuth 内部要取 token）
vi.mock('../../features/auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(async () => 'test-token'),
}));

// Mock fetchWithAuth（保留 ApiError 真身，isNotFound 语义不变）
vi.mock('../api/httpClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/httpClient.js')>();
  return { ...actual, fetchWithAuth: vi.fn() };
});

const mockFetchWithAuth = vi.mocked(fetchWithAuth);

// jsdom 无 createObjectURL/revokeObjectURL —— 桩之
let blobSeq = 0;
const mockCreateObjectURL = vi.fn(() => `blob:mock-${++blobSeq}`);
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  blobSeq = 0;
  vi.clearAllMocks();
  mockFetchWithAuth.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { value: mockCreateObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: mockRevokeObjectURL, configurable: true });
});

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function binaryResponse(): Response {
  return new Response(new Blob(['fake-png'], { type: 'image/png' }), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });
}

/** 探针组件：把 hook 结果写进外部变量断言 */
let latestUrl: string | null | undefined;
 
function Probe({ id }: { id: string | null }): null {
  latestUrl = useITwinImage(id);
  return null;
}

function renderProbe(id: string | null): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Probe id={id} />
    </QueryClientProvider>,
  );
  return client;
}

describe('useITwinImage', () => {
  it('JSON 图像清单：GET /itwins/:id/image → 首个 url 认证下载 → objectURL', async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'img-1', url: '/files/a.png', type: 'thumbnail' }]),
      )
      .mockResolvedValueOnce(binaryResponse());

    renderProbe('twin-1');

    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

    // 第一段：图像清单；第二段：相对路径原样同源下载（baseUrl=''）
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(2);
    expect(mockFetchWithAuth.mock.calls[0][0]).toBe('/itwins/twin-1/image');
    const [secondUrl, secondInit] = mockFetchWithAuth.mock.calls[1];
    expect(secondUrl).toBe('/files/a.png');
    expect((secondInit as { baseUrl?: string } | undefined)?.baseUrl).toBe('');
  });

  it('二进制直出（content-type image/*）：单段流直接 objectURL', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(binaryResponse());

    renderProbe('twin-2');

    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it('404 → null（不创建 objectURL，组件回退占位）', async () => {
    mockFetchWithAuth.mockRejectedValueOnce(new ApiError('not found', 404, 'NotFound'));

    renderProbe('twin-404');

    await waitFor(() => expect(latestUrl).toBe(null));
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it('空图像清单 → null', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(jsonResponse([]));

    renderProbe('twin-empty');

    await waitFor(() => expect(latestUrl).toBe(null));
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });

  it('非 404 失败（500）→ null 回退占位，不抛出打断列表', async () => {
    mockFetchWithAuth.mockRejectedValueOnce(new ApiError('boom', 500));

    renderProbe('twin-500');

    await waitFor(() => expect(latestUrl).toBe(null));
  });

  it('缓存条目移除时 revokeObjectURL 回收（防泄漏）', async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(jsonResponse([{ id: 'img-1', url: '/files/a.png' }]))
      .mockResolvedValueOnce(binaryResponse());

    const client = renderProbe('twin-gc');
    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));

    client.removeQueries({ queryKey: queryKeys.itwins.image('twin-gc') });

    await waitFor(() =>
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-1'),
    );
  });

  it('refetch 成功替换数据时回收旧 objectURL（广域 invalidate 不泄漏）', async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(jsonResponse([{ id: 'img-1', url: '/files/a.png' }]))
      .mockResolvedValueOnce(binaryResponse())
      .mockResolvedValueOnce(jsonResponse([{ id: 'img-2', url: '/files/b.png' }]))
      .mockResolvedValueOnce(binaryResponse());

    const client = renderProbe('twin-replace');
    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));

    // 模拟 itwins.all 广域 invalidate（改名/删除/收藏 mutation 后的真实路径）
    await client.refetchQueries({ queryKey: queryKeys.itwins.image('twin-replace') });

    await waitFor(() => expect(latestUrl).toBe('blob:mock-2'));
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(mockRevokeObjectURL).not.toHaveBeenCalledWith('blob:mock-2');
  });

  it('组件卸载但缓存未移除 → 不 revoke（重挂载仍可用，避免破图）', async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(jsonResponse([{ id: 'img-1', url: '/files/a.png' }]))
      .mockResolvedValueOnce(binaryResponse());

    renderProbe('twin-keep');
    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));

    cleanup();

    // 留出微任务/定时器窗口，确认未触发回收
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it('同一 id 多消费：react-query 去重，仅一次网络请求', async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(jsonResponse([{ id: 'img-1', url: '/files/a.png' }]))
      .mockResolvedValueOnce(binaryResponse());

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe id="twin-dedupe" />
        <Probe id="twin-dedupe" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(latestUrl).toBe('blob:mock-1'));
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(2); // 清单 + 下载，各一次
  });

  it('iTwinId 为 null：不发起请求，直接 null', () => {
    renderProbe(null);

    expect(latestUrl).toBe(null);
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });
});
