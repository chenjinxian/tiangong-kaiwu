/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图实体拾取纯逻辑（ADR-0018 S1b）：屏幕空间控制点/曲线命中（Onshape 对拍）。
 * 与组件解耦便于单测——调用方注入 world→screen 投影。
 */
import type { Point3d } from '@itwin/core-geometry';
import type { SketchControlPointWorld, SketchEntityPolyline } from './sketch-curves.js';

export interface SketchEntitySelection {
  sketchId: string;
  entityId: number;
  part: 'curve' | 'handle';
  handleIndex?: number;
}

export interface ScreenPoint2 { x: number; y: number }

export interface SketchPickerGeometry {
  polylines: readonly SketchEntityPolyline[];
  controlPoints: readonly SketchControlPointWorld[];
}

export const HIT_CONTROL_POINT_PX = 6;
export const HIT_CURVE_PX = 5;

export function distToSegment(p: ScreenPoint2, a: ScreenPoint2, b: ScreenPoint2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0)
    return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function curveDistance(p: ScreenPoint2, points: readonly ScreenPoint2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const d = distToSegment(p, points[i - 1]!, points[i]!);
    if (d < best)
      best = d;
  }
  return best;
}

/**
 * 命中：控制点优先（≤6px），其次曲线本体（≤5px）。
 * `project` 由调用方提供（viewport.worldToView）；控制点与曲线均用其采样点投影。
 */
export function hitTestSketchEntity(
  geometry: SketchPickerGeometry,
  point: ScreenPoint2,
  project: (world: Point3d) => ScreenPoint2,
  sketchId: string,
): SketchEntitySelection | null {
  let bestControl: { d: number; cp: SketchControlPointWorld } | undefined;
  for (const cp of geometry.controlPoints) {
    const v = project(cp.position);
    const d = Math.hypot(point.x - v.x, point.y - v.y);
    if (d <= HIT_CONTROL_POINT_PX && (bestControl === undefined || d < bestControl.d))
      bestControl = { d, cp };
  }
  if (bestControl)
    return {
      sketchId,
      entityId: bestControl.cp.entityId,
      part: 'handle',
      ...(bestControl.cp.handleIndex !== undefined ? { handleIndex: bestControl.cp.handleIndex } : {}),
    };
  let bestCurve: { d: number; line: SketchEntityPolyline } | undefined;
  for (const line of geometry.polylines) {
    const d = curveDistance(point, line.points.map((world) => project(world)));
    if (d <= HIT_CURVE_PX && (bestCurve === undefined || d < bestCurve.d))
      bestCurve = { d, line };
  }
  if (bestCurve)
    return { sketchId, entityId: bestCurve.line.entityId, part: 'curve' };
  return null;
}
