/**
 * 草图槽——线+弧混合开放链（ADR-0022 S2h，2026-11-20 live `mixed-slot.dxf`）。
 *
 * live 语义（私有 `ui-evidence/slot-variants-20261120/state-94..98` +
 * `mixed-slot.dxf`）：
 * - 相连的 line/arc 链生成**一个**连续槽：每段两侧偏移（直线→平行线；圆弧→
 *   同心 R±w/2、同角度范围），两端半圆帽 r=w/2；
 * - 每个接缝：转向**外侧**为 r=w/2 圆角弧（弧心=接缝顶点、扫角=两侧偏移方向
 *   夹角），转向内侧为两侧偏移曲线（线/圆弧）的交点（裁剪到交点）；
 * - 单一 Ø 驱动：帽/转角弧全部等半径（以首帽为锚逐对 equal）；原中线保留。
 *
 * 范围：开放、无分支、至少含 1 条 line 与 1 段 arc 的连通链；圆弧必须按
 * authored 方向遍历（start→end）；闭合混合链、混合链内反向弧、分支链、
 * 相切接缝数值不一致 → 诚实拒收。纯直线链仍走 `buildLineChainSlotDraft`。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  SLOT_CHAIN_TOL,
  SLOT_TOL,
  type SlotBuildError,
  type SlotDraft,
} from './sketch-slot-logic.js';

type MixedMemberEntity = SketchEntityDto & ({ kind: 'line' } | { kind: 'arc' });

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
const dot2 = (a: P2, b: P2): number => a.u * b.u + a.v * b.v;
const cross2 = (a: P2, b: P2): number => a.u * b.v - a.v * b.u;
const len2 = (a: P2): number => Math.hypot(a.u, a.v);
const dist2 = (a: P2, b: P2): number => Math.hypot(a.u - b.u, a.v - b.v);
const unit = (a: P2): P2 | undefined => {
  const l = len2(a);
  return l > SLOT_TOL ? { u: a.u / l, v: a.v / l } : undefined;
};
const rotateLeft = (d: P2): P2 => ({ u: -d.v, v: d.u });
const radial = (angle: number): P2 => ({ u: Math.cos(angle), v: Math.sin(angle) });

export interface MixedArcGeometry {
  center: P2;
  radius: number;
  sign: 1 | -1;
  startAngle: number;
  endAngle: number;
  start: P2;
  end: P2;
  startTangent: P2;
  endTangent: P2;
}

/** 弧的派生几何；未解算/非法角度 → undefined。 */
export function resolveMixedArc(
  arc: SketchEntityDto & { kind: 'arc' },
  points: Map<number, P2>,
): MixedArcGeometry | undefined {
  const center = resolvePoint(arc.center, points);
  if (!center || arc.radius === undefined || arc.startAngle === undefined || arc.sweepAngle === undefined)
    return undefined;
  if (![arc.radius, arc.startAngle, arc.sweepAngle].every(Number.isFinite) || !(arc.radius > SLOT_TOL))
    return undefined;
  if (!(Math.abs(arc.sweepAngle) > SLOT_TOL)) return undefined;
  const sign: 1 | -1 = arc.sweepAngle > 0 ? 1 : -1;
  const startAngle = arc.startAngle;
  const endAngle = startAngle + arc.sweepAngle;
  const at = (angle: number): P2 => vadd(center, scale(radial(angle), arc.radius!));
  const tangent = (angle: number): P2 => ({
    u: -sign * Math.sin(angle),
    v: sign * Math.cos(angle),
  });
  return {
    center,
    radius: arc.radius,
    sign,
    startAngle,
    endAngle,
    start: at(startAngle),
    end: at(endAngle),
    startTangent: tangent(startAngle),
    endTangent: tangent(endAngle),
  };
}

export interface MixedChainMember {
  entity: MixedMemberEntity;
  kind: 'line' | 'arc';
  entryPart: 'start' | 'end';
  exitPart: 'start' | 'end';
  start: P2;
  end: P2;
  startTangent: P2;
  endTangent: P2;
  arc?: MixedArcGeometry;
}

export interface MixedChain {
  members: MixedChainMember[];
  /** n+1 个顶点（开放链）。 */
  vertices: P2[];
}

/**
 * 从选择集构造开放线+弧混合链（只连选中集合内部端点）。
 * 至少 1 条 line + 1 段 arc、全部相连成一条开放路径、弧必须 start→end 遍历；
 * 其它（分支/闭环/反向弧/非 line・arc）→ undefined（工具诚实拒收）。
 */
export function mixedChainFromSelection(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): MixedChain | undefined {
  const ids = new Set(selectedIds);
  if (ids.size < 2) return undefined;
  const members = entities.filter(
    (e): e is MixedMemberEntity => (e.kind === 'line' || e.kind === 'arc') && ids.has(e.id),
  );
  if (members.length !== ids.size) return undefined;
  if (!members.some((m) => m.kind === 'line') || !members.some((m) => m.kind === 'arc')) return undefined;

  const points = indexPoints(entities);
  interface End { entityId: number; which: 0 | 1; pos: P2; part: 'start' | 'end' }
  const ends: End[] = [];
  for (const member of members) {
    if (member.kind === 'line') {
      const a = resolvePoint(member.p1, points);
      const b = resolvePoint(member.p2, points);
      if (!a || !b) return undefined;
      ends.push({ entityId: member.id, which: 0, pos: a, part: 'start' });
      ends.push({ entityId: member.id, which: 1, pos: b, part: 'end' });
    } else {
      const g = resolveMixedArc(member, points);
      if (!g) return undefined;
      ends.push({ entityId: member.id, which: 0, pos: g.start, part: 'start' });
      ends.push({ entityId: member.id, which: 1, pos: g.end, part: 'end' });
    }
  }

  // 端点焊接图（选中集合内部；与直线链同口径）。
  const adjacent = new Map<string, { memberId: number; which: 0 | 1 }>();
  const bumpDegree = new Map<string, number>();
  const bump = (key: string): void => { bumpDegree.set(key, (bumpDegree.get(key) ?? 0) + 1); };
  const seen = new Set<string>();
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      if (a.entityId === b.entityId) continue;
      if (dist2(a.pos, b.pos) > SLOT_CHAIN_TOL) continue;
      const ka = `${a.entityId}:${a.which}`;
      const kb = `${b.entityId}:${b.which}`;
      const key = [ka, kb].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      if (adjacent.has(ka) || adjacent.has(kb)) return undefined; // 分支/重边
      adjacent.set(ka, { memberId: b.entityId, which: b.which });
      adjacent.set(kb, { memberId: a.entityId, which: a.which });
      bump(ka);
      bump(kb);
    }
  }
  if (seen.size !== members.length - 1) return undefined; // 非单链（断链/闭环/分支）

  const free = ends.filter((end) => (bumpDegree.get(`${end.entityId}:${end.which}`) ?? 0) === 0);
  if (free.length !== 2) return undefined;
  // 起点：优先 line 端（弧反向由 entryPart 检查拒绝）。
  const startEnd = free[0]!;
  let currentId = startEnd.entityId;
  let entryPart: 'start' | 'end' = startEnd.part;
  const byId = new Map(members.map((m) => [m.id, m]));
  const ordered: MixedChainMember[] = [];
  const vertices: P2[] = [startEnd.pos];
  const visited = new Set<number>();
  while (true) {
    const member = byId.get(currentId);
    if (!member || visited.has(currentId)) return undefined;
    visited.add(currentId);
    const g = member.kind === 'arc' ? resolveMixedArc(member, points) : undefined;
    if (member.kind === 'arc' && !g) return undefined;
    if (member.kind === 'arc' && entryPart !== 'start') return undefined; // 反向弧未采证据
    const exitPart: 'start' | 'end' = entryPart === 'start' ? 'end' : 'start';
    const endPos = member.kind === 'line'
      ? (exitPart === 'start' ? resolvePoint(member.p1, points) : resolvePoint(member.p2, points))
      : (exitPart === 'start' ? g!.start : g!.end);
    if (!endPos) return undefined;
    const tangent = (part: 'start' | 'end'): P2 | undefined => {
      if (member.kind === 'arc') return part === 'start' ? g!.startTangent : g!.endTangent;
      const a = resolvePoint(member.p1, points);
      const b = resolvePoint(member.p2, points);
      if (!a || !b) return undefined;
      const d = unit(sub(b, a));
      if (!d) return undefined;
      return part === 'start' ? d : d;
    };
    const startTangent = tangent(entryPart);
    const endTangent = tangent(exitPart);
    if (!startTangent || !endTangent) return undefined;
    ordered.push({
      entity: member,
      kind: member.kind,
      entryPart,
      exitPart,
      start: member.kind === 'line'
        ? (entryPart === 'start' ? resolvePoint(member.p1, points)! : resolvePoint(member.p2, points)!)
        : (entryPart === 'start' ? g!.start : g!.end),
      end: endPos,
      startTangent,
      endTangent,
      ...(g ? { arc: g } : {}),
    });
    vertices.push(endPos);
    if (ordered.length === members.length) break;
    const which = exitPart === 'start' ? 0 : 1;
    const next = adjacent.get(`${member.id}:${which}`);
    if (!next) return undefined;
    const nextMember = byId.get(next.memberId);
    if (!nextMember) return undefined;
    currentId = nextMember.id;
    entryPart = next.which === 0 ? 'start' : 'end';
  }
  if (ordered.length !== members.length) return undefined;
  return { members: ordered, vertices };
}

interface BoundaryLine {
  kind: 'line';
  memberIndex: number;
  side: 1 | -1;
  start: P2;
  end: P2;
}
interface BoundaryArc {
  kind: 'arc';
  memberIndex: number;
  side: 1 | -1;
  center: P2;
  radius: number;
  /** 遍历角范围（与源弧同向；sign 由 endAngle-startAngle 的符号确定）。 */
  startAngle: number;
  endAngle: number;
}
type Boundary = BoundaryLine | BoundaryArc;

interface Junction {
  index: number;
  vertex: P2;
  type: 'corner' | 'tangent';
  outsideSide?: 1 | -1;
  startAngle?: number;
  sweep?: number;
}

/** 圆-直线求交（无限直线）；取离 vertex 最近的交点。 */
function intersectLineCircle(
  lineStart: P2, lineDir: P2, center: P2, radius: number, near: P2,
): P2 | undefined {
  const d = unit(lineDir);
  if (!d) return undefined;
  const f = sub(lineStart, center);
  const b = 2 * dot2(f, d);
  const c = dot2(f, f) - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < -1e-9) return undefined;
  const sq = Math.sqrt(Math.max(0, disc));
  const candidates = [(-b - sq) / 2, (-b + sq) / 2]
    .map((t) => vadd(lineStart, scale(d, t)));
  return candidates.sort((a, b2) => dist2(a, near) - dist2(b2, near))[0];
}

/** 圆-圆求交；取离 vertex 最近的交点。 */
function intersectCircleCircle(
  c0: P2, r0: number, c1: P2, r1: number, near: P2,
): P2 | undefined {
  const d = sub(c1, c0);
  const dl = len2(d);
  if (!(dl > SLOT_TOL) || dl > r0 + r1 + SLOT_TOL || dl < Math.abs(r0 - r1) - SLOT_TOL) return undefined;
  const a = (r0 * r0 - r1 * r1 + dl * dl) / (2 * dl);
  const h2 = r0 * r0 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const ux = d.u / dl;
  const uy = d.v / dl;
  const base = { u: c0.u + a * ux, v: c0.v + a * uy };
  const candidates = [
    { u: base.u - h * uy, v: base.v + h * ux },
    { u: base.u + h * uy, v: base.v - h * ux },
  ];
  return candidates.sort((p, q) => dist2(p, near) - dist2(q, near))[0];
}

/** 边界曲线在“接入端/接出端”的点（未裁剪）。 */
function boundaryPoint(boundary: Boundary, part: 'start' | 'end'): P2 {
  if (boundary.kind === 'line') return part === 'start' ? boundary.start : boundary.end;
  const angle = part === 'start' ? boundary.startAngle : boundary.endAngle;
  return vadd(boundary.center, scale(radial(angle), boundary.radius));
}

/** 将边界的 start/end 端点裁剪到给定交点（直线改端点；弧改角度并校验在范围内）。 */
function trimBoundary(boundary: Boundary, part: 'start' | 'end', point: P2): boolean {
  if (boundary.kind === 'line') {
    if (part === 'start') boundary.start = point;
    else boundary.end = point;
    return true;
  }
  const phi = Math.atan2(point.v - boundary.center.v, point.u - boundary.center.u);
  // 交点须落在原弧的角范围内（按遍历方向）；否则说明取到了另一侧交点。
  const norm = (v: number): number => {
    const twoPi = 2 * Math.PI;
    return ((v % twoPi) + twoPi) % twoPi;
  };
  const ccw = boundary.endAngle > boundary.startAngle;
  const startNorm = norm(boundary.startAngle);
  const sweepAbs = norm(boundary.endAngle - boundary.startAngle);
  const phiRel = ccw ? norm(phi - startNorm) : norm(startNorm - phi);
  if (phiRel > sweepAbs + 1e-6) return false;
  if (part === 'start') boundary.startAngle = phi;
  else boundary.endAngle = phi;
  return true;
}

/**
 * 线+弧混合开放链槽草稿（live 2026-11-20 `mixed-slot.dxf` 同构）。
 *
 * - 每段两侧偏移边界：line→平行线；arc→同心 R±w/2、同角范围（接缝内侧裁剪）；
 * - 接缝：转向外侧 r=w/2 转角弧（弧心=顶点）；转向内侧为两偏移曲线交点；
 *   相切接缝两侧直接相接（无弧）；
 * - 两端半圆帽；单个 Ø（首帽 diameter + 其它帽/转角弧逐对 equal）；
 * - 原中线保留；提交仍由工具一次 updateSketch。
 */
export function buildMixedChainSlotDraft(input: {
  chain: MixedChain;
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { chain, width } = input;
  const { members, vertices } = chain;
  const n = members.length;
  if (n < 2) return { ok: false, error: 'unsupportedChain' };
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const half = width / 2;

  // 1) 边界曲线（未裁剪）。
  const boundaries: Record<1 | -1, Boundary[]> = { 1: [], [-1]: [] };
  for (let i = 0; i < n; i++) {
    const member = members[i]!;
    if (member.kind === 'line') {
      const d = unit(sub(member.end, member.start));
      if (!d) return { ok: false, error: 'unsolvedLine' };
      const left = rotateLeft(d);
      for (const side of [1, -1] as const) {
        boundaries[side].push({
          kind: 'line', memberIndex: i, side,
          start: vadd(member.start, scale(left, side * half)),
          end: vadd(member.end, scale(left, side * half)),
        });
      }
    } else {
      const g = member.arc;
      if (!g) return { ok: false, error: 'unsolvedCurve' };
      if (!(g.radius - half > SLOT_TOL)) return { ok: false, error: 'degenerateRadius' };
      for (const side of [1, -1] as const) {
        boundaries[side].push({
          kind: 'arc', memberIndex: i, side,
          center: g.center,
          radius: g.radius - side * g.sign * half,
          startAngle: g.startAngle,
          endAngle: g.endAngle,
        });
      }
    }
  }

  // 2) 接缝：外侧转角弧 / 内侧交点 / 相切直连。
  const junctions: Junction[] = [];
  for (let i = 1; i < n; i++) {
    const vertex = vertices[i]!;
    const t0 = members[i - 1]!.endTangent;
    const t1 = members[i]!.startTangent;
    const cross = cross2(t0, t1);
    const dot = Math.max(-1, Math.min(1, dot2(t0, t1)));
    if (Math.abs(cross) <= 1e-9) {
      if (dot < 0) return { ok: false, error: 'unsupportedChain' };
      // 相切：两侧偏移曲线在共享法向点相遇（数值校验）。
      for (const side of [1, -1] as const) {
        const prev = boundaryPoint(boundaries[side][i - 1]!, 'end');
        const next = boundaryPoint(boundaries[side][i]!, 'start');
        if (dist2(prev, next) > 1e-6) return { ok: false, error: 'unsupportedChain' };
      }
      junctions.push({ index: i, vertex, type: 'tangent' });
      continue;
    }
    const outsideSide: 1 | -1 = cross > 0 ? -1 : 1;
    const insideSide: 1 | -1 = outsideSide === 1 ? -1 : 1;
    const prevOut = boundaryPoint(boundaries[outsideSide][i - 1]!, 'end');
    const nextOut = boundaryPoint(boundaries[outsideSide][i]!, 'start');
    const startAngle = Math.atan2(prevOut.v - vertex.v, prevOut.u - vertex.u);
    const endAngle = Math.atan2(nextOut.v - vertex.v, nextOut.u - vertex.u);
    let sweep = endAngle - startAngle;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    if (Math.abs(sweep) <= SLOT_TOL) return { ok: false, error: 'unsupportedChain' };
    junctions.push({ index: i, vertex, type: 'corner', outsideSide, startAngle, sweep });

    // 内侧交点：裁剪两条边界曲线。
    const prevB = boundaries[insideSide][i - 1]!;
    const nextB = boundaries[insideSide][i]!;
    let intersection: P2 | undefined;
    if (prevB.kind === 'line' && nextB.kind === 'line') {
      const d0 = unit(sub(prevB.end, prevB.start));
      const d1 = unit(sub(nextB.end, nextB.start));
      if (!d0 || !d1) return { ok: false, error: 'unsolvedLine' };
      const denom = cross2(d0, d1);
      if (Math.abs(denom) <= 1e-12) return { ok: false, error: 'unsupportedChain' };
      const t = cross2(sub(nextB.start, prevB.start), d1) / denom;
      intersection = vadd(prevB.start, scale(d0, t));
    } else if (prevB.kind === 'line') {
      const nextArc = nextB as BoundaryArc;
      const d = unit(sub(prevB.end, prevB.start));
      if (!d) return { ok: false, error: 'unsolvedLine' };
      intersection = intersectLineCircle(prevB.start, d, nextArc.center, nextArc.radius, vertex);
    } else if (nextB.kind === 'line') {
      const prevArc = prevB as BoundaryArc;
      const d = unit(sub(nextB.end, nextB.start));
      if (!d) return { ok: false, error: 'unsolvedLine' };
      intersection = intersectLineCircle(nextB.start, d, prevArc.center, prevArc.radius, vertex);
    } else {
      const prevArc = prevB as BoundaryArc;
      const nextArc = nextB as BoundaryArc;
      intersection = intersectCircleCircle(prevArc.center, prevArc.radius, nextArc.center, nextArc.radius, vertex);
    }
    if (!intersection) return { ok: false, error: 'unsupportedChain' };
    if (!trimBoundary(prevB, 'end', intersection)) return { ok: false, error: 'unsupportedChain' };
    if (!trimBoundary(nextB, 'start', intersection)) return { ok: false, error: 'unsupportedChain' };
  }

  // 3) 分配实体/约束。
  let nextId = input.startId;
  const alloc = (): number => nextId++;
  const newEntities: SketchEntityDto[] = [];
  const newConstraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    newConstraints.push({ ...constraint, id });
    return id;
  };
  const endpointRef = (entity: MixedMemberEntity, part: 'start' | 'end'): { entity: number; part: 'start' | 'end' } =>
    ({ entity: entity.id, part });

  // 3.1 边界实体。
  const boundaryIds: Record<1 | -1, number[]> = { 1: [], [-1]: [] };
  const boundaryIdAt = (side: 1 | -1, memberIndex: number): number => boundaryIds[side][memberIndex]!;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < n; i++) {
      const boundary = boundaries[side][i]!;
      const id = alloc();
      boundaryIds[side].push(id);
      if (boundary.kind === 'line') {
        newEntities.push({
          kind: 'line', id,
          p1: { x: boundary.start.u, y: boundary.start.v },
          p2: { x: boundary.end.u, y: boundary.end.v },
        });
      } else {
        const sourceArc = members[i]!.entity as SketchEntityDto & { kind: 'arc' };
        newEntities.push({
          kind: 'arc', id,
          center: sourceArc.center,
          radius: boundary.radius,
          startAngle: boundary.startAngle,
          sweepAngle: boundary.endAngle - boundary.startAngle,
        });
      }
    }
  }

  // 3.2 帽（链两端）。
  const capCenters: number[] = [];
  const capArcs: number[] = [];
  /**
   * 端帽：半径 half，弧心=链端顶点。方向必须是**背离链体**的半圆：
   * 起点帽从左侧（left）经后方绕到右侧（sweep +π）；终点帽从右侧经前方绕到
   * 左侧（sweep +π）。两条边界在帽端点的切向与帽相切（live DXF 同构）。
   */
  const makeCap = (
    memberIndex: number,
    part: 'start' | 'end',
    leftPart: 'start' | 'end',
    rightPart: 'start' | 'end',
    leftFirst: boolean,
  ): number => {
    const member = members[memberIndex]!;
    const vertex = vertices[part === 'start' ? memberIndex : memberIndex + 1]!;
    const leftPoint = boundaryPoint(boundaries[1][memberIndex]!, leftPart);
    const rightPoint = boundaryPoint(boundaries[-1][memberIndex]!, rightPart);
    const firstPoint = leftFirst ? leftPoint : rightPoint;
    const secondPoint = leftFirst ? rightPoint : leftPoint;
    const firstSide: 1 | -1 = leftFirst ? 1 : -1;
    const secondSide: 1 | -1 = leftFirst ? -1 : 1;
    const centerId = alloc();
    capCenters.push(centerId);
    newEntities.push({ kind: 'point', id: centerId, x: vertex.u, y: vertex.v });
    const arcId = alloc();
    capArcs.push(arcId);
    const startAngle = Math.atan2(firstPoint.v - vertex.v, firstPoint.u - vertex.u);
    newEntities.push({ kind: 'arc', id: arcId, center: centerId, radius: half, startAngle, sweepAngle: Math.PI });
    // 帽心 ↔ 链端顶点。
    add({ kind: 'coincident', refs: [centerId, endpointRef(member.entity, part)] });
    // 帽端点 ↔ 左右边界端点。
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, { entity: boundaryIds[firstSide][memberIndex]!, part: firstSide === 1 ? leftPart : rightPart }] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, { entity: boundaryIds[secondSide][memberIndex]!, part: secondSide === 1 ? leftPart : rightPart }] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[1][memberIndex]!] });
    add({ kind: 'tangent', refs: [arcId, boundaryIds[-1][memberIndex]!] });
    return arcId;
  };
  const startCap = makeCap(0, 'start', 'start', 'start', true);
  const endCap = makeCap(n - 1, 'end', 'end', 'end', false);

  // 3.3 接缝实体/约束。
  const cornerCenters: number[] = [];
  const cornerArcs: number[] = [];
  for (const junction of junctions) {
    const i = junction.index;
    const prev = members[i - 1]!;
    const next = members[i]!;
    if (junction.type === 'tangent') {
      for (const side of [1, -1] as const) {
        add({
          kind: 'coincident',
          refs: [
            { entity: boundaryIdAt(side, i - 1), part: 'end' },
            { entity: boundaryIdAt(side, i), part: 'start' },
          ],
        });
      }
      continue;
    }
    const outside = junction.outsideSide!;
    const inside: 1 | -1 = outside === 1 ? -1 : 1;
    const centerId = alloc();
    cornerCenters.push(centerId);
    newEntities.push({ kind: 'point', id: centerId, x: junction.vertex.u, y: junction.vertex.v });
    const arcId = alloc();
    cornerArcs.push(arcId);
    newEntities.push({
      kind: 'arc', id: arcId, center: centerId, radius: half,
      startAngle: junction.startAngle!, sweepAngle: junction.sweep!,
    });
    add({ kind: 'coincident', refs: [centerId, endpointRef(prev.entity, prev.exitPart)] });
    add({ kind: 'coincident', refs: [centerId, endpointRef(next.entity, next.entryPart)] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'start' }, { entity: boundaryIdAt(outside, i - 1), part: 'end' }] });
    add({ kind: 'coincident', refs: [{ entity: arcId, part: 'end' }, { entity: boundaryIdAt(outside, i), part: 'start' }] });
    add({ kind: 'tangent', refs: [arcId, boundaryIdAt(outside, i - 1)] });
    add({ kind: 'tangent', refs: [arcId, boundaryIdAt(outside, i)] });
    add({
      kind: 'coincident',
      refs: [
        { entity: boundaryIdAt(inside, i - 1), part: 'end' },
        { entity: boundaryIdAt(inside, i), part: 'start' },
      ],
    });
  }

  // 3.4 平行（线边界）/ 同心（弧边界）。
  for (let i = 0; i < n; i++) {
    const member = members[i]!;
    for (const side of [1, -1] as const) {
      if (member.kind === 'line') {
        add({ kind: 'parallel', refs: [member.entity.id, boundaryIdAt(side, i)] });
      } else {
        add({ kind: 'concentric', refs: [member.entity.id, boundaryIdAt(side, i)] });
      }
    }
  }

  // 3.5 单一 Ø：首帽 diameter + 其它帽/转角弧逐对 equal。
  const diameterConstraintId = add({ kind: 'diameter', refs: [startCap], value: width });
  for (const arcId of [...capArcs.slice(1), ...cornerArcs])
    add({ kind: 'equal', refs: [startCap, arcId] });

  const allBoundaryIds = [...boundaryIds[1], ...boundaryIds[-1]];
  return {
    ok: true,
    draft: {
      entities: newEntities,
      constraints: newConstraints,
      nextId,
      capArcIds: capArcs,
      boundaryLineIds: allBoundaryIds,
      diameterConstraintId,
      cornerArcIds: cornerArcs,
    },
  };
}
