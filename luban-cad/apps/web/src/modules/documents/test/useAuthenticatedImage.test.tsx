// src/modules/documents/test/useAuthenticatedImage.test.tsx
//
// P2-05 follow-up：hub 图片内容路由受 Bearer 保护，`<img src>` 不带头。
// 本文件钉死 hook 的分流契约：
//   1) 外部/公开 URL 原样返回，不发 fetch；
//   2) 同源 /itwins/:id/image/:imageId/content 先取 token 再 fetch，成功换
//      object URL；
//   3) 失败回退 undefined（调用方显示占位图）；
//   4) 卸载时 revoke object URL，且 AbortController 中止在途请求。

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getValidAccessToken: mocks.getValidAccessToken,
  },
}));

import {
  isAuthenticatedImageUrl,
  useAuthenticatedImage,
} from '../hooks/useAuthenticatedImage.js';

const PROTECTED = '/itwins/itwin-1/image/image-1/content';

describe('useAuthenticatedImage（P2-05 follow-up）', () => {
  const fetchMock = vi.fn();
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    mocks.getValidAccessToken.mockReset();
    mocks.getValidAccessToken.mockResolvedValue('jwt-1');
    fetchMock.mockReset();
    createObjectURL.mockReset();
    createObjectURL.mockReturnValue('blob:image-1');
    revokeObjectURL.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should pass public/external URLs through without fetching', () => {
    const { result } = renderHook(() =>
      useAuthenticatedImage('https://cdn.example.com/a.png'),
    );

    expect(result.current).toBe('https://cdn.example.com/a.png');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getValidAccessToken).not.toHaveBeenCalled();
  });

  it('should fetch a protected same-origin image with Bearer and return a blob URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    });

    const { result } = renderHook(() => useAuthenticatedImage(PROTECTED));

    await waitFor(() => expect(result.current).toBe('blob:image-1'));
    expect(fetchMock).toHaveBeenCalledWith(
      PROTECTED,
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt-1' },
      }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should fall back to undefined when the image request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, blob: async () => new Blob([]) });

    const { result } = renderHook(() => useAuthenticatedImage(PROTECTED));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('should revoke the object URL and abort on unmount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    });

    const { result, unmount } = renderHook(() =>
      useAuthenticatedImage(PROTECTED),
    );
    await waitFor(() => expect(result.current).toBe('blob:image-1'));

    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-1');
    expect(signal.aborted).toBe(true);
  });

  it('should treat only same-origin iTwin content paths as protected', () => {
    expect(isAuthenticatedImageUrl(PROTECTED)).toBe(true);
    expect(
      isAuthenticatedImageUrl('https://cdn.example.com/itwins/1/image/2/content'),
    ).toBe(false);
    expect(isAuthenticatedImageUrl('/itwins/1/image/2')).toBe(false);
  });
});
