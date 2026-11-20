/**
 * 草图槽——一般线树（分支/多毂树，ADR-0022 §2.11 扩展，2026-11-20 live S2o）。
 *
 * live 证据（私有 `SLOT-S2L-...` + `ui-evidence/slot-variants-20261120/`）：
 * - `s2oA-wide-branch-slot.dxf`：3 线共点、一个相邻缺口 >180° → 结果 = 各线
 *   stadium 的并集：尖端半圆帽；窄缺口处相邻偏移线**斜接**；宽缺口处边界是
 *   **绕毂 r=w/2 圆弧**（弧心=毂点、扫角 =「背面半平面交集」的宽度，实测
 *   117.255° = 180° − 三臂最小锥角 62.74°）。
 * - `s2oD-tree-slot.dxf`：5 线双毂树（P 3 臂 + C 3 臂）→ 接受：4 个自由尖端
 *   半圆帽、两个毂部全部斜接（所有缺口 <180°）、15 LINE+4 ARC（10 边界线）。
 *
 * 统一规则（对每个顶点，按入射臂的**朝臂方向**排序）：
 * - 相邻臂缺口 <180°：两条相对偏移线求交 → 斜接；
 * - 缺口 >180°：边界为绕顶点的 r=w/2 圆弧，弧端点 = 两条相对偏移线在顶点的
 *   偏移点；弧角区间 = 所有臂「背面半平面」的交集（±90° 半圆交）；
 * - 缺口 =180°（共线/直通，live 2026-11-20 S2x T 形）：该对相对边界**不连接**，
 *   各自止于毂偏移点（两点重合，形成共线接缝）；其余窄缺口照常斜接。T 形结果
 *   = 3 帽 + 6 边界线（3 源线 + 6 边界；无毂弧）。
 * - 度 1 顶点：尖端半圆帽；度 2 顶点同样走上述规则（外侧圆弧/内侧斜接，与
 *   开放链一致）；度 ≥3 即分支/毂。
 *
 * 范围：**单连通、无环**的直线树（至少一个度 ≥3 顶点）、单臂长度足以容纳
 * 斜接（交点投影在臂内）。纯开放链（无度≥3）仍走既有链构建器；闭环/断链/
 * 多直通缺口（+ 形）/直通与宽缺口并存 → 拒收（未采证据）。
 * 单 Ø = 首帽 diameter + 其余帽/毂弧逐对 equal。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { SLOT_CHAIN_TOL, SLOT_TOL, type SlotBuildError, type SlotDraft } from './sketch-slot-logic.js';

interface P2 { u: number; v: number }

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

const sub = (a: P2, b: P2): P2 => ({ u: a.u - b.u, v: a.v - b.v });
const vadd = (a: P2, b: P2): P2 => ({ u: a.u + b.u, v: a.v + b.v });
const scale = (a: P2, k: number): P2 => ({ u: a.u * k, v: a.v * k });
const cross2 = (a: P2, b: P2): number => a.u * b.v - a.v * b.u;
const dist2 = (a: P2, b: P2): number => Math.hypot(a.u - b.u, a.v - b.v);
const unit = (a: P2): P2 | undefined => {
  const l = Math.hypot(a.u, a.v);
  return l > SLOT_TOL ? { u: a.u / l, v: a.v / l } : undefined;
};
const rotL = (d: P2): P2 => ({ u: -d.v, v: d.u });
const rotR = (d: P2): P2 => ({ u: d.v, v: -d.u });
const radial = (angle: number): P2 => ({ u: Math.cos(angle), v: Math.sin(angle) });

export interface TreeArm {
  line: SketchEntityDto & { kind: 'line' };
  a: P2;
  b: P2;
}

export interface TreeNodeInfo {
  pos: P2;
  /** 入射臂端点（end 0=a、1=b）。 */
  ends: Array<{ armIndex: number; end: 0 | 1 }>;
}

export interface LineBranchTree {
  arms: TreeArm[];
  nodes: TreeNodeInfo[];
}

/**
 * 从选择集识别**单连通线树**（至少一个度 ≥3 顶点）。
 * 无环（边数 = 顶点数 − 1 且连通）、非退化端点、每簇不含同线两端。
 * 纯开放链（无度≥3）→ undefined（走既有链构建器）。
 */
export function lineTreeFromSelection(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): LineBranchTree | undefined {
  const ids = new Set(selectedIds);
  if (ids.size < 2) return undefined;
  const members = entities.filter(
    (e): e is SketchEntityDto & { kind: 'line' } => e.kind === 'line' && ids.has(e.id),
  );
  if (members.length !== ids.size) return undefined;
  const points = indexPoints(entities);
  const arms: TreeArm[] = [];
  for (const line of members) {
    const a = resolvePoint(line.p1, points);
    const b = resolvePoint(line.p2, points);
    if (!a || !b || dist2(a, b) <= SLOT_TOL) return undefined;
    arms.push({ line, a, b });
  }

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
      if (seen.has(e.armIndex)) return undefined; // 同一条线两端同簇
      seen.add(e.armIndex);
    }
  }
  const nodes: TreeNodeInfo[] = clusters.map((c) => ({ pos: c.pos, ends: c.ends }));
  if (nodes.length !== arms.length + 1) return undefined; // 非树（环/断链/重边）

  const endNode = new Map<string, number>();
  clusters.forEach((c, ni) => c.ends.forEach((e) => endNode.set(`${e.armIndex}:${e.end}`, ni)));
  const adjacency: number[][] = nodes.map(() => []);
  arms.forEach((_, ai) => {
    const n0 = endNode.get(`${ai}:0`);
    const n1 = endNode.get(`${ai}:1`);
    if (n0 === undefined || n1 === undefined) return;
    adjacency[n0]!.push(ai);
    adjacency[n1]!.push(ai);
  });
  const visited = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const n = stack.pop()!;
    for (const ai of adjacency[n]!) {
      const n0 = endNode.get(`${ai}:0`)!;
      const n1 = endNode.get(`${ai}:1`)!;
      const other = n0 === n ? n1 : n0;
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

/** 端点槽在源线上的 part（end 0 → start、1 → end）。 */
const partOfEnd = (end: 0 | 1): 'start' | 'end' => (end === 0 ? 'start' : 'end');

interface FrameRef {
  armIndex: number;
  end: 0 | 1;
  /** 该臂在此端点的朝臂方向（从顶点指向臂内）。 */
  u: P2;
  angle: number;
}

interface ArcConnection {
  nodeIndex: number;
  center: P2;
  startAngle: number;
  sweep: number;
  startArm: FrameRef;
  endArm: FrameRef;
}

/**
 * 一般线树槽草稿。实体 = 边界线 2/臂 + 尖端帽 + 宽缺口毂弧；约束 =
 * 尖端帽心/弧心 ↔ 源线端点、端点 coincident、tangent、parallel、单 Ø
 * （首帽 diameter + 其余帽/毂弧逐对 equal）。
 */
export function buildLineTreeSlotDraft(input: {
  tree: LineBranchTree;
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { tree, width } = input;
  const arms = tree.arms;
  const nodes = tree.nodes;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const half = width / 2;
  const twoPi = 2 * Math.PI;
  const dirs: P2[] = [];
  for (const arm of arms) {
    const d = unit(sub(arm.b, arm.a));
    if (!d) return { ok: false, error: 'unsolvedLine' };
    dirs.push(d);
  }

  /** 每个（臂, 端点, 朝臂框 left/right）的连接点与弧（宽缺口时）。 */
  const conn = new Map<string, P2>();
  const arcs: ArcConnection[] = [];
  const capTips: Array<{ armIndex: number; end: 0 | 1; tip: P2 }> = [];

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!;
    const incident: FrameRef[] = node.ends.map((e) => {
      const u = e.end === 0 ? dirs[e.armIndex]! : scale(dirs[e.armIndex]!, -1);
      return { ...e, u, angle: Math.atan2(u.v, u.u) };
    });
    if (incident.length === 1) {
      const inc = incident[0]!;
      const tip = inc.end === 0 ? arms[inc.armIndex]!.a : arms[inc.armIndex]!.b;
      capTips.push({ armIndex: inc.armIndex, end: inc.end, tip });
      conn.set(`${inc.armIndex}:${inc.end}:L`, vadd(tip, scale(rotL(inc.u), half)));
      conn.set(`${inc.armIndex}:${inc.end}:R`, vadd(tip, scale(rotR(inc.u), half)));
      continue;
    }
    incident.sort((p, q) => p.angle - q.angle);
    const m = incident.length;
    interface Gap { from: number; to: number; gap: number; wide: boolean; through: boolean }
    const gaps: Gap[] = [];
    let throughGaps = 0;
    for (let k = 0; k < m; k++) {
      const a = incident[k]!;
      const b = incident[(k + 1) % m]!;
      let gap = b.angle - a.angle;
      while (gap <= 0) gap += twoPi;
      if (gap <= 1e-9) return { ok: false, error: 'unsupportedChain' };
      const through = Math.abs(gap - Math.PI) <= 1e-9;
      if (through) throughGaps++;
      gaps.push({ from: k, to: (k + 1) % m, gap, wide: gap > Math.PI, through });
    }
    // live S2x 仅采到「单一 T 形直通」；+ 形（多直通）与直通+宽缺口并存无证据。
    if (throughGaps > 1) return { ok: false, error: 'unsupportedChain' };
    const wideGaps = gaps.filter((g) => g.wide);
    if (wideGaps.length > 1) return { ok: false, error: 'unsupportedChain' };
    if (wideGaps.length > 0 && throughGaps > 0) return { ok: false, error: 'unsupportedChain' };
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
      if (gap.through) {
        // live S2x T 形：直通缺口两侧边界各自止于毂偏移点（共线 seam），
        // 不生成斜接/毂弧；两点必须重合（非共线近 180° 无证据 → 拒收）。
        const pA = vadd(node.pos, scale(rotL(aInc.u), half));
        const pB = vadd(node.pos, scale(rotR(bInc.u), half));
        if (dist2(pA, pB) > 1e-6) return { ok: false, error: 'unsupportedChain' };
        conn.set(`${aInc.armIndex}:${aInc.end}:L`, pA);
        conn.set(`${bInc.armIndex}:${bInc.end}:R`, pB);
        continue;
      }
      const isArcGap = arcGap === gap;
      if (isArcGap) {
        // startAngle = 缺口起臂角 + 交集起（缺口中 aInc 即 gap.from）。
        const startAngle = aInc.angle + arcInterval!.start;
        const sweep = arcInterval!.end - arcInterval!.start;
        if (!(sweep > SLOT_TOL) || sweep > Math.PI + 1e-9) return { ok: false, error: 'unsupportedChain' };
        const startPoint = vadd(node.pos, scale(radial(startAngle), half));
        const endPoint = vadd(node.pos, scale(radial(startAngle + sweep), half));
        // 与相对偏移点一致（数值守卫）。
        const expectStart = vadd(node.pos, scale(rotL(aInc.u), half));
        const expectEnd = vadd(node.pos, scale(rotR(bInc.u), half));
        if (dist2(startPoint, expectStart) > 1e-6 || dist2(endPoint, expectEnd) > 1e-6)
          return { ok: false, error: 'unsupportedChain' };
        conn.set(`${aInc.armIndex}:${aInc.end}:L`, startPoint);
        conn.set(`${bInc.armIndex}:${bInc.end}:R`, endPoint);
        arcs.push({
          nodeIndex: ni, center: node.pos, startAngle, sweep,
          startArm: aInc, endArm: bInc,
        });
        continue;
      }
      // 窄缺口：斜接（相对偏移线求交，交点须落在两臂长度内）。
      const pLine = { p: vadd(node.pos, scale(rotL(aInc.u), half)), d: aInc.u };
      const qLine = { p: vadd(node.pos, scale(rotR(bInc.u), half)), d: bInc.u };
      const denom = cross2(pLine.d, qLine.d);
      if (Math.abs(denom) <= 1e-12) return { ok: false, error: 'unsupportedChain' };
      const diff = sub(qLine.p, pLine.p);
      const t = cross2(diff, qLine.d) / denom;
      const s = cross2(diff, pLine.d) / denom;
      const lenA = dist2(arms[aInc.armIndex]!.a, arms[aInc.armIndex]!.b);
      const lenB = dist2(arms[bInc.armIndex]!.a, arms[bInc.armIndex]!.b);
      if (!(t > SLOT_TOL) || !(t < lenA - SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
      if (!(s > SLOT_TOL) || !(s < lenB - SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
      const miter = vadd(pLine.p, scale(pLine.d, t));
      conn.set(`${aInc.armIndex}:${aInc.end}:L`, miter);
      conn.set(`${bInc.armIndex}:${bInc.end}:R`, miter);
    }
  }

  const connOf = (armIndex: number, end: 0 | 1, side: 'L' | 'R'): P2 => {
    const p = conn.get(`${armIndex}:${end}:${side}`);
    if (!p) throw new Error(`tree: missing connection ${armIndex}:${end}:${side}`);
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

  // 边界线（段 L：a 端 frame-L → b 端 frame-R；段 R：a 端 frame-R → b 端 frame-L）。
  const boundaryIds: Array<{ L: number; R: number }> = [];
  for (let i = 0; i < arms.length; i++) {
    const pL1 = connOf(i, 0, 'L');
    const pL2 = connOf(i, 1, 'R');
    const idL = alloc();
    newEntities.push({ kind: 'line', id: idL, p1: { x: pL1.u, y: pL1.v }, p2: { x: pL2.u, y: pL2.v } });
    const pR1 = connOf(i, 0, 'R');
    const pR2 = connOf(i, 1, 'L');
    const idR = alloc();
    newEntities.push({ kind: 'line', id: idR, p1: { x: pR1.u, y: pR1.v }, p2: { x: pR2.u, y: pR2.v } });
    boundaryIds.push({ L: idL, R: idR });
  }

  // 尖端帽（自由端）：起于尖端「段 R 点」扫 +π 到「段 L 点」（外向帧右→左，背离臂）。
  const capArcIds: number[] = [];
  for (const { armIndex, end, tip } of capTips) {
    const centerId = alloc();
    newEntities.push({ kind: 'point', id: centerId, x: tip.u, y: tip.v });
    const outU = end === 0 ? scale(dirs[armIndex]!, -1) : dirs[armIndex]!;
    const startPoint = vadd(tip, scale(rotR(outU), half));
    const startAngle = Math.atan2(startPoint.v - tip.v, startPoint.u - tip.u);
    const arcId = alloc();
    capArcIds.push(arcId);
    newEntities.push({ kind: 'arc', id: arcId, center: centerId, radius: half, startAngle, sweepAngle: Math.PI });
    // end 0：帽起点=段 L 的 a 端；end 1：帽起点=段 R 的 b 端（背离臂的外向帧右→左）。
    const startBoundary = end === 0
      ? { entity: boundaryIds[armIndex]!.L, part: 'start' as const }
      : { entity: boundaryIds[armIndex]!.R, part: 'end' as const };
    const endBoundary = end === 0
      ? { entity: boundaryIds[armIndex]!.R, part: 'start' as const }
      : { entity: boundaryIds[armIndex]!.L, part: 'end' as const };
    add({ kind: 'coincident', refs: [centerId, { entity: arms[armIndex]!.line.id, part: partOfEnd(end) }] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, startBoundary] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, endBoundary] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[armIndex]!.L] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[armIndex]!.R] });
  }

  // 宽缺口毂弧：弧心点 ↔ 源线端点；端点 ↔ 两条相对边界线端部；相切。
  const hubArcIds: number[] = [];
  for (const arc of arcs) {
    const centerId = alloc();
    newEntities.push({ kind: 'point', id: centerId, x: arc.center.u, y: arc.center.v });
    const arcId = alloc();
    hubArcIds.push(arcId);
    newEntities.push({
      kind: 'arc', id: arcId, center: centerId, radius: half,
      startAngle: arc.startAngle, sweepAngle: arc.sweep,
    });
    const startArm = arc.startArm;
    const endArm = arc.endArm;
    // 起点臂 frame-L → 段侧：end0→L/start、end1→R/end；终点臂 frame-R → end0→R/start、end1→L/end。
    const startBoundary = startArm.end === 0
      ? { entity: boundaryIds[startArm.armIndex]!.L, part: 'start' as const }
      : { entity: boundaryIds[startArm.armIndex]!.R, part: 'end' as const };
    const endBoundary = endArm.end === 0
      ? { entity: boundaryIds[endArm.armIndex]!.R, part: 'start' as const }
      : { entity: boundaryIds[endArm.armIndex]!.L, part: 'end' as const };
    add({ kind: 'coincident', refs: [centerId, { entity: arms[startArm.armIndex]!.line.id, part: partOfEnd(startArm.end) }] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, startBoundary] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, endBoundary] });
    // 相切引用的边界线必须与端点 coincident 的侧一致（end1 时 frame 侧翻转到另一段侧）。
    add({ kind: 'tangent', refs: [arcId, startArm.end === 0 ? boundaryIds[startArm.armIndex]!.L : boundaryIds[startArm.armIndex]!.R] });
    add({ kind: 'tangent', refs: [arcId, endArm.end === 0 ? boundaryIds[endArm.armIndex]!.R : boundaryIds[endArm.armIndex]!.L] });
  }

  // 窄缺口斜接：两条相对边界线端点重合。
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!;
    if (node.ends.length < 2) continue;
    const incident: FrameRef[] = node.ends.map((e) => {
      const u = e.end === 0 ? dirs[e.armIndex]! : scale(dirs[e.armIndex]!, -1);
      return { ...e, u, angle: Math.atan2(u.v, u.u) };
    });
    incident.sort((p, q) => p.angle - q.angle);
    const m = incident.length;
    for (let k = 0; k < m; k++) {
      const a = incident[k]!;
      const b = incident[(k + 1) % m]!;
      let gap = b.angle - a.angle;
      while (gap <= 0) gap += 2 * Math.PI;
      if (gap > Math.PI) continue; // 宽缺口由毂弧连接
      const startRef = a.end === 0
        ? { entity: boundaryIds[a.armIndex]!.L, part: 'start' as const }
        : { entity: boundaryIds[a.armIndex]!.R, part: 'end' as const };
      const endRef = b.end === 0
        ? { entity: boundaryIds[b.armIndex]!.R, part: 'start' as const }
        : { entity: boundaryIds[b.armIndex]!.L, part: 'end' as const };
      add({ kind: 'coincident', refs: [startRef, endRef] });
    }
  }

  // 边界线平行于源线。
  for (let i = 0; i < arms.length; i++) {
    add({ kind: 'parallel', refs: [arms[i]!.line.id, boundaryIds[i]!.L] });
    add({ kind: 'parallel', refs: [arms[i]!.line.id, boundaryIds[i]!.R] });
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
      boundaryLineIds: boundaryIds.flatMap((b) => [b.L, b.R]),
      diameterConstraintId,
      cornerArcIds: hubArcIds,
    },
  };
}
