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

/** v1.19：数字 ref 查显式点；内联点直接取坐标。 */
function resolvePoint(ref: number | { x: number; y: number }, points: Map<number, SolvedCoord>): SolvedCoord | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

function resolveLineGeom(line: SketchEntityDto & { kind: 'line' }, points: Map<number, SolvedCoord>): LineGeom | undefined {
  const a = resolvePoint(line.p1, points);
  const b = resolvePoint(line.p2, points);
  if (!a || !b) return undefined;
  if (Math.hypot(b.u - a.u, b.v - a.v) <= OFFSET_TOL) return undefined; // 零长退化线
  return { a, b };
}

function resolveArcGeom(arc: SketchEntityDto & { kind: 'arc' }, points: Map<number, SolvedCoord>): ArcGeom | undefined {
  const center = resolvePoint(arc.center, points);
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
      const a = resolvePoint(e.p1, points);
      const b = resolvePoint(e.p2, points);
      if (!a || !b) continue; // 未解算端点不入图
      // 只有数字 ref 才有可寻址 point id；内联端点走几何端点通道 ③。
      if (typeof e.p1 === 'number') own(e.id, 0, e.p1);
      if (typeof e.p2 === 'number') own(e.id, 1, e.p2);
      endpoints.push({ entityId: e.id, which: 0, pos: a }, { entityId: e.id, which: 1, pos: b });
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
    // 端点焊接通道只认数字 point id；结构化 ref（v1.19）由通道③几何重合补位。
    if (typeof r0 !== 'number' || typeof r1 !== 'number') continue;
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

/** 端点切向（切线链模式下判定「光滑相接」；线=方向、弧=角度导数方向）。 */
function endpointTangent(
  entity: SketchEntityDto,
  which: EndpointWhich,
  points: Map<number, SolvedCoord>,
): SolvedCoord | undefined {
  if (entity.kind === 'line') {
    const a = resolvePoint(entity.p1, points);
    const b = resolvePoint(entity.p2, points);
    if (!a || !b) return undefined;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const m = Math.hypot(dx, dy);
    return m === 0 ? undefined : { u: dx / m, v: dy / m };
  }
  if (entity.kind === 'arc') {
    const g = resolveArcGeom(entity, points);
    if (!g) return undefined;
    const th = which === 0 ? g.startAngle : g.startAngle + g.sweepAngle;
    return { u: -Math.sin(th), v: Math.cos(th) };
  }
  return undefined;
}

/**
 * 相接链提取：seed 起沿焊接图 BFS 连通闭包。seed 缺失或非线/弧
 * （circle/point——契约无样条）→ unsupportedKind（工具面拒收 toast）。
 *
 * `tangentOnly`（v1.19，偏移工具默认开）：只在**光滑相接**的端点对之间扩展
 * （切向 |dot|≈1）。Tutorial 2 的右腿起点与基座矩形角点共享坐标但成 90°，
 * 焊接图会把整个基底矩形拉进链 → 偏移产出 6 行而非 Onshape 的 2 行；Onshape
 * 的链选择同样是切线连续语义。默认 false 保留既有焊接图全扩展语义（旧测试）。
 */
export function collectOffsetChain(
  entities: SketchEntityDto[],
  constraints: SketchConstraintDto[],
  seedId: number,
  tolOrOptions: number | { tol?: number; tangentOnly?: boolean } = OFFSET_TOL,
): { ok: true; chain: OffsetChain } | { ok: false; error: OffsetChainError } {
  const opts = typeof tolOrOptions === 'number' ? { tol: tolOrOptions } : tolOrOptions;
  const tol = opts.tol ?? OFFSET_TOL;
  const seed = entities.find((e) => e.id === seedId);
  if (!seed || (seed.kind !== 'line' && seed.kind !== 'arc')) return { ok: false, error: 'unsupportedKind' };

  const points = indexPoints(entities);
  const byId = new Map(entities.map((e) => [e.id, e]));
  let junctions = extractJunctions(entities, constraints, tol);
  if (opts.tangentOnly) {
    // 所有线/弧端点位置（价数判定：三价及以上顶点链在此截断——Onshape 链
    // 传播不跨分支点；Tutorial 2 基底角有三条边共点）。
    const endpointPositions: SolvedCoord[] = [];
    const endpointPos = (entityId: number, which: EndpointWhich): SolvedCoord | undefined => {
      const e = byId.get(entityId);
      if (!e) return undefined;
      if (e.kind === 'line') return resolvePoint(which === 0 ? e.p1 : e.p2, points);
      if (e.kind === 'arc') {
        const g = resolveArcGeom(e, points);
        return g ? (which === 0 ? g.start : g.end) : undefined;
      }
      return undefined;
    };
    for (const e of entities) {
      if (e.kind === 'line') {
        const a = resolvePoint(e.p1, points);
        const b = resolvePoint(e.p2, points);
        if (a) endpointPositions.push(a);
        if (b) endpointPositions.push(b);
      } else if (e.kind === 'arc') {
        const g = resolveArcGeom(e, points);
        if (g) endpointPositions.push(g.start, g.end);
      }
    }
    const valenceAt = (pos: SolvedCoord): number =>
      endpointPositions.filter((p) => Math.hypot(p.u - pos.u, p.v - pos.v) <= tol).length;
    junctions = junctions.filter((j) => {
      const ea = byId.get(j.a.entityId);
      const eb = byId.get(j.b.entityId);
      if (!ea || !eb) return false;
      const ta = endpointTangent(ea, j.a.which, points);
      const tb = endpointTangent(eb, j.b.which, points);
      if (!ta || !tb) return false;
      if (Math.abs(ta.u * tb.u + ta.v * tb.v) < 0.9999) return false;
      const posA = endpointPos(j.a.entityId, j.a.which);
      return posA !== undefined && valenceAt(posA) === 2;
    });
  }
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
    const center = entity.kind === 'circle' ? resolvePoint(entity.center, points) : g?.center;
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
      const p1 = resolvePoint(e.p1, points);
      const p2 = resolvePoint(e.p2, points);
      if (p1 && p2) {
        const abx = p2.u - p1.u;
        const aby = p2.v - p1.v;
        const lenSq = abx * abx + aby * aby;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((hit.u - p1.u) * abx + (hit.v - p1.v) * aby) / lenSq));
        consider(e.id, Math.hypot(hit.u - (p1.u + t * abx), hit.v - (p1.v + t * aby)), 'line', index);
      }
    } else if (e.kind === 'circle') {
      const c = resolvePoint(e.center, points);
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
  const offsetIds: number[] = [];
  const masterIds: number[] = [];

  for (const member of chain.members) {
    if (member.kind === 'line') {
      const g = resolveLineGeom(member, points);
      if (!g) return { ok: false, error: 'unsupportedKind' }; // 未解算/零长成员
      const len = Math.hypot(g.b.u - g.a.u, g.b.v - g.a.v);
      const n = { u: -(g.b.v - g.a.v) / len, v: (g.b.u - g.a.u) / len }; // 单位法向 (−dy,dx)
      const side = (cursor.u - g.a.u) * n.u + (cursor.v - g.a.v) * n.v >= 0 ? 1 : -1; // 光标侧
      const idLine = alloc();
      newEntities.push({
        kind: 'line', id: idLine,
        p1: { x: g.a.u + side * distance * n.u, y: g.a.v + side * distance * n.v },
        p2: { x: g.b.u + side * distance * n.u, y: g.b.v + side * distance * n.v },
      });
      offsetIds.push(idLine);
      masterIds.push(member.id);
    } else if (member.kind === 'arc') {
      const g = resolveArcGeom(member, points);
      if (!g) return { ok: false, error: 'unsupportedKind' }; // 未解算成员
      const side = Math.hypot(cursor.u - g.center.u, cursor.v - g.center.v) > g.radius ? 1 : -1; // 圆外=+1
      const radius2 = g.radius + side * distance;
      if (!(radius2 > OFFSET_TOL)) return { ok: false, error: 'degenerateRadius' }; // 向内偏移坍缩
      const idArc = alloc();
      newEntities.push({
        kind: 'arc', id: idArc,
        center: { x: g.center.u, y: g.center.v },
        radius: radius2, startAngle: g.startAngle, sweepAngle: g.sweepAngle,
      });
      offsetIds.push(idArc);
      masterIds.push(member.id);
    } else {
      // circle/point（契约无样条）在链中 → 拒收（工具面「偏移暂只支持线和圆弧」）。
      return { ok: false, error: 'unsupportedKind' };
    }
  }

  // 链桥：相邻成员的对应端点 coincident（Onshape [38][39] 同构）。
  const memberIndex = new Map<number, number>(masterIds.map((id, i) => [id, i]));
  for (const j of chain.junctions) {
    const ia = memberIndex.get(j.a.entityId);
    const ib = memberIndex.get(j.b.entityId);
    if (ia === undefined || ib === undefined) continue;
    newConstraints.push({
      kind: 'coincident', id: alloc(),
      refs: [
        { entity: offsetIds[ia]!, part: j.a.which === 0 ? 'start' : 'end' },
        { entity: offsetIds[ib]!, part: j.b.which === 0 ? 'start' : 'end' },
      ],
    });
  }

  // Onshape OFFSET 关系：链 ≥2 时以首成员为锚，逐对发出
  // [offsetA, masterA, offsetB, masterB]（Tutorial 2 单次偏移产 2 行：
  // 线16↔线6 + 弧15↔弧7；线16↔线6 + 线14↔线8）。
  // 单成员链保留 parallel+distance / 同心+半径 等价式（v1 契约 offset 需两对）。
  if (masterIds.length >= 2) {
    for (let i = 1; i < masterIds.length; i++) {
      newConstraints.push({
        kind: 'offset', id: alloc(),
        refs: [offsetIds[0]!, masterIds[0]!, offsetIds[i]!, masterIds[i]!],
        value: distance,
      });
    }
  } else if (masterIds.length === 1) {
    const member = chain.members[0]!;
    const off = offsetIds[0]!;
    if (member.kind === 'line') {
      const ref = typeof member.p1 === 'number' ? member.p1 : { entity: member.id, part: 'start' as const };
      newConstraints.push(
        { kind: 'parallel', id: alloc(), refs: [member.id, off] },
        { kind: 'distance', id: alloc(), refs: [ref, { entity: off, part: 'start' }], value: distance },
      );
    } else {
      const arc = member as Extract<SketchEntityDto, { kind: 'arc' }>;
      const radius2 = (arc.radius ?? 0) + distance;
      newConstraints.push(
        { kind: 'coincident', id: alloc(), refs: [{ entity: member.id, part: 'center' }, { entity: off, part: 'center' }] },
        { kind: 'radius', id: alloc(), refs: [off], value: radius2 },
      );
    }
  }

  return { ok: true, draft: { entities: newEntities, constraints: newConstraints, nextId } };
}
