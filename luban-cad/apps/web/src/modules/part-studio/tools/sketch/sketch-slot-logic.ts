/**
 * 草图槽（Slot）纯逻辑（ADR-0022 S2，2026-11-19 live 探针）。
 *
 * live 语义（私有 `ui-evidence/slot-probe-20261119/` + `sketch1-slot.dxf`）：
 * - 单条直线：体育场槽（两平行边界 + 两端半圆帽），默认 Ø20；改宽联动。
 * - 相连折线链（2026-11-19 链探针 `chain-slot.dxf`）：沿整条链生成**一个**槽；
 *   每个内顶点外侧为 r=Ø/2 的圆角弧（弧心=顶点），内侧为两条偏移线尖角相交；
 *   两端半圆帽；原中线全部保留；仍只有一个 Ø 驱动尺寸（所有弧等半径）。
 * - 宽度是直径/Ø 驱动尺寸；提交后一次 updateSketch 事务（可撤销）。
 *
 * 尚未实现（诚实拒收）：圆弧/整圆中线、闭合环槽、分支链、多条互不相连曲线的
 * 联动等宽槽（live 已见两独立槽共享一个 Ø，但选择/尺寸联动语义待补）。
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
  | 'unsolvedLine';

export interface SlotDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  nextId: number;
  capArcIds: [number, number];
  boundaryLineIds: number[];
  diameterConstraintId: number;
  /** 链槽的圆角内顶点弧（单直线为空）。 */
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
  /** 沿链路径的 n+1 个顶点（局部坐标）。 */
  points: SolvedPoint[];
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
  if (chain.junctions.length !== members.length - 1) return { ok: false, error: 'unsupportedChain' };

  // 端点键的 degree = 它参与的 junction 边数；开放链恰有两个 degree-0 端点，
  // 其余（内顶点）degree=1。degree>1 是分支/重边，已在上方拒绝。
  const freeNodes: string[] = [];
  for (const m of members) {
    for (const which of [0, 1] as const) {
      const key = `${m.id}:${which}`;
      const d = degree.get(key) ?? 0;
      if (d > 1) return { ok: false, error: 'unsupportedChain' };
      if (d === 0) freeNodes.push(key);
    }
  }
  if (freeNodes.length !== 2) return { ok: false, error: 'unsupportedChain' };

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

  const [startId, startWhich] = freeNodes[0]!.split(':');
  let member = byId.get(Number(startId));
  let entryPart: 'start' | 'end' = startWhich === '0' ? 'start' : 'end';
  if (!member) return { ok: false, error: 'unsupportedChain' };
  const entryCoord = endpointCoord(member, entryPart, points);
  if (!entryCoord) return { ok: false, error: 'unsolvedLine' };

  const ordered: Array<SketchEntityDto & { kind: 'line' }> = [];
  const entryParts: Array<'start' | 'end'> = [];
  const exitParts: Array<'start' | 'end'> = [];
  const pathPoints: SolvedPoint[] = [entryCoord];
  const visited = new Set<number>();
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
    const next = adjacent.get(`${member.id}:${exitPart === 'start' ? 0 : 1}`);
    if (!next) break;
    const nextMember = byId.get(next.memberId);
    if (!nextMember) return { ok: false, error: 'unsupportedChain' };
    member = nextMember;
    entryPart = next.which === 0 ? 'start' : 'end';
  }
  if (ordered.length !== members.length) return { ok: false, error: 'unsupportedChain' };
  return { ok: true, path: { members: ordered, entryParts, exitParts, points: pathPoints } };
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
 * 仅开放、无分支、无共线折点的直线链；其余返回 unsupportedChain/unsupportedKind/
 * unsolvedLine。后端 `equal` 契约恰 2 个同型实体 → 以首帽为锚逐对展开（等价语义）。
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
