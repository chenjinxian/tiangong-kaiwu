/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图非尺寸约束 → 视口 glyph 锚点（Onshape live，2026-11-12）。
 *
 * 数据源：SketchDto.constraints 中除尺寸外的约束（coincident/horizontal/…）；
 * 实体坐标用解算后的 DTO 局部 (u,v)，经 SketchPlaneDto 坐标架变换到世界，
 * 与草图曲线/尺寸标注同源。锚点规则（live 对拍的口径）：
 * - coincident：引用中的点位（点实体/端点/圆心）平均；无点位取实体代表点平均；
 * - horizontal/vertical：首条线中点；
 * - parallel/perpendicular/equal：两条引用实体代表点平均；
 * - midpoint：线中点（点引用则取点）；
 * - mirror：被镜像实体代表点 + 轴线中点平均；
 * - 其余（tangent/concentric/fixed/offset）：引用实体代表点平均。
 * 不可解析的约束静默跳过（显示层不得因数据缺陷崩死，也不猜测）。
 */
import type { SketchConstraintDto, SketchDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';
import type { SketchConstraintGlyphAnnotation, SketchConstraintGlyphKind } from '@luban-cad/viewer';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

interface LocalPoint { x: number; y: number }

const GLYPH_KIND_BY_CONSTRAINT: Partial<Record<SketchConstraintDto['kind'], SketchConstraintGlyphKind>> = {
  coincident: 'coincident',
  horizontal: 'horizontal',
  vertical: 'vertical',
  parallel: 'parallel',
  perpendicular: 'perpendicular',
  equal: 'equal',
  midpoint: 'midpoint',
  mirror: 'mirror',
  tangent: 'tangent',
  concentric: 'concentric',
  fixed: 'fixed',
  offset: 'offset',
};

interface ResolvedRef {
  /** 引用本身的点（端点/圆心/点实体/原点）；无则缺省。 */
  point?: LocalPoint;
  /** 实体代表点（线中点/圆心/点本身）；用于多条实体平均。 */
  representative?: LocalPoint;
  /** 线端点（midpoint / horizontal 等取中点）。 */
  lineMid?: LocalPoint;
}

function inlinePoint(ref: number | { x: number; y: number }, points: ReadonlyMap<number, LocalPoint>): LocalPoint | undefined {
  if (typeof ref === 'number')
    return points.get(ref);
  if (Number.isFinite(ref.x) && Number.isFinite(ref.y))
    return { x: ref.x, y: ref.y };
  return undefined;
}

function midpoint(a: LocalPoint, b: LocalPoint): LocalPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function resolveEntity(
  entity: SketchEntityDto,
  part: 'entity' | 'start' | 'end' | 'center' | 'point' | 'handle',
  index: number | undefined,
  points: ReadonlyMap<number, LocalPoint>,
): ResolvedRef | undefined {
  switch (entity.kind) {
    case 'point': {
      if (entity.x === undefined || entity.y === undefined)
        return undefined;
      const p = { x: entity.x, y: entity.y };
      return { point: p, representative: p };
    }
    case 'line': {
      const a = inlinePoint(entity.p1, points);
      const b = inlinePoint(entity.p2, points);
      if (!a || !b)
        return undefined;
      const mid = midpoint(a, b);
      if (part === 'start') return { point: a, representative: a };
      if (part === 'end') return { point: b, representative: b };
      return { representative: mid, lineMid: mid };
    }
    case 'circle':
    case 'arc': {
      const center = inlinePoint(entity.center, points);
      if (!center)
        return undefined;
      return { point: part === 'center' ? center : undefined, representative: center };
    }
    case 'spline': {
      if (part === 'point' || part === 'handle') {
        const p = entity.controlPoints[index ?? 0];
        return p ? { point: { x: p.x, y: p.y }, representative: { x: p.x, y: p.y } } : undefined;
      }
      const first = entity.controlPoints[0];
      const last = entity.controlPoints[entity.controlPoints.length - 1];
      if (!first || !last)
        return undefined;
      if (part === 'start') return { point: { x: first.x, y: first.y }, representative: { x: first.x, y: first.y } };
      if (part === 'end') return { point: { x: last.x, y: last.y }, representative: { x: last.x, y: last.y } };
      const mid = midpoint({ x: first.x, y: first.y }, { x: last.x, y: last.y });
      return { representative: mid, lineMid: mid };
    }
  }
}

function resolveRef(
  ref: SketchRef,
  entities: ReadonlyMap<number, SketchEntityDto>,
  points: ReadonlyMap<number, LocalPoint>,
): ResolvedRef | undefined {
  if (typeof ref === 'number') {
    const entity = entities.get(ref);
    return entity ? resolveEntity(entity, 'entity', undefined, points) : undefined;
  }
  if ('origin' in ref)
    return { point: { x: 0, y: 0 }, representative: { x: 0, y: 0 } };
  const entity = entities.get(ref.entity);
  if (!entity)
    return undefined;
  if (ref.part === 'point' || ref.part === 'handle')
    return resolveEntity(entity, ref.part, ref.index, points);
  return resolveEntity(entity, ref.part, undefined, points);
}

function average(points: readonly LocalPoint[]): LocalPoint | undefined {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0)
    return undefined;
  let x = 0, y = 0;
  for (const p of valid) {
    x += p.x;
    y += p.y;
  }
  return { x: x / valid.length, y: y / valid.length };
}

function anchorForConstraint(
  constraint: SketchConstraintDto,
  refs: readonly ResolvedRef[],
): LocalPoint | undefined {
  const pointLike = refs.flatMap((ref) => (ref.point ? [ref.point] : []));
  const representatives = refs.flatMap((ref) => (ref.representative ? [ref.representative] : []));
  const lineMids = refs.flatMap((ref) => (ref.lineMid ? [ref.lineMid] : []));
  switch (constraint.kind) {
    case 'coincident':
      return average(pointLike) ?? average(representatives);
    case 'midpoint':
      return average(lineMids) ?? average(pointLike) ?? average(representatives);
    case 'horizontal':
    case 'vertical':
      return average(lineMids) ?? average(representatives);
    case 'mirror': {
      const entityPoints = refs.slice(0, 1).flatMap((ref) => (ref.representative ? [ref.representative] : []));
      const axisMid = refs.slice(1).flatMap((ref) => (ref.lineMid ? [ref.lineMid] : ref.representative ? [ref.representative] : []));
      return average([...entityPoints, ...axisMid]) ?? average(representatives);
    }
    default:
      return average(representatives);
  }
}

/** SketchDto → 非尺寸约束 glyph 锚点（世界系；尺寸约束不产 glyph）。 */
export function buildSketchConstraintGlyphs(sketch: SketchDto): SketchConstraintGlyphAnnotation[] {
  const frame = sketchPlaneFrameFrom(sketch.plane);
  const entities = new Map<number, SketchEntityDto>();
  const points = new Map<number, LocalPoint>();
  for (const entity of sketch.entities) {
    entities.set(entity.id, entity);
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
      points.set(entity.id, { x: entity.x, y: entity.y });
  }

  const glyphs: SketchConstraintGlyphAnnotation[] = [];
  for (const constraint of sketch.constraints) {
    const kind = GLYPH_KIND_BY_CONSTRAINT[constraint.kind];
    if (!kind)
      continue;
    const refs = constraint.refs
      .map((ref) => resolveRef(ref, entities, points))
      .filter((ref): ref is ResolvedRef => ref !== undefined);
    if (refs.length === 0)
      continue;
    const anchor = anchorForConstraint(constraint, refs);
    if (!anchor)
      continue;
    glyphs.push({
      id: `constraint-${constraint.id}`,
      kind,
      position: frame.toWorld({ u: anchor.x, v: anchor.y }),
    });
  }
  return glyphs;
}

/** glyph 观测/拾取 id → 约束 id（`constraint-<id>`）。 */
export function constraintIdFromGlyphId(id: string): number | null {
  const match = /^constraint-(\d+)$/.exec(id);
  if (!match)
    return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}
