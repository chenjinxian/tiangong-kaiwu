/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「使用」纯逻辑（Onshape Use 首切片 2026-11-13）：
 * 把同一 Part Studio 内**其它草图**的 line/point/circle/arc 投影到当前草图，
 * 生成带 `projected` 标记的根实体。后端 `updateSketch` 会对携带标记的实体
 * 实时重投影（SketchProjection.resolveProjectedEntities），派生点/圆心由后端
 * 合成——本模块只负责选择/平面支持判定/根实体快照与 id 分配。
 *
 * 诚实边界：
 * - 仅草图源（实体边/面投影属后端切片 1b，未实现）；
 * - circle/arc 仅在平行平面间保形（非平行是椭圆，后端拒收）；
 * - 样条/投影源/自身 sketch 不入候选。
 */
import type { SketchEntityDto, SketchPlaneDto, SketchProjectedMarker } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export type SketchUseError = 'unsupported-kind' | 'non-parallel' | 'degenerate-source' | 'no-id';

export type SketchUseBuildResult =
  | { ok: true; entity: SketchEntityDto }
  | { ok: false; error: SketchUseError };

export interface SketchUseSourceSketch {
  id: string;
  plane?: SketchPlaneDto;
  entities: readonly SketchEntityDto[];
}

const isPoint = (value: unknown): value is { x: number; y: number } =>
  !!value && typeof value === 'object'
  && typeof (value as { x?: unknown }).x === 'number'
  && typeof (value as { y?: unknown }).y === 'number';

function pointMap(entities: readonly SketchEntityDto[]): Map<number, { x: number; y: number }> {
  const map = new Map<number, { x: number; y: number }>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.x === 'number' && typeof entity.y === 'number')
      map.set(entity.id, { x: entity.x, y: entity.y });
  }
  return map;
}

function resolvePoint(
  ref: number | { x: number; y: number },
  points: ReadonlyMap<number, { x: number; y: number }>,
): { x: number; y: number } | undefined {
  return typeof ref === 'number' ? points.get(ref) : isPoint(ref) ? ref : undefined;
}

/** 候选实体：非投影、线/点/圆/弧（样条后端不支持投影源）。 */
export function isUsableSourceEntity(entity: SketchEntityDto): boolean {
  if (entity.projected !== undefined)
    return false;
  return entity.kind === 'line' || entity.kind === 'point' || entity.kind === 'circle' || entity.kind === 'arc';
}

/** 平行平面（含反向）——圆/弧投影保形的前提（与后端 PARALLEL_TOL 同口径）。 */
export function planesAreParallel(a?: SketchPlaneDto | null, b?: SketchPlaneDto | null): boolean {
  const fa = sketchPlaneFrameFrom(a);
  const fb = sketchPlaneFrameFrom(b);
  const dot = fa.normal.dotProduct(fb.normal);
  return Math.abs(Math.abs(dot) - 1) <= 1e-6;
}

/** 根实体 id：保证 id/id+1/id+2 均未被实体或约束占用（后端保留 +1/+2 给派生点）。 */
export function nextProjectedRootId(
  entities: readonly SketchEntityDto[],
  constraints: readonly { id: number }[],
): number | undefined {
  const used = new Set<number>();
  for (const entity of entities)
    used.add(entity.id);
  for (const constraint of constraints)
    used.add(constraint.id);
  let candidate = 1;
  for (const id of used)
    candidate = Math.max(candidate, id + 1);
  for (let attempt = 0; attempt < used.size + 4; attempt++) {
    if (!used.has(candidate) && !used.has(candidate + 1) && !used.has(candidate + 2))
      return candidate;
    candidate += 1;
  }
  return undefined;
}

function markerOf(source: SketchUseSourceSketch, entityId: number): SketchProjectedMarker {
  return { kind: 'projected', source: { kind: 'sketchEntity', sketchId: source.id, entityId } };
}

/**
 * 生成投影根实体（快照坐标；后端读取时按源当前解重投影覆盖）。
 * 圆/弧非平行平面诚实拒收（不折线化/不椭圆近似）。
 */
export function buildProjectedSketchEntity(
  source: SketchUseSourceSketch,
  entity: SketchEntityDto,
  target: { plane?: SketchPlaneDto; entities: readonly SketchEntityDto[]; constraints: readonly { id: number }[] },
): SketchUseBuildResult {
  if (!isUsableSourceEntity(entity))
    return { ok: false, error: 'unsupported-kind' };
  const rootId = nextProjectedRootId(target.entities, target.constraints);
  if (rootId === undefined)
    return { ok: false, error: 'no-id' };
  const srcFrame = sketchPlaneFrameFrom(source.plane);
  const tgtFrame = sketchPlaneFrameFrom(target.plane);
  const project = (point: { x: number; y: number }): { x: number; y: number } => {
    const local = tgtFrame.toLocal(srcFrame.toWorld({ u: point.x, v: point.y }));
    return { x: local.u, y: local.v };
  };
  const points = pointMap(source.entities);
  const marker = markerOf(source, entity.id);
  const construction = (entity as { construction?: boolean }).construction === true;

  switch (entity.kind) {
    case 'point': {
      if (typeof entity.x !== 'number' || typeof entity.y !== 'number')
        return { ok: false, error: 'degenerate-source' };
      const p = project({ x: entity.x, y: entity.y });
      return { ok: true, entity: { kind: 'point', id: rootId, x: p.x, y: p.y, projected: marker } };
    }
    case 'line': {
      const a = resolvePoint(entity.p1, points);
      const b = resolvePoint(entity.p2, points);
      if (!a || !b)
        return { ok: false, error: 'degenerate-source' };
      const pa = project(a);
      const pb = project(b);
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 1e-12)
        return { ok: false, error: 'degenerate-source' };
      return {
        ok: true,
        entity: {
          kind: 'line', id: rootId, p1: pa, p2: pb, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    case 'circle': {
      const center = resolvePoint(entity.center, points);
      if (!center || typeof entity.radius !== 'number' || entity.radius <= 0)
        return { ok: false, error: 'degenerate-source' };
      if (!planesAreParallel(source.plane, target.plane))
        return { ok: false, error: 'non-parallel' };
      const c = project(center);
      return {
        ok: true,
        entity: {
          kind: 'circle', id: rootId, center: c, radius: entity.radius, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    case 'arc': {
      const center = resolvePoint(entity.center, points);
      if (!center || typeof entity.radius !== 'number' || entity.radius <= 0
        || typeof entity.startAngle !== 'number' || typeof entity.sweepAngle !== 'number')
        return { ok: false, error: 'degenerate-source' };
      if (!planesAreParallel(source.plane, target.plane))
        return { ok: false, error: 'non-parallel' };
      const r = entity.radius;
      const start = entity.startAngle;
      const sweep = entity.sweepAngle;
      const at = (angle: number): { x: number; y: number } => ({
        x: center.x + r * Math.cos(angle),
        y: center.y + r * Math.sin(angle),
      });
      const c = project(center);
      const s = project(at(start));
      const m = project(at(start + sweep / 2));
      const startAngle = Math.atan2(s.y - c.y, s.x - c.x);
      const cross = (s.x - c.x) * (m.y - c.y) - (s.y - c.y) * (m.x - c.x);
      const sweepAngle = (cross >= 0 ? 1 : -1) * Math.abs(sweep);
      return {
        ok: true,
        entity: {
          kind: 'arc', id: rootId, center: c, radius: r, startAngle, sweepAngle, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    default:
      return { ok: false, error: 'unsupported-kind' };
  }
}
