/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图修剪纯逻辑（Onshape「修剪」首切片）：点击曲线 → 移除「最近交点之间」的
 * 段落；无交点的实体整体删除（Onshape 帮助语义）。支持 line/circle/arc；
 * spline 等暂不支持（诚实 reason，不静默 no-op）。
 *
 * 约束语义（首切片诚实登记）：被修剪实体的 id 会保留在一段剩余几何上，但原实体
 * 的端点/圆心位置已变化，故**移除引用该实体的约束**（与删除实体同口径），
 * 不做半吊子“保留约束但不满足”的状态；剩余约束原样提交，后端重解算兜底。
 */
import type { SketchConstraintDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';

export interface TrimPoint { x: number; y: number }

export interface SketchTrimResult {
  ok: boolean;
  reason?: 'not-found' | 'unsupported' | 'no-change';
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  /** 被整体删除的实体 id（无交点整删时）。 */
  removedEntityIds: number[];
}

interface LineGeom { kind: 'line'; a: TrimPoint; b: TrimPoint }
interface CircleGeom { kind: 'circle'; c: TrimPoint; r: number }
interface ArcGeom { kind: 'arc'; c: TrimPoint; r: number; start: number; sweep: number }
type Geom = LineGeom | CircleGeom | ArcGeom;

const TAU = Math.PI * 2;
const EPS = 1e-9;

const isPoint = (value: unknown): value is TrimPoint =>
  !!value && typeof value === 'object'
  && typeof (value as { x?: unknown }).x === 'number'
  && typeof (value as { y?: unknown }).y === 'number';

function pointOf(ref: number | TrimPoint, points: ReadonlyMap<number, TrimPoint>): TrimPoint | undefined {
  if (typeof ref === 'number')
    return points.get(ref);
  return isPoint(ref) ? ref : undefined;
}

function geometryOf(entity: SketchEntityDto, points: ReadonlyMap<number, TrimPoint>): Geom | undefined {
  switch (entity.kind) {
    case 'line': {
      const a = pointOf(entity.p1, points);
      const b = pointOf(entity.p2, points);
      return a && b ? { kind: 'line', a, b } : undefined;
    }
    case 'circle': {
      const c = pointOf(entity.center, points);
      if (!c || typeof entity.radius !== 'number' || entity.radius <= 0)
        return undefined;
      return { kind: 'circle', c, r: entity.radius };
    }
    case 'arc': {
      const c = pointOf(entity.center, points);
      if (!c || typeof entity.radius !== 'number' || entity.radius <= 0
        || typeof entity.startAngle !== 'number' || typeof entity.sweepAngle !== 'number')
        return undefined;
      return { kind: 'arc', c, r: entity.radius, start: entity.startAngle, sweep: entity.sweepAngle };
    }
    default:
      return undefined;
  }
}

const normalizeAngle = (angle: number): number => {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
};

/** angle 是否在 [start, start+sweep]（sweep 可负）。 */
function angleOnArc(angle: number, start: number, sweep: number): boolean {
  if (Math.abs(sweep) >= TAU - EPS)
    return true;
  const delta = normalizeAngle(angle - start);
  if (sweep >= 0)
    return delta <= sweep + 1e-7;
  return delta >= TAU + sweep - 1e-7;
}

/** 弧上角度 → 参数 s∈[0,1]（沿 sweep 方向）；不在弧上 → undefined。 */
function arcParam(angle: number, start: number, sweep: number): number | undefined {
  if (Math.abs(sweep) < EPS)
    return undefined;
  const delta = normalizeAngle(angle - start);
  if (sweep >= 0) {
    const s = delta / sweep;
    return s <= 1 + 1e-7 ? Math.max(0, Math.min(1, s)) : undefined;
  }
  const s = (TAU - delta) / -sweep;
  return s <= 1 + 1e-7 ? Math.max(0, Math.min(1, s)) : undefined;
}

function segmentParam(point: TrimPoint, line: LineGeom): number | undefined {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < EPS)
    return undefined;
  const t = ((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / lengthSq;
  return t >= -1e-9 && t <= 1 + 1e-9 ? Math.max(0, Math.min(1, t)) : undefined;
}

function lineLine(line: LineGeom, other: LineGeom): TrimPoint[] {
  const r = { x: line.b.x - line.a.x, y: line.b.y - line.a.y };
  const s = { x: other.b.x - other.a.x, y: other.b.y - other.a.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < EPS)
    return [];
  const qp = { x: other.a.x - line.a.x, y: other.a.y - line.a.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)
    return [];
  return [{ x: line.a.x + r.x * t, y: line.a.y + r.y * t }];
}

function lineCircle(line: LineGeom, center: TrimPoint, radius: number): TrimPoint[] {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const fx = line.a.x - center.x;
  const fy = line.a.y - center.y;
  const a = dx * dx + dy * dy;
  if (a < EPS)
    return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < -EPS)
    return [];
  if (disc <= EPS) {
    const t = -b / (2 * a);
    return t >= -1e-9 && t <= 1 + 1e-9 ? [{ x: line.a.x + dx * t, y: line.a.y + dy * t }] : [];
  }
  const root = Math.sqrt(disc);
  const out: TrimPoint[] = [];
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t >= -1e-9 && t <= 1 + 1e-9)
      out.push({ x: line.a.x + dx * t, y: line.a.y + dy * t });
  }
  return out;
}

function circleCircle(c1: TrimPoint, r1: number, c2: TrimPoint, r2: number): TrimPoint[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < EPS || d > r1 + r2 + 1e-7 || d < Math.abs(r1 - r2) - 1e-7)
    return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  if (hSq < -1e-7)
    return [];
  const h = Math.sqrt(Math.max(0, hSq));
  const mx = c1.x + (dx * a) / d;
  const my = c1.y + (dy * a) / d;
  const ox = (-dy * h) / d;
  const oy = (dx * h) / d;
  if (h < 1e-7)
    return [{ x: mx, y: my }];
  return [{ x: mx + ox, y: my + oy }, { x: mx - ox, y: my - oy }];
}

function rawIntersections(target: Geom, other: Geom): TrimPoint[] {
  const circleOf = (geom: Geom): { c: TrimPoint; r: number } | undefined =>
    geom.kind === 'line' ? undefined : { c: geom.c, r: geom.r };
  if (target.kind === 'line' && other.kind === 'line')
    return lineLine(target, other);
  if (target.kind === 'line') {
    const circle = circleOf(other)!;
    return lineCircle(target, circle.c, circle.r);
  }
  if (other.kind === 'line') {
    return lineCircle(other, target.c, target.r);
  }
  return circleCircle(target.c, target.r, other.c, other.r);
}

function onGeom(point: TrimPoint, geom: Geom): boolean {
  if (geom.kind === 'line')
    return segmentParam(point, geom) !== undefined;
  const angle = Math.atan2(point.y - geom.c.y, point.x - geom.c.x);
  if (geom.kind === 'arc')
    return angleOnArc(angle, geom.start, geom.sweep);
  return true;
}

function collectIntersections(target: Geom, others: readonly Geom[]): TrimPoint[] {
  const out: TrimPoint[] = [];
  for (const other of others) {
    for (const point of rawIntersections(target, other)) {
      if (!onGeom(point, target) || !onGeom(point, other))
        continue;
      if (out.some((existing) => Math.hypot(existing.x - point.x, existing.y - point.y) < 1e-7))
        continue;
      out.push(point);
    }
  }
  return out;
}

function refEntityId(ref: SketchRef | undefined): number | undefined {
  if (ref === undefined)
    return undefined;
  if (typeof ref === 'number')
    return ref;
  return 'entity' in ref ? ref.entity : undefined;
}

/**
 * 在 targetId 实体上、以 click（草图局部坐标）所在段执行一次修剪。
 * 无交点 → 整删该实体（Onshape 语义）；有交点 → 移除 click 所在区间并保留
 * 剩余段（第一段沿用原 id，后续段新 id）。不改入参。
 */
export function trimSketchAt(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  targetId: number,
  click: TrimPoint,
): SketchTrimResult {
  const points = new Map<number, TrimPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.x === 'number' && typeof entity.y === 'number')
      points.set(entity.id, { x: entity.x, y: entity.y });
  }
  const targetIndex = entities.findIndex((entity) => entity.id === targetId);
  const targetEntity = targetIndex >= 0 ? entities[targetIndex] : undefined;
  if (!targetEntity)
    return { ok: false, reason: 'not-found', entities: [...entities], constraints: [...constraints], removedEntityIds: [] };
  if (targetEntity.kind !== 'line' && targetEntity.kind !== 'circle' && targetEntity.kind !== 'arc')
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints], removedEntityIds: [] };
  const target = geometryOf(targetEntity, points);
  if (!target)
    return { ok: false, reason: 'not-found', entities: [...entities], constraints: [...constraints], removedEntityIds: [] };

  const others: Geom[] = [];
  for (const entity of entities) {
    if (entity.id === targetId)
      continue;
    const geometry = geometryOf(entity, points);
    if (geometry)
      others.push(geometry);
  }
  const intersections = collectIntersections(target, others);

  let nextId = 1 + entities.reduce((max, entity) => Math.max(max, entity.id), 0);
  const buildLine = (a: TrimPoint, b: TrimPoint, id: number, construction: boolean): SketchEntityDto => ({
    kind: 'line',
    id,
    p1: { x: a.x, y: a.y },
    p2: { x: b.x, y: b.y },
    ...(construction ? { construction: true } : {}),
  });
  const construction = (targetEntity as { construction?: boolean }).construction === true;
  const replacements: SketchEntityDto[] = [];
  let removedWhole = false;

  if (target.kind === 'line') {
    const length = Math.hypot(target.b.x - target.a.x, target.b.y - target.a.y);
    const clickParam = segmentParam(click, target) ?? 0;
    const params = intersections
      .map((point) => segmentParam(point, target))
      .filter((value): value is number => value !== undefined && value > 1e-6 && value < 1 - 1e-6);
    if (params.length === 0) {
      removedWhole = true;
    } else {
      const lo = Math.max(0, ...params.filter((value) => value < clickParam));
      const hi = Math.min(1, ...params.filter((value) => value > clickParam));
      const pointAt = (t: number): TrimPoint => ({
        x: target.a.x + (target.b.x - target.a.x) * t,
        y: target.a.y + (target.b.y - target.a.y) * t,
      });
      if (lo > 1e-6 && lo * length > 1e-7)
        replacements.push(buildLine(target.a, pointAt(lo), targetId, construction));
      if (1 - hi > 1e-6 && (1 - hi) * length > 1e-7)
        replacements.push(buildLine(pointAt(hi), target.b, replacements.length === 0 ? targetId : nextId++, construction));
      if (replacements.length === 0)
        removedWhole = true;
    }
  } else if (target.kind === 'circle') {
    const angles = intersections.map((point) => normalizeAngle(Math.atan2(point.y - target.c.y, point.x - target.c.x)));
    const unique = [...new Set(angles.map((angle) => Number(angle.toFixed(9))))].sort((a, b) => a - b);
    if (unique.length < 2) {
      removedWhole = true;
    } else {
      const clickAngle = normalizeAngle(Math.atan2(click.y - target.c.y, click.x - target.c.x));
      let prev = unique[unique.length - 1]!;
      let next = unique[0]!;
      for (let i = 0; i < unique.length; i++) {
        const start = unique[i]!;
        const end = unique[(i + 1) % unique.length]!;
        const span = normalizeAngle(end - start) || TAU;
        if (normalizeAngle(clickAngle - start) <= span + 1e-9) {
          prev = start;
          next = end;
          break;
        }
      }
      const removedSweep = normalizeAngle(next - prev) || TAU;
      const remainingSweep = TAU - removedSweep;
      if (remainingSweep <= 1e-6) {
        removedWhole = true;
      } else {
        replacements.push({
          kind: 'arc',
          id: targetId,
          center: (targetEntity as { center: number | TrimPoint }).center,
          radius: target.r,
          startAngle: next,
          sweepAngle: remainingSweep,
          ...(construction ? { construction: true } : {}),
        } as SketchEntityDto);
      }
    }
  } else {
    const clickAngle = normalizeAngle(Math.atan2(click.y - target.c.y, click.x - target.c.x));
    const clickParam = arcParam(clickAngle, target.start, target.sweep) ?? 0;
    const params = intersections
      .map((point) => arcParam(normalizeAngle(Math.atan2(point.y - target.c.y, point.x - target.c.x)), target.start, target.sweep))
      .filter((value): value is number => value !== undefined && value > 1e-6 && value < 1 - 1e-6);
    if (params.length === 0) {
      removedWhole = true;
    } else {
      const lo = Math.max(0, ...params.filter((value) => value < clickParam));
      const hi = Math.min(1, ...params.filter((value) => value > clickParam));
      const centerRef = (targetEntity as { center: number | TrimPoint }).center;
      if (lo > 1e-6)
        replacements.push({
          kind: 'arc',
          id: targetId,
          center: centerRef,
          radius: target.r,
          startAngle: target.start,
          sweepAngle: target.sweep * lo,
          ...(construction ? { construction: true } : {}),
        } as SketchEntityDto);
      if (1 - hi > 1e-6)
        replacements.push({
          kind: 'arc',
          id: replacements.length === 0 ? targetId : nextId++,
          center: centerRef,
          radius: target.r,
          startAngle: target.start + target.sweep * hi,
          sweepAngle: target.sweep * (1 - hi),
          ...(construction ? { construction: true } : {}),
        } as SketchEntityDto);
      if (replacements.length === 0)
        removedWhole = true;
    }
  }

  const nextEntities: SketchEntityDto[] = [];
  for (const [index, entity] of entities.entries()) {
    if (index !== targetIndex) {
      nextEntities.push(entity);
      continue;
    }
    if (!removedWhole)
      nextEntities.push(...replacements);
  }
  const nextConstraints = constraints.filter((constraint) =>
    !constraint.refs.some((ref) => refEntityId(ref) === targetId));
  return {
    ok: true,
    entities: nextEntities,
    constraints: nextConstraints,
    removedEntityIds: removedWhole ? [targetId] : [],
  };
}
