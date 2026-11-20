/**
 * 草图槽——单毂分支链（ADR-0022 §2.11，2026-11-20 live `branch-slot.dxf`）。
 *
 * live 语义（私有 `SLOT-S2L-CLOSEDMIX-BRANCH-LIVE-20261120.md`）：
 * 三条线共点 P 一起选 → 槽工具**接受**，结果为三条 stadium（每条线两侧
 * ±w/2 偏移 + 尖端半圆帽）的**并集轮廓**：
 * - 尖端保留 r=w/2 半圆帽（帽心=源线尖端）；
 * - 毂部相邻臂的偏移线两两**直接斜接**（无转角弧）；毂端半圆帽并入并集
 *   内部而消失；
 * - 源线全部保留；草图中仅一个 **Ø20**（引线指向某条帽弧）。
 *
 * 范围（与证据一致）：**单毂**分支（所有选中线恰有一个公共端点）、每条线
 * 另一端点自由、任一相邻臂夹角缺口严格 <180°（否则并集边界会切换为绕毂
 * r=w/2 圆弧，未采证据）；弧参与的分支、多毂树、共线臂、两线共自由端 →
 * 诚实拒收。内部槽几何 = 相邻臂偏移线交点 + 尖帽，全部由单个 diameter +
 * equal 驱动（与多独立线槽同口径）。
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

const cross2 = (a: P2, b: P2): number => a.u * b.v - a.v * b.u;
const dist2 = (a: P2, b: P2): number => Math.hypot(a.u - b.u, a.v - b.v);

/** 一条臂：源线 + 毂端/尖端坐标（尖端=远离毂的自由端）。 */
export interface SlotBranchArm {
  line: SketchEntityDto & { kind: 'line' };
  /** 源线在毂部一侧的端点槽。 */
  hubPart: 'start' | 'end';
  /** 源线尖端一侧的端点槽。 */
  farPart: 'start' | 'end';
  far: P2;
  /** 单位方向（毂→尖端）与臂长。 */
  dir: P2;
  length: number;
}

export interface SlotBranchChain {
  hub: P2;
  /** 按极角 CCW 排序的臂。 */
  arms: SlotBranchArm[];
}

/**
 * 从选择集识别**单毂分支链**（live 2026-11-20 Y 分支）。
 *
 * 条件：≥3 条直线；恰有一个公共端点簇（每条线各贡献一个端点）；其余端点
 * 两两不重合；臂方向互异且相邻缺口严格 <180°。不满足 → undefined（工具
 * 走既有链/多线/拒收路径）。
 */
export function branchChainFromSelection(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): SlotBranchChain | undefined {
  const ids = new Set(selectedIds);
  if (ids.size < 3) return undefined;
  const members = entities.filter(
    (e): e is SketchEntityDto & { kind: 'line' } => e.kind === 'line' && ids.has(e.id),
  );
  if (members.length !== ids.size) return undefined;

  const points = indexPoints(entities);
  interface End { lineId: number; part: 'start' | 'end'; pos: P2 }
  const ends: End[] = [];
  for (const line of members) {
    const a = resolvePoint(line.p1, points);
    const b = resolvePoint(line.p2, points);
    if (!a || !b) return undefined;
    ends.push({ lineId: line.id, part: 'start', pos: a }, { lineId: line.id, part: 'end', pos: b });
  }

  // 端点聚类（容差 SLOT_CHAIN_TOL；每条线的两个端点必须分开）。
  const clusters: Array<{ pos: P2; ends: End[] }> = [];
  for (const end of ends) {
    let cluster = clusters.find((c) => dist2(c.pos, end.pos) <= SLOT_CHAIN_TOL);
    if (!cluster) {
      cluster = { pos: end.pos, ends: [] };
      clusters.push(cluster);
    }
    cluster.ends.push(end);
  }
  const shared = clusters.filter((c) => c.ends.length > 1);
  if (shared.length !== 1) return undefined;
  const hubCluster = shared[0]!;
  if (hubCluster.ends.length < 3) return undefined;

  const hubByLine = new Map<number, End>();
  for (const end of hubCluster.ends) {
    if (hubByLine.has(end.lineId)) return undefined; // 同一条线两端都落在毂上
    hubByLine.set(end.lineId, end);
  }
  if (hubByLine.size !== members.length) return undefined; // 有线条没有接到毂上
  // 其余端点必须全部自由（同一自由端点被两条线共享 → 不是单毂星形）。
  for (const cluster of clusters) {
    if (cluster === hubCluster) continue;
    if (cluster.ends.length !== 1) return undefined;
  }

  const hub = hubCluster.pos;
  const arms: SlotBranchArm[] = [];
  for (const line of members) {
    const hubEnd = hubByLine.get(line.id)!;
    const a = resolvePoint(line.p1, points)!;
    const b = resolvePoint(line.p2, points)!;
    const far = hubEnd.part === 'start' ? b : a;
    const dx = far.u - hub.u;
    const dy = far.v - hub.v;
    const length = Math.hypot(dx, dy);
    if (!(length > SLOT_TOL)) return undefined;
    arms.push({
      line,
      hubPart: hubEnd.part,
      farPart: hubEnd.part === 'start' ? 'end' : 'start',
      far,
      dir: { u: dx / length, v: dy / length },
      length,
    });
  }
  // 极角排序（CCW），并校验相邻缺口严格 <180°（并集轮廓用斜接而非绕毂圆弧）。
  arms.sort((p, q) => Math.atan2(p.dir.v, p.dir.u) - Math.atan2(q.dir.v, q.dir.u));
  const twoPi = 2 * Math.PI;
  for (let i = 0; i < arms.length; i++) {
    const next = arms[(i + 1) % arms.length]!;
    const t0 = Math.atan2(arms[i]!.dir.v, arms[i]!.dir.u);
    const t1 = Math.atan2(next.dir.v, next.dir.u);
    let gap = t1 - t0;
    while (gap <= 0) gap += twoPi;
    if (!(gap > 1e-9) || !(gap < Math.PI - 1e-9)) return undefined;
  }
  return { hub, arms };
}

/**
 * 单毂分支链槽草稿（与 live `branch-slot.dxf` 同构）。
 *
 * - 每条臂两侧偏移线（平行于源线、距 w/2）；每个相邻缺口的两条相对偏移线
 *   求交得毂部斜接点；尖端半圆帽 r=w/2（帽心=源线尖端、从右侧点扫 +π 到
 *   左侧点，弧背离毂部）；
 * - 源线保留；单 diameter（首帽）+ 其余帽逐对 equal；
 * - 交点投影越出臂长 / 宽度不可容纳 → degenerateRadius。
 */
export function buildBranchChainSlotDraft(input: {
  chain: SlotBranchChain;
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { chain, width } = input;
  const arms = chain.arms;
  const n = arms.length;
  if (n < 3) return { ok: false, error: 'unsupportedChain' };
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const half = width / 2;

  // 相邻缺口 (i → i+1) 的斜接点 = 臂 i 左偏移线 ∩ 臂 i+1 右偏移线。
  const miters: P2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = arms[i]!;
    const next = arms[(i + 1) % n]!;
    const leftPrev: P2 = { u: -prev.dir.v, v: prev.dir.u };
    const leftNext: P2 = { u: -next.dir.v, v: next.dir.u };
    const p: P2 = {
      u: chain.hub.u + leftPrev.u * half,
      v: chain.hub.v + leftPrev.v * half,
    };
    const q: P2 = {
      u: chain.hub.u - leftNext.u * half,
      v: chain.hub.v - leftNext.v * half,
    };
    const denom = cross2(prev.dir, next.dir);
    if (Math.abs(denom) <= 1e-12) return { ok: false, error: 'unsupportedChain' };
    const diff: P2 = { u: q.u - p.u, v: q.v - p.v };
    const t = cross2(diff, next.dir) / denom;
    const s = cross2(diff, prev.dir) / denom;
    // 斜接点须落在两条臂的偏移段内（否则并集轮廓改由端帽/绕毂圆弧主导，未采证据）。
    if (!(t > SLOT_TOL) || !(t < prev.length - SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
    if (!(s > SLOT_TOL) || !(s < next.length - SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
    miters.push({ u: p.u + prev.dir.u * t, v: p.v + prev.dir.v * t });
  }

  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    newConstraints.push({ ...constraint, id });
    return id;
  };

  // 尖端帽心点 + 每条臂左右两条边界线。
  const capCenters: number[] = [];
  for (const arm of arms) {
    const id = alloc();
    capCenters.push(id);
    newEntities.push({ kind: 'point', id, x: arm.far.u, y: arm.far.v });
  }
  const leftLines: number[] = [];
  const rightLines: number[] = [];
  const tipLeft: P2[] = [];
  const tipRight: P2[] = [];
  for (let i = 0; i < n; i++) {
    const arm = arms[i]!;
    const left: P2 = { u: -arm.dir.v, v: arm.dir.u };
    const tl: P2 = { u: arm.far.u + left.u * half, v: arm.far.v + left.v * half };
    const tr: P2 = { u: arm.far.u - left.u * half, v: arm.far.v - left.v * half };
    tipLeft.push(tl);
    tipRight.push(tr);
    // 左边界：缺口 (i→i+1) 斜接点 → 尖端左侧点；右边界：缺口 (i-1→i) 斜接点 → 尖端右侧点。
    const leftId = alloc();
    leftLines.push(leftId);
    newEntities.push({
      kind: 'line', id: leftId,
      p1: { x: miters[i]!.u, y: miters[i]!.v },
      p2: { x: tl.u, y: tl.v },
    });
    const rightId = alloc();
    rightLines.push(rightId);
    newEntities.push({
      kind: 'line', id: rightId,
      p1: { x: miters[(i + n - 1) % n]!.u, y: miters[(i + n - 1) % n]!.v },
      p2: { x: tr.u, y: tr.v },
    });
  }

  // 尖端半圆帽：从右侧点 CCW 扫 +π 到左侧点（经过臂的外向方向，背离毂部）。
  const capArcs: number[] = [];
  for (let i = 0; i < n; i++) {
    const arm = arms[i]!;
    const startAngle = Math.atan2(tipRight[i]!.v - arm.far.v, tipRight[i]!.u - arm.far.u);
    const id = alloc();
    capArcs.push(id);
    newEntities.push({
      kind: 'arc', id, center: capCenters[i]!, radius: half,
      startAngle, sweepAngle: Math.PI,
    });
  }

  // 约束：帽心 ↔ 源线尖端；边界线 ↔ 源线平行；帽端点/相切；毂部斜接重合。
  for (let i = 0; i < n; i++) {
    const arm = arms[i]!;
    add({ kind: 'coincident', refs: [capCenters[i]!, { entity: arm.line.id, part: arm.farPart }] });
    add({ kind: 'parallel', refs: [arm.line.id, leftLines[i]!] });
    add({ kind: 'parallel', refs: [arm.line.id, rightLines[i]!] });
    add({ kind: 'coincident', refs: [{ entity: leftLines[i]!, part: 'end' }, { entity: capArcs[i]!, part: 'end' }] });
    add({ kind: 'coincident', refs: [{ entity: rightLines[i]!, part: 'end' }, { entity: capArcs[i]!, part: 'start' }] });
    add({ kind: 'tangent', refs: [capArcs[i]!, leftLines[i]!] });
    add({ kind: 'tangent', refs: [capArcs[i]!, rightLines[i]!] });
    const next = (i + 1) % n;
    add({ kind: 'coincident', refs: [{ entity: leftLines[i]!, part: 'start' }, { entity: rightLines[next]!, part: 'start' }] });
  }

  // 单一 Ø：首帽 diameter + 其余帽逐对 equal（live 仅一个 Ø20）。
  const diameterConstraintId = add({ kind: 'diameter', refs: [capArcs[0]!], value: width });
  for (let i = 1; i < n; i++) add({ kind: 'equal', refs: [capArcs[0]!, capArcs[i]!] });

  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds: capArcs,
      boundaryLineIds: [...leftLines, ...rightLines],
      diameterConstraintId,
    },
  };
}
