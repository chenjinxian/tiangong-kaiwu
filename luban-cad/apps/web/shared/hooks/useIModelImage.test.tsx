/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * useIModelImage（RW4-P3-T3-1）：iModel 缩略图认证加载 hook。
 * 契约：GET /imodels/:id/thumbnail → {downloadUrl,size} 元数据（认证）→
 * downloadUrl 二段取图（Azurite 绝对地址改走 /azurite 同源代理）→ blob → objectURL；
 * 无图（downloadUrl:null）/404/失败回退 null。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../api/httpClient.js', async () => {
  const actual = await vi.importActual<typeof import('../api/httpClient.js')>('../api/httpClient.js');
  return {
    ...actual,
    fetchWithAuth: vi.fn(),
  };
});

import { ApiError, fetchWithAuth } from '../api/httpClient.js';
import { useIModelImage } from './useIModelImage.js';

const mockedFetchWithAuth = vi.mocked(fetchWithAuth);

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function imageResponse(): Response {
  return new Response(new Blob(['img'], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom 未实现 object URL；hook 只关心句柄流转
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:imodel-thumb'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIModelImage', () => {
  it('fetches thumbnail metadata with auth, then the Azurite download URL through the same-origin proxy', async () => {
    mockedFetchWithAuth.mockResolvedValueOnce(
      jsonResponse({ downloadUrl: 'http://localhost:10000/devstoreaccount1/imodels/i-1/thumbnail.png?sig=x', size: 'medium' }),
    );
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useIModelImage('i-1'), { wrapper });

    await waitFor(() => expect(result.current).toBe('blob:imodel-thumb'));

    expect(mockedFetchWithAuth).toHaveBeenCalledWith('/imodels/i-1/thumbnail?size=medium');
    expect(fetchMock).toHaveBeenCalledWith(
      '/azurite/devstoreaccount1/imodels/i-1/thumbnail.png?sig=x',
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('rewrites compose-form Azurite host (azurite:10000) to the same-origin proxy', async () => {
    mockedFetchWithAuth.mockResolvedValueOnce(
      jsonResponse({ downloadUrl: 'http://azurite:10000/devstoreaccount1/imodels/i-1/thumb.png?sig=y', size: 'medium' }),
    );
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useIModelImage('i-1'), { wrapper });

    await waitFor(() => expect(result.current).toBe('blob:imodel-thumb'));
    expect(fetchMock).toHaveBeenCalledWith('/azurite/devstoreaccount1/imodels/i-1/thumb.png?sig=y');
  });

  it('keeps non-Azurite download URLs untouched', async () => {
    mockedFetchWithAuth.mockResolvedValueOnce(
      jsonResponse({ downloadUrl: 'https://cdn.example.com/t.png', size: 'medium' }),
    );
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useIModelImage('i-1'), { wrapper });

    await waitFor(() => expect(result.current).toBe('blob:imodel-thumb'));
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/t.png');
  });

  it('returns null when the metadata carries no downloadUrl (no thumbnail yet)', async () => {
    mockedFetchWithAuth.mockResolvedValueOnce(jsonResponse({ downloadUrl: null, size: 'medium' }));

    const { result } = renderHook(() => useIModelImage('i-1'), { wrapper });

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null on 404 without throwing', async () => {
    mockedFetchWithAuth.mockRejectedValueOnce(new ApiError('Not Found', 404));

    const { result } = renderHook(() => useIModelImage('i-1'), { wrapper });

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('skips the request entirely without an id', () => {
    const { result } = renderHook(() => useIModelImage(null), { wrapper });

    expect(result.current).toBeNull();
    expect(mockedFetchWithAuth).not.toHaveBeenCalled();
  });
});
