/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图偏移纯逻辑（M6-c T4）：相接链提取（焊接图遍历）+ 闭式偏移 + 约束展开。
 *
 * Onshape 同构（实现路径权威：.superpowers/sdd/onshape-tutorial2-analysis/
 * TUTORIAL2-FULL-STEPS.md §3.1）：偏移工具本质 = 草图域内「造几何+加约束」
 * 复合操作，零内核调用、**求解器零改动**——
 * - 线偏移 = 平行线（整线法向平移 d，方向=光标侧）
 * - 弧偏移 = 同心弧（半径 R±d，角度 span 原样，光标在圆外→R+d / 圆内→R−d）
 * - 约束展开（8 种基元约束精确展开，无 OFFSET 种类）：
 *   线↔线 = parallel + distance（对应端点对，创建坐标下恰为法距 d，与采集
 *   api-features.json [40] DISTANCE=0.75 同构）；
 *   弧↔弧 = 圆心 coincident（同心）+ radius=源±d；
 *   链桥 = 新链段间 coincident（采集 [38][39] 的焊接语义）。
 *
 * **零 core-frontend/core-geometry 依赖**（sketch-constraint-logic.ts 同款
 * 裁决）：弧端点纯三角换算，全函数可 vitest 直测不 mock。
 *
 * v1 边界（诚实登记）：
 * - **只支持线+弧**：seed/链成员为 circle/point（契约无样条实体）→
 *   unsupportedKind 拒收，工具面 toast「偏移暂只支持线和圆弧」。
 * - 焊接图三通道：①coincident(point,point)（线端点焊接，M3-b 矩形拓扑）；
 *   ②两线共享端点 point id（共享端点变体）；③**弧端点几何重合**——契约
 *   arc 无端点实体（仅 center 引用 point），coincident 无法寻址弧端点，
 *   故按解算坐标容差匹配补位（Tutorial 2 的右腿线-小弧-喉线链由此成链，
 *   Onshape「相接实体组」语义的契约内近似）。
 * - 链桥只对**线↔线**相接发 coincident；线↔弧相接不发（弧端点非实体，
 *   约束无法寻址——相切链创建坐标天然对齐无求解位移，契约升级挂账）。
 * - 非相切拐角（两线直角等）纯平移坐标留缝：桥接 coincident 照发（拓扑
 *   正确），创建坐标缝由后端重解算收敛（欠约束族内最近解）；相切链
 *   （Tutorial 2 形态）创建坐标精确满足全部展开约束，零位移。
 */

import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';

/** 局部 2D 点（与 sketch-plane.SketchPoint2 同形；独立声明保持零依赖）。 */
export interface OffsetPoint { u: number; v: number }

/** 链成员端点槽：0=线 p1 / 弧起点；1=线 p2 / 弧终点。 */
export type EndpointWhich = 0 | 1;

/** 相接点对（焊接图边）：两实体的相接端点槽。 */
export interface OffsetJunction {
  a: { entityId: number; which: EndpointWhich };
  b: { entityId: number; which: EndpointWhich };
}

/** 偏移链：seed 起沿焊接图连通闭包（BFS 发现序）。 */
export interface OffsetChain {
  seedId: number;
  members: SketchEntityDto[];
  /** 链内相接点对（桥接展开的输入；跨链的焊接边已滤除）。 */
  junctions: OffsetJunction[];
}

export type OffsetChainError = 'unsupportedKind';

/** 闭式偏移草稿（实体/约束 + 计数器终值——工具按此回滚/续播）。 */
export interface OffsetDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  nextId: number;
}

export type OffsetBuildError = 'unsupportedKind' | 'zeroDistance' | 'degenerateRadius';

/** 几何容差（焊接图几何通道与退化判定共用；草图坐标米制）。 */
export const OFFSET_TOL = 1e-6;

interface SolvedCoord { u: number; v: number }

interface LineGeom { a: SolvedCoord; b: SolvedCoord }
interface ArcGeom {
  center: SolvedCoord;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  start: SolvedCoord;
  end: SolvedCoord;
}

/** point 实体解算坐标索引（无 x/y 的未解算点不入）。 */
function indexPoints(entities: SketchEntityDto[]): Map<number, SolvedCoord> {
  const points = new Map<number, SolvedCoord>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) {
      points.set(e.id, { u: e.x, v: e.y });
    }
  }
  return points;
}

function resolveLineGeom(line: SketchEntityDto & { kind: 'line' }, points: Map<number, SolvedCoord>): LineGeom | undefined {
  const a = points.get(line.p1);
  const b = points.get(line.p2);
  if (!a || !b) return undefined;
  if (Math.hypot(b.u - a.u, b.v - a.v) <= OFFSET_TOL) return undefined; // 零长退化线
  return { a, b };
}

function resolveArcGeom(arc: SketchEntityDto & { kind: 'arc' }, points: Map<number, SolvedCoord>): ArcGeom | undefined {
  const center = points.get(arc.center);
  if (!center || arc.radius === undefined || arc.startAngle === undefined || arc.sweepAngle === undefined) return undefined;
  const start = {
    u: center.u + arc.radius * Math.cos(arc.startAngle),
    v: center.v + arc.radius * Math.sin(arc.startAngle),
  };
  const endAngle = arc.startAngle + arc.sweepAngle;
  const end = {
    u: center.u + arc.radius * Math.cos(endAngle),
    v: center.v + arc.radius * Math.sin(endAngle),
  };
  return { center, radius: arc.radius, startAngle: arc.startAngle, sweepAngle: arc.sweepAngle, start, end };
}

/** 焊接图提取（三通道，文件头）：只在线/弧实体间建边，端点键去重。 */
function extractJunctions(entities: SketchEntityDto[], constraints: SketchConstraintDto[], tol: number): OffsetJunction[] {
  const points = indexPoints(entities);

  // 线端点 → point id 归属表（通道①②）；全部端点解算坐标表（通道③）。
  const pointOwners = new Map<number, Array<{ entityId: number; which: EndpointWhich }>>();
  const endpoints: Array<{ entityId: number; which: EndpointWhich; pos: SolvedCoord }> = [];
  const own = (entityId: number, which: EndpointWhich, pointId: number): void => {
    const list = pointOwners.get(pointId) ?? [];
    list.push({ entityId, which });
    pointOwners.set(pointId, list);
  };
  for (const e of entities) {
    if (e.kind === 'line') {
      if (!points.has(e.p1) || !points.has(e.p2)) continue; // 未解算端点不入图
      own(e.id, 0, e.p1);
      own(e.id, 1, e.p2);
      endpoints.push({ entityId: e.id, which: 0, pos: points.get(e.p1)! }, { entityId: e.id, which: 1, pos: points.get(e.p2)! });
    } else if (e.kind === 'arc') {
      const g = resolveArcGeom(e, points);
      if (!g) continue;
      endpoints.push({ entityId: e.id, which: 0, pos: g.start }, { entityId: e.id, which: 1, pos: g.end });
    }
  }

  const result: OffsetJunction[] = [];
  const seen = new Set<string>();
  const endpointKey = (ref: { entityId: number; which: EndpointWhich }): string => `${ref.entityId}:${ref.which}`;
  const addJunction = (a: { entityId: number; which: EndpointWhich }, b: { entityId: number; which: EndpointWhich }): void => {
    if (a.entityId === b.entityId) return;
    const [k1, k2] = [endpointKey(a), endpointKey(b)].sort();
    const key = `${k1}|${k2}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ a, b });
  };

  // ① coincident(point,point)：线端点焊接约束（M3-b 矩形拓扑）。
  for (const c of constraints) {
    if (c.kind !== 'coincident' || c.refs.length !== 2) continue;
    const r0 = c.refs[0];
    const r1 = c.refs[1];
    if (r0 === undefined || r1 === undefined) continue;
    for (const oa of pointOwners.get(r0) ?? []) {
      for (const ob of pointOwners.get(r1) ?? []) addJunction(oa, ob);
    }
  }
  // ② 共享端点 point id：同一点被两线引用（共享端点变体，无需约束）。
  for (const owners of pointOwners.values()) {
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const a = owners[i];
        const b = owners[j];
        if (a && b) addJunction(a, b);
      }
    }
  }
  // ③ 弧端点几何重合（含线↔弧/弧↔弧；契约 arc 无端点实体的补位通道）。
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const a = endpoints[i];
      const b = endpoints[j];
      if (!a || !b) continue;
      if (Math.hypot(a.pos.u - b.pos.u, a.pos.v - b.pos.v) <= tol) addJunction({ entityId: a.entityId, which: a.which }, { entityId: b.entityId, which: b.which });
    }
  }
  return result;
}

/**
 * 相接链提取：seed 起沿焊接图 BFS 连通闭包。seed 缺失或非线/弧
 * （circle/point——契约无样条）→ unsupportedKind（工具面拒收 toast）。
 */
export function collectOffsetChain(
  entities: SketchEntityDto[],
  constraints: SketchConstraintDto[],
  seedId: number,
  tol: number = OFFSET_TOL,
): { ok: true; chain: OffsetChain } | { ok: false; error: OffsetChainError } {
  const seed = entities.find((e) => e.id === seedId);
  if (!seed || (seed.kind !== 'line' && seed.kind !== 'arc')) return { ok: false, error: 'unsupportedKind' };

  const junctions = extractJunctions(entities, constraints, tol);
  const adjacency = new Map<number, Array<{ entityId: number; which: EndpointWhich }>>();
  for (const j of junctions) {
    const la = adjacency.get(j.a.entityId) ?? [];
    la.push(j.b);
    adjacency.set(j.a.entityId, la);
    const lb = adjacency.get(j.b.entityId) ?? [];
    lb.push(j.a);
    adjacency.set(j.b.entityId, lb);
  }

  const inChain = new Set<number>([seedId]);
  const queue: number[] = [seedId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const nb of adjacency.get(id) ?? []) {
      if (inChain.has(nb.entityId)) continue;
      inChain.add(nb.entityId);
      queue.push(nb.entityId);
    }
  }

  return {
    ok: true,
    chain: {
      seedId,
      members: entities.filter((e) => inChain.has(e.id)),
      junctions: junctions.filter((j) => inChain.has(j.a.entityId) && inChain.has(j.b.entityId)),
    },
  };
}

/**
 * 光标到实体曲线的垂距（偏移距离量取；seed 实体用）：
 * 线=点到线段距（投影夹取）；弧/圆=到圆周距。无解算坐标 → undefined。
 */
export function offsetMeasureDistance(entity: SketchEntityDto, entities: SketchEntityDto[], point: OffsetPoint): number | undefined {
  const points = indexPoints(entities);
  if (entity.kind === 'line') {
    const g = resolveLineGeom(entity, points);
    if (!g) return undefined;
    const abx = g.b.u - g.a.u;
    const aby = g.b.v - g.a.v;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.u - g.a.u) * abx + (point.v - g.a.v) * aby) / lenSq));
    return Math.hypot(point.u - (g.a.u + t * abx), point.v - (g.a.v + t * aby));
  }
  if (entity.kind === 'arc' || entity.kind === 'circle') {
    const g = entity.kind === 'arc' ? resolveArcGeom(entity, points) : undefined;
    const center = entity.kind === 'circle' ? points.get(entity.center) : g?.center;
    const radius = entity.kind === 'circle' ? entity.radius : g?.radius;
    if (!center || radius === undefined) return undefined;
    return Math.abs(Math.hypot(point.u - center.u, point.v - center.v) - radius);
  }
  if (entity.kind === 'point') {
    const c = points.get(entity.id);
    return c ? Math.hypot(point.u - c.u, point.v - c.v) : undefined;
  }
  return undefined;
}

/**
 * 就近偏移种子分辨（约束工具的 resolveNearestEntityId 同构 + **弧参与**）：
 * 弧按到圆周距参与（偏移工具必须能直接拾弧——Tutorial 2 链的弧成员）；
 * 并列序 距离 → kind 优先（point < circle < arc < line）→ 数组序，与
 * sketch-constraint-logic 同一口径外延。无解算坐标 → undefined。
 */
export function resolveNearestOffsetSeedId(entities: SketchEntityDto[], hit: OffsetPoint): number | undefined {
  const points = indexPoints(entities);
  const kindPriority = (kind: SketchEntityDto['kind']): number =>
    kind === 'point' ? 0 : kind === 'circle' ? 1 : kind === 'arc' ? 2 : 3;
  let best: { id: number; dist: number; prio: number; index: number } | undefined;

  const consider = (id: number, dist: number, kind: SketchEntityDto['kind'], index: number): void => {
    const prio = kindPriority(kind);
    if (!best || dist < best.dist
      || (dist === best.dist && (prio < best.prio || (prio === best.prio && index < best.index)))) {
      best = { id, dist, prio, index };
    }
  };

  entities.forEach((e, index) => {
    if (e.kind === 'point') {
      const c = points.get(e.id);
      if (c) consider(e.id, Math.hypot(hit.u - c.u, hit.v - c.v), 'point', index);
    } else if (e.kind === 'line') {
      const p1 = points.get(e.p1);
      const p2 = points.get(e.p2);
      if (p1 && p2) {
        const abx = p2.u - p1.u;
        const aby = p2.v - p1.v;
        const lenSq = abx * abx + aby * aby;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((hit.u - p1.u) * abx + (hit.v - p1.v) * aby) / lenSq));
        consider(e.id, Math.hypot(hit.u - (p1.u + t * abx), hit.v - (p1.v + t * aby)), 'line', index);
      }
    } else if (e.kind === 'circle') {
      const c = points.get(e.center);
      if (c && e.radius !== undefined) consider(e.id, Math.abs(Math.hypot(hit.u - c.u, hit.v - c.v) - e.radius), 'circle', index);
    } else if (e.kind === 'arc') {
      const g = resolveArcGeom(e, points);
      if (g) consider(e.id, Math.abs(Math.hypot(hit.u - g.center.u, hit.v - g.center.v) - g.radius), 'arc', index);
    }
  });

  return best?.id;
}

/**
 * 闭式偏移草稿（纯函数；预览与提交共用——预览即所得）：
 * - 线：法向平移 d（方向=光标侧）→ 2 新 point + 1 新 line；
 *   约束 = parallel(源,新) + distance(源 p1, 新 p1, d)（创建坐标下恰为法距）。
 * - 弧：同心 R±d（光标圆外→+d / 圆内→−d；span 原样）→ 1 新中心 point +
 *   1 新 arc；约束 = coincident(源中心,新中心) + radius(新弧, R±d)。
 * - 链桥：链内线↔线相接 → 新对应端点 coincident（弧相接不发——契约寻址
 *   缺位，文件头 v1 边界）。
 * id 自 startId 起分配（实体与约束共用一支）；任一成员不支持/半径坍缩 →
 * 整体拒收（无部分提交）。
 */
export function buildOffsetDraft(input: {
  chain: OffsetChain;
  /** 全草图实体（链成员坐标解析源）。 */
  entities: SketchEntityDto[];
  distance: number;
  /** 方向裁决点（每实体独立按光标侧）。 */
  cursor: OffsetPoint;
  startId: number;
}): { ok: true; draft: OffsetDraft } | { ok: false; error: OffsetBuildError } {
  const { chain, entities, distance, cursor, startId } = input;
  if (!(distance > OFFSET_TOL)) return { ok: false, error: 'zeroDistance' };

  const points = indexPoints(entities);
  let nextId = startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  // 新线端点地址表（`${entityId}:${which}` → 新 point id；链桥寻址）。
  const newLinePoint = new Map<string, number>();

  for (const member of chain.members) {
    if (member.kind === 'line') {
      const g = resolveLineGeom(member, points);
      if (!g) return { ok: false, error: 'unsupportedKind' }; // 未解算/零长成员
      const len = Math.hypot(g.b.u - g.a.u, g.b.v - g.a.v);
      const n = { u: -(g.b.v - g.a.v) / len, v: (g.b.u - g.a.u) / len }; // 单位法向 (−dy,dx)
      const side = (cursor.u - g.a.u) * n.u + (cursor.v - g.a.v) * n.v >= 0 ? 1 : -1; // 光标侧
      const np1 = { u: g.a.u + side * distance * n.u, v: g.a.v + side * distance * n.v };
      const np2 = { u: g.b.u + side * distance * n.u, v: g.b.v + side * distance * n.v };
      const idP1 = alloc();
      const idP2 = alloc();
      const idLine = alloc();
      newEntities.push(
        { kind: 'point', id: idP1, x: np1.u, y: np1.v },
        { kind: 'point', id: idP2, x: np2.u, y: np2.v },
        { kind: 'line', id: idLine, p1: idP1, p2: idP2 },
      );
      newConstraints.push(
        { kind: 'parallel', id: alloc(), refs: [member.id, idLine] },
        { kind: 'distance', id: alloc(), refs: [member.p1, idP1], value: distance },
      );
      newLinePoint.set(`${member.id}:0`, idP1);
      newLinePoint.set(`${member.id}:1`, idP2);
    } else if (member.kind === 'arc') {
      const g = resolveArcGeom(member, points);
      if (!g) return { ok: false, error: 'unsupportedKind' }; // 未解算成员
      const side = Math.hypot(cursor.u - g.center.u, cursor.v - g.center.v) > g.radius ? 1 : -1; // 圆外=+1
      const radius2 = g.radius + side * distance;
      if (!(radius2 > OFFSET_TOL)) return { ok: false, error: 'degenerateRadius' }; // 向内偏移坍缩
      const idCenter = alloc();
      const idArc = alloc();
      newEntities.push(
        { kind: 'point', id: idCenter, x: g.center.u, y: g.center.v },
        { kind: 'arc', id: idArc, center: idCenter, radius: radius2, startAngle: g.startAngle, sweepAngle: g.sweepAngle },
      );
      newConstraints.push(
        { kind: 'coincident', id: alloc(), refs: [member.center, idCenter] },
        { kind: 'radius', id: alloc(), refs: [idArc], value: radius2 },
      );
    } else {
      // circle/point（契约无样条）在链中 → 拒收（工具面「偏移暂只支持线和圆弧」）。
      return { ok: false, error: 'unsupportedKind' };
    }
  }

  // 链桥：线↔线相接 → 新对应端点 coincident（Onshape [38][39] 焊接同构）。
  for (const j of chain.junctions) {
    const na = newLinePoint.get(`${j.a.entityId}:${j.a.which}`);
    const nb = newLinePoint.get(`${j.b.entityId}:${j.b.which}`);
    if (na === undefined || nb === undefined) continue; // 弧相接：无桥（契约寻址缺位）
    newConstraints.push({ kind: 'coincident', id: alloc(), refs: [na, nb] });
  }

  return { ok: true, draft: { entities: newEntities, constraints: newConstraints, nextId } };
}
