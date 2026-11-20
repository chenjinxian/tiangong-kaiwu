/**
 * 草图槽（Slot）纯逻辑（ADR-0022 S2，2026-11-19 live 探针）。
 *
 * live 语义（私有 `ui-evidence/slot-probe-20261119/` + `sketch1-slot.dxf`）：
 * - 单条直线：体育场槽（两平行边界 + 两端半圆帽），默认 Ø20；改宽联动。
 * - 相连折线链（2026-11-19 链探针 `chain-slot.dxf`）：沿整条链生成**一个**槽；
 *   每个内顶点外侧为 r=Ø/2 的圆角弧（弧心=顶点），内侧为两条偏移线尖角相交；
 *   两端半圆帽；原中线全部保留；仍只有一个 Ø 驱动尺寸（所有弧等半径）。
 * - 圆弧中线（2026-11-20 live `arc-slot.dxf`）：两条同心偏移弧（R±Ø/2）+ 两个
 *   半圆帽（圆心=弧端点、帽半径=Ø/2）；帽与两条偏移弧相切；单个 Ø 驱动；
 *   原中线保留。帽的扫角方向随中线 sweep 符号确定（开放弧，允许负扫角）。
 * - 宽度是直径/Ø 驱动尺寸；提交后一次 updateSketch 事务（可撤销）。
 *
 * - **整圆中线**（2026-11-20 live `circle-slot.dxf`）：两条同心圆 R±w/2、无帽；
 *   宽度是**线性**尺寸（不是 Ø）。由 ADR-0023 solver-neutral `slotWidth`
 *   （concentric：refs=[中线圆,内圆,外圆]）单一尺寸精确驱动两圆。
 * - **闭合直线环**（2026-11-20 live `ring-slot.dxf`）：外侧处处 r=Ø/2 圆角弧、
 *   内侧斜接尖角、**无端帽**；单一 Ø 驱动内外两侧。由 ADR-0023 `slotWidth`
 *   （ring：refs=[N 中线,N 外,N 内]）单一尺寸驱动，替代 S2d 的 blocked-design。
 * - **多条互不相连直线**（2026-11-20 live `multi-slot` 探针）：每条线各得一个
 *   完整槽，草图中只有**一个 Ø20**（引线跨两个槽的帽弧）——全部帽共用同一
 *   宽度尺寸（`buildMultiLineSlotDraft`：首槽 diameter + 跨槽 equal）。
 *
 * 尚未实现（诚实拒收）：
 * - 凹多边形/自交闭合环（圆角外侧语义未采证据）、分支链、混合「部分连通 +
 *   部分独立」选择、圆弧参与的独立多曲线联动槽、live 宽度光标拖拽。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import type { OffsetChain, OffsetJunction } from './sketch-offset-logic.js';

export interface SlotPoint { u: number; v: number }

/** live mm 文档默认槽宽（Onshape 预览默认 Ø20）。 */
export const DEFAULT_SLOT_WIDTH = 20;

/** 几何容差（与 offset 逻辑同量级）。 */
export const SLOT_TOL = 1e-9;

export type SlotBuildError =
  | 'unsupportedChain'
  | 'unsupportedKind'
  | 'zeroWidth'
  | 'unsolvedLine'
  | 'unsolvedCurve'
  | 'degenerateRadius';

export interface SlotDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  nextId: number;
  /** 端帽弧（开放链/单线/圆弧槽）；闭合环槽/整圆槽为空。 */
  capArcIds: number[];
  boundaryLineIds: number[];
  /** S2u：含圆弧臂的混合线树的同心弧边界（可选；纯直线树不携带）。 */
  boundaryArcIds?: number[];
  /** 单线/链/圆弧槽的 Ø 约束 id（闭合环/整圆槽用 slotWidthConstraintId）。 */
  diameterConstraintId?: number;
  /** 整圆/闭合环槽的单一宽度约束 id（ADR-0023）。 */
  slotWidthConstraintId?: number;
  /** 链槽的圆角内顶点弧（单直线/圆弧槽为空）。 */
  cornerArcIds?: number[];
}

/** 单条直线中线的最小输入（工具负责选链与范围裁决）。 */
export interface SlotLineSeed {
  line: SketchEntityDto & { kind: 'line' };
  entities: SketchEntityDto[];
}

interface SolvedPoint { u: number; v: number }

function indexPoints(entities: SketchEntityDto[]): Map<number, SolvedPoint> {
  const points = new Map<number, SolvedPoint>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  }
  return points;
}

function resolvePoint(ref: number | { x: number; y: number }, points: Map<number, SolvedPoint>): SolvedPoint | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

/**
 * 单条直线槽草稿：pA/pB 为两帽圆心点；U/D 为 ±half 边界线；capA/capB 为半圆帽。
 * 约束：帽心↔中线端点（coincident center）、边界端点↔帽端点（4 coincident）、
 * 4 tangent（帽-线）、2 parallel（边界↔中线）、1 diameter（首帽=width）、1 equal（两帽）。
 */
export function buildLineSlotDraft(input: SlotLineSeed & { width: number; startId: number }): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { line, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };

  const points = indexPoints(entities);
  const a = resolvePoint(line.p1, points);
  const b = resolvePoint(line.p2, points);
  if (!a || !b) return { ok: false, error: 'unsolvedLine' };
  const dx = b.u - a.u;
  const dy = b.v - a.v;
  const len = Math.hypot(dx, dy);
  if (!(len > SLOT_TOL)) return { ok: false, error: 'unsolvedLine' };

  const half = width / 2;
  const n: SolvedPoint = { u: -dy / len, v: dx / len }; // 左法向（offset 同式）
  let nextId = input.startId;
  const alloc = (): number => nextId++;

  const pA = alloc();
  const pB = alloc();
  const uLine = alloc();
  const dLine = alloc();
  const capA = alloc();
  const capB = alloc();

  const upperAngle = Math.atan2(n.v, n.u);
  const lowerAngle = Math.atan2(-n.v, -n.u);

  const entitiesOut: SketchEntityDto[] = [
    { kind: 'point', id: pA, x: a.u, y: a.v },
    { kind: 'point', id: pB, x: b.u, y: b.v },
    {
      kind: 'line', id: uLine,
      p1: { x: a.u + n.u * half, y: a.v + n.v * half },
      p2: { x: b.u + n.u * half, y: b.v + n.v * half },
    },
    {
      kind: 'line', id: dLine,
      p1: { x: a.u - n.u * half, y: a.v - n.v * half },
      p2: { x: b.u - n.u * half, y: b.v - n.v * half },
    },
    {
      kind: 'arc', id: capA, center: pA, radius: half,
      startAngle: upperAngle, sweepAngle: Math.PI,
    },
    {
      kind: 'arc', id: capB, center: pB, radius: half,
      startAngle: lowerAngle, sweepAngle: Math.PI,
    },
  ];

  const constraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    constraints.push({ ...constraint, id });
    return id;
  };

  // 帽心与中线端点重合（帽心是新建 point；中线端点可为 point id 或内联点）。
  add({ kind: 'coincident', refs: [pA, { entity: line.id, part: 'start' }] });
  add({ kind: 'coincident', refs: [pB, { entity: line.id, part: 'end' }] });
  // 边界端点与帽端点重合：U start↔capA start；U end↔capB end；D start↔capA end；D end↔capB start。
  add({ kind: 'coincident', refs: [{ entity: uLine, part: 'start' }, { entity: capA, part: 'start' }] });
  add({ kind: 'coincident', refs: [{ entity: uLine, part: 'end' }, { entity: capB, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: dLine, part: 'start' }, { entity: capA, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: dLine, part: 'end' }, { entity: capB, part: 'start' }] });
  // 相切：四条（每帽×两边界）；求解器按初值就近配对端点。
  add({ kind: 'tangent', refs: [capA, uLine] });
  add({ kind: 'tangent', refs: [capB, uLine] });
  add({ kind: 'tangent', refs: [capA, dLine] });
  add({ kind: 'tangent', refs: [capB, dLine] });
  // 边界与中线平行（live 字形；也锁住方向）。
  add({ kind: 'parallel', refs: [line.id, uLine] });
  add({ kind: 'parallel', refs: [line.id, dLine] });
  // 宽度：一个 Ø 驱动尺寸 + 两帽等半径（live 仅一个 Ø 标签）。
  const diameterConstraintId = add({ kind: 'diameter', refs: [capA], value: width });
  add({ kind: 'equal', refs: [capA, capB] });

  return {
    ok: true,
    draft: {
      entities: entitiesOut,
      constraints,
      nextId,
      capArcIds: [capA, capB],
      boundaryLineIds: [uLine, dLine],
      diameterConstraintId,
    },
  };
}

// ---------------------------------------------------------------------------
// 相连折线链槽（2026-11-19 live `chain-slot.dxf`）
// ---------------------------------------------------------------------------

/** 链端点焊接容差（草图坐标米制；与偏移焊接图同量级）。 */
export const SLOT_CHAIN_TOL = 1e-6;

interface ChainPath {
  members: Array<SketchEntityDto & { kind: 'line' }>;
  /** members[i] 的入口端点槽（与 points[i] 重合）。 */
  entryParts: Array<'start' | 'end'>;
  /** members[i] 的出口端点槽（与 points[i+1] 重合）。 */
  exitParts: Array<'start' | 'end'>;
  /**
   * 沿链路径的顶点（局部坐标）：开放链 n+1 个；闭合环 n+1 个且
   * `points[n] === points[0]`（末点=回环重复点）。
   */
  points: SolvedPoint[];
  /** 闭合环：无自由端、无端帽。 */
  closed: boolean;
}

function endpointCoord(
  line: SketchEntityDto & { kind: 'line' },
  part: 'start' | 'end',
  points: Map<number, SolvedPoint>,
): SolvedPoint | undefined {
  return resolvePoint(part === 'start' ? line.p1 : line.p2, points);
}

/**
 * 从用户预选的直线集合构造偏移链输入（live 2026-11-19：先框选相连的 3 段，
 * 再打开「偏移 ▾ → 槽」，预览直接沿整条链生成）。
 *
 * 只连**选中集合内部**的端点：未选中的相连线不参与（链范围=选择范围）。
 * 选中含非直线/未解算端点 → undefined（工具诚实拒收）；连线关系仍由
 * `orderLineChain` 校验（分支/闭环/非开放链拒收）。
 */
export function lineChainFromSelection(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): OffsetChain | undefined {
  const ids = new Set(selectedIds);
  if (ids.size < 2) return undefined;
  const members = entities.filter(
    (e): e is SketchEntityDto & { kind: 'line' } => e.kind === 'line' && ids.has(e.id),
  );
  if (members.length !== ids.size) return undefined; // 选中了缺失/非直线实体

  const points = indexPoints(entities);
  const ends: Array<{ entityId: number; which: 0 | 1; pos: SolvedPoint }> = [];
  for (const member of members) {
    const a = resolvePoint(member.p1, points);
    const b = resolvePoint(member.p2, points);
    if (!a || !b) return undefined;
    ends.push({ entityId: member.id, which: 0, pos: a }, { entityId: member.id, which: 1, pos: b });
  }

  const junctions: OffsetJunction[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      if (a.entityId === b.entityId) continue;
      if (Math.hypot(a.pos.u - b.pos.u, a.pos.v - b.pos.v) > SLOT_CHAIN_TOL) continue;
      const key = [`${a.entityId}:${a.which}`, `${b.entityId}:${b.which}`].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      junctions.push({
        a: { entityId: a.entityId, which: a.which },
        b: { entityId: b.entityId, which: b.which },
      });
    }
  }
  return { seedId: members[0]!.id, members, junctions };
}

/**
 * 按 OffsetChain 的 junction 图排出有序折线路径（开放、无分支、无环）。
 * 失败（分支/闭环/多连通/非直线成员/端点未解算/共线折点）返回错误码。
 */
export function orderLineChain(
  chain: OffsetChain,
  entities: SketchEntityDto[],
): { ok: true; path: ChainPath } | { ok: false; error: 'unsupportedChain' | 'unsupportedKind' | 'unsolvedLine' } {
  if (chain.members.length < 2) return { ok: false, error: 'unsupportedChain' };
  const members = chain.members;
  if (!members.every((m): m is SketchEntityDto & { kind: 'line' } => m.kind === 'line'))
    return { ok: false, error: 'unsupportedKind' };
  const byId = new Map(members.map((m) => [m.id, m]));
  if (byId.size !== members.length) return { ok: false, error: 'unsupportedChain' };

  // node key = "<lineId>:<0|1>"；junction 边连接两个端点槽。
  const adjacent = new Map<string, { memberId: number; which: 0 | 1 }>();
  const degree = new Map<string, number>();
  const bump = (key: string): void => { degree.set(key, (degree.get(key) ?? 0) + 1); };
  for (const j of chain.junctions) {
    if (!byId.has(j.a.entityId) || !byId.has(j.b.entityId)) continue;
    const ka = `${j.a.entityId}:${j.a.which}`;
    const kb = `${j.b.entityId}:${j.b.which}`;
    // 同一端点被焊两次 = 分支/重边；开放链必须是一维路径。
    if (adjacent.has(ka) || adjacent.has(kb)) return { ok: false, error: 'unsupportedChain' };
    adjacent.set(ka, { memberId: j.b.entityId, which: j.b.which });
    adjacent.set(kb, { memberId: j.a.entityId, which: j.a.which });
    bump(ka);
    bump(kb);
  }
  const n = members.length;
  const closed = chain.junctions.length === n;
  if (!closed && chain.junctions.length !== n - 1) return { ok: false, error: 'unsupportedChain' };

  // 端点键的 degree = 它参与的 junction 边数；开放链恰有两个 degree-0 端点，
  // 闭合环没有自由端；其余（内顶点）degree=1。degree>1 是分支/重边，已拒绝。
  const freeNodes: string[] = [];
  for (const m of members) {
    for (const which of [0, 1] as const) {
      const key = `${m.id}:${which}`;
      const d = degree.get(key) ?? 0;
      if (d > 1) return { ok: false, error: 'unsupportedChain' };
      if (d === 0) freeNodes.push(key);
    }
  }
  if (closed) {
    if (freeNodes.length !== 0) return { ok: false, error: 'unsupportedChain' };
  } else if (freeNodes.length !== 2) {
    return { ok: false, error: 'unsupportedChain' };
  }

  const points = indexPoints(entities);
  const coordFor = (entityId: number, which: 0 | 1): SolvedPoint | undefined => {
    const line = byId.get(entityId);
    return line ? endpointCoord(line, which === 0 ? 'start' : 'end', points) : undefined;
  };
  for (const j of chain.junctions) {
    const a = coordFor(j.a.entityId, j.a.which);
    const b = coordFor(j.b.entityId, j.b.which);
    if (!a || !b) return { ok: false, error: 'unsolvedLine' };
    if (Math.hypot(a.u - b.u, a.v - b.v) > SLOT_CHAIN_TOL) return { ok: false, error: 'unsupportedChain' };
  }

  // 闭合环从 members[0] 的 start 端点起沿环走一圈；开放链从自由端起。
  let startMemberId: number;
  let startEntryPart: 'start' | 'end';
  if (closed) {
    startMemberId = members[0]!.id;
    startEntryPart = 'start';
  } else {
    const [startId, startWhich] = freeNodes[0]!.split(':');
    startMemberId = Number(startId);
    startEntryPart = startWhich === '0' ? 'start' : 'end';
  }
  let member = byId.get(startMemberId);
  let entryPart: 'start' | 'end' = startEntryPart;
  if (!member) return { ok: false, error: 'unsupportedChain' };
  const entryCoord = endpointCoord(member, entryPart, points);
  if (!entryCoord) return { ok: false, error: 'unsolvedLine' };

  const ordered: Array<SketchEntityDto & { kind: 'line' }> = [];
  const entryParts: Array<'start' | 'end'> = [];
  const exitParts: Array<'start' | 'end'> = [];
  const pathPoints: SolvedPoint[] = [entryCoord];
  const visited = new Set<number>();
  let lastExitKey: string | undefined;
  while (member) {
    if (visited.has(member.id)) return { ok: false, error: 'unsupportedChain' };
    visited.add(member.id);
    const exitPart: 'start' | 'end' = entryPart === 'start' ? 'end' : 'start';
    const exitCoord = endpointCoord(member, exitPart, points);
    if (!exitCoord) return { ok: false, error: 'unsolvedLine' };
    ordered.push(member);
    entryParts.push(entryPart);
    exitParts.push(exitPart);
    pathPoints.push(exitCoord);
    lastExitKey = `${member.id}:${exitPart === 'start' ? 0 : 1}`;
    // 闭合环走满 n 段即停（下一步会回到起点，不是新成员）。
    if (closed && ordered.length === n) break;
    const next = adjacent.get(lastExitKey);
    if (!next) break;
    const nextMember = byId.get(next.memberId);
    if (!nextMember) return { ok: false, error: 'unsupportedChain' };
    member = nextMember;
    entryPart = next.which === 0 ? 'start' : 'end';
  }
  if (ordered.length !== n) return { ok: false, error: 'unsupportedChain' };

  if (closed) {
    if (!lastExitKey) return { ok: false, error: 'unsupportedChain' };
    const back = adjacent.get(lastExitKey);
    const startKey = `${startMemberId}:${startEntryPart === 'start' ? 0 : 1}`;
    if (!back || `${back.memberId}:${back.which}` !== startKey)
      return { ok: false, error: 'unsupportedChain' };
    const closingPoint = pathPoints[n];
    if (!closingPoint || Math.hypot(closingPoint.u - entryCoord.u, closingPoint.v - entryCoord.v) > SLOT_CHAIN_TOL)
      return { ok: false, error: 'unsupportedChain' };
  }
  return { ok: true, path: { members: ordered, entryParts, exitParts, points: pathPoints, closed } };
}

function lineIntersection(p: SolvedPoint, d: SolvedPoint, q: SolvedPoint, e: SolvedPoint): SolvedPoint | undefined {
  const denom = d.u * e.v - d.v * e.u;
  if (Math.abs(denom) <= 1e-12) return undefined;
  const t = ((q.u - p.u) * e.v - (q.v - p.v) * e.u) / denom;
  return { u: p.u + t * d.u, v: p.v + t * d.v };
}

/**
 * 相连折线链槽草稿（与 live DXF 同构）：
 *  - 每个内顶点：转向**外侧**为 r=Ø/2 的圆角弧（弧心=顶点），内侧为两偏移线尖角相交；
 *  - 两端为半圆帽；所有弧等半径 + 一个 Ø 驱动尺寸；
 *  - 原中线保留；边界线平行于对应中线段；端点/弧端点 coincident，弧-线 tangent。
 *
 * 开放、无分支、无共线折点的直线链走本函数；**闭合环**转交
 * `buildClosedRingSlotDraft`（ADR-0023 ring 模式，无端帽）。其余返回
 * unsupportedChain/unsupportedKind/unsolvedLine。后端 `equal` 契约恰 2 个同型
 * 实体 → 以首帽为锚逐对展开（等价语义）。
 */
export function buildLineChainSlotDraft(input: {
  chain: OffsetChain;
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { chain, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const ordered = orderLineChain(chain, entities);
  if (!ordered.ok) return ordered;
  // 闭合环走 ring 模式（ADR-0023）：无端帽、外侧圆角弧/内侧斜接、单一 Ø 驱动两侧。
  if (ordered.path.closed) return buildClosedRingSlotDraft(input);
  const { members, entryParts, exitParts, points } = ordered.path;
  const nSeg = members.length;
  const half = width / 2;

  const dirs: SolvedPoint[] = [];
  const normals: SolvedPoint[] = [];
  for (let i = 0; i < nSeg; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len = Math.hypot(dx, dy);
    if (!(len > SLOT_TOL)) return { ok: false, error: 'unsolvedLine' };
    const d = { u: dx / len, v: dy / len };
    dirs.push(d);
    normals.push({ u: -d.v, v: d.u }); // 左法向（与偏移/单线槽同式）
  }

  interface Corner {
    /** +1=left, −1=right 外侧；内侧为另一侧。 */
    outsideSide: 1 | -1;
    /** 外侧弧起点角（side*n[i-1]）。 */
    startAngle: number;
    /** 外侧弧有向扫角（DXF 同几何；允许负值）。 */
    sweep: number;
    /** 两侧偏移线交点（内侧尖角；外侧点为弧端点）。 */
    miter: Record<1 | -1, SolvedPoint>;
  }
  const corners: Corner[] = [];
  for (let i = 1; i < nSeg; i++) {
    const d0 = dirs[i - 1]!;
    const d1 = dirs[i]!;
    const cross = d0.u * d1.v - d0.v * d1.u;
    const dot = Math.max(-1, Math.min(1, d0.u * d1.u + d0.v * d1.v));
    // 共线折点（cross≈0）未采 live 证据：诚实拒收，不猜合并/断开语义。
    if (Math.abs(cross) <= 1e-9 || dot > 1 - 1e-12) return { ok: false, error: 'unsupportedChain' };
    const outsideSide: 1 | -1 = cross > 0 ? -1 : 1;
    const n0 = normals[i - 1]!;
    const n1 = normals[i]!;
    const outsideNormal = outsideSide === 1 ? n0 : { u: -n0.u, v: -n0.v };
    const startAngle = Math.atan2(outsideNormal.v, outsideNormal.u);
    const sweep = Math.sign(cross) * Math.acos(Math.max(-1, Math.min(1, n0.u * n1.u + n0.v * n1.v)));
    const miter = {} as Record<1 | -1, SolvedPoint>;
    for (const side of [1, -1] as const) {
      const p = { u: points[i]!.u + side * half * n0.u, v: points[i]!.v + side * half * n0.v };
      const q = { u: points[i]!.u + side * half * n1.u, v: points[i]!.v + side * half * n1.v };
      const m = lineIntersection(p, d0, q, d1);
      if (!m) return { ok: false, error: 'unsupportedChain' };
      miter[side] = m;
    }
    corners.push({ outsideSide, startAngle, sweep, miter });
  }

  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  const addConstraint = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    newConstraints.push({ ...constraint, id });
    return id;
  };
  const endpointRef = (line: SketchEntityDto & { kind: 'line' }, part: 'start' | 'end'): { entity: number; part: 'start' | 'end' } =>
    ({ entity: line.id, part });

  const capStartCenter = alloc();
  const capEndCenter = alloc();
  newEntities.push({ kind: 'point', id: capStartCenter, x: points[0]!.u, y: points[0]!.v });
  newEntities.push({ kind: 'point', id: capEndCenter, x: points[nSeg]!.u, y: points[nSeg]!.v });
  const cornerCenters: number[] = [];
  for (let i = 1; i < nSeg; i++) {
    const id = alloc();
    cornerCenters.push(id);
    newEntities.push({ kind: 'point', id, x: points[i]!.u, y: points[i]!.v });
  }

  // 边界线：左右两侧 × 每段；外顶点端止于圆角弧端点，内顶点端止于斜接交点。
  const leftLines: number[] = [];
  const rightLines: number[] = [];
  const linesFor = (side: 1 | -1): number[] => side === 1 ? leftLines : rightLines;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < nSeg; i++) {
      const n = normals[i]!;
      const outsideHere = i > 0 && corners[i - 1]!.outsideSide === side;
      const outsideNext = i < nSeg - 1 && corners[i]!.outsideSide === side;
      const start = i === 0
        ? { u: points[0]!.u + side * half * n.u, v: points[0]!.v + side * half * n.v }
        : outsideHere
          ? { u: points[i]!.u + side * half * n.u, v: points[i]!.v + side * half * n.v }
          : corners[i - 1]!.miter[side];
      const end = i === nSeg - 1
        ? { u: points[nSeg]!.u + side * half * n.u, v: points[nSeg]!.v + side * half * n.v }
        : outsideNext
          ? { u: points[i + 1]!.u + side * half * n.u, v: points[i + 1]!.v + side * half * n.v }
          : corners[i]!.miter[side];
      const id = alloc();
      linesFor(side).push(id);
      newEntities.push({
        kind: 'line', id,
        p1: { x: start.u, y: start.v }, p2: { x: end.u, y: end.v },
      });
    }
  }

  // 弧：起点帽、终点帽、每个内顶点的外侧圆角弧。
  const capStartArc = alloc();
  const capEndArc = alloc();
  newEntities.push({
    kind: 'arc', id: capStartArc, center: capStartCenter, radius: half,
    startAngle: Math.atan2(normals[0]!.v, normals[0]!.u), sweepAngle: Math.PI,
  });
  newEntities.push({
    kind: 'arc', id: capEndArc, center: capEndCenter, radius: half,
    startAngle: Math.atan2(normals[nSeg - 1]!.v, normals[nSeg - 1]!.u) + Math.PI, sweepAngle: Math.PI,
  });
  const cornerArcIds: number[] = [];
  for (let i = 1; i < nSeg; i++) {
    const id = alloc();
    cornerArcIds.push(id);
    newEntities.push({
      kind: 'arc', id, center: cornerCenters[i - 1]!, radius: half,
      startAngle: corners[i - 1]!.startAngle, sweepAngle: corners[i - 1]!.sweep,
    });
  }

  // 帽心/圆角弧心 ↔ 中线端点（链顶点的唯一焊接来源）。
  addConstraint({ kind: 'coincident', refs: [capStartCenter, endpointRef(members[0]!, entryParts[0]!)] });
  addConstraint({ kind: 'coincident', refs: [capEndCenter, endpointRef(members[nSeg - 1]!, exitParts[nSeg - 1]!)] });
  for (let i = 1; i < nSeg; i++) {
    addConstraint({ kind: 'coincident', refs: [cornerCenters[i - 1]!, endpointRef(members[i - 1]!, exitParts[i - 1]!)] });
    addConstraint({ kind: 'coincident', refs: [cornerCenters[i - 1]!, endpointRef(members[i]!, entryParts[i]!)] });
  }
  // 边界线平行于对应中线段（宽度方向锁定）。
  for (const side of [1, -1] as const) {
    for (let i = 0; i < nSeg; i++)
      addConstraint({ kind: 'parallel', refs: [members[i]!.id, linesFor(side)[i]!] });
  }
  // 帽端点 coincident（左侧/右侧端点与半圆帽两端一一对应）。
  addConstraint({ kind: 'coincident', refs: [{ entity: leftLines[0]!, part: 'start' }, { entity: capStartArc, part: 'start' }] });
  addConstraint({ kind: 'coincident', refs: [{ entity: rightLines[0]!, part: 'start' }, { entity: capStartArc, part: 'end' }] });
  addConstraint({ kind: 'coincident', refs: [{ entity: rightLines[nSeg - 1]!, part: 'end' }, { entity: capEndArc, part: 'start' }] });
  addConstraint({ kind: 'coincident', refs: [{ entity: leftLines[nSeg - 1]!, part: 'end' }, { entity: capEndArc, part: 'end' }] });
  // 内顶点：外侧=线-弧 coincident；内侧=两条边界线尖角重合。
  for (let i = 1; i < nSeg; i++) {
    const corner = corners[i - 1]!;
    const outside = corner.outsideSide;
    const inside: 1 | -1 = outside === 1 ? -1 : 1;
    const cornerArc = cornerArcIds[i - 1]!;
    addConstraint({ kind: 'coincident', refs: [{ entity: linesFor(outside)[i - 1]!, part: 'end' }, { entity: cornerArc, part: 'start' }] });
    addConstraint({ kind: 'coincident', refs: [{ entity: linesFor(outside)[i]!, part: 'start' }, { entity: cornerArc, part: 'end' }] });
    addConstraint({ kind: 'coincident', refs: [{ entity: linesFor(inside)[i - 1]!, part: 'end' }, { entity: linesFor(inside)[i]!, part: 'start' }] });
  }
  // 相切：帽-首末边界；圆角弧-两侧边界。
  addConstraint({ kind: 'tangent', refs: [capStartArc, leftLines[0]!] });
  addConstraint({ kind: 'tangent', refs: [capStartArc, rightLines[0]!] });
  addConstraint({ kind: 'tangent', refs: [capEndArc, leftLines[nSeg - 1]!] });
  addConstraint({ kind: 'tangent', refs: [capEndArc, rightLines[nSeg - 1]!] });
  for (let i = 1; i < nSeg; i++) {
    const side = corners[i - 1]!.outsideSide;
    addConstraint({ kind: 'tangent', refs: [cornerArcIds[i - 1]!, linesFor(side)[i - 1]!] });
    addConstraint({ kind: 'tangent', refs: [cornerArcIds[i - 1]!, linesFor(side)[i]!] });
  }
  // 一个 Ø 驱动所有弧；后端 equal 契约恰 2 个同型实体 → 以首帽为锚逐对展开。
  const diameterConstraintId = addConstraint({ kind: 'diameter', refs: [capStartArc], value: width });
  for (const arcId of [capEndArc, ...cornerArcIds])
    addConstraint({ kind: 'equal', refs: [capStartArc, arcId] });

  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds: [capStartArc, capEndArc],
      boundaryLineIds: [...leftLines, ...rightLines],
      diameterConstraintId,
      cornerArcIds,
    },
  };
}

// ---------------------------------------------------------------------------
// 圆弧中线槽（2026-11-20 live `arc-slot.dxf`）
// ---------------------------------------------------------------------------

interface SolvedArc {
  center: SolvedPoint;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  start: SolvedPoint;
  end: SolvedPoint;
}

function resolveArcGeometry(
  arc: SketchEntityDto & { kind: 'arc' },
  points: Map<number, SolvedPoint>,
): SolvedArc | undefined {
  const center = resolvePoint(arc.center, points);
  if (!center || arc.radius === undefined || arc.startAngle === undefined || arc.sweepAngle === undefined)
    return undefined;
  if (![arc.radius, arc.startAngle, arc.sweepAngle].every(Number.isFinite)) return undefined;
  const endAngle = arc.startAngle + arc.sweepAngle;
  return {
    center,
    radius: arc.radius,
    startAngle: arc.startAngle,
    sweepAngle: arc.sweepAngle,
    start: {
      u: center.u + arc.radius * Math.cos(arc.startAngle),
      v: center.v + arc.radius * Math.sin(arc.startAngle),
    },
    end: {
      u: center.u + arc.radius * Math.cos(endAngle),
      v: center.v + arc.radius * Math.sin(endAngle),
    },
  };
}

/**
 * 圆弧中线槽草稿（与 live `arc-slot.dxf` 同构）：
 *  - 两条同心偏移弧 R±Ø/2（与源弧同 center/startAngle/sweepAngle）；
 *  - 两个半圆帽（圆心=源弧端点、半径=Ø/2）；帽与两条偏移弧相切，
 *    由几何关系自然得到偏移半径，单个 Ø 驱动（无 offset 数值约束）；
 *  - 帽扫角方向随源弧 sweep 符号确定：起点帽始终从外侧点绕到内侧点；
 *    终点帽始终从外侧点绕到内侧点（负扫角时取 -π）。
 *  - 原中线保留；源弧半径不足以容纳半宽 → degenerateRadius；整圆弧
 *    （|sweep|≈2π）属于整圆槽语义，当前 blocked-design → unsupportedKind。
 *
 * 返回实体 = 2 帽心 point + 2 偏移弧 + 2 帽弧；约束 14 条。
 */
export function buildArcSlotDraft(input: {
  arc: SketchEntityDto & { kind: 'arc' };
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { arc, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const points = indexPoints(entities);
  const g = resolveArcGeometry(arc, points);
  if (!g) return { ok: false, error: 'unsolvedCurve' };
  if (!(g.radius > SLOT_TOL) || !(Math.abs(g.sweepAngle) > SLOT_TOL))
    return { ok: false, error: 'unsolvedCurve' };
  if (Math.abs(Math.abs(g.sweepAngle) - 2 * Math.PI) <= 1e-6)
    return { ok: false, error: 'unsupportedKind' }; // 整圆弧 → 整圆槽语义（尚未支持）
  const half = width / 2;
  if (!(g.radius - half > SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };

  const sign = g.sweepAngle > 0 ? 1 : -1;
  const endAngle = g.startAngle + g.sweepAngle;
  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    newConstraints.push({ ...constraint, id });
    return id;
  };

  const capStartCenter = alloc();
  const capEndCenter = alloc();
  newEntities.push({ kind: 'point', id: capStartCenter, x: g.start.u, y: g.start.v });
  newEntities.push({ kind: 'point', id: capEndCenter, x: g.end.u, y: g.end.v });
  const outerArc = alloc();
  const innerArc = alloc();
  newEntities.push({
    kind: 'arc', id: outerArc, center: arc.center, radius: g.radius + half,
    startAngle: g.startAngle, sweepAngle: g.sweepAngle,
  });
  newEntities.push({
    kind: 'arc', id: innerArc, center: arc.center, radius: g.radius - half,
    startAngle: g.startAngle, sweepAngle: g.sweepAngle,
  });
  const capStartArc = alloc();
  const capEndArc = alloc();
  newEntities.push({
    kind: 'arc', id: capStartArc, center: capStartCenter, radius: half,
    startAngle: g.startAngle,
    // 起点帽：外侧点（a1）→ 内侧点（a1±π），扫角方向与源弧相反。
    sweepAngle: -sign * Math.PI,
  });
  newEntities.push({
    kind: 'arc', id: capEndArc, center: capEndCenter, radius: half,
    startAngle: endAngle,
    // 终点帽：外侧点（a2）→ 内侧点（a2±π），扫角方向与源弧相同。
    sweepAngle: sign * Math.PI,
  });

  add({ kind: 'coincident', refs: [capStartCenter, { entity: arc.id, part: 'start' }] });
  add({ kind: 'coincident', refs: [capEndCenter, { entity: arc.id, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: outerArc, part: 'start' }, { entity: capStartArc, part: 'start' }] });
  add({ kind: 'coincident', refs: [{ entity: innerArc, part: 'start' }, { entity: capStartArc, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: outerArc, part: 'end' }, { entity: capEndArc, part: 'start' }] });
  add({ kind: 'coincident', refs: [{ entity: innerArc, part: 'end' }, { entity: capEndArc, part: 'end' }] });
  add({ kind: 'concentric', refs: [arc.id, outerArc] });
  add({ kind: 'concentric', refs: [arc.id, innerArc] });
  add({ kind: 'tangent', refs: [capStartArc, outerArc] });
  add({ kind: 'tangent', refs: [capStartArc, innerArc] });
  add({ kind: 'tangent', refs: [capEndArc, outerArc] });
  add({ kind: 'tangent', refs: [capEndArc, innerArc] });
  const diameterConstraintId = add({ kind: 'diameter', refs: [capStartArc], value: width });
  add({ kind: 'equal', refs: [capStartArc, capEndArc] });

  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds: [capStartArc, capEndArc],
      boundaryLineIds: [],
      diameterConstraintId,
    },
  };
}

// ---------------------------------------------------------------------------
// 整圆槽（2026-11-20 live `circle-slot.dxf`，ADR-0023 concentric 模式）
// ---------------------------------------------------------------------------

/**
 * 整圆中线槽草稿（与 live `circle-slot.dxf` 同构）：
 *  - 两条同心整圆 R±w/2（无端帽）；源整圆保留；
 *  - 单一 `slotWidth`（concentric）约束 refs=[源圆,内圆,外圆]、value=宽度
 *    （live 显示为**线性**宽度尺寸，不是 Ø）：后端补两圆心重合 + 隐藏径向
 *    构造（点在圆上/点线距/点距），单一宽度同时驱动内外半径；
 *  - 圆心沿用产品整圆的内联 {x,y} 口径（归一化器合成 point，写回仍内联）。
 *
 * 源半径不足以容纳半宽 → degenerateRadius；圆未解算 → unsolvedCurve。
 */
export function buildCircleSlotDraft(input: {
  circle: SketchEntityDto & { kind: 'circle' };
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { circle, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const points = indexPoints(entities);
  const center = resolvePoint(circle.center, points);
  if (!center || circle.radius === undefined || !Number.isFinite(circle.radius))
    return { ok: false, error: 'unsolvedCurve' };
  if (!(circle.radius > SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
  const half = width / 2;
  if (!(circle.radius - half > SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };

  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const innerCircle = alloc();
  const outerCircle = alloc();
  const entitiesOut: SketchEntityDto[] = [
    { kind: 'circle', id: innerCircle, center: { x: center.u, y: center.v }, radius: circle.radius - half },
    { kind: 'circle', id: outerCircle, center: { x: center.u, y: center.v }, radius: circle.radius + half },
  ];
  const slotWidthConstraintId = alloc();
  const constraints: SketchConstraintDto[] = [{
    kind: 'slotWidth', slotMode: 'concentric', id: slotWidthConstraintId,
    refs: [circle.id, innerCircle, outerCircle], value: width,
  }];

  return {
    ok: true,
    draft: {
      entities: entitiesOut,
      constraints,
      nextId,
      capArcIds: [],
      boundaryLineIds: [],
      slotWidthConstraintId,
    },
  };
}

// ---------------------------------------------------------------------------
// 闭合直线环槽（2026-11-20 live `ring-slot.dxf`，ADR-0023 ring 模式）
// ---------------------------------------------------------------------------

/**
 * 闭合直线环槽草稿（与 live `ring-slot.dxf` / `concave-slot.dxf` 同构）：
 *  - 每个顶点：**转向外侧**为 r=Ø/2 圆角弧（弧心=源顶点），转向内侧为两侧偏移线
 *    斜接/交点；凸角与凹角同一规则（凹角时外侧翻到另一侧，必须逐角判定）。
 *  - **无端帽**；n 条源中线 + 2n 条边界（两组）全部保留；
 *  - 单一 `slotWidth`（ring）约束 refs=[N 中线, N 组A, N 组B]、value=宽度：后端为
 *    每条边界补 parallel + 有符号垂距 ±w/2——一个 Ø 尺寸同时驱动两侧。
 *
 * 接受无共线折点的简单闭合直线链（凸或凹；live 2026-11-20 `concave-slot.dxf`）；
 * 宽度导致边界环坍缩/反向 → degenerateRadius；共线折点/分支/自交兜底 →
 * unsupportedChain。自交环无 live 证据，不在承诺范围。
 */
export function buildClosedRingSlotDraft(input: {
  chain: OffsetChain;
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { chain, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const ordered = orderLineChain(chain, entities);
  if (!ordered.ok) return ordered;
  const { members, entryParts, exitParts, points, closed } = ordered.path;
  if (!closed) return { ok: false, error: 'unsupportedChain' };
  const nSeg = members.length;
  const half = width / 2;

  const dirs: SolvedPoint[] = [];
  const normals: SolvedPoint[] = [];
  for (let i = 0; i < nSeg; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len = Math.hypot(dx, dy);
    if (!(len > SLOT_TOL)) return { ok: false, error: 'unsolvedLine' };
    const d = { u: dx / len, v: dy / len };
    dirs.push(d);
    normals.push({ u: -d.v, v: d.u }); // 左法向（与偏移/单线槽同式）
  }

  // 源环有向面积：凹环各角转向可不同，不能再用单一 turnSign 判定朝向。
  let sourceArea2 = 0;
  for (let i = 0; i < nSeg; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % nSeg]!;
    sourceArea2 += a.u * b.v - a.v * b.u;
  }
  if (Math.abs(sourceArea2) <= 2 * SLOT_TOL) return { ok: false, error: 'unsupportedChain' };
  const orientation: 1 | -1 = sourceArea2 > 0 ? 1 : -1;

  interface RingCorner {
    /** 本角转向的外侧（+1=left, −1=right）；凹角与凸角可不同。 */
    outsideSide: 1 | -1;
    startAngle: number;
    sweep: number;
    /** 两侧在角点的端点：外侧=prev 段上的圆角弧端点；内侧=两偏移线斜接交点。 */
    point: Record<1 | -1, SolvedPoint>;
  }
  const corners: RingCorner[] = [];
  for (let i = 0; i < nSeg; i++) {
    const prev = (i + nSeg - 1) % nSeg;
    const d0 = dirs[prev]!;
    const d1 = dirs[i]!;
    const cross = d0.u * d1.v - d0.v * d1.u;
    const dot = Math.max(-1, Math.min(1, d0.u * d1.u + d0.v * d1.v));
    if (Math.abs(cross) <= 1e-9 || dot > 1 - 1e-12) return { ok: false, error: 'unsupportedChain' };
    const outsideSide: 1 | -1 = cross > 0 ? -1 : 1;
    const n0 = normals[prev]!;
    const n1 = normals[i]!;
    const outsideNormal = outsideSide === 1 ? n0 : { u: -n0.u, v: -n0.v };
    const startAngle = Math.atan2(outsideNormal.v, outsideNormal.u);
    const sweep = Math.sign(cross) * Math.acos(Math.max(-1, Math.min(1, n0.u * n1.u + n0.v * n1.v)));
    const point = {} as Record<1 | -1, SolvedPoint>;
    for (const side of [1, -1] as const) {
      const p = { u: points[i]!.u + side * half * n0.u, v: points[i]!.v + side * half * n0.v };
      if (side === outsideSide) {
        point[side] = p; // 外侧圆角弧在 prev 段上的端点（cur 段端点按段法向现算）
      } else {
        const q = { u: points[i]!.u + side * half * n1.u, v: points[i]!.v + side * half * n1.v };
        const m = lineIntersection(p, d0, q, d1);
        if (!m) return { ok: false, error: 'unsupportedChain' };
        point[side] = m;
      }
    }
    corners.push({ outsideSide, startAngle, sweep, point });
  }

  /** 段 i、侧 s 在角点处的边界端点（外侧=弧端点、内侧=斜接点）。 */
  const boundaryPoint = (cornerIndex: number, segmentIndex: number, side: 1 | -1): SolvedPoint => {
    if (side === corners[cornerIndex]!.outsideSide) {
      const n = normals[segmentIndex]!;
      const p = points[cornerIndex]!;
      return { u: p.u + side * half * n.u, v: p.v + side * half * n.v };
    }
    return corners[cornerIndex]!.point[side];
  };

  /** 角点代表点（外侧取弧中点，内侧取斜接点）——用于边界环面积/朝向守卫。 */
  const loopRepPoint = (cornerIndex: number, side: 1 | -1): SolvedPoint => {
    const corner = corners[cornerIndex]!;
    if (side !== corner.outsideSide)
      return corner.point[side];
    const n0 = normals[(cornerIndex + nSeg - 1) % nSeg]!;
    const n1 = normals[cornerIndex]!;
    const mx = n0.u + n1.u;
    const my = n0.v + n1.v;
    const len = Math.hypot(mx, my);
    if (!(len > SLOT_TOL)) return corner.point[side];
    const p = points[cornerIndex]!;
    return {
      u: p.u + side * half * (mx / len),
      v: p.v + side * half * (my / len),
    };
  };

  // 退化/反向守卫：两侧边界线非零长；两组代表环与源环同向且面积非零。
  for (const side of [1, -1] as const) {
    let loopArea2 = 0;
    for (let i = 0; i < nSeg; i++) {
      const next = (i + 1) % nSeg;
      const start = boundaryPoint(i, i, side);
      const end = boundaryPoint(next, i, side);
      if (!(Math.hypot(end.u - start.u, end.v - start.v) > SLOT_TOL))
        return { ok: false, error: 'degenerateRadius' };
      const rep = loopRepPoint(i, side);
      const repNext = loopRepPoint(next, side);
      loopArea2 += rep.u * repNext.v - rep.v * repNext.u;
    }
    if (!(loopArea2 * orientation > 2 * SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
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
  const endpointRef = (line: SketchEntityDto & { kind: 'line' }, part: 'start' | 'end'): { entity: number; part: 'start' | 'end' } =>
    ({ entity: line.id, part });

  const cornerCenters: number[] = [];
  for (let i = 0; i < nSeg; i++) {
    const id = alloc();
    cornerCenters.push(id);
    newEntities.push({ kind: 'point', id, x: points[i]!.u, y: points[i]!.v });
  }

  // 边界线：两组（组A=角 0 的外侧，组B=另一侧），每段各一条；端点按角点性质
  // 取弧端点或斜接点。
  const groupA = corners[0]!.outsideSide;
  const groupB: 1 | -1 = groupA === 1 ? -1 : 1;
  const linesBySide: Record<1 | -1, number[]> = { 1: [], [-1]: [] };
  for (let i = 0; i < nSeg; i++) {
    for (const side of [groupA, groupB] as const) {
      const start = boundaryPoint(i, i, side);
      const end = boundaryPoint((i + 1) % nSeg, i, side);
      const id = alloc();
      linesBySide[side].push(id);
      newEntities.push({
        kind: 'line', id,
        p1: { x: start.u, y: start.v }, p2: { x: end.u, y: end.v },
      });
    }
  }
  const outsideLines = linesBySide[groupA];
  const insideLines = linesBySide[groupB];

  // 圆角弧：每个角一条（弧心=源顶点，半径=Ø/2）。
  const cornerArcIds: number[] = [];
  for (let i = 0; i < nSeg; i++) {
    const id = alloc();
    cornerArcIds.push(id);
    newEntities.push({
      kind: 'arc', id, center: cornerCenters[i]!, radius: half,
      startAngle: corners[i]!.startAngle, sweepAngle: corners[i]!.sweep,
    });
  }

  // 弧心 ↔ 两条相邻中线的端点（环顶点的唯一焊接来源）。
  for (let i = 0; i < nSeg; i++) {
    const prev = (i + nSeg - 1) % nSeg;
    add({ kind: 'coincident', refs: [cornerCenters[i]!, endpointRef(members[prev]!, exitParts[prev]!)] });
    add({ kind: 'coincident', refs: [cornerCenters[i]!, endpointRef(members[i]!, entryParts[i]!)] });
  }
  // 边界线平行于对应中线段（宽度方向锁定）。
  for (let i = 0; i < nSeg; i++) {
    add({ kind: 'parallel', refs: [members[i]!.id, outsideLines[i]!] });
    add({ kind: 'parallel', refs: [members[i]!.id, insideLines[i]!] });
  }
  // 角点：外侧=线-弧端点 coincident + 两侧相切；内侧=斜接两线重合（逐角判定）。
  for (let i = 0; i < nSeg; i++) {
    const prev = (i + nSeg - 1) % nSeg;
    const outside = corners[i]!.outsideSide;
    const inside: 1 | -1 = outside === 1 ? -1 : 1;
    const outLines = linesBySide[outside];
    const inLines = linesBySide[inside];
    add({ kind: 'coincident', refs: [{ entity: outLines[prev]!, part: 'end' }, { entity: cornerArcIds[i]!, part: 'start' }] });
    add({ kind: 'coincident', refs: [{ entity: outLines[i]!, part: 'start' }, { entity: cornerArcIds[i]!, part: 'end' }] });
    add({ kind: 'coincident', refs: [{ entity: inLines[prev]!, part: 'end' }, { entity: inLines[i]!, part: 'start' }] });
    add({ kind: 'tangent', refs: [cornerArcIds[i]!, outLines[prev]!] });
    add({ kind: 'tangent', refs: [cornerArcIds[i]!, outLines[i]!] });
  }
  // 单一宽度尺寸驱动两侧（ADR-0023 ring 模式；后端补 parallel + ±w/2 垂距）。
  const slotWidthConstraintId = add({
    kind: 'slotWidth', slotMode: 'ring',
    refs: [...members.map((m) => m.id), ...outsideLines, ...insideLines], value: width,
  });

  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds: [],
      boundaryLineIds: [...outsideLines, ...insideLines],
      slotWidthConstraintId,
      cornerArcIds,
    },
  };
}

// ---------------------------------------------------------------------------
// 多条互不相连直线的联动等宽槽（2026-11-20 live `multi-slot` 探针，ADR-0022 §2.8）
// ---------------------------------------------------------------------------

/**
 * 多条互不相连直线 → 每条线一个体育场槽，**全部帽弧共享一个 Ø**。
 *
 * live 2026-11-20（私有 `ui-evidence/slot-variants-20261120/state-54..57`）：
 * 两条独立水平线一起框选 → 槽工具为每条线各生成一个完整槽，草图中只出现
 * 一个 `Ø20` 尺寸（引线跨两个槽的帽弧）。实测未直接观察到双槽改宽联动
 * （会话 Poor connection，标签编辑未复现）；本实现按「唯一宽度尺寸 + 全部帽
 * 等半径」的实测结构建模，改值后由 equal 传递同步所有槽。
 *
 * 实现：逐线复用 `buildLineSlotDraft`；仅保留首槽的 diameter，去掉后续槽的
 * diameter（其 equal 保留），再以首槽起帽为锚补齐跨槽 equal。
 * 仅接受两两不相连的直线集合；混合连通/独立、圆弧、分支链由调用方拒收。
 */
export function buildMultiLineSlotDraft(input: {
  lines: Array<SketchEntityDto & { kind: 'line' }>;
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { lines, entities, width } = input;
  if (lines.length < 2) return { ok: false, error: 'unsupportedChain' };
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };

  const outEntities: SketchEntityDto[] = [];
  const outConstraints: SketchConstraintDto[] = [];
  const capArcIds: number[] = [];
  const boundaryLineIds: number[] = [];
  const capAIds: number[] = [];
  let diameterConstraintId: number | undefined;
  let anchorCapId: number | undefined;
  let cursor = input.startId;
  for (let i = 0; i < lines.length; i++) {
    const built = buildLineSlotDraft({ line: lines[i]!, entities, width, startId: cursor });
    if (!built.ok) return built;
    const { draft } = built;
    outEntities.push(...draft.entities);
    for (const constraint of draft.constraints) {
      if (constraint.kind === 'diameter') {
        // 单一 Ø：仅首槽保留 diameter；其余槽由跨槽 equal 传递宽度。
        if (i === 0) {
          outConstraints.push(constraint);
          diameterConstraintId = constraint.id;
          anchorCapId = constraint.refs[0] as number;
        }
        continue;
      }
      outConstraints.push(constraint);
    }
    capArcIds.push(...draft.capArcIds);
    boundaryLineIds.push(...draft.boundaryLineIds);
    capAIds.push(draft.capArcIds[0]!);
    cursor = draft.nextId;
  }
  // 各槽内 capA↔capB 的 equal 已存在；补首槽起帽 ↔ 其它槽起帽。
  let nextId = cursor;
  for (let i = 1; i < capAIds.length; i++) {
    if (anchorCapId === undefined) return { ok: false, error: 'unsupportedChain' };
    outConstraints.push({ kind: 'equal', id: nextId++, refs: [anchorCapId, capAIds[i]!] });
  }
  return {
    ok: true,
    draft: {
      entities: outEntities,
      constraints: outConstraints,
      nextId,
      capArcIds,
      boundaryLineIds,
      ...(diameterConstraintId !== undefined ? { diameterConstraintId } : {}),
    },
  };
}
