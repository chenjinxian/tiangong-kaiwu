/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图曲线生命周期（2026-11-02）：特征树草图条目 → 世界折线 →
 * SketchCurvesDecoration。编辑态只显示活动草图并绘制橙色实线（Onshape live）；
 * 非编辑态显示全部草图灰色虚线。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { Point3d } from '@itwin/core-geometry';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import { SketchCurvesDecoration } from '@luban-cad/viewer';
import { sketchEntriesToWorldPolylines } from '../internal/sketch-curves.js';

export function useSketchCurveDecorations(
  viewport: ScreenViewport | null | undefined,
  entries: readonly FeatureTreeEntry[],
  sketchActive: boolean,
  activeSketchId?: string | null,
): void {
  const activeSketch = sketchActive ? activeSketchId ?? undefined : undefined;
  const polylines = useMemo<readonly { points: readonly Point3d[]; sketchId?: string }[]>(() => {
    const converted = sketchEntriesToWorldPolylines(entries);
    const visible = activeSketch === undefined
      ? converted
      : converted.filter((entry) => entry.sketchId === activeSketch);
    return visible.map((entry) => ({ points: entry.points, sketchId: entry.sketchId }));
  }, [entries, activeSketch]);
  const decorationRef = useRef<SketchCurvesDecoration | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const decoration = new SketchCurvesDecoration(viewport, polylines, activeSketch);
    decorationRef.current = decoration;
    return () => {
      decoration.dispose();
      decorationRef.current = null;
    };
    // polylines 首次值仅用于构造；后续变化由下方 effect 同步。
  }, [viewport]);

  useEffect(() => {
    decorationRef.current?.setPolylines(polylines, activeSketch);
  }, [polylines, activeSketch]);
}
