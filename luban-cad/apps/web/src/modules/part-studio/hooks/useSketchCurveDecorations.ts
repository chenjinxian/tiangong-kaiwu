/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图曲线生命周期（2026-11-02；Onshape 控制点/约束着色对拍 2026-11-12）：
 * 特征树草图条目 → 世界折线 → SketchCurvesDecoration。
 * - 非编辑态：全部草图灰色虚线；
 * - 编辑态：只显示活动草图——欠约束蓝色、全约束黑色、失败红色（live 像素采样），
 *   并在活动草图实体端点/圆心/弧起止中点/样条控制点处绘制蓝色控制点。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { FeatureTreeEntry, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { SketchCurvesDecoration } from '@luban-cad/viewer';
import type { SketchConstraintState, SketchControlPointGeometry, SketchCurveGeometry } from '@luban-cad/viewer';
import {
  sketchControlPointsToWorld,
  sketchEntitiesToWorldPolylines,
  sketchEntriesToWorldPolylines,
} from '../internal/sketch-curves.js';

function constraintStateOf(sketch: SketchDto | null | undefined): SketchConstraintState {
  const solve = sketch?.solve;
  if (!solve)
    return 'underconstrained';
  if (solve.status === 'failed' || solve.status === 'conflicting')
    return 'error';
  return solve.dof === 0 ? 'constrained' : 'underconstrained';
}

export function useSketchCurveDecorations(
  viewport: ScreenViewport | null | undefined,
  entries: readonly FeatureTreeEntry[],
  sketchActive: boolean,
  activeSketchId?: string | null,
  activeSketch?: SketchDto | null,
  /** S1c：拖拽预览实体（显示层覆盖；缺省用 activeSketch.entities）。 */
  previewEntities?: readonly SketchEntityDto[] | null,
): void {
  const activeSketchForId = sketchActive && activeSketch !== undefined && activeSketch !== null
    && (activeSketchId === undefined || activeSketchId === null || activeSketch.id === activeSketchId)
    ? activeSketch
    : undefined;
  const activeId = sketchActive ? activeSketchId ?? activeSketchForId?.id : undefined;

  const activeEntities = previewEntities ?? activeSketchForId?.entities;
  const polylines = useMemo<readonly SketchCurveGeometry[]>(() => {
    // 编辑态优先用 getSketch 现场解（含最新解算坐标）；拖拽期用预览覆盖；未就绪回退树 params。
    const fromActive = activeSketchForId && activeEntities ? sketchEntitiesToWorldPolylines(
      activeEntities,
      activeSketchForId.plane,
    ).map((entry) => ({
      points: entry.points,
      sketchId: activeSketchForId.id,
      ...(entry.construction ? { construction: true } : {}),
    })) : undefined;
    const converted = fromActive ?? sketchEntriesToWorldPolylines(entries);
    const visible = activeId === undefined
      ? converted
      : converted.filter((entry) => entry.sketchId === activeId);
    return visible.map((entry) => ({
      points: entry.points,
      sketchId: entry.sketchId,
      ...(entry.construction ? { construction: true } : {}),
    }));
  }, [entries, activeId, activeSketchForId, activeEntities]);

  const controlPoints = useMemo<readonly SketchControlPointGeometry[]>(() => {
    if (!activeSketchForId || !activeEntities)
      return [];
    return sketchControlPointsToWorld(activeEntities, activeSketchForId.plane).map((point) => ({
      position: point.position,
      sketchId: activeSketchForId.id,
    }));
  }, [activeSketchForId, activeEntities]);

  const constraintState = useMemo(() => constraintStateOf(activeSketchForId), [activeSketchForId]);

  const decorationRef = useRef<SketchCurvesDecoration | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const decoration = new SketchCurvesDecoration(viewport, polylines, activeId, {
      constraintState,
      controlPoints,
    });
    decorationRef.current = decoration;
    return () => {
      decoration.dispose();
      decorationRef.current = null;
    };
    // polylines 首次值仅用于构造；后续变化由下方 effect 同步。
  }, [viewport]);

  useEffect(() => {
    decorationRef.current?.setPolylines(polylines, activeId, { constraintState, controlPoints });
  }, [polylines, activeId, constraintState, controlPoints]);
}
