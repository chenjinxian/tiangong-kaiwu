/**
 * 草图槽——含圆弧的混合线树（ADR-0022 §2.15 扩展，2026-11-20 live S2u）。
 *
 * live 证据（私有 `SLOT-S2O-TREE-COMPONENTS-LIVE-20261120.md` §4b；
 * `ui-evidence/slot-variants-20261120/s2u-arcbranch-*.dxf`）：
 * - 输入：毂 P 处 **1 弧 + 2 线**（弧 P→T 为 CCW 圆弧、两线 P→A/P→B）。
 * - 结果（w=20）：源 3 曲线保留；每条线两侧平行边界（窄缺口斜接/宽缺口
 *   毂弧同直线树规则）；圆弧两侧同心边界（内 r−10=96.785、外 r+10=116.785）；
 *   弧自由端半圆帽 r=10（圆心=弧端点）；弧线与线 A 的宽缺口 → 绕毂弧
 *   r=10 扫 11.9619°（角度=两臂**朝向偏移法线**的夹角）；弧线与线 B 的窄
 *   缺口 → 线 B 边界与内弧（r−10）的**交点**（内弧被裁剪到 122.127°）。
 *
 * 规则：所有臂在顶点用「朝臂方向」帧（直线=指向另一端点；圆弧=端点处切线
 * 朝弧内），facing offset = 端点 ± w/2·法线；窄缺口取两条边界曲线（直线/
 * 圆）交点，宽缺口取绕毂 r=w/2 圆弧（扫角=各臂背面半平面交集）。圆弧边界
 * = 与源弧同心的同心弧（半径由端点偏移点确定；只允许在源扫角内裁剪，不允许
 * 外延——未采证据）。
 *
 * 范围（证据边界）：单连通无环树、**恰一条圆弧臂**（≥2 条直线臂，至少一个
 * 度 ≥3 顶点）；多弧臂/弧-弧宽缺口未采 → 诚实拒收。纯直线树仍走
 * `sketch-slot-tree-logic.ts`（行为不变）。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { SLOT_CHAIN_TOL, SLOT_TOL, type SlotBuildError, type SlotDraft } from './sketch-slot-logic.js';

interface P2 { u: number; v: number }

const sub = (a: P2, b: P2): P2 => ({ u: a.u - b.u, v: a.v - b.v });
const vadd = (a: P2, b: P2): P2 => ({ u: a.u + b.u, v: a.v + b.v });
const scale = (a: P2, k: number): P2 => ({ u: a.u * k, v: a.v * k });
const cross2 = (a: P2, b: P2): number => a.u * b.v - a.v * b.u;
const dot2 = (a: P2, b: P2): number => a.u * b.u + a.v * b.v;
const dist2 = (a: P2, b: P2): number => Math.hypot(a.u - b.u, a.v - b.v);
const unit = (a: P2): P2 | undefined => {
  const l = Math.hypot(a.u, a.v);
  return l > SLOT_TOL ? { u: a.u / l, v: a.v / l } : undefined;
};
const rotL = (d: P2): P2 => ({ u: -d.v, v: d.u });
const rotR = (d: P2): P2 => ({ u: d.v, v: -d.u });
const radial = (angle: number): P2 => ({ u: Math.cos(angle), v: Math.sin(angle) });
const partOfEnd = (end: 0 | 1): 'start' | 'end' => (end === 0 ? 'start' : 'end');

function indexPoints(entities: SketchEntityDto[]): Map<number, P2> {
  const points = new Map<number, P2>();
  for (const e of entities)
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  return points;
}

function resolvePoint(ref: number | { x: number; y: number }, points: Map<number, P2>): P2 | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

export interface CurveArm {
  kind: 'line' | 'arc';
  /** 源实体（直线/圆弧）。 */
  entity: SketchEntityDto;
  /** 端点 0 / 1（圆弧 = authored start / end）。 */
  a: P2;
  b: P2;
  /** 两端「朝臂」方向（直线=指向另一端；圆弧=端点切向朝弧内）。 */
  uInto0: P2;
  uInto1: P2;
  /** 直线：单位方向 a→b。 */
  dir?: P2;
  /** 圆弧：圆心/半径/起始角/扫角/旋向。 */
  center?: P2;
  radius?: number;
  startAngle?: number;
  sweep?: number;
  sign?: 1 | -1;
}

export interface CurveTreeNode {
  pos: P2;
  ends: Array<{ armIndex: number; end: 0 | 1 }>;
}

export interface CurveBranchTree {
  arms: CurveArm[];
  nodes: CurveTreeNode[];
}

/**
 * 识别「恰一条圆弧 + ≥1 条直线」的单连通无环树（至少一个度 ≥3 顶点）。
 * 纯直线/多弧/断链/环/同实体两端同簇 → undefined（工具走直线树或诚实拒收）。
 */
export function curveTreeFromSelection(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): CurveBranchTree | undefined {
  const ids = new Set(selectedIds);
  if (ids.size < 3) return undefined;
  const points = indexPoints(entities);
  const arms: CurveArm[] = [];
  let arcCount = 0;
  for (const entity of entities) {
    if (!ids.has(entity.id)) continue;
    if (entity.kind === 'line') {
      const a = resolvePoint(entity.p1, points);
      const b = resolvePoint(entity.p2, points);
      const dir = a && b ? unit(sub(b, a)) : undefined;
      if (!a || !b || !dir || dist2(a, b) <= SLOT_TOL) return undefined;
      arms.push({ kind: 'line', entity, a, b, dir, uInto0: dir, uInto1: scale(dir, -1) });
    } else if (entity.kind === 'arc') {
      arcCount += 1;
      const center = resolvePoint(entity.center, points);
      const radius = entity.radius;
      const startAngle = entity.startAngle;
      const sweep = entity.sweepAngle;
      if (!center || radius === undefined || startAngle === undefined || sweep === undefined)
        return undefined;
      if (![radius, startAngle, sweep].every(Number.isFinite) || !(radius > SLOT_TOL)) return undefined;
      if (Math.abs(sweep) <= SLOT_TOL || Math.abs(sweep) > 2 * Math.PI - SLOT_TOL) return undefined;
      const sign: 1 | -1 = sweep > 0 ? 1 : -1;
      const a: P2 = vadd(center, scale(radial(startAngle), radius));
      const endAngle = startAngle + sweep;
      const b: P2 = vadd(center, scale(radial(endAngle), radius));
      const forward0 = scale(radial(startAngle + sign * Math.PI / 2), sign);
      const forward1 = scale(radial(endAngle + sign * Math.PI / 2), sign);
      arms.push({
        kind: 'arc', entity, a, b, center, radius, startAngle, sweep, sign,
        uInto0: forward0, uInto1: scale(forward1, -1),
      });
    } else {
      return undefined;
    }
  }
  if (arms.length !== ids.size || arcCount !== 1) return undefined;

  const clusters: Array<{ pos: P2; ends: Array<{ armIndex: number; end: 0 | 1 }> }> = [];
  for (let i = 0; i < arms.length; i++) {
    for (const end of [0, 1] as const) {
      const p = end === 0 ? arms[i]!.a : arms[i]!.b;
      let cluster = clusters.find((c) => dist2(c.pos, p) <= SLOT_CHAIN_TOL);
      if (!cluster) {
        cluster = { pos: p, ends: [] };
        clusters.push(cluster);
      }
      cluster.ends.push({ armIndex: i, end });
    }
  }
  for (const cluster of clusters) {
    const seen = new Set<number>();
    for (const e of cluster.ends) {
      if (seen.has(e.armIndex)) return undefined; // 同一实体两端同簇
      seen.add(e.armIndex);
    }
  }
  const nodes: CurveTreeNode[] = clusters.map((c) => ({ pos: c.pos, ends: c.ends }));
  if (nodes.length !== arms.length + 1) return undefined; // 非树
  const endNode = new Map<string, number>();
  clusters.forEach((c, ni) => c.ends.forEach((e) => endNode.set(`${e.armIndex}:${e.end}`, ni)));
  const adjacency: number[][] = nodes.map(() => []);
  arms.forEach((_, ai) => {
    adjacency[endNode.get(`${ai}:0`)!]!.push(ai);
    adjacency[endNode.get(`${ai}:1`)!]!.push(ai);
  });
  const visited = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const n = stack.pop()!;
    for (const ai of adjacency[n]!) {
      const other = endNode.get(`${ai}:0`) === n ? endNode.get(`${ai}:1`)! : endNode.get(`${ai}:0`)!;
      if (!visited.has(other)) {
        visited.add(other);
        stack.push(other);
      }
    }
  }
  if (visited.size !== nodes.length) return undefined;
  if (!nodes.some((n) => n.ends.length >= 3)) return undefined;
  return { arms, nodes };
}

interface FrameRef {
  armIndex: number;
  end: 0 | 1;
  u: P2;
  angle: number;
}

interface BoundaryRef { entity: number; part: 'start' | 'end' }

type BoundaryCurve =
  | { kind: 'line'; p: P2; d: P2 }
  | { kind: 'circle'; c: P2; r: number };

/** 帧侧（frame side）→ 边界实体：end0 直选，end1 左右互换（两端帧翻转）。 */
const boundarySide = (end: 0 | 1, side: 'L' | 'R'): 'L' | 'R' =>
  end === 0 ? side : (side === 'L' ? 'R' : 'L');

/**
 * 含圆弧的混合线树槽草稿（恰一条弧臂）。实体 = 每臂两条边界（直线/同心弧）
 * + 尖端帽 + 宽缺口毂弧；约束 = 线边界 parallel / 弧边界 concentric、帽/毂
 * 弧心 coincident + endpoint coincident + tangent、窄缺口 coincident、单 Ø。
 */
export function buildCurveTreeSlotDraft(input: {
  tree: CurveBranchTree;
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { tree, width } = input;
  const arms = tree.arms;
  const nodes = tree.nodes;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const half = width / 2;
  const twoPi = 2 * Math.PI;
  // 圆弧内偏移 r−w/2 必须为正（否则偏移穿过圆心，几何无意义）。
  for (const arm of arms)
    if (arm.kind === 'arc' && !(arm.radius! - half > SLOT_TOL))
      return { ok: false, error: 'degenerateRadius' };

  const uInto = (armIndex: number, end: 0 | 1): P2 =>
    end === 0 ? arms[armIndex]!.uInto0 : arms[armIndex]!.uInto1;
  const frameAngle = (armIndex: number, end: 0 | 1): number => {
    const u = uInto(armIndex, end);
    return Math.atan2(u.v, u.u);
  };

  /**
   * 圆弧在某端某帧侧的边界半径：边界 L/R 的半径 = r ∓ sign·half（边界标签按
   * **end0 帧**定义）；end1 帧侧翻转（frame-L→边界 R、frame-R→边界 L）。
   */
  const arcSideRadius = (arm: CurveArm, end: 0 | 1, side: 'L' | 'R'): number => {
    const actual = boundarySide(end, side);
    return arm.radius! + (actual === 'L' ? -arm.sign! * half : arm.sign! * half);
  };

  /** 该臂在某端某侧的边界曲线（直线=过偏移点、方向=臂方向；弧=同心圆）。 */
  const boundaryCurve = (arm: CurveArm, end: 0 | 1, side: 'L' | 'R', conn: P2): BoundaryCurve =>
    arm.kind === 'line'
      ? { kind: 'line', p: conn, d: arm.uInto0 }
      : { kind: 'circle', c: arm.center!, r: arcSideRadius(arm, end, side) };

  /** 交点是否落在臂的实体范围内（直线：投影 0..len；弧：源扫角内，仅裁剪不外延）。 */
  const withinArm = (arm: CurveArm, end: 0 | 1, point: P2): boolean => {
    if (arm.kind === 'line') {
      const len = dist2(arm.a, arm.b);
      const t = dot2(sub(point, end === 0 ? arm.a : arm.b), uInto0Of(arm, end));
      return t > SLOT_TOL && t < len - SLOT_TOL;
    }
    const angle = Math.atan2(point.v - arm.center!.v, point.u - arm.center!.u);
    const delta = arm.sign! > 0
      ? mod2(angle - arm.startAngle!)
      : mod2(arm.startAngle! - angle);
    return delta > 1e-6 && delta < Math.abs(arm.sweep!) - 1e-6;
  };
  const uInto0Of = (arm: CurveArm, end: 0 | 1): P2 => (end === 0 ? arm.uInto0 : arm.uInto1);
  const mod2 = (x: number): number => {
    let a = x % twoPi;
    if (a < 0) a += twoPi;
    return a;
  };

  /** 两边界曲线交点（取距两偏移点中点最近且落臂内者）。 */
  const intersectBoundaries = (
    aArm: CurveArm, aEnd: 0 | 1, aSide: 'L' | 'R', aConn: P2,
    bArm: CurveArm, bEnd: 0 | 1, bSide: 'L' | 'R', bConn: P2,
  ): P2 | undefined => {
    const ca = boundaryCurve(aArm, aEnd, aSide, aConn);
    const cb = boundaryCurve(bArm, bEnd, bSide, bConn);
    const target = scale(vadd(aConn, bConn), 0.5);
    let candidates: P2[] = [];
    if (ca.kind === 'line' && cb.kind === 'line') {
      const denom = cross2(ca.d, cb.d);
      if (Math.abs(denom) <= 1e-12) return undefined;
      const diff = sub(cb.p, ca.p);
      const t = cross2(diff, cb.d) / denom;
      candidates = [vadd(ca.p, scale(ca.d, t))];
    } else if (ca.kind === 'line' && cb.kind === 'circle') {
      candidates = intersectLineCircle(ca, cb);
    } else if (ca.kind === 'circle' && cb.kind === 'line') {
      candidates = intersectLineCircle(cb, ca);
    } else if (ca.kind === 'circle' && cb.kind === 'circle') {
      candidates = intersectCircleCircle(ca.c, ca.r, cb.c, cb.r);
    }
    const valid = candidates.filter((p) => withinArm(aArm, aEnd, p) && withinArm(bArm, bEnd, p));
    if (valid.length === 0) return undefined;
    valid.sort((p, q) => dist2(p, target) - dist2(q, target));
    return valid[0];
  };

  const conn = new Map<string, P2>();
  interface HubArc {
    nodeIndex: number;
    center: P2;
    startAngle: number;
    sweep: number;
    startArm: FrameRef;
    endArm: FrameRef;
  }
  const hubArcs: HubArc[] = [];
  const capTips: Array<{ armIndex: number; end: 0 | 1; tip: P2 }> = [];
  const miters: Array<{ a: FrameRef; b: FrameRef }> = [];

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!;
    const incident: FrameRef[] = node.ends.map((e) => ({
      ...e,
      u: uInto(e.armIndex, e.end),
      angle: frameAngle(e.armIndex, e.end),
    }));
    if (incident.length === 1) {
      const inc = incident[0]!;
      const arm = arms[inc.armIndex]!;
      const tip = inc.end === 0 ? arm.a : arm.b;
      capTips.push({ armIndex: inc.armIndex, end: inc.end, tip });
      conn.set(`${inc.armIndex}:${inc.end}:L`, vadd(tip, scale(rotL(inc.u), half)));
      conn.set(`${inc.armIndex}:${inc.end}:R`, vadd(tip, scale(rotR(inc.u), half)));
      continue;
    }
    incident.sort((p, q) => p.angle - q.angle);
    const m = incident.length;
    interface Gap { from: number; to: number; gap: number; wide: boolean }
    const gaps: Gap[] = [];
    for (let k = 0; k < m; k++) {
      const a = incident[k]!;
      const b = incident[(k + 1) % m]!;
      let gap = b.angle - a.angle;
      while (gap <= 0) gap += twoPi;
      if (gap <= 1e-9 || Math.abs(gap - Math.PI) <= 1e-9) return { ok: false, error: 'unsupportedChain' };
      gaps.push({ from: k, to: (k + 1) % m, gap, wide: gap > Math.PI });
    }
    const wideGaps = gaps.filter((g) => g.wide);
    if (wideGaps.length > 1) return { ok: false, error: 'unsupportedChain' };
    let arcGap: Gap | undefined;
    let arcInterval: { start: number; end: number } | undefined;
    if (wideGaps.length === 1) {
      arcGap = wideGaps[0]!;
      const theta0 = incident[arcGap.from]!.angle;
      const gapLen = arcGap.gap;
      let lo = -Infinity;
      let hi = Infinity;
      for (const inc of incident) {
        let d = inc.angle - theta0;
        while (d < -1e-12) d += twoPi;
        while (d >= twoPi - 1e-12) d -= twoPi;
        const baseL = d - 1.5 * Math.PI;
        const baseR = d - 0.5 * Math.PI;
        let best: [number, number] | undefined;
        let bestOverlap = -Infinity;
        for (const k of [-1, 0, 1] as const) {
          const l = baseL + twoPi * k;
          const r = baseR + twoPi * k;
          const overlap = Math.min(r, gapLen) - Math.max(l, 0);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = [l, r];
          }
        }
        if (!best || bestOverlap <= 1e-12) return { ok: false, error: 'unsupportedChain' };
        lo = Math.max(lo, best[0]);
        hi = Math.min(hi, best[1]);
      }
      if (!(hi - lo > 1e-9)) return { ok: false, error: 'unsupportedChain' };
      arcInterval = { start: lo, end: hi };
    }

    for (const gap of gaps) {
      const aInc = incident[gap.from]!;
      const bInc = incident[gap.to]!;
      if (arcGap === gap) {
        const startAngle = aInc.angle + arcInterval!.start;
        const sweep = arcInterval!.end - arcInterval!.start;
        if (!(sweep > SLOT_TOL) || sweep > Math.PI + 1e-9) return { ok: false, error: 'unsupportedChain' };
        const startPoint = vadd(node.pos, scale(radial(startAngle), half));
        const endPoint = vadd(node.pos, scale(radial(startAngle + sweep), half));
        const expectStart = vadd(node.pos, scale(rotL(aInc.u), half));
        const expectEnd = vadd(node.pos, scale(rotR(bInc.u), half));
        if (dist2(startPoint, expectStart) > 1e-6 || dist2(endPoint, expectEnd) > 1e-6)
          return { ok: false, error: 'unsupportedChain' };
        conn.set(`${aInc.armIndex}:${aInc.end}:L`, startPoint);
        conn.set(`${bInc.armIndex}:${bInc.end}:R`, endPoint);
        hubArcs.push({ nodeIndex: ni, center: node.pos, startAngle, sweep, startArm: aInc, endArm: bInc });
        continue;
      }
      // 窄缺口：两条边界曲线求交（直线/同心弧），交点须落在两臂实体内。
      const aConn = vadd(node.pos, scale(rotL(aInc.u), half));
      const bConn = vadd(node.pos, scale(rotR(bInc.u), half));
      const miter = intersectBoundaries(
        arms[aInc.armIndex]!, aInc.end, 'L', aConn,
        arms[bInc.armIndex]!, bInc.end, 'R', bConn,
      );
      if (!miter) return { ok: false, error: 'unsupportedChain' };
      conn.set(`${aInc.armIndex}:${aInc.end}:L`, miter);
      conn.set(`${bInc.armIndex}:${bInc.end}:R`, miter);
      miters.push({ a: aInc, b: bInc });
    }
  }

  const connOf = (armIndex: number, end: 0 | 1, side: 'L' | 'R'): P2 => {
    const p = conn.get(`${armIndex}:${end}:${side}`);
    if (!p) throw new Error(`curve-tree: missing connection ${armIndex}:${end}:${side}`);
    return p;
  };

  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    newConstraints.push({ ...constraint, id });
    return id;
  };

  // 边界实体：每臂两侧；直线=两偏移点连线，圆弧=同心弧（按源扫角方向裁剪）。
  interface BoundaryArm { L: number; R: number }
  const boundaryIds: BoundaryArm[] = [];
  const boundaryArcIds: number[] = [];
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i]!;
    const pL1 = connOf(i, 0, 'L');
    const pL2 = connOf(i, 1, 'R');
    const pR1 = connOf(i, 0, 'R');
    const pR2 = connOf(i, 1, 'L');
    if (arm.kind === 'line') {
      const idL = alloc();
      newEntities.push({ kind: 'line', id: idL, p1: { x: pL1.u, y: pL1.v }, p2: { x: pL2.u, y: pL2.v } });
      const idR = alloc();
      newEntities.push({ kind: 'line', id: idR, p1: { x: pR1.u, y: pR1.v }, p2: { x: pR2.u, y: pR2.v } });
      boundaryIds.push({ L: idL, R: idR });
      continue;
    }
    const makeArcBoundary = (startConn: P2, endConn: P2): number => {
      const radius = dist2(startConn, arm.center!);
      if (!(radius > SLOT_TOL) || Math.abs(dist2(endConn, arm.center!) - radius) > 1e-5)
        throw new Error('curve-tree: arc boundary radius mismatch');
      const startAngle = Math.atan2(startConn.v - arm.center!.v, startConn.u - arm.center!.u);
      const endAngle = Math.atan2(endConn.v - arm.center!.v, endConn.u - arm.center!.u);
      const sweep = arm.sign! > 0 ? mod2(endAngle - startAngle) : -mod2(startAngle - endAngle);
      if (!(Math.abs(sweep) > 1e-6) || Math.abs(sweep) > Math.abs(arm.sweep!) + 1e-6)
        throw new Error('curve-tree: arc boundary sweep outside source span');
      const centerId = alloc();
      newEntities.push({ kind: 'point', id: centerId, x: arm.center!.u, y: arm.center!.v });
      const arcId = alloc();
      boundaryArcIds.push(arcId);
      newEntities.push({ kind: 'arc', id: arcId, center: centerId, radius, startAngle, sweepAngle: sweep });
      return arcId;
    };
    let idL: number;
    let idR: number;
    try {
      idL = makeArcBoundary(pL1, pL2);
      idR = makeArcBoundary(pR1, pR2);
    } catch {
      return { ok: false, error: 'unsupportedChain' };
    }
    boundaryIds.push({ L: idL, R: idR });
  }

  /** 帧侧 → 边界实体 + 端点 part（end0=start、end1=end）。 */
  const boundaryRef = (frame: FrameRef, side: 'L' | 'R'): BoundaryRef => {
    const actual = boundarySide(frame.end, side);
    const id = boundaryIds[frame.armIndex]![actual];
    return { entity: id, part: partOfEnd(frame.end) };
  };

  // 尖端帽。
  const capArcIds: number[] = [];
  for (const { armIndex, end, tip } of capTips) {
    const arm = arms[armIndex]!;
    const centerId = alloc();
    newEntities.push({ kind: 'point', id: centerId, x: tip.u, y: tip.v });
    const outU = scale(uInto0Of(arm, end), -1);
    const startPoint = vadd(tip, scale(rotR(outU), half));
    const startAngle = Math.atan2(startPoint.v - tip.v, startPoint.u - tip.u);
    const arcId = alloc();
    capArcIds.push(arcId);
    newEntities.push({ kind: 'arc', id: arcId, center: centerId, radius: half, startAngle, sweepAngle: Math.PI });
    const frame = { armIndex, end, u: uInto0Of(arm, end), angle: frameAngle(armIndex, end) };
    add({ kind: 'coincident', refs: [centerId, { entity: arm.entity.id, part: partOfEnd(end) }] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, boundaryRef(frame, 'L')] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, boundaryRef(frame, 'R')] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[armIndex]!.L] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[armIndex]!.R] });
  }

  // 宽缺口毂弧。
  const hubArcIds: number[] = [];
  for (const hub of hubArcs) {
    const centerId = alloc();
    newEntities.push({ kind: 'point', id: centerId, x: hub.center.u, y: hub.center.v });
    const arcId = alloc();
    hubArcIds.push(arcId);
    newEntities.push({
      kind: 'arc', id: arcId, center: centerId, radius: half,
      startAngle: hub.startAngle, sweepAngle: hub.sweep,
    });
    add({
      kind: 'coincident',
      refs: [centerId, { entity: arms[hub.startArm.armIndex]!.entity.id, part: partOfEnd(hub.startArm.end) }],
    });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, boundaryRef(hub.startArm, 'L')] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, boundaryRef(hub.endArm, 'R')] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[hub.startArm.armIndex]![boundarySide(hub.startArm.end, 'L')]] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[hub.endArm.armIndex]![boundarySide(hub.endArm.end, 'R')]] });
  }

  // 窄缺口斜接端点重合。
  for (const miter of miters) {
    add({ kind: 'coincident', refs: [boundaryRef(miter.a, 'L'), boundaryRef(miter.b, 'R')] });
  }

  // 边界约束：线 parallel、弧 concentric。
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i]!;
    if (arm.kind === 'line') {
      add({ kind: 'parallel', refs: [arm.entity.id, boundaryIds[i]!.L] });
      add({ kind: 'parallel', refs: [arm.entity.id, boundaryIds[i]!.R] });
    } else {
      add({ kind: 'concentric', refs: [arm.entity.id, boundaryIds[i]!.L] });
      add({ kind: 'concentric', refs: [arm.entity.id, boundaryIds[i]!.R] });
    }
  }

  // 单 Ø：首帽 diameter + 其余帽/毂弧逐对 equal。
  if (capArcIds.length === 0) return { ok: false, error: 'unsupportedChain' };
  const anchor = capArcIds[0]!;
  const diameterConstraintId = add({ kind: 'diameter', refs: [anchor], value: width });
  for (const arcId of [...capArcIds.slice(1), ...hubArcIds]) add({ kind: 'equal', refs: [anchor, arcId] });

  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds,
      boundaryLineIds: arms.flatMap((arm, i) => (arm.kind === 'line'
        ? [boundaryIds[i]!.L, boundaryIds[i]!.R]
        : [])),
      ...(boundaryArcIds.length > 0 ? { boundaryArcIds } : {}),
      diameterConstraintId,
      cornerArcIds: hubArcIds,
    },
  };
}

function intersectLineCircle(line: { p: P2; d: P2 }, circle: { c: P2; r: number }): P2[] {
  const f = sub(line.p, circle.c);
  const a = dot2(line.d, line.d);
  const b = 2 * dot2(f, line.d);
  const c = dot2(f, f) - circle.r * circle.r;
  const disc = b * b - 4 * a * c;
  if (disc < -1e-9 || a <= 1e-12) return [];
  const root = Math.sqrt(Math.max(0, disc));
  const ts = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  return ts.map((t) => vadd(line.p, scale(line.d, t)));
}

function intersectCircleCircle(c1: P2, r1: number, c2: P2, r2: number): P2[] {
  const d = dist2(c1, c2);
  if (d <= 1e-12) return [];
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -1e-9) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const dir = scale(sub(c2, c1), 1 / d);
  const mid = vadd(c1, scale(dir, a));
  const perp = { u: -dir.v, v: dir.u };
  return [vadd(mid, scale(perp, h)), vadd(mid, scale(perp, -h))];
}
