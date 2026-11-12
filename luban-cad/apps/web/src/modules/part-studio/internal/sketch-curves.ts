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
  construction?: boolean;
}

/** 单草图实体折线（entityId 用于面域外环过滤——特征预览消费）。 */
export interface SketchEntityPolyline {
  entityId: number;
  points: Point3d[];
  construction?: boolean;
}

/**
 * 草图控制点（Onshape live 2026-11-12：编辑态显示端点/圆心/弧端点/样条控制点，
 * 蓝色小圆点；点实体同样可见）。kind 预留不同绘制样式，当前统一小圆点。
 */
export interface SketchControlPointWorld {
  entityId: number;
  position: Point3d;
  kind: 'point' | 'center' | 'endpoint' | 'control';
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

/** 点实体索引（数值引用解析共用；退化点按 0,0 保持旧口径）。 */
function collectPointEntities(entities: readonly SketchEntityDto[]): Map<number, LocalPoint> {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.id === 'number')
      points.set(entity.id, { x: entity.x ?? 0, y: entity.y ?? 0 });
  }
  return points;
}

function makePointResolver(points: Map<number, LocalPoint>): (ref: unknown) => LocalPoint | undefined {
  return (ref: unknown): LocalPoint | undefined => {
    if (typeof ref === 'number')
      return points.get(ref);
    return isLocalPoint(ref) ? { x: ref.x, y: ref.y } : undefined;
  };
}

/** 单草图实体 → 世界折线（供特征预览/面域过滤复用；退化实体跳过）。 */
export function sketchEntitiesToWorldPolylines(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
): SketchEntityPolyline[] {
  const frame = sketchPlaneFrameFrom(plane);
  const points = collectPointEntities(entities);
  const resolve = makePointResolver(points);

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
      out.push({
        entityId: entity.id,
        points: local.map((p) => frame.toWorld({ u: p.x, v: p.y })),
        ...((entity as { construction?: boolean }).construction ? { construction: true } : {}),
      });
    }
  }
  return out;
}

/**
 * 单草图实体 → 世界控制点（Onshape live：编辑态显示点/端点/圆心/弧起止中点/
 * 样条控制点；同一坐标去重，避免点实体与引用端点重复绘制）。
 */
export function sketchControlPointsToWorld(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
): SketchControlPointWorld[] {
  const frame = sketchPlaneFrameFrom(plane);
  const points = collectPointEntities(entities);
  const resolve = makePointResolver(points);
  const out: SketchControlPointWorld[] = [];
  const seen = new Set<string>();
  const push = (entityId: number, local: LocalPoint | undefined, kind: SketchControlPointWorld['kind']): void => {
    if (!local)
      return;
    const key = `${Math.round(local.x * 1000)}:${Math.round(local.y * 1000)}`;
    if (seen.has(key))
      return;
    seen.add(key);
    out.push({ entityId, position: frame.toWorld({ u: local.x, v: local.y }), kind });
  };
  for (const entity of entities) {
    if (typeof entity.id !== 'number')
      continue;
    switch (entity.kind) {
      case 'point':
        push(entity.id, { x: entity.x ?? 0, y: entity.y ?? 0 }, 'point');
        break;
      case 'line':
        push(entity.id, resolve(entity.p1), 'endpoint');
        push(entity.id, resolve(entity.p2), 'endpoint');
        break;
      case 'circle':
        push(entity.id, resolve(entity.center), 'center');
        break;
      case 'arc': {
        const center = resolve(entity.center);
        push(entity.id, center, 'center');
        if (center && typeof entity.radius === 'number'
          && typeof entity.startAngle === 'number' && typeof entity.sweepAngle === 'number') {
          const at = (angle: number): LocalPoint => ({
            x: center.x + entity.radius! * Math.cos(angle),
            y: center.y + entity.radius! * Math.sin(angle),
          });
          push(entity.id, at(entity.startAngle), 'endpoint');
          push(entity.id, at(entity.startAngle + entity.sweepAngle / 2), 'endpoint');
          push(entity.id, at(entity.startAngle + entity.sweepAngle), 'endpoint');
        }
        break;
      }
      case 'spline':
        for (const cp of entity.controlPoints ?? [])
          push(entity.id, isLocalPoint(cp) ? cp : undefined, 'control');
        break;
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
      polylines.push({
        sketchId: entry.id,
        points: entityPolyline.points,
        ...(entityPolyline.construction ? { construction: true } : {}),
      });
    }
  }
  return polylines;
}
