/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图镜像纯逻辑（Onshape Sketch Mirror 首切片）。
 *
 * 证据：Onshape Help「Sketch Mirror」——先选实体再点 Mirror 后选镜像线，或先点
 * Mirror 再选镜像线/实体；镜像线可为草图线（本切片只接草图线；平面/实体面边
 * 属后续外部引用）。本模块只做草图域内「反射几何 + mirror 约束」，零 core 依赖。
 *
 * v1 边界（诚实拒收）：line/point/circle/arc/spline；circle = 圆心 point 对称 +
 * 等半径两条约束；arc = 圆心/起/终点反射 + mirror(arc,arc,axis)（三对点）；
 * spline = 四次控制点反射 + mirror(spline,spline,axis)（四对点；仅三次样条，
 * periodic/非 4 控制点继续拒收）。
 */

import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';

export interface MirrorPoint { u: number; v: number }

export interface MirrorDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  nextId: number;
}

export type MirrorError = 'sameEntity' | 'unsupportedKind' | 'degenerateAxis' | 'degenerateEntity';

const EPS = 1e-9;

function pointOf(
  ref: number | { x: number; y: number },
  points: Map<number, MirrorPoint>,
): MirrorPoint | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

function reflectPoint(p: MirrorPoint, a: MirrorPoint, b: MirrorPoint): MirrorPoint | undefined {
  const dx = b.u - a.u;
  const dy = b.v - a.v;
  const lenSq = dx * dx + dy * dy;
  if (!(lenSq > EPS)) return undefined;
  const t = ((p.u - a.u) * dx + (p.v - a.v) * dy) / lenSq;
  const foot = { u: a.u + t * dx, v: a.v + t * dy };
  return { u: 2 * foot.u - p.u, v: 2 * foot.v - p.v };
}

/**
 * 生成一次镜像的草稿（单实体；工具可连续调用累积）。
 * `startId` 为实体/约束 id 起点，返回 nextId=最后使用 id+1。
 */
export function buildMirrorDraft(input: {
  source: SketchEntityDto;
  axis: SketchEntityDto;
  /** 全草图实体（解析数字端点/圆心引用）。 */
  entities: SketchEntityDto[];
  startId: number;
}): { ok: true; draft: MirrorDraft } | { ok: false; error: MirrorError } {
  const { source, axis, entities, startId } = input;
  if (source.id === axis.id) return { ok: false, error: 'sameEntity' };
  if (axis.kind !== 'line') return { ok: false, error: 'unsupportedKind' };
  if (source.kind !== 'line' && source.kind !== 'point' && source.kind !== 'circle'
    && source.kind !== 'arc' && source.kind !== 'spline')
    return { ok: false, error: 'unsupportedKind' };

  const points = new Map<number, MirrorPoint>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  }
  const axisA = pointOf(axis.p1, points);
  const axisB = pointOf(axis.p2, points);
  if (!axisA || !axisB) return { ok: false, error: 'degenerateAxis' };
  if ((axisB.u - axisA.u) ** 2 + (axisB.v - axisA.v) ** 2 <= EPS) return { ok: false, error: 'degenerateAxis' };

  let nextId = startId;
  const entitiesOut: SketchEntityDto[] = [];
  let constraintsOut: SketchConstraintDto[] = [];
  if (source.kind === 'spline') {
    if (source.periodic === true || source.controlPoints.length !== 4)
      return { ok: false, error: 'unsupportedKind' };
    const reflectedControls = source.controlPoints
      .map((p) => reflectPoint({ u: p.x, v: p.y }, axisA, axisB));
    const reflectedFits = source.fitPoints?.map((p) => reflectPoint({ u: p.x, v: p.y }, axisA, axisB));
    if (reflectedControls.some((p) => p === undefined) || reflectedFits?.some((p) => p === undefined))
      return { ok: false, error: 'degenerateAxis' };
    const mirroredId = nextId++;
    entitiesOut.push({
      kind: 'spline',
      id: mirroredId,
      controlPoints: reflectedControls.map((p) => ({ x: p!.u, y: p!.v })),
      ...(reflectedFits ? { fitPoints: reflectedFits.map((p) => ({ x: p!.u, y: p!.v })) } : {}),
      ...(source.construction ? { construction: true } : {}),
    });
    constraintsOut = [{ kind: 'mirror', id: nextId++, refs: [source.id, mirroredId, axis.id] }];
  } else if (source.kind === 'arc') {

    const center = pointOf(source.center, points);
    if (!center || source.radius === undefined || !(source.radius > EPS)
      || source.startAngle === undefined || source.sweepAngle === undefined)
      return { ok: false, error: 'degenerateEntity' };
    const start = {
      u: center.u + source.radius * Math.cos(source.startAngle),
      v: center.v + source.radius * Math.sin(source.startAngle),
    };
    const endAngle = source.startAngle + source.sweepAngle;
    const end = {
      u: center.u + source.radius * Math.cos(endAngle),
      v: center.v + source.radius * Math.sin(endAngle),
    };
    const rc = reflectPoint(center, axisA, axisB);
    const rs = reflectPoint(start, axisA, axisB);
    const re = reflectPoint(end, axisA, axisB);
    if (!rc || !rs || !re) return { ok: false, error: 'degenerateAxis' };
    const mirroredId = nextId++;
    const startAngle = Math.atan2(rs.v - rc.v, rs.u - rc.u);
    // 反射翻转走向：镜像弧扫角取源扫角相反数；终点因此落回 re。
    const sweepAngle = -source.sweepAngle;
    if (Math.abs(sweepAngle) <= EPS) return { ok: false, error: 'degenerateEntity' };
    entitiesOut.push({
      kind: 'arc',
      id: mirroredId,
      center: { x: rc.u, y: rc.v },
      radius: source.radius,
      startAngle,
      sweepAngle,
      ...(source.construction ? { construction: true } : {}),
    });
    constraintsOut = [{ kind: 'mirror', id: nextId++, refs: [source.id, mirroredId, axis.id] }];
  } else if (source.kind === 'circle') {
    const center = pointOf(source.center, points);
    if (!center) return { ok: false, error: 'degenerateEntity' };
    const reflected = reflectPoint(center, axisA, axisB);
    if (!reflected) return { ok: false, error: 'degenerateAxis' };
    const mirroredId = nextId++;
    entitiesOut.push({
      kind: 'circle',
      id: mirroredId,
      center: { x: reflected.u, y: reflected.v },
      ...(source.radius !== undefined ? { radius: source.radius } : {}),
      ...(source.construction ? { construction: true } : {}),
    });
    constraintsOut = [
      {
        kind: 'mirror',
        id: nextId++,
        refs: [{ entity: source.id, part: 'center' }, { entity: mirroredId, part: 'center' }, axis.id],
      },
      { kind: 'equal', id: nextId++, refs: [source.id, mirroredId] },
    ];
  } else if (source.kind === 'line') {
    const a = pointOf(source.p1, points);
    const b = pointOf(source.p2, points);
    if (!a || !b) return { ok: false, error: 'degenerateEntity' };
    const ra = reflectPoint(a, axisA, axisB);
    const rb = reflectPoint(b, axisA, axisB);
    if (!ra || !rb) return { ok: false, error: 'degenerateAxis' };
    if (Math.hypot(rb.u - ra.u, rb.v - ra.v) <= EPS) return { ok: false, error: 'degenerateEntity' };
    const mirroredId = nextId++;
    entitiesOut.push({
      kind: 'line',
      id: mirroredId,
      p1: { x: ra.u, y: ra.v },
      p2: { x: rb.u, y: rb.v },
      ...(source.construction ? { construction: true } : {}),
    });
    constraintsOut = [{ kind: 'mirror', id: nextId++, refs: [source.id, mirroredId, axis.id] }];
  } else {
    if (source.x === undefined || source.y === undefined) return { ok: false, error: 'degenerateEntity' };
    const r = reflectPoint({ u: source.x, v: source.y }, axisA, axisB);
    if (!r) return { ok: false, error: 'degenerateAxis' };
    const mirroredId = nextId++;
    entitiesOut.push({ kind: 'point', id: mirroredId, x: r.u, y: r.v });
    constraintsOut = [{ kind: 'mirror', id: nextId++, refs: [source.id, mirroredId, axis.id] }];
  }

  return { ok: true, draft: { entities: entitiesOut, constraints: constraintsOut, nextId } };
}

/**
 * 镜像工具的实体拾取（含样条；offset 的 seed picker 只认 point/line/circle/arc）。
 * 距离口径：point 欧氏；circle/arc 径向差；line 点段距；spline 三次 Bezier 采样
 * 折线距（非 4 控制点退回控制多边形）。同距按 point<circle<arc<line<spline、
 * 再按实体序——与 offset 的稳定排序口径同构。
 */
export function resolveNearestMirrorSeedId(entities: readonly SketchEntityDto[], hit: MirrorPoint): number | undefined {
  const points = new Map<number, MirrorPoint>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  }
  const pointOfRef = (ref: number | { x: number; y: number } | undefined): MirrorPoint | undefined =>
    ref === undefined ? undefined : (typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y });
  const priority = (kind: SketchEntityDto['kind']): number =>
    kind === 'point' ? 0 : kind === 'circle' ? 1 : kind === 'arc' ? 2 : kind === 'line' ? 3 : 4;
  let best: { id: number; dist: number; prio: number; index: number } | undefined;
  const consider = (id: number, dist: number, kind: SketchEntityDto['kind'], index: number): void => {
    const prio = priority(kind);
    if (!best || dist < best.dist
      || (dist === best.dist && (prio < best.prio || (prio === best.prio && index < best.index))))
      best = { id, dist, prio, index };
  };
  const segmentDistance = (p: MirrorPoint, a: MirrorPoint, b: MirrorPoint): number => {
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const lenSq = dx * dx + dy * dy;
    if (!(lenSq > EPS)) return Math.hypot(p.u - a.u, p.v - a.v);
    const t = Math.max(0, Math.min(1, ((p.u - a.u) * dx + (p.v - a.v) * dy) / lenSq));
    return Math.hypot(p.u - (a.u + t * dx), p.v - (a.v + t * dy));
  };
  entities.forEach((e, index) => {
    if (e.kind === 'point') {
      const c = points.get(e.id);
      if (c) consider(e.id, Math.hypot(hit.u - c.u, hit.v - c.v), 'point', index);
    } else if (e.kind === 'line') {
      const a = pointOfRef(e.p1);
      const b = pointOfRef(e.p2);
      if (a && b) consider(e.id, segmentDistance(hit, a, b), 'line', index);
    } else if (e.kind === 'circle') {
      const c = pointOfRef(e.center);
      if (c && e.radius !== undefined)
        consider(e.id, Math.abs(Math.hypot(hit.u - c.u, hit.v - c.v) - e.radius), 'circle', index);
    } else if (e.kind === 'arc') {
      const c = pointOfRef(e.center);
      if (c && e.radius !== undefined)
        consider(e.id, Math.abs(Math.hypot(hit.u - c.u, hit.v - c.v) - e.radius), 'arc', index);
    } else if (e.kind === 'spline') {
      const controls = e.controlPoints.map((p) => ({ u: p.x, v: p.y }));
      if (controls.length === 4) {
        const [p0, p1, p2, p3] = controls as [MirrorPoint, MirrorPoint, MirrorPoint, MirrorPoint];
        let previous = p0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 1; i <= 48; i++) {
          const t = i / 48;
          const mt = 1 - t;
          const u = mt * mt * mt * p0.u + 3 * mt * mt * t * p1.u + 3 * mt * t * t * p2.u + t * t * t * p3.u;
          const v = mt * mt * mt * p0.v + 3 * mt * mt * t * p1.v + 3 * mt * t * t * p2.v + t * t * t * p3.v;
          const current = { u, v };
          bestDistance = Math.min(bestDistance, segmentDistance(hit, previous, current));
          previous = current;
        }
        consider(e.id, bestDistance, 'spline', index);
      } else {
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 1; i < controls.length; i++)
          bestDistance = Math.min(bestDistance, segmentDistance(hit, controls[i - 1]!, controls[i]!));
        consider(e.id, bestDistance, 'spline', index);
      }
    }
  });
  return best?.id;
}
