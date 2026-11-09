/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * v1.19：绘制工具自动重合（Onshape 端点推断吸附 → 自动 coincident 同构）。
 *
 * 为什么需要：结构化子实体引用（v1.19）让线端点/弧端点/样条控制点成为隐式
 * 子元素；两个实体端点落在同一坐标时，就近拾取器对两点等距、只能按实体序
 * 先到先得，用户无法在 coincident 工具里再拾取「另一侧」端点。Onshape 的
 * 处理方式是在绘制时以推断吸附自动落重合关系——本模块在草图绘制提交前，
 * 对**新实体端点**与**既有实体端点**做同坐标扫描，命中即补一条结构化
 * coincident。Tutorial 2 的 [14][16][18][45][46] 即此来源（[38][39] 由偏移
 * 工具自身链桥产出）。
 *
 * 边界（诚实登记）：
 * - 只扫描端点（line p1/p2、arc start/end、spline 首/末控制点）；圆心/样条
 *   内部句柄不做推断焊接（避免把「落在圆心上的自由端点」意外锁死）。
 * - 焊接目标只含既有草图实体（新实体彼此不焊——矩形四角已有工具内建关系）。
 * - 容差 AUTO_WELD_TOL（mm）：覆盖真实鼠标取点的亚像素误差（实测 ~0.5mm @
 *   当前取景），远小于 T2 实体间距（≥3mm）。
 * - 既有重合关系已覆盖同一对 ref 时跳过（幂等，防重复行改变 18/48 字面计数）。
 */

import type { SketchConstraintDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';

/** 自动焊接容差（草图 mm 单位；见文件头边界）。 */
export const AUTO_WELD_TOL = 1.0;

interface EndpointCandidate {
  ref: SketchRef;
  x: number;
  y: number;
}

type Point2 = { x: number; y: number };

function resolvePoint(ref: number | Point2 | undefined, points: Map<number, Point2>): Point2 | undefined {
  if (ref === undefined) return undefined;
  return typeof ref === 'number' ? points.get(ref) : ref;
}

/** 可见 point 实体的解算坐标索引（数字 ref 端点解析源）。 */
function indexPoints(entities: SketchEntityDto[]): Map<number, Point2> {
  const points = new Map<number, Point2>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) points.set(e.id, { x: e.x, y: e.y });
  }
  return points;
}

/** 实体端点（焊接目标/焊接来源共用）：line 两端、arc 起止、spline 首末控制点。 */
function entityEndpoints(entity: SketchEntityDto, points: Map<number, Point2>): EndpointCandidate[] {
  if (entity.kind === 'point') {
    return entity.x === undefined || entity.y === undefined
      ? []
      : [{ ref: entity.id, x: entity.x, y: entity.y }];
  }
  if (entity.kind === 'line') {
    const out: EndpointCandidate[] = [];
    const a = resolvePoint(entity.p1, points);
    const b = resolvePoint(entity.p2, points);
    if (a) out.push({ ref: typeof entity.p1 === 'number' ? entity.p1 : { entity: entity.id, part: 'start' }, ...a });
    if (b) out.push({ ref: typeof entity.p2 === 'number' ? entity.p2 : { entity: entity.id, part: 'end' }, ...b });
    return out;
  }
  if (entity.kind === 'arc') {
    const center = resolvePoint(entity.center, points);
    const { radius, startAngle, sweepAngle } = entity;
    if (!center || radius === undefined || startAngle === undefined || sweepAngle === undefined) return [];
    const at = (angle: number): Point2 => ({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
    return [
      { ref: { entity: entity.id, part: 'start' }, ...at(startAngle) },
      { ref: { entity: entity.id, part: 'end' }, ...at(startAngle + sweepAngle) },
    ];
  }
  if (entity.kind === 'spline') {
    const c = entity.controlPoints;
    if (c.length < 2) return [];
    return [
      { ref: { entity: entity.id, part: 'start' }, ...c[0]! },
      { ref: { entity: entity.id, part: 'end' }, ...c[c.length - 1]! },
    ];
  }
  return [];
}

/** point 实体作为焊接目标（可见点；数字 ref 形态）。 */
function pointCandidates(entities: SketchEntityDto[]): EndpointCandidate[] {
  return entities.flatMap((e) =>
    e.kind === 'point' && e.x !== undefined && e.y !== undefined ? [{ ref: e.id, x: e.x, y: e.y }] : []);
}

/** ref 对键（顺序无关；用于幂等去重）。 */
function pairKey(a: SketchRef, b: SketchRef): string {
  const [k1, k2] = [JSON.stringify(a), JSON.stringify(b)].sort();
  return `${k1}|${k2}`;
}

/** 点到线段距离；垂足在段外返回 undefined（不把“延长线附近”焊成点在线）。 */
function pointOnSegmentDistance(
  p: Point2,
  a: Point2,
  b: Point2,
): number | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (!(lenSq > 1e-12)) return undefined;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0 || t > 1) return undefined;
  const fx = a.x + t * dx;
  const fy = a.y + t * dy;
  return Math.hypot(p.x - fx, p.y - fy);
}

/**
 * 为新实体端点生成自动 coincident 行。
 *
 * @param newEntities   本次绘制草稿的新实体（不含既有草图实体）
 * @param existingEntities 提交前草图既有实体（焊接目标来源）
 * @param existingConstraints 既有约束（去重：已覆盖同一对 ref 不重复落行）
 * @param opts.startConstraintId 新约束起始 id（工具 id 计数器分配后传入）
 */
export function autoWeldConstraints(
  newEntities: SketchEntityDto[],
  existingEntities: SketchEntityDto[],
  existingConstraints: SketchConstraintDto[],
  opts: { startConstraintId: number; tol?: number },
): SketchConstraintDto[] {
  const tol = opts.tol ?? AUTO_WELD_TOL;
  const existingPoints = indexPoints(existingEntities);
  const targets = [
    ...pointCandidates(existingEntities),
    ...existingEntities.flatMap((e) => entityEndpoints(e, existingPoints)),
  ];
  const newPoints = indexPoints(newEntities);
  const covered = new Set<string>();
  for (const c of existingConstraints) {
    if (c.kind === 'coincident' && c.refs.length === 2) covered.add(pairKey(c.refs[0]!, c.refs[1]!));
  }

  const out: SketchConstraintDto[] = [];
  let nextId = opts.startConstraintId;
  const existingLines = existingEntities.flatMap((entity) => {
    if (entity.kind !== 'line') return [];
    const a = resolvePoint(entity.p1, existingPoints);
    const b = resolvePoint(entity.p2, existingPoints);
    return a && b ? [{ id: entity.id, a, b }] : [];
  });
  const existingCircles = existingEntities.flatMap((entity) => {
    if (entity.kind !== 'circle' || entity.radius === undefined) return [];
    const center = resolvePoint(entity.center, existingPoints);
    return center ? [{ id: entity.id, center, radius: entity.radius }] : [];
  });
  for (const entity of newEntities) {
    let welded = false;
    for (const endpoint of entityEndpoints(entity, newPoints)) {
      let best: EndpointCandidate | undefined;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const target of targets) {
        const d = Math.hypot(target.x - endpoint.x, target.y - endpoint.y);
        if (d <= tol && d < bestDist) {
          best = target;
          bestDist = d;
        }
      }
      if (!best) continue;
      const key = pairKey(endpoint.ref, best.ref);
      if (covered.has(key)) continue;
      covered.add(key);
      out.push({ kind: 'coincident', id: nextId++, refs: [endpoint.ref, best.ref] });
      welded = true;
    }
    // v1.59：点实体落在既有线内部 → point-on-line coincident（Onshape 推断同构）。
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined && !welded) {
      let best: { id: number; distance: number } | undefined;
      for (const line of existingLines) {
        const distance = pointOnSegmentDistance({ x: entity.x, y: entity.y }, line.a, line.b);
        if (distance !== undefined && distance <= tol && (best === undefined || distance < best.distance))
          best = { id: line.id, distance };
      }
      if (best !== undefined) {
        const key = pairKey(entity.id, best.id);
        if (!covered.has(key)) {
          covered.add(key);
          out.push({ kind: 'coincident', id: nextId++, refs: [entity.id, best.id] });
        }
        welded = true;
      }
      if (!welded) {
        // 整圆边界：point-on-circle 由 coincident(point, circle) 表达（弧只支持端点重合，
        // 不做 point-on-arc 冒充）。
        let bestCircle: { id: number; distance: number } | undefined;
        for (const circle of existingCircles) {
          const distance = Math.abs(
            Math.hypot(entity.x - circle.center.x, entity.y - circle.center.y) - circle.radius,
          );
          if (distance <= tol && (bestCircle === undefined || distance < bestCircle.distance))
            bestCircle = { id: circle.id, distance };
        }
        if (bestCircle !== undefined) {
          const key = pairKey(entity.id, bestCircle.id);
          if (!covered.has(key)) {
            covered.add(key);
            out.push({ kind: 'coincident', id: nextId++, refs: [entity.id, bestCircle.id] });
          }
        }
      }
    }
  }
  return out;
}
