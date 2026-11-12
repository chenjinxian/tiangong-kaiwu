/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图约束 → 视口尺寸标注（Onshape live，2026-11-02）。
 *
 * 数据源：SketchDto.constraints 中 length / distance / radius / diameter（与面板「尺寸」
 * 页签同口径），实体坐标用解算后的 DTO 局部 (u,v)。标注锚点在世界系：
 * 局部几何经 SketchPlaneDto 坐标架刚体变换——与草图曲线装饰同源。
 *
 * 标注侧向确定性规则（约束 DTO 目前不存放置点，故不做交互式放置）：
 * 取尺寸线法向中远离草图整体包围盒中心的一侧；垂线方向与中心共线时取 +法向。
 * 相同侧向的标注由视口装饰器做像素级堆叠避让。
 */
import { Vector3d } from '@itwin/core-geometry';
import type { SketchConstraintDto, SketchDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';
import type { SketchDimensionAnnotation } from '@luban-cad/viewer';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

interface LocalPoint { x: number; y: number }
interface LineItem { kind: 'line'; a: LocalPoint; b: LocalPoint }
interface PointItem { kind: 'point'; p: LocalPoint }
interface CircleItem { kind: 'circle'; center: LocalPoint; radius: number; startAngle?: number; sweepAngle?: number }
type ResolvedItem = LineItem | PointItem | CircleItem;

const EPS = 1e-9;

/** 尺寸文字：最多 4 位小数、去尾零（Onshape 不显示单位后缀）。 */
export function formatSketchDimensionValue(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '?';
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '') || '0';
}

function inlinePoint(ref: number | { x: number; y: number }, points: ReadonlyMap<number, LocalPoint>): LocalPoint | undefined {
  if (typeof ref === 'number') return points.get(ref);
  if (Number.isFinite(ref.x) && Number.isFinite(ref.y)) return { x: ref.x, y: ref.y };
  return undefined;
}

function arcPoint(center: LocalPoint, radius: number, angle: number): LocalPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function resolveEntityRef(
  entity: SketchEntityDto,
  part: 'start' | 'end' | 'center' | 'point' | 'handle' | 'entity',
  points: ReadonlyMap<number, LocalPoint>,
  index?: number,
): ResolvedItem | undefined {
  switch (entity.kind) {
    case 'point': {
      if (entity.x === undefined || entity.y === undefined) return undefined;
      return { kind: 'point', p: { x: entity.x, y: entity.y } };
    }
    case 'line': {
      const a = inlinePoint(entity.p1, points);
      const b = inlinePoint(entity.p2, points);
      if (!a || !b) return undefined;
      if (part === 'start') return { kind: 'point', p: a };
      if (part === 'end') return { kind: 'point', p: b };
      return { kind: 'line', a, b };
    }
    case 'circle':
    case 'arc': {
      const center = inlinePoint(entity.center, points);
      if (!center) return undefined;
      const radius = entity.radius;
      return {
        kind: 'circle',
        center,
        radius: typeof radius === 'number' && radius > 0 ? radius : 0,
        startAngle: entity.kind === 'arc' ? entity.startAngle : undefined,
        sweepAngle: entity.kind === 'arc' ? entity.sweepAngle : undefined,
      };
    }
    case 'spline': {
      const control = entity.controlPoints;
      if (part === 'handle') {
        const p = control[index ?? 0];
        return p ? { kind: 'point', p: { x: p.x, y: p.y } } : undefined;
      }
      if (part === 'point') {
        const p = entity.fitPoints?.[index ?? 0] ?? control[index ?? 0];
        return p ? { kind: 'point', p: { x: p.x, y: p.y } } : undefined;
      }
      const p = part === 'end' ? control[control.length - 1] : control[0];
      return p ? { kind: 'point', p: { x: p.x, y: p.y } } : undefined;
    }
  }
}

function resolveRef(
  ref: SketchRef,
  entities: ReadonlyMap<number, SketchEntityDto>,
  points: ReadonlyMap<number, LocalPoint>,
): ResolvedItem | undefined {
  if (typeof ref === 'number') {
    const entity = entities.get(ref);
    return entity ? resolveEntityRef(entity, 'entity', points) : undefined;
  }
  if ('origin' in ref) return { kind: 'point', p: { x: 0, y: 0 } };
  const entity = entities.get(ref.entity);
  if (!entity) return undefined;
  if (ref.part === 'center') {
    if (entity.kind === 'circle' || entity.kind === 'arc') {
      const center = inlinePoint(entity.center, points);
      if (!center) return undefined;
      const radius = entity.radius;
      return {
        kind: 'circle',
        center,
        radius: typeof radius === 'number' && radius > 0 ? radius : 0,
        startAngle: entity.kind === 'arc' ? entity.startAngle : undefined,
        sweepAngle: entity.kind === 'arc' ? entity.sweepAngle : undefined,
      };
    }
    return undefined;
  }
  const index = ref.part === 'point' || ref.part === 'handle' ? ref.index : undefined;
  return resolveEntityRef(entity, ref.part, points, index);
}

/** 点/线/圆心到点；不可解析的形态返回 undefined（不猜测）。 */
function asPoint(item: ResolvedItem | undefined): LocalPoint | undefined {
  if (!item) return undefined;
  if (item.kind === 'point') return item.p;
  if (item.kind === 'circle') return item.center;
  return undefined;
}

/** 无限长直线垂足（尺寸约束语义：点/平行线距离量到直线，不是线段截断）。 */
function projectToInfiniteLine(p: LocalPoint, a: LocalPoint, b: LocalPoint): LocalPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return a;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * 平行线距离锚点对：投影重叠 → 重叠区中点；投影不重叠 → 缺口正中的垂线
 * 锚点（Onshape 口径——尺寸线必须垂直于两条线，不能把两个最近端点连成斜线）。
 * 非平行/退化返回 undefined（当前约束语料只有平行线对）。
 */
function parallelClosestPair(lineA: LineItem, lineB: LineItem): [LocalPoint, LocalPoint] | undefined {
  const ax = lineA.b.x - lineA.a.x;
  const ay = lineA.b.y - lineA.a.y;
  const bx = lineB.b.x - lineB.a.x;
  const by = lineB.b.y - lineB.a.y;
  const lenA = Math.hypot(ax, ay);
  const lenB = Math.hypot(bx, by);
  if (lenA < EPS || lenB < EPS) return undefined;
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) > EPS * lenA * lenB) return undefined;

  const lenA2 = ax * ax + ay * ay;
  const t1 = ((lineB.a.x - lineA.a.x) * ax + (lineB.a.y - lineA.a.y) * ay) / lenA2;
  const t2 = ((lineB.b.x - lineA.a.x) * ax + (lineB.b.y - lineA.a.y) * ay) / lenA2;
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(1, Math.max(t1, t2));
  let anchor: LocalPoint;
  if (lo <= hi) {
    const t = (lo + hi) / 2;
    anchor = { x: lineA.a.x + ax * t, y: lineA.a.y + ay * t };
  } else {
    // 两条平行线段沿轴向有缺口：A 取最近端，B 取最近端，二者中点投影回两线。
    const endT = Math.min(t1, t2) > 1 ? 1 : 0;
    const endA = { x: lineA.a.x + ax * endT, y: lineA.a.y + ay * endT };
    const endB = Math.hypot(endA.x - lineB.a.x, endA.y - lineB.a.y)
      <= Math.hypot(endA.x - lineB.b.x, endA.y - lineB.b.y) ? lineB.a : lineB.b;
    const gapMid = { x: (endA.x + endB.x) / 2, y: (endA.y + endB.y) / 2 };
    anchor = projectToInfiniteLine(gapMid, lineA.a, lineA.b);
  }
  return [anchor, projectToInfiniteLine(anchor, lineB.a, lineB.b)];
}

function distanceAnchors(a: ResolvedItem, b: ResolvedItem): [LocalPoint, LocalPoint] | undefined {
  if (a.kind === 'line' && b.kind === 'line') return parallelClosestPair(a, b);
  const pa = asPoint(a);
  const pb = asPoint(b);
  if (pa && pb) return [pa, pb];
  // 点-线：无限长直线垂足（垂足可在段外；Onshape 距离约束同义）。
  if (pa && b.kind === 'line') return [pa, projectToInfiniteLine(pa, b.a, b.b)];
  if (pb && a.kind === 'line') return [projectToInfiniteLine(pb, a.a, a.b), pb];
  return undefined;
}

/** 两条无限直线交点；平行/退化返回 undefined（角度标注顶点）。 */
function lineIntersection(lineA: LineItem, lineB: LineItem): LocalPoint | undefined {
  const ax = lineA.b.x - lineA.a.x;
  const ay = lineA.b.y - lineA.a.y;
  const bx = lineB.b.x - lineB.a.x;
  const by = lineB.b.y - lineB.a.y;
  const cross = ax * by - ay * bx;
  const lenA = Math.hypot(ax, ay);
  const lenB = Math.hypot(bx, by);
  if (lenA < EPS || lenB < EPS || Math.abs(cross) <= EPS * lenA * lenB)
    return undefined;
  const dx = lineB.a.x - lineA.a.x;
  const dy = lineB.a.y - lineA.a.y;
  const t = (dx * by - dy * bx) / cross;
  return { x: lineA.a.x + ax * t, y: lineA.a.y + ay * t };
}

/** 角度标注射线：取线段上离交点较远的端点（朝线段主体一侧）。 */
function fartherEndpoint(line: LineItem, vertex: LocalPoint): LocalPoint {
  const da = Math.hypot(line.a.x - vertex.x, line.a.y - vertex.y);
  const db = Math.hypot(line.b.x - vertex.x, line.b.y - vertex.y);
  return da >= db ? line.a : line.b;
}

/** 草图全部实体 2D 包围盒中心（标注「远离中心」规则的基准）。 */
function sketchLocalCenter(entities: readonly SketchEntityDto[]): LocalPoint {
  const points = new Map<number, LocalPoint>();
  for (const e of entities)
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { x: e.x, y: e.y });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = (p: LocalPoint | undefined): void => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  };
  for (const e of entities) {
    switch (e.kind) {
      case 'point':
        add(e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : undefined);
        break;
      case 'line':
        add(inlinePoint(e.p1, points));
        add(inlinePoint(e.p2, points));
        break;
      case 'circle':
      case 'arc': {
        const c = inlinePoint(e.center, points);
        if (!c) break;
        const r = typeof e.radius === 'number' && e.radius > 0 ? e.radius : 0;
        add({ x: c.x - r, y: c.y - r });
        add({ x: c.x + r, y: c.y + r });
        break;
      }
      case 'spline':
        for (const p of e.controlPoints) add(p);
        for (const p of e.fitPoints ?? []) add(p);
        break;
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** 远离草图中心的标注侧向（局部单位向量）。 */
function sideDirection(a: LocalPoint, b: LocalPoint, center: LocalPoint): LocalPoint | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return undefined;
  let nx = -dy / len;
  let ny = dx / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const awayX = mid.x - center.x;
  const awayY = mid.y - center.y;
  const dot = awayX * nx + awayY * ny;
  if (dot < -EPS || (Math.abs(dot) <= EPS && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function sideWorld(frame: ReturnType<typeof sketchPlaneFrameFrom>, side: LocalPoint): Vector3d {
  return frame.xDir.scale(side.x).plus(frame.yDir.scale(side.y));
}

/**
 * SketchDto → 视口尺寸标注（世界系）。只消费可解析的尺寸约束；其余（水平/
 * 重合等）与未解析引用静默跳过——显示层不得因数据缺陷崩死。
 */
export function buildSketchDimensionAnnotations(sketch: SketchDto): SketchDimensionAnnotation[] {
  const frame = sketchPlaneFrameFrom(sketch.plane);
  const world = (p: LocalPoint) => frame.toWorld({ u: p.x, v: p.y });
  const entities = new Map<number, SketchEntityDto>();
  const points = new Map<number, LocalPoint>();
  for (const e of sketch.entities) {
    entities.set(e.id, e);
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { x: e.x, y: e.y });
  }
  const center = sketchLocalCenter(sketch.entities);
  const annotations: SketchDimensionAnnotation[] = [];

  const linear = (constraint: SketchConstraintDto, a: LocalPoint, b: LocalPoint): void => {
    if (constraint.value === undefined) return;
    const side = sideDirection(a, b, center);
    if (!side) return;
    annotations.push({
      kind: 'linear',
      id: `dimension-${constraint.id}`,
      a: world(a),
      b: world(b),
      side: sideWorld(frame, side),
      text: formatSketchDimensionValue(constraint.value),
    });
  };

  for (const constraint of sketch.constraints) {
    switch (constraint.kind) {
      case 'length': {
        const ref = constraint.refs[0];
        if (ref === undefined) break;
        const item = resolveRef(ref, entities, points);
        if (item?.kind === 'line') linear(constraint, item.a, item.b);
        break;
      }
      case 'distance': {
        const [refA, refB] = constraint.refs;
        if (refA === undefined || refB === undefined) break;
        const itemA = resolveRef(refA, entities, points);
        const itemB = resolveRef(refB, entities, points);
        if (!itemA || !itemB) break;
        const anchors = distanceAnchors(itemA, itemB);
        if (anchors) linear(constraint, anchors[0], anchors[1]);
        break;
      }
      case 'radius': {
        const ref = constraint.refs[0];
        if (ref === undefined || constraint.value === undefined) break;
        const item = resolveRef(ref, entities, points);
        if (item?.kind !== 'circle' || item.radius < EPS) break;
        const start = item.startAngle;
        const sweep = item.sweepAngle;
        const midAngle = typeof start === 'number' && typeof sweep === 'number'
          ? start + sweep / 2
          : Math.PI / 4;
        const point = arcPoint(item.center, item.radius, midAngle);
        const radial = { x: Math.cos(midAngle), y: Math.sin(midAngle) };
        annotations.push({
          kind: 'radial',
          id: `dimension-${constraint.id}`,
          center: world(item.center),
          point: world(point),
          side: sideWorld(frame, radial),
          text: `R${formatSketchDimensionValue(constraint.value)}`,
        });
        break;
      }
      case 'diameter': {
        const ref = constraint.refs[0];
        if (ref === undefined || constraint.value === undefined) break;
        const item = resolveRef(ref, entities, points);
        if (item?.kind !== 'circle' || item.radius < EPS) break;
        const start = item.startAngle;
        const sweep = item.sweepAngle;
        const midAngle = typeof start === 'number' && typeof sweep === 'number'
          ? start + sweep / 2
          : Math.PI / 4;
        const point = arcPoint(item.center, item.radius, midAngle);
        const radial = { x: Math.cos(midAngle), y: Math.sin(midAngle) };
        annotations.push({
          kind: 'radial',
          id: `dimension-${constraint.id}`,
          center: world(item.center),
          point: world(point),
          side: sideWorld(frame, radial),
          text: `⌀${formatSketchDimensionValue(constraint.value)}`,
        });
        break;
      }
      case 'angle': {
        const [refA, refB] = constraint.refs;
        if (refA === undefined || refB === undefined || constraint.value === undefined) break;
        const itemA = resolveRef(refA, entities, points);
        const itemB = resolveRef(refB, entities, points);
        if (itemA?.kind !== 'line' || itemB?.kind !== 'line') break;
        const vertex = lineIntersection(itemA, itemB);
        if (!vertex) break;
        annotations.push({
          kind: 'angular',
          id: `dimension-${constraint.id}`,
          vertex: world(vertex),
          a: world(fartherEndpoint(itemA, vertex)),
          b: world(fartherEndpoint(itemB, vertex)),
          // shared 契约 angle.value 为弧度；Onshape 显示度数。
          text: `${formatSketchDimensionValue(Math.abs(constraint.value) * 180 / Math.PI)}°`,
        });
        break;
      }
      default:
        break;
    }
  }

  return annotations;
}
