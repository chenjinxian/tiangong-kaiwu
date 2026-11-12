/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图延伸纯逻辑（Onshape Extend 首切片，2026-11-12）。
 *
 * Onshape 帮助（cad.onshape.com/help/Content/Sketch/extend.htm，快捷键 X）：
 * Extend 与 Trim 同一按钮下拉；点击线/弧后，点击新端点或边界几何，把实体
 * 延长到第一个相交/边界几何。本切片实现 **直线端点自动延伸到最近边界**
 * （线/圆/弧）；点击哪一侧就延伸该侧端点。弧/圆/样条作为源实体诚实返回
 * unsupported；找不到边界返回 no-boundary（工具保持，不静默改数据）。
 *
 * 端点若为显式点实体（p1/p2 为点 id），延伸会移动该点实体（共享点语义与
 * Onshape 一致——共享点的其它曲线随之延伸）；内联端点则写回坐标。
 */
import type { SketchEntityDto } from '@luban-cad/shared';

interface LocalPoint { x: number; y: number }

export type ExtendResult =
  | { ok: true; entities: SketchEntityDto[] }
  | { ok: false; reason: 'unsupported' | 'no-boundary' | 'invalid'; entities: SketchEntityDto[] };

const EPS = 1e-9;

function resolvePoint(ref: number | LocalPoint, points: ReadonlyMap<number, LocalPoint>): LocalPoint | undefined {
  if (typeof ref === 'number')
    return points.get(ref);
  if (Number.isFinite(ref.x) && Number.isFinite(ref.y))
    return { x: ref.x, y: ref.y };
  return undefined;
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

/** 点击线 → 延伸最近端点到第一个边界；失败不修改数据。 */
export function extendSketchAt(
  entities: readonly SketchEntityDto[],
  targetId: number,
  click: LocalPoint,
): ExtendResult {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities)
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
      points.set(entity.id, { x: entity.x, y: entity.y });

  const target = entities.find((entity) => entity.id === targetId);
  if (!target)
    return { ok: false, reason: 'invalid', entities: [...entities] };
  if (target.kind !== 'line')
    return { ok: false, reason: 'unsupported', entities: [...entities] };
  const a = resolvePoint(target.p1, points);
  const b = resolvePoint(target.p2, points);
  if (!a || !b)
    return { ok: false, reason: 'invalid', entities: [...entities] };

  const da = Math.hypot(click.x - a.x, click.y - a.y);
  const db = Math.hypot(click.x - b.x, click.y - b.y);
  const endpoint = da <= db ? a : b;
  const other = da <= db ? b : a;
  const len = Math.hypot(endpoint.x - other.x, endpoint.y - other.y);
  if (len < EPS)
    return { ok: false, reason: 'invalid', entities: [...entities] };
  const dir: LocalPoint = { x: (endpoint.x - other.x) / len, y: (endpoint.y - other.y) / len };

  let nearest: { t: number; point: LocalPoint } | undefined;
  for (const entity of entities) {
    if (entity.id === targetId || entity.kind === 'point')
      continue;
    for (const t of rayIntersections(endpoint, dir, entity, points)) {
      if (!nearest || t < nearest.t)
        nearest = { t, point: { x: endpoint.x + dir.x * t, y: endpoint.y + dir.y * t } };
    }
  }
  if (!nearest)
    return { ok: false, reason: 'no-boundary', entities: [...entities] };

  const atA = da <= db;
  const endpointRef = atA ? target.p1 : target.p2;
  if (typeof endpointRef === 'number'
    && !entities.some((entity) => entity.id === endpointRef && entity.kind === 'point'))
    return { ok: false, reason: 'invalid', entities: [...entities] };
  const updated = entities.map((entity) => {
    if (typeof endpointRef === 'number' && entity.id === endpointRef && entity.kind === 'point')
      return { ...entity, x: nearest!.point.x, y: nearest!.point.y };
    if (entity.id === targetId && entity.kind === 'line') {
      const next = { ...entity };
      if (typeof endpointRef === 'number')
        return next;
      if (atA)
        next.p1 = { ...nearest!.point };
      else
        next.p2 = { ...nearest!.point };
      return next;
    }
    return entity;
  });
  return { ok: true, entities: updated };
}
