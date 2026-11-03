/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 非编辑态草图曲线视口叠加（2026-11-02 Onshape 视觉对齐）：
 * FeatureTreeEntry.params 里的 sketch 条目自带 entities + plane（v1.7），
 * 无需额外 RPC。把局部 2D 实体采样成世界折线，交给 viewer 侧 WorldOverlay
 * 装饰器画灰色虚线（Onshape 建模时所有草图可见、非选中灰色）。
 *
 * 只做显示，不参与拾取/编辑（pickable=false）；活动草图编辑态由宿主跳过，
 * 避免与草图工具自身高亮重复。
 */
import { Point3d } from '@itwin/core-geometry';
import type { FeatureTreeEntry, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export interface SketchCurvePolyline {
  sketchId: string;
  points: Point3d[];
}

/** 单草图实体折线（entityId 用于面域外环过滤——特征预览消费）。 */
export interface SketchEntityPolyline {
  entityId: number;
  points: Point3d[];
}

interface LocalPoint { x: number; y: number }
interface SketchParams {
  entities?: SketchEntityDto[];
  plane?: SketchPlaneDto;
}

const CIRCLE_SEGMENTS = 56;
const CURVE_SAMPLE_LIMIT = 64;

function isLocalPoint(value: unknown): value is LocalPoint {
  if (!value || typeof value !== 'object')
    return false;
  const p = value as { x?: unknown; y?: unknown };
  return typeof p.x === 'number' && typeof p.y === 'number';
}

function asSketchParams(params: unknown): SketchParams | undefined {
  if (!params || typeof params !== 'object')
    return undefined;
  return params as SketchParams;
}

function sampleArc(center: LocalPoint, radius: number, start: number, sweep: number): LocalPoint[] {
  const count = Math.max(8, Math.min(CURVE_SAMPLE_LIMIT, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * CIRCLE_SEGMENTS)));
  const out: LocalPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = start + sweep * (i / count);
    out.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return out;
}

function sampleCircle(center: LocalPoint, radius: number): LocalPoint[] {
  const out: LocalPoint[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (Math.PI * 2 * i) / CIRCLE_SEGMENTS;
    out.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return out;
}

function sampleBezier(control: LocalPoint[]): LocalPoint[] {
  if (control.length !== 4)
    return control;
  const out: LocalPoint[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const u = 1 - t;
    out.push({
      x: u * u * u * control[0]!.x + 3 * u * u * t * control[1]!.x + 3 * u * t * t * control[2]!.x + t * t * t * control[3]!.x,
      y: u * u * u * control[0]!.y + 3 * u * u * t * control[1]!.y + 3 * u * t * t * control[2]!.y + t * t * t * control[3]!.y,
    });
  }
  return out;
}

/** 单草图实体 → 世界折线（供特征预览/面域过滤复用；退化实体跳过）。 */
export function sketchEntitiesToWorldPolylines(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
): SketchEntityPolyline[] {
  const frame = sketchPlaneFrameFrom(plane);
  const points = new Map<number, LocalPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.id === 'number')
      points.set(entity.id, { x: entity.x ?? 0, y: entity.y ?? 0 });
  }

  const resolve = (ref: unknown): LocalPoint | undefined => {
    if (typeof ref === 'number')
      return points.get(ref);
    return isLocalPoint(ref) ? { x: ref.x, y: ref.y } : undefined;
  };

  const out: SketchEntityPolyline[] = [];
  for (const entity of entities) {
    let local: LocalPoint[] | undefined;
    switch (entity.kind) {
      case 'line': {
        const a = resolve(entity.p1);
        const b = resolve(entity.p2);
        local = a && b ? [a, b] : undefined;
        break;
      }
      case 'circle': {
        const center = resolve(entity.center);
        if (center && typeof entity.radius === 'number' && entity.radius > 0)
          local = sampleCircle(center, entity.radius);
        break;
      }
      case 'arc': {
        const center = resolve(entity.center);
        if (center && typeof entity.radius === 'number' && entity.radius > 0
          && typeof entity.startAngle === 'number' && typeof entity.sweepAngle === 'number')
          local = sampleArc(center, entity.radius, entity.startAngle, entity.sweepAngle);
        break;
      }
      case 'spline': {
        const control = entity.controlPoints;
        if (Array.isArray(control) && control.length >= 2)
          local = sampleBezier(control);
        else if (Array.isArray(entity.fitPoints) && entity.fitPoints.length >= 2)
          local = entity.fitPoints;
        break;
      }
      case 'point':
        break;
    }
    if (local && local.length >= 2 && typeof entity.id === 'number') {
      out.push({ entityId: entity.id, points: local.map((p) => frame.toWorld({ u: p.x, v: p.y })) });
    }
  }
  return out;
}

/**
 * 特征树 → 每条草图曲线的世界折线。suppressed 草图、无 entities/plane、
 * 退化轨迹一律跳过——显示层绝不因数据缺陷抛错。
 */
export function sketchEntriesToWorldPolylines(entries: readonly FeatureTreeEntry[]): SketchCurvePolyline[] {
  const polylines: SketchCurvePolyline[] = [];
  for (const entry of entries) {
    if (entry.featureType !== 'sketch' || entry.suppressed)
      continue;
    const params = asSketchParams(entry.params);
    if (!params || !Array.isArray(params.entities))
      continue;
    for (const entityPolyline of sketchEntitiesToWorldPolylines(params.entities, params.plane)) {
      polylines.push({ sketchId: entry.id, points: entityPolyline.points });
    }
  }
  return polylines;
}
