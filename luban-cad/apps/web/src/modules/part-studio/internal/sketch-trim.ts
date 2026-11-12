/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图修剪纯逻辑（Onshape「修剪」首切片）：点击曲线 → 移除「最近交点之间」的
 * 段落；无交点的实体整体删除（Onshape 帮助语义）。支持 line/circle/arc 与
 * 三次贝塞尔样条（controlPoints 恰 4：Onshape Trim 帮助明确支持 Bezier；切除用
 * de Casteljau 精确分裂，交点检测用折线细分近似——档内登记）；periodic/非四次
 * 控制点/投影样条诚实 reason=unsupported，不静默 no-op。
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
interface SplineGeom { kind: 'spline'; p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint] }
type Geom = LineGeom | CircleGeom | ArcGeom | SplineGeom;

const TAU = Math.PI * 2;
const EPS = 1e-9;
/** 贝塞尔交点检测的折线细分数（分裂本身用 de Casteljau 精确解，不受此影响）。 */
const SPLINE_SEGMENTS = 128;

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
    case 'spline': {
      const controls = entity.controlPoints;
      if (!Array.isArray(controls) || controls.length !== 4 || controls.some((control) => !isPoint(control)))
        return undefined;
      return { kind: 'spline', p: controls as [TrimPoint, TrimPoint, TrimPoint, TrimPoint] };
    }
    default:
      return undefined;
  }
}

/** 三次贝塞尔参数点。 */
function cubicPoint(p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint], t: number): TrimPoint {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  };
}

/** 三次贝塞尔折线细分（用于交点检测与点击参数反解）。 */
function tessellateSpline(p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint]): TrimPoint[] {
  const out: TrimPoint[] = [];
  for (let i = 0; i <= SPLINE_SEGMENTS; i++)
    out.push(cubicPoint(p, i / SPLINE_SEGMENTS));
  return out;
}

const lerp = (a: TrimPoint, b: TrimPoint, t: number): TrimPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** de Casteljau 在 t 处分裂三次贝塞尔（返回左右两段控制点；精确保持三次）。 */
function splitCubic(
  p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint],
  t: number,
): [TrimPoint[], TrimPoint[]] {
  const p01 = lerp(p[0], p[1], t);
  const p12 = lerp(p[1], p[2], t);
  const p23 = lerp(p[2], p[3], t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const mid = lerp(p012, p123, t);
  return [
    [p[0], p01, p012, mid],
    [mid, p123, p23, p[3]],
  ];
}

/** 取贝塞尔参数区间 [a,b] 的子曲线控制点（a/b 已夹取到 [0,1]）。 */
function subCubic(
  p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint],
  a: number,
  b: number,
): TrimPoint[] {
  let start = Math.max(0, Math.min(1, a));
  let end = Math.max(0, Math.min(1, b));
  if (end < start) [start, end] = [end, start];
  if (start <= 1e-12)
    return splitCubic(p, end)[0];
  if (end >= 1 - 1e-12)
    return splitCubic(p, start)[1];
  const right = splitCubic(p, start)[1] as [TrimPoint, TrimPoint, TrimPoint, TrimPoint];
  const local = (end - start) / (1 - start);
  return splitCubic(right, local)[0];
}

/** 点在折线上的最近参数（含端点夹取；用于点击/交点参数反解）。 */
function nearestSplineParam(point: TrimPoint, p: readonly [TrimPoint, TrimPoint, TrimPoint, TrimPoint]): number {
  const polyline = tessellateSpline(p);
  let bestT = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const raw = lengthSq < EPS ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    const t = Math.max(0, Math.min(1, raw));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = (i + t) / SPLINE_SEGMENTS;
    }
  }
  return bestT;
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

/** 曲线段上的点是否落在折线容差内（样条交点由折线细分产生，容差取 1e-6 米）。 */
function onSpline(point: TrimPoint, spline: SplineGeom): boolean {
  const polyline = tessellateSpline(spline.p);
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq < EPS ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    if (Math.hypot(point.x - px, point.y - py) <= 1e-6)
      return true;
  }
  return false;
}

function segmentPairs(spline: SplineGeom): LineGeom[] {
  const polyline = tessellateSpline(spline.p);
  const segments: LineGeom[] = [];
  for (let i = 0; i < polyline.length - 1; i++)
    segments.push({ kind: 'line', a: polyline[i]!, b: polyline[i + 1]! });
  return segments;
}

/** 样条参与的交点：把样条边折线化后与对方（线/圆/弧/样条）逐段求交。 */
function splineIntersections(target: Geom, other: Geom): TrimPoint[] {
  const out: TrimPoint[] = [];
  if (target.kind === 'spline') {
    for (const segment of segmentPairs(target)) {
      if (other.kind === 'spline') {
        for (const otherSegment of segmentPairs(other))
          out.push(...lineLine(segment, otherSegment));
      } else {
        out.push(...rawIntersections(segment, other));
      }
    }
  } else {
    for (const segment of segmentPairs(other as SplineGeom))
      out.push(...rawIntersections(target, segment));
  }
  return out;
}

function rawIntersections(target: Geom, other: Geom): TrimPoint[] {
  if (target.kind === 'spline' || other.kind === 'spline')
    return splineIntersections(target, other);
  const circleOf = (geom: Geom): { c: TrimPoint; r: number } | undefined =>
    geom.kind === 'line' || geom.kind === 'spline' ? undefined : { c: geom.c, r: geom.r };
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
  if (geom.kind === 'spline')
    return onSpline(point, geom);
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
  if (targetEntity.kind !== 'line' && targetEntity.kind !== 'circle' && targetEntity.kind !== 'arc' && targetEntity.kind !== 'spline')
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints], removedEntityIds: [] };
  if (targetEntity.kind === 'spline') {
    const controls = targetEntity.controlPoints;
    const cubic = Array.isArray(controls) && controls.length === 4 && controls.every((control) => isPoint(control));
    if (!cubic || targetEntity.periodic === true || targetEntity.projected !== undefined)
      return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints], removedEntityIds: [] };
  }
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
  const buildSpline = (controls: readonly TrimPoint[], id: number, construction: boolean): SketchEntityDto => ({
    kind: 'spline',
    id,
    controlPoints: controls.map((control) => ({ x: control.x, y: control.y })),
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
  } else if (target.kind === 'arc') {
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
  } else {
    // 三次贝塞尔样条：参数域 [0,1]；交点参数由折线细分反解（容差 1e-5），
    // 保留段用 de Casteljau 精确分裂（次数/控制点语义保持，fitPoints 丢弃）。
    const clickParam = nearestSplineParam(click, target.p);
    const params = intersections
      .map((point) => nearestSplineParam(point, target.p))
      .filter((value) => value > 1e-6 && value < 1 - 1e-6)
      .sort((a, b) => a - b)
      .filter((value, index, list) => index === 0 || value - list[index - 1]! > 1e-5);
    if (params.length === 0) {
      removedWhole = true;
    } else {
      const lo = Math.max(0, ...params.filter((value) => value < clickParam));
      const hi = Math.min(1, ...params.filter((value) => value > clickParam));
      if (lo > 1e-6)
        replacements.push(buildSpline(subCubic(target.p, 0, lo), targetId, construction));
      if (1 - hi > 1e-6)
        replacements.push(buildSpline(
          subCubic(target.p, hi, 1),
          replacements.length === 0 ? targetId : nextId++,
          construction,
        ));
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

export interface SketchSplitResult {
  ok: boolean;
  reason?: 'not-found' | 'unsupported' | 'no-change';
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  /** 线分割时新分配的共享点实体 id。 */
  pointId?: number;
}

/**
 * 草图分割（Onshape「分割」首切片 2026-11-13）：在点击处把曲线断成两段。
 * 线/圆弧/三次贝塞尔样条；圆（单点分割结果形态无 live 证据）、periodic/投影
 * 样条、端点附近点击 → 诚实拒收/无变更。约束口径同修剪：移除引用原实体的
 * 约束（整段尺寸不再对一半几何成立），由后端重解算兜底。
 */
export function splitSketchAt(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  targetId: number,
  click: TrimPoint,
): SketchSplitResult {
  const points = new Map<number, TrimPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.x === 'number' && typeof entity.y === 'number')
      points.set(entity.id, { x: entity.x, y: entity.y });
  }
  const targetIndex = entities.findIndex((entity) => entity.id === targetId);
  const targetEntity = targetIndex >= 0 ? entities[targetIndex] : undefined;
  if (!targetEntity)
    return { ok: false, reason: 'not-found', entities: [...entities], constraints: [...constraints] };
  if (targetEntity.kind !== 'line' && targetEntity.kind !== 'arc' && targetEntity.kind !== 'spline')
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };
  if (targetEntity.kind === 'spline') {
    const controls = targetEntity.controlPoints;
    const cubic = Array.isArray(controls) && controls.length === 4 && controls.every((control) => isPoint(control));
    if (!cubic || targetEntity.periodic === true)
      return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };
  }
  if ((targetEntity as { projected?: unknown }).projected !== undefined)
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };
  const target = geometryOf(targetEntity, points);
  if (!target)
    return { ok: false, reason: 'not-found', entities: [...entities], constraints: [...constraints] };

  let nextId = 1 + entities.reduce((max, entity) => Math.max(max, entity.id), 0);
  for (const constraint of constraints)
    nextId = Math.max(nextId, constraint.id + 1);
  const construction = (targetEntity as { construction?: boolean }).construction === true;
  let first: SketchEntityDto | undefined;
  let second: SketchEntityDto | undefined;
  let pointEntity: SketchEntityDto | undefined;

  if (target.kind === 'line') {
    const param = segmentParam(click, target);
    if (param === undefined || param <= 1e-4 || param >= 1 - 1e-4)
      return { ok: false, reason: 'no-change', entities: [...entities], constraints: [...constraints] };
    const splitId = nextId++;
    const splitPoint = {
      x: target.a.x + (target.b.x - target.a.x) * param,
      y: target.a.y + (target.b.y - target.a.y) * param,
    };
    pointEntity = { kind: 'point', id: splitId, x: splitPoint.x, y: splitPoint.y };
    const source = targetEntity as { p1: number | TrimPoint; p2: number | TrimPoint };
    first = {
      kind: 'line',
      id: targetId,
      p1: source.p1,
      p2: splitId,
      ...(construction ? { construction: true } : {}),
    };
    second = {
      kind: 'line',
      id: nextId++,
      p1: splitId,
      p2: source.p2,
      ...(construction ? { construction: true } : {}),
    };
  } else if (target.kind === 'arc') {
    const clickAngle = normalizeAngle(Math.atan2(click.y - target.c.y, click.x - target.c.x));
    const param = arcParam(clickAngle, target.start, target.sweep);
    if (param === undefined || param <= 1e-4 || param >= 1 - 1e-4)
      return { ok: false, reason: 'no-change', entities: [...entities], constraints: [...constraints] };
    const centerRef = (targetEntity as { center: number | TrimPoint }).center;
    first = {
      kind: 'arc',
      id: targetId,
      center: centerRef,
      radius: target.r,
      startAngle: target.start,
      sweepAngle: target.sweep * param,
      ...(construction ? { construction: true } : {}),
    };
    second = {
      kind: 'arc',
      id: nextId++,
      center: centerRef,
      radius: target.r,
      startAngle: target.start + target.sweep * param,
      sweepAngle: target.sweep * (1 - param),
      ...(construction ? { construction: true } : {}),
    };
  } else if (target.kind === 'spline') {
    const param = nearestSplineParam(click, target.p);
    if (param <= 1e-4 || param >= 1 - 1e-4)
      return { ok: false, reason: 'no-change', entities: [...entities], constraints: [...constraints] };
    const [left, right] = splitCubic(target.p, param);
    const buildSpline = (controls: readonly TrimPoint[], id: number): SketchEntityDto => ({
      kind: 'spline',
      id,
      controlPoints: controls.map((control) => ({ x: control.x, y: control.y })),
      ...(construction ? { construction: true } : {}),
    });
    first = buildSpline(left, targetId);
    second = buildSpline(right, nextId++);
  } else {
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };
  }

  if (!first || !second)
    return { ok: false, reason: 'no-change', entities: [...entities], constraints: [...constraints] };
  const nextEntities: SketchEntityDto[] = [];
  for (const [index, entity] of entities.entries()) {
    if (index === targetIndex) {
      nextEntities.push(first);
      continue;
    }
    nextEntities.push(entity);
  }
  // 第二段插在原实体之后（保持树序直观），线分割的共享点附在尾部。
  const insertion = nextEntities.findIndex((entity) => entity.id === targetId) + 1;
  nextEntities.splice(insertion, 0, second);
  if (pointEntity)
    nextEntities.push(pointEntity);
  const nextConstraints = constraints.filter((constraint) =>
    !constraint.refs.some((ref) => refEntityId(ref) === targetId));
  return {
    ok: true,
    entities: nextEntities,
    constraints: nextConstraints,
    ...(pointEntity ? { pointId: pointEntity.id } : {}),
  };
}
