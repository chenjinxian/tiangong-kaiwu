/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图标注生命周期（2026-11-02 Onshape live）：SketchDto →
 * 世界系尺寸标注 / 非尺寸约束 glyph → SketchDimensionsDecoration /
 * SketchConstraintGlyphsDecoration（viewer 屏幕空间绘制）。只在草图编辑态挂载；
 * 非编辑态草图由 SketchCurvesDecoration 灰虚线呈现。
 *
 * 2026-11-12：非尺寸约束 glyph（Onshape 对拍）与尺寸标注共用同一 SketchDto
 * 解算源；拾取层（SketchDimensionEditor）用同一个布局纯函数命中。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchDto } from '@luban-cad/shared';
import { SketchConstraintGlyphsDecoration, SketchDimensionsDecoration } from '@luban-cad/viewer';
import type { SketchConstraintGlyphAnnotation, SketchDimensionAnnotation } from '@luban-cad/viewer';
import { buildSketchDimensionAnnotations } from '../internal/sketch-annotations.js';
import { buildSketchConstraintGlyphs } from '../internal/sketch-constraint-glyphs.js';

export interface UseSketchAnnotationsResult {
  /** 当前尺寸标注（e2e/结构测试观测面；绘制由装饰器完成）。 */
  annotations: readonly SketchDimensionAnnotation[];
  /** 当前非尺寸约束 glyph 锚点（拾取层布局同源）。 */
  glyphs: readonly SketchConstraintGlyphAnnotation[];
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
  const glyphs = useMemo<readonly SketchConstraintGlyphAnnotation[]>(
    () => (active && sketch ? buildSketchConstraintGlyphs(sketch) : []),
    [active, sketch],
  );
  const decorationRef = useRef<SketchDimensionsDecoration | null>(null);
  const glyphDecorationRef = useRef<SketchConstraintGlyphsDecoration | null>(null);

  useEffect(() => {
    if (!viewport || !active) {
      decorationRef.current?.dispose();
      decorationRef.current = null;
      glyphDecorationRef.current?.dispose();
      glyphDecorationRef.current = null;
      return;
    }
    const decoration = new SketchDimensionsDecoration(viewport, annotations);
    decorationRef.current = decoration;
    const glyphDecoration = new SketchConstraintGlyphsDecoration(viewport, glyphs);
    glyphDecorationRef.current = glyphDecoration;
    return () => {
      decoration.dispose();
      if (decorationRef.current === decoration) decorationRef.current = null;
      glyphDecoration.dispose();
      if (glyphDecorationRef.current === glyphDecoration) glyphDecorationRef.current = null;
    };
    // annotations/glyphs 首次值用于构造；后续变化由下方 effect 同步。
  }, [viewport, active]);

  useEffect(() => {
    decorationRef.current?.setAnnotations(annotations);
  }, [annotations]);

  useEffect(() => {
    glyphDecorationRef.current?.setGlyphs(glyphs);
  }, [glyphs]);

  return { annotations, glyphs };
}
