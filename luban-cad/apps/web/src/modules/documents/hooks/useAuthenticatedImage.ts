/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 认证图片加载（audit P2-05 follow-up）：hub 的 iTwin 图片内容路由
 * `/itwins/:id/image/:imageId/content` 受 Bearer 保护，`<img src>` 不会
 * 携带 Authorization。对这类同源内容 URL 先经 AuthSession 取 token、
 * `fetch` 成 Blob，再以 object URL 交给 `<img>`；外部/公开 URL 原样返回。
 *
 * object URL 在 url 变化或卸载时 revoke；StrictMode 下的双执行用
 * AbortController + cancelled 标志消掉，避免把已卸载组件的 blob 泄漏。
 */

import { useEffect, useState } from 'react';
import { AuthSession } from '@clients/auth/AuthSession.js';

const PROTECTED_IMAGE_PATH =
  /^\/itwins\/[^/]+\/image\/[^/]+\/content\/?$/;

/** 是否为需要 Bearer 的 hub 图片内容 URL（同源才走 fetch）。 */
export function isAuthenticatedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      PROTECTED_IMAGE_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * 返回可直接放进 `src` 的 URL：公开地址即时返回，受保护地址异步换成
 * object URL；加载失败/无权限返回 undefined（调用方回退占位图）。
 */
export function useAuthenticatedImage(url?: string): string | undefined {
  const publicUrl = url && !isAuthenticatedImageUrl(url) ? url : undefined;
  const [resolved, setResolved] = useState<string | undefined>(publicUrl);

  useEffect(() => {
    if (!url) {
      setResolved(undefined);
      return;
    }
    if (!isAuthenticatedImageUrl(url)) {
      setResolved(url);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;
    const abort = new AbortController();

    setResolved(undefined);
    void (async () => {
      try {
        const token = await AuthSession.getValidAccessToken();
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: abort.signal,
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      } catch {
        // 中止/网络失败/无权限：保持占位图，不向 UI 抛错。
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return resolved;
}
