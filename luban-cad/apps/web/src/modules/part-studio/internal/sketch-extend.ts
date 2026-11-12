/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图延伸纯逻辑（Onshape Extend，2026-11-12）。
 *
 * Onshape 帮助（cad.onshape.com/help/Content/Sketch/extend.htm，快捷键 X）：
 * Extend 与 Trim 同一按钮下拉；先点击要延伸的**线/弧**，再点击新端点位置或
 * 边界几何——有边界时延伸到该边界，没有边界时止于点击位置。
 *
 * 线源：点击侧端点沿远离另一端点方向延伸；弧源：点击侧端点沿圆周（保持
 * 另一端不动）延伸，扫角向点击侧增长。边界支持线/圆/弧（线段范围与弧扫角
 * 均校验）；自由点投影到延伸射线上（线）或圆周上（弧）。圆/样条作为源
 * 诚实返回 unsupported；显式点端点移动点实体（共享点语义）。
 */
import type { SketchEntityDto } from '@luban-cad/shared';

interface LocalPoint { x: number; y: number }

export type ExtendResult =
  | { ok: true; entities: SketchEntityDto[] }
  | { ok: false; reason: 'unsupported' | 'no-boundary' | 'invalid'; entities: SketchEntityDto[] };

export interface ExtendToTarget {
  /** 第二击的草图局部点（自由端点位置；边界命中时也提供用于方向参考）。 */
  point: LocalPoint;
  /** 第二击命中的边界实体 id；缺省=按 point 自由延伸。 */
  boundaryId?: number;
}

interface LineSetup {
  kind: 'line';
  target: SketchEntityDto & { kind: 'line' };
  endpoint: LocalPoint;
  dir: LocalPoint;
  atA: boolean;
}

interface ArcSetup {
  kind: 'arc';
  target: SketchEntityDto & { kind: 'arc' };
  center: LocalPoint;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  /** true=延伸起点（另一端=终点）；false=延伸终点。 */
  atStart: boolean;
  /** 扫角符号（+1 CCW / −1 CW）；延伸端沿此方向增长。 */
  dirSign: 1 | -1;
}

type EndpointSetup = LineSetup | ArcSetup;

const EPS = 1e-9;
const TAU = Math.PI * 2;

function resolvePoint(ref: number | LocalPoint, points: ReadonlyMap<number, LocalPoint>): LocalPoint | undefined {
  if (typeof ref === 'number')
    return points.get(ref);
  if (Number.isFinite(ref.x) && Number.isFinite(ref.y))
    return { x: ref.x, y: ref.y };
  return undefined;
}

function pointMap(entities: readonly SketchEntityDto[]): Map<number, LocalPoint> {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities)
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
      points.set(entity.id, { x: entity.x, y: entity.y });
  return points;
}

function polar(center: LocalPoint, radius: number, angle: number): LocalPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function angleInSweep(angle: number, start: number, sweep: number): boolean {
  if (sweep >= 0) {
    const delta = ((angle - start) % TAU + TAU) % TAU;
    return delta <= sweep + 1e-7;
  }
  const delta = ((start - angle) % TAU + TAU) % TAU;
  return delta <= -sweep + 1e-7;
}

/** 有向角差 → [0,2π)（dir=+1 表示逆时针，-1 顺时针）。 */
function forwardDelta(direction: 1 | -1, from: number, to: number): number {
  const delta = ((direction * (to - from)) % TAU + TAU) % TAU;
  return delta;
}

/** 射线（origin,dir 单位向量）与实体的交点参数 t（>EPS）。 */
function rayIntersections(
  origin: LocalPoint,
  dir: LocalPoint,
  entity: SketchEntityDto,
  points: ReadonlyMap<number, LocalPoint>,
): number[] {
  if (entity.kind === 'line') {
    const a = resolvePoint(entity.p1, points);
    const b = resolvePoint(entity.p2, points);
    if (!a || !b)
      return [];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const det = ex * dir.y - dir.x * ey;
    if (Math.abs(det) <= EPS * (Math.hypot(ex, ey) + 1))
      return [];
    const dx = a.x - origin.x;
    const dy = a.y - origin.y;
    const t = (-dx * ey + ex * dy) / det;
    const u = (dir.x * dy - dir.y * dx) / det;
    if (t > EPS && u >= -1e-7 && u <= 1 + 1e-7)
      return [t];
    return [];
  }
  if (entity.kind === 'circle' || entity.kind === 'arc') {
    const center = resolvePoint(entity.center, points);
    const radius = entity.radius;
    if (!center || typeof radius !== 'number' || radius <= 0)
      return [];
    const fx = origin.x - center.x;
    const fy = origin.y - center.y;
    const b = 2 * (fx * dir.x + fy * dir.y);
    const c = fx * fx + fy * fy - radius * radius;
    const disc = b * b - 4 * c;
    if (disc < 0)
      return [];
    const root = Math.sqrt(disc);
    const ts = [(-b - root) / 2, (-b + root) / 2].filter((t) => t > EPS);
    if (entity.kind === 'circle')
      return ts;
    const start = entity.startAngle ?? 0;
    const sweep = entity.sweepAngle ?? 0;
    return ts.filter((t) => {
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      return angleInSweep(Math.atan2(py - center.y, px - center.x), start, sweep);
    });
  }
  return [];
}

/** 两圆交点（同心/相离/内含 → 空）。 */
function circleCircleIntersections(
  c1: LocalPoint,
  r1: number,
  c2: LocalPoint,
  r2: number,
): LocalPoint[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < EPS)
    return [];
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9)
    return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -1e-9)
    return [];
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1.x + (a * dx) / d;
  const my = c1.y + (a * dy) / d;
  const px = (-dy / d) * h;
  const py = (dx / d) * h;
  return [{ x: mx + px, y: my + py }, { x: mx - px, y: my - py }];
}

/** 圆（center,r）与实体的交点（线按段范围、弧按扫角过滤）。 */
function circleEntityIntersections(
  center: LocalPoint,
  radius: number,
  entity: SketchEntityDto,
  points: ReadonlyMap<number, LocalPoint>,
): LocalPoint[] {
  if (entity.kind === 'line') {
    const a = resolvePoint(entity.p1, points);
    const b = resolvePoint(entity.p2, points);
    if (!a || !b)
      return [];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    const aa = ex * ex + ey * ey;
    if (aa < EPS)
      return [];
    const bb = 2 * (fx * ex + fy * ey);
    const cc = fx * fx + fy * fy - radius * radius;
    const disc = bb * bb - 4 * aa * cc;
    if (disc < 0)
      return [];
    const root = Math.sqrt(disc);
    const us = [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)].filter((u) => u >= -1e-7 && u <= 1 + 1e-7);
    return us.map((u) => ({ x: a.x + ex * u, y: a.y + ey * u }));
  }
  if (entity.kind === 'circle' || entity.kind === 'arc') {
    const otherCenter = resolvePoint(entity.center, points);
    const otherRadius = entity.radius;
    if (!otherCenter || typeof otherRadius !== 'number' || otherRadius <= 0)
      return [];
    const intersections = circleCircleIntersections(center, radius, otherCenter, otherRadius);
    if (entity.kind === 'circle')
      return intersections;
    const start = entity.startAngle ?? 0;
    const sweep = entity.sweepAngle ?? 0;
    return intersections.filter((p) => angleInSweep(Math.atan2(p.y - otherCenter.y, p.x - otherCenter.x), start, sweep));
  }
  return [];
}

/** 第一条点击 → 目标线/弧与点击侧端点/延伸方向。 */
function prepareEndpoint(
  entities: readonly SketchEntityDto[],
  targetId: number,
  click: LocalPoint,
): { setup: EndpointSetup } | { reason: 'unsupported' | 'invalid' } {
  const points = pointMap(entities);
  const target = entities.find((entity) => entity.id === targetId);
  if (!target)
    return { reason: 'invalid' };
  if (target.kind === 'line') {
    const a = resolvePoint(target.p1, points);
    const b = resolvePoint(target.p2, points);
    if (!a || !b)
      return { reason: 'invalid' };
    const da = Math.hypot(click.x - a.x, click.y - a.y);
    const db = Math.hypot(click.x - b.x, click.y - b.y);
    const endpoint = da <= db ? a : b;
    const other = da <= db ? b : a;
    const len = Math.hypot(endpoint.x - other.x, endpoint.y - other.y);
    if (len < EPS)
      return { reason: 'invalid' };
    return {
      setup: {
        kind: 'line',
        target,
        endpoint,
        dir: { x: (endpoint.x - other.x) / len, y: (endpoint.y - other.y) / len },
        atA: da <= db,
      },
    };
  }
  if (target.kind === 'arc') {
    const center = resolvePoint(target.center, points);
    const radius = target.radius;
    if (!center || typeof radius !== 'number' || radius <= 0)
      return { reason: 'invalid' };
    const startAngle = target.startAngle ?? 0;
    const sweepAngle = target.sweepAngle ?? 0;
    if (Math.abs(sweepAngle) < EPS)
      return { reason: 'invalid' };
    const startPoint = polar(center, radius, startAngle);
    const endPoint = polar(center, radius, startAngle + sweepAngle);
    const da = Math.hypot(click.x - startPoint.x, click.y - startPoint.y);
    const db = Math.hypot(click.x - endPoint.x, click.y - endPoint.y);
    return {
      setup: {
        kind: 'arc',
        target,
        center,
        radius,
        startAngle,
        sweepAngle,
        atStart: da <= db,
        dirSign: sweepAngle >= 0 ? 1 : -1,
      },
    };
  }
  return { reason: 'unsupported' };
}

/** 线源候选交点参数（沿延伸射线）；弧源候选有向角差。 */
function setupCandidates(
  entities: readonly SketchEntityDto[],
  setup: EndpointSetup,
  points: Map<number, LocalPoint>,
  onlyId?: number,
): Array<{ amount: number; point: LocalPoint }> {
  const out: Array<{ amount: number; point: LocalPoint }> = [];
  for (const entity of entities) {
    if (entity.id === setup.target.id || entity.kind === 'point')
      continue;
    if (onlyId !== undefined && entity.id !== onlyId)
      continue;
    if (setup.kind === 'line') {
      for (const t of rayIntersections(setup.endpoint, setup.dir, entity, points))
        out.push({ amount: t, point: { x: setup.endpoint.x + setup.dir.x * t, y: setup.endpoint.y + setup.dir.y * t } });
    } else {
      for (const point of circleEntityIntersections(setup.center, setup.radius, entity, points)) {
        const angle = Math.atan2(point.y - setup.center.y, point.x - setup.center.x);
        const direction = setup.atStart ? (setup.dirSign === 1 ? -1 : 1) : setup.dirSign;
        const from = setup.atStart ? setup.startAngle : setup.startAngle + setup.sweepAngle;
        const delta = forwardDelta(direction as 1 | -1, from, angle);
        if (delta > 1e-7 && delta < TAU - 1e-7)
          out.push({ amount: delta, point });
      }
    }
  }
  out.sort((a, b) => a.amount - b.amount);
  return out;
}

function applyCandidate(
  entities: readonly SketchEntityDto[],
  setup: EndpointSetup,
  candidate: { amount: number; point: LocalPoint },
): ExtendResult {
  if (setup.kind === 'line') {
    if (Math.hypot(candidate.point.x - setup.endpoint.x, candidate.point.y - setup.endpoint.y) < EPS)
      return { ok: false, reason: 'invalid', entities: [...entities] };
    const endpointRef = setup.atA ? setup.target.p1 : setup.target.p2;
    if (typeof endpointRef === 'number'
      && !entities.some((entity) => entity.id === endpointRef && entity.kind === 'point'))
      return { ok: false, reason: 'invalid', entities: [...entities] };
    const updated = entities.map((entity) => {
      if (typeof endpointRef === 'number' && entity.id === endpointRef && entity.kind === 'point')
        return { ...entity, x: candidate.point.x, y: candidate.point.y };
      if (entity.id === setup.target.id && entity.kind === 'line') {
        if (typeof endpointRef === 'number')
          return entity;
        const next = { ...entity };
        if (setup.atA)
          next.p1 = { ...candidate.point };
        else
          next.p2 = { ...candidate.point };
        return next;
      }
      return entity;
    });
    return { ok: true, entities: updated };
  }
  const delta = candidate.amount * setup.dirSign;
  const updated = entities.map((entity) => {
    if (entity.id !== setup.target.id || entity.kind !== 'arc')
      return entity;
    const next = { ...entity };
    if (setup.atStart)
      next.startAngle = setup.startAngle - delta;
    next.sweepAngle = setup.sweepAngle + delta;
    return next;
  });
  return { ok: true, entities: updated };
}

/** 自动最近边界（快速路径/单测）：一次点击完成。 */
export function extendSketchAt(
  entities: readonly SketchEntityDto[],
  targetId: number,
  click: LocalPoint,
): ExtendResult {
  const prepared = prepareEndpoint(entities, targetId, click);
  if ('reason' in prepared)
    return { ok: false, reason: prepared.reason, entities: [...entities] };
  const candidates = setupCandidates(entities, prepared.setup, pointMap(entities));
  if (candidates.length === 0)
    return { ok: false, reason: 'no-boundary', entities: [...entities] };
  return applyCandidate(entities, prepared.setup, candidates[0]!);
}

/**
 * Onshape 两相延伸：click=第一击（选线/弧/端点侧），target=第二击。
 * 有 boundaryId → 延伸至该边界的最近候选；否则投影自由端点。
 */
export function extendSketchTo(
  entities: readonly SketchEntityDto[],
  targetId: number,
  click: LocalPoint,
  target: ExtendToTarget,
): ExtendResult {
  const prepared = prepareEndpoint(entities, targetId, click);
  if ('reason' in prepared)
    return { ok: false, reason: prepared.reason, entities: [...entities] };
  if (target.boundaryId !== undefined) {
    if (target.boundaryId === targetId)
      return { ok: false, reason: 'invalid', entities: [...entities] };
    const candidates = setupCandidates(entities, prepared.setup, pointMap(entities), target.boundaryId);
    if (candidates.length === 0)
      return { ok: false, reason: 'no-boundary', entities: [...entities] };
    return applyCandidate(entities, prepared.setup, candidates[0]!);
  }

  if (prepared.setup.kind === 'line') {
    const { endpoint, dir } = prepared.setup;
    const t = (target.point.x - endpoint.x) * dir.x + (target.point.y - endpoint.y) * dir.y;
    if (!(t > EPS))
      return { ok: false, reason: 'invalid', entities: [...entities] };
    return applyCandidate(entities, prepared.setup, {
      amount: t,
      point: { x: endpoint.x + dir.x * t, y: endpoint.y + dir.y * t },
    });
  }
  const { center, radius, startAngle, sweepAngle, atStart, dirSign } = prepared.setup;
  const vx = target.point.x - center.x;
  const vy = target.point.y - center.y;
  if (Math.hypot(vx, vy) < EPS)
    return { ok: false, reason: 'invalid', entities: [...entities] };
  const angle = Math.atan2(vy, vx);
  const direction = atStart ? (dirSign === 1 ? -1 : 1) : dirSign;
  const from = atStart ? startAngle : startAngle + sweepAngle;
  const delta = forwardDelta(direction as 1 | -1, from, angle);
  if (!(delta > 1e-7) || delta >= TAU - 1e-7)
    return { ok: false, reason: 'invalid', entities: [...entities] };
  return applyCandidate(entities, prepared.setup, { amount: delta, point: polar(center, radius, angle) });
}
