/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图尺寸标注生命周期（2026-11-02 Onshape live）：SketchDto →
 * 世界系标注 → SketchDimensionsDecoration（viewer 屏幕空间绘制）。只在草图
 * 编辑态挂载；非编辑态草图由 SketchCurvesDecoration 灰虚线呈现。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchDto } from '@luban-cad/shared';
import { SketchDimensionsDecoration } from '@luban-cad/viewer';
import type { SketchDimensionAnnotation } from '@luban-cad/viewer';
import { buildSketchDimensionAnnotations } from '../internal/sketch-annotations.js';

export interface UseSketchAnnotationsResult {
  /** 当前标注（e2e/结构测试观测面；绘制由装饰器完成）。 */
  annotations: readonly SketchDimensionAnnotation[];
}

export function useSketchAnnotations(
  viewport: ScreenViewport | null | undefined,
  sketch: SketchDto | undefined,
  active: boolean,
): UseSketchAnnotationsResult {
  const annotations = useMemo<readonly SketchDimensionAnnotation[]>(
    () => (active && sketch ? buildSketchDimensionAnnotations(sketch) : []),
    [active, sketch],
  );
  const decorationRef = useRef<SketchDimensionsDecoration | null>(null);

  useEffect(() => {
    if (!viewport || !active) {
      decorationRef.current?.dispose();
      decorationRef.current = null;
      return;
    }
    const decoration = new SketchDimensionsDecoration(viewport, annotations);
    decorationRef.current = decoration;
    return () => {
      decoration.dispose();
      if (decorationRef.current === decoration) decorationRef.current = null;
    };
    // annotations 首次值用于构造；后续变化由下方 effect 同步。
  }, [viewport, active]);

  useEffect(() => {
    decorationRef.current?.setAnnotations(annotations);
  }, [annotations]);

  return { annotations };
}
