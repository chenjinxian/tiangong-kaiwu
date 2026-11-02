/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 默认几何图元视口装饰生命周期（2026-11-02）：viewport 就绪后注册
 * DatumPlanesDecoration；datum 切片可见性变化走 setVisibility，不重建装饰器。
 */
import { useEffect, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import { DatumPlanesDecoration } from '@luban-cad/viewer';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export function useDatumPlaneDecorations(viewport: ScreenViewport | null | undefined): void {
  const visibility = usePartStudioStore((s) => s.datum.visibility);
  const decorationRef = useRef<DatumPlanesDecoration | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const decoration = new DatumPlanesDecoration(viewport, visibility);
    decorationRef.current = decoration;
    return () => {
      decoration.dispose();
      decorationRef.current = null;
    };
    // visibility 首次值仅用于构造；后续变化由下方 effect 同步。
  }, [viewport]);

  useEffect(() => {
    decorationRef.current?.setVisibility(visibility);
  }, [visibility]);
}
