/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图框选纯逻辑（2026-11-12 Onshape live 对拍）：
 * - 左→右拖拽 = 窗口选择（window）：实体全部投影采样点位于框内才选中；
 * - 右→左拖拽 = 交叉选择（crossing）：实体与框相交（含点在框内）即选中；
 * - 点实体不在 polylines 中，按控制点 kind='point' 纳入；
 * - 结果写回既有唯一选择权威（`kind='sketchEntity'`，part='curve'）。
 *
 * 与组件解耦：world→screen 投影由调用方注入，便于单测。
 */
import type { Point3d } from '@itwin/core-geometry';
import type {
  ScreenPoint2,
  SketchEntitySelection,
  SketchPickerGeometry,
} from './sketch-entity-picker.js';

export type SketchBoxSelectMode = 'window' | 'crossing';

export interface SketchScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SketchBoxFromPoints {
  box: SketchScreenBox;
  mode: SketchBoxSelectMode;
}

/** 拖拽起止点 → 规范化屏幕矩形 + Onshape 方向语义（左→右窗口 / 右→左交叉）。 */
export function sketchBoxFromScreenPoints(from: ScreenPoint2, to: ScreenPoint2): SketchBoxFromPoints {
  return {
    box: {
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      right: Math.max(from.x, to.x),
      bottom: Math.max(from.y, to.y),
    },
    mode: to.x >= from.x ? 'window' : 'crossing',
  };
}

export function pointInScreenBox(point: ScreenPoint2, box: SketchScreenBox): boolean {
  return point.x >= box.left && point.x <= box.right
    && point.y >= box.top && point.y <= box.bottom;
}

/**
 * 线段与矩形相交（Liang–Barsky 裁剪）：端点在内、穿过矩形、贴边都算相交。
 */
export function segmentIntersectsScreenBox(a: ScreenPoint2, b: ScreenPoint2, box: SketchScreenBox): boolean {
  if (pointInScreenBox(a, box) || pointInScreenBox(b, box))
    return true;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (p === 0)
      return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1)
        return false;
      if (r > t0)
        t0 = r;
    } else {
      if (r < t0)
        return false;
      if (r < t1)
        t1 = r;
    }
    return true;
  };

  return clip(-dx, a.x - box.left)
    && clip(dx, box.right - a.x)
    && clip(-dy, a.y - box.top)
    && clip(dy, box.bottom - a.y);
}

/**
 * 框选命中实体（按 entityId 去重；曲线优先，点实体补入）。
 * 空框或退化折线不产生选择。
 */
export function selectSketchEntitiesInScreenBox(
  geometry: SketchPickerGeometry,
  project: (world: Point3d) => ScreenPoint2,
  box: SketchScreenBox,
  mode: SketchBoxSelectMode,
  sketchId: string,
): SketchEntitySelection[] {
  const selected = new Set<number>();
  const out: SketchEntitySelection[] = [];

  for (const line of geometry.polylines) {
    if (line.points.length < 2 || selected.has(line.entityId))
      continue;
    const points = line.points.map((world) => project(world));
    const hit = mode === 'window'
      ? points.every((point) => pointInScreenBox(point, box))
      : points.some((point) => pointInScreenBox(point, box))
        || points.some((point, index) => index > 0
          && segmentIntersectsScreenBox(points[index - 1]!, point, box));
    if (hit) {
      selected.add(line.entityId);
      out.push({ sketchId, entityId: line.entityId, part: 'curve' });
    }
  }

  // 点实体没有折线：按 kind='point' 的控制点框选（命中框内即选中整个点）。
  for (const cp of geometry.controlPoints) {
    if (cp.kind !== 'point' || selected.has(cp.entityId))
      continue;
    if (!pointInScreenBox(project(cp.position), box))
      continue;
    selected.add(cp.entityId);
    out.push({ sketchId, entityId: cp.entityId, part: 'curve' });
  }

  return out;
}
