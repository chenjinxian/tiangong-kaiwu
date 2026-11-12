/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图延伸纯逻辑（Onshape Extend，2026-11-12）。
 *
 * Onshape 帮助（cad.onshape.com/help/Content/Sketch/extend.htm，快捷键 X）：
 * Extend 与 Trim 同一按钮下拉；**先点击要延伸的线/弧**，再点击新端点位置或
 * 边界几何——有边界时延伸到该边界，没有边界时止于点击位置。
 *
 * 本切片实现直线源的两相延伸：
 * - `extendSketchAt`（自动最近边界）：点击线一次，沿远离另一端点方向取全图
 *   最近边界（保留给快速路径/单测）；
 * - `extendSketchTo`（Onshape 两相）：第一击选线，第二击给边界实体 id 或自由
 *   点——边界按该实体求最近交点，自由点投影到延伸射线上。
 * 弧/圆/样条作为源实体诚实返回 unsupported；端点若为显式点实体则移动该点
 * （共享点语义）。
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

interface EndpointSetup {
  target: SketchEntityDto & { kind: 'line' };
  endpoint: LocalPoint;
  dir: LocalPoint;
  atA: boolean;
}

const EPS = 1e-9;

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

function angleInSweep(angle: number, start: number, sweep: number): boolean {
  const tau = Math.PI * 2;
  if (sweep >= 0) {
    const delta = ((angle - start) % tau + tau) % tau;
    return delta <= sweep + 1e-7;
  }
  const delta = ((start - angle) % tau + tau) % tau;
  return delta <= -sweep + 1e-7;
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

/** 第一条点击 → 目标线与点击侧端点/延伸方向。 */
function prepareEndpoint(
  entities: readonly SketchEntityDto[],
  targetId: number,
  click: LocalPoint,
): { setup: EndpointSetup } | { reason: 'unsupported' | 'invalid' } {
  const points = pointMap(entities);
  const target = entities.find((entity) => entity.id === targetId);
  if (!target)
    return { reason: 'invalid' };
  if (target.kind !== 'line')
    return { reason: 'unsupported' };
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
      target: target as SketchEntityDto & { kind: 'line' },
      endpoint,
      dir: { x: (endpoint.x - other.x) / len, y: (endpoint.y - other.y) / len },
      atA: da <= db,
    },
  };
}

function applyEndpoint(
  entities: readonly SketchEntityDto[],
  setup: EndpointSetup,
  point: LocalPoint,
): ExtendResult {
  const endpointRef = setup.atA ? setup.target.p1 : setup.target.p2;
  // 端点无移动 → 无效（避免假成功）。
  if (Math.hypot(point.x - setup.endpoint.x, point.y - setup.endpoint.y) < EPS)
    return { ok: false, reason: 'invalid', entities: [...entities] };
  if (typeof endpointRef === 'number'
    && !entities.some((entity) => entity.id === endpointRef && entity.kind === 'point'))
    return { ok: false, reason: 'invalid', entities: [...entities] };
  const updated = entities.map((entity) => {
    if (typeof endpointRef === 'number' && entity.id === endpointRef && entity.kind === 'point')
      return { ...entity, x: point.x, y: point.y };
    if (entity.id === setup.target.id && entity.kind === 'line') {
      if (typeof endpointRef === 'number')
        return entity;
      const next = { ...entity };
      if (setup.atA)
        next.p1 = { ...point };
      else
        next.p2 = { ...point };
      return next;
    }
    return entity;
  });
  return { ok: true, entities: updated };
}

function nearestAcross(
  entities: readonly SketchEntityDto[],
  setup: EndpointSetup,
  points: Map<number, LocalPoint>,
  onlyId?: number,
): number | undefined {
  let best: number | undefined;
  for (const entity of entities) {
    if (entity.id === setup.target.id || entity.kind === 'point')
      continue;
    if (onlyId !== undefined && entity.id !== onlyId)
      continue;
    for (const t of rayIntersections(setup.endpoint, setup.dir, entity, points))
      if (best === undefined || t < best)
        best = t;
  }
  return best;
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
  const t = nearestAcross(entities, prepared.setup, pointMap(entities));
  if (t === undefined)
    return { ok: false, reason: 'no-boundary', entities: [...entities] };
  const point = {
    x: prepared.setup.endpoint.x + prepared.setup.dir.x * t,
    y: prepared.setup.endpoint.y + prepared.setup.dir.y * t,
  };
  return applyEndpoint(entities, prepared.setup, point);
}

/**
 * Onshape 两相延伸：click=第一击（选线/定端点侧），target=第二击。
 * 有 boundaryId → 延伸至该边界的最近交点；否则投影到射线上的自由端点。
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
  const points = pointMap(entities);
  let t: number | undefined;
  if (target.boundaryId !== undefined) {
    if (target.boundaryId === targetId)
      return { ok: false, reason: 'invalid', entities: [...entities] };
    t = nearestAcross(entities, prepared.setup, points, target.boundaryId);
    if (t === undefined)
      return { ok: false, reason: 'no-boundary', entities: [...entities] };
  } else {
    t = (target.point.x - prepared.setup.endpoint.x) * prepared.setup.dir.x
      + (target.point.y - prepared.setup.endpoint.y) * prepared.setup.dir.y;
    if (!(t > EPS))
      return { ok: false, reason: 'invalid', entities: [...entities] };
  }
  const point = {
    x: prepared.setup.endpoint.x + prepared.setup.dir.x * t,
    y: prepared.setup.endpoint.y + prepared.setup.dir.y * t,
  };
  return applyEndpoint(entities, prepared.setup, point);
}
