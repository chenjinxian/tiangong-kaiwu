/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 文档缩略图：受 Bearer 保护的内容 URL 经 useAuthenticatedImage 换成
 * object URL；无图/加载失败回退调用方给的占位图标。
 */

import React from 'react';
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage.js';

export interface DocumentThumbnailProps {
  url?: string;
  className: string;
  fallback: React.ReactNode;
  alt?: string;
}

export function DocumentThumbnail({
  url,
  className,
  fallback,
  alt = '',
}: DocumentThumbnailProps): React.JSX.Element {
  const src = useAuthenticatedImage(url);
  if (!src) return <>{fallback}</>;
  return <img className={className} src={src} alt={alt} />;
}
