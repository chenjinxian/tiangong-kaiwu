/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图圆角纯逻辑（Onshape Sketch Fillet 首切片 2026-11-12）。
 *
 * Live 证据（2026-11-12，自家 LubanLivePostman 副本 / 草图1 / 英寸文档）：
 * 圆角工具激活后点击矩形角点，**立即**生成相切圆弧并显示可编辑的 R 尺寸
 * （R0.25）；没有单独的半径对话框。本切片按同一交互：点击两条直线共享的
 * 角点 → 用默认半径生成 arc + 两条线端点回缩 + coincident/tangent/radius
 * 约束；半径随后经现有 R 尺寸双击编辑改值（`SketchDimensionEditor`）。
 *
 * 几何：线 A 方向 a、线 B 方向 b 均从角点指向各自另一端，夹角 θ。
 *   切点 = 角点 + 各自方向 · r/tan(θ/2)
 *   圆心 = 角点 + 单位角平分线 · r/sin(θ/2)
 * 圆弧取两切点间的短弧（扫角 |π−θ|），朝向角点一侧（用短弧中点与角点
 * 方向点积裁决符号）。
 *
 * 边界（诚实登记，不伪造）：支持**两条非投影直线**的角点（共享坐标 /
 * coincident / 同一显式 point 实体）与两线延长交点；显式 point 端点以
 * 「裁剪端分离为内联点 + 孤儿点按引用清理」处理。直线-圆弧组合、三条以上
 * 线交于一点、投影线暂不支持——工具提示 unsupported 且不写数据。
 */
import type { SketchConstraintDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';

interface LocalPoint { x: number; y: number }

type EndpointPart = 'start' | 'end';

export interface FilletCornerLine {
  lineId: number;
  part: EndpointPart;
  /** 该直线另一端（用于延伸/方向展示）。 */
  other: LocalPoint;
  /** 从角点指向另一端的单位方向。 */
  direction: LocalPoint;
  /** 角点到另一端的距离。 */
  length: number;
}

/** 可圆角角点：两条直线各一个端点，坐标（平均）为角点。 */
export interface FilletCorner {
  /** 稳定键 `lineId:part|lineId:part`（a/b 按 lineId 排序）。 */
  id: string;
  point: LocalPoint;
  a: FilletCornerLine;
  b: FilletCornerLine;
}

export interface FilletArcGeometry {
  /** 线 a 上的切点（= arc start）。 */
  tangentA: LocalPoint;
  /** 线 b 上的切点（= arc end）。 */
  tangentB: LocalPoint;
  center: LocalPoint;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  /** 圆心到切点半径与对应直线的夹角应为 90°（调试/单测用）。 */
  theta: number;
}

export type FilletGeometryResult =
  | { ok: true; geometry: FilletArcGeometry }
  | { ok: false; reason: 'degenerate' | 'radius-too-large' | 'invalid-radius' };

export type FilletFailureReason =
  | 'no-corner'
  | 'unsupported'
  | 'degenerate'
  | 'radius-too-large'
  | 'invalid-radius'
  /** 两线选择：切点落在线段外（线间隙大于切距/交点在线段内）。 */
  | 'outside-segment';

export type FilletCornerResult =
  | {
    ok: true;
    entities: SketchEntityDto[];
    constraints: SketchConstraintDto[];
    arcId: number;
    nextId: number;
    geometry: FilletArcGeometry;
  }
  | {
    ok: false;
    reason: FilletFailureReason;
    entities: SketchEntityDto[];
    constraints: SketchConstraintDto[];
  };

const EPS = 1e-9;
const CORNER_TOL = 1e-6;

interface EndpointEntry {
  line: SketchEntityDto & { kind: 'line' };
  part: EndpointPart;
  point: LocalPoint;
  /** 内联端点（非 point 实体引用）才可修剪。 */
  inline: boolean;
}

interface Dsu {
  parent: number[];
  find(index: number): number;
  union(a: number, b: number): void;
}

function makeDsu(size: number): Dsu {
  const parent = Array.from({ length: size }, (_, index) => index);
  return {
    parent,
    find(index: number): number {
      let root = index;
      while (parent[root] !== root)
        root = parent[root]!;
      while (parent[index] !== root) {
        const next = parent[index]!;
        parent[index] = root;
        index = next;
      }
      return root;
    },
    union(a: number, b: number): void {
      const ra = this.find(a);
      const rb = this.find(b);
      if (ra !== rb)
        parent[ra] = rb;
    },
  };
}

function pointMap(entities: readonly SketchEntityDto[]): Map<number, LocalPoint> {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
      points.set(entity.id, { x: entity.x, y: entity.y });
  }
  return points;
}

function resolvePoint(ref: number | LocalPoint | undefined, points: ReadonlyMap<number, LocalPoint>): LocalPoint | undefined {
  if (ref === undefined)
    return undefined;
  if (typeof ref === 'number')
    return points.get(ref);
  if (Number.isFinite(ref.x) && Number.isFinite(ref.y))
    return { x: ref.x, y: ref.y };
  return undefined;
}

function endpointKey(lineId: number, part: EndpointPart): string {
  return `${lineId}:${part}`;
}

/** 结构化端点引用（只有线端点参与圆角；数字 point 引用/圆心等返回 undefined）。 */
function refKey(ref: SketchRef): string | undefined {
  if (typeof ref === 'number' || 'origin' in ref)
    return undefined;
  if (!('entity' in ref) || (ref.part !== 'start' && ref.part !== 'end'))
    return undefined;
  return endpointKey(ref.entity, ref.part);
}

function lineEndpoints(
  entities: readonly SketchEntityDto[],
  points: ReadonlyMap<number, LocalPoint>,
): EndpointEntry[] {
  const out: EndpointEntry[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'line' || entity.projected)
      continue;
    const start = resolvePoint(entity.p1, points);
    const end = resolvePoint(entity.p2, points);
    if (start)
      out.push({ line: entity, part: 'start', point: start, inline: typeof entity.p1 !== 'number' });
    if (end)
      out.push({ line: entity, part: 'end', point: end, inline: typeof entity.p2 !== 'number' });
  }
  return out;
}

/** 两条直线端点是否由 coincident 约束直接连接（内联端点结构化引用）。 */
function coincidentPairs(
  entries: readonly EndpointEntry[],
  constraints: readonly SketchConstraintDto[],
): Array<[number, number]> {
  const indexByKey = new Map<string, number>();
  entries.forEach((entry, index) => indexByKey.set(endpointKey(entry.line.id, entry.part), index));
  const pairs: Array<[number, number]> = [];
  for (const constraint of constraints) {
    if (constraint.kind !== 'coincident' || constraint.refs.length !== 2)
      continue;
    const first = refKey(constraint.refs[0]!);
    const second = refKey(constraint.refs[1]!);
    if (first === undefined || second === undefined || first === second)
      continue;
    const a = indexByKey.get(first);
    const b = indexByKey.get(second);
    if (a !== undefined && b !== undefined && entries[a]!.line.id !== entries[b]!.line.id)
      pairs.push([a, b]);
  }
  return pairs;
}

function unit(from: LocalPoint, to: LocalPoint): { direction: LocalPoint; length: number } | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > EPS))
    return undefined;
  return { direction: { x: dx / length, y: dy / length }, length };
}

function cornerLine(
  entry: EndpointEntry,
  corner: LocalPoint,
  points: ReadonlyMap<number, LocalPoint>,
): FilletCornerLine | undefined {
  const otherRef = entry.part === 'start' ? entry.line.p2 : entry.line.p1;
  const other = typeof otherRef === 'number' ? points.get(otherRef) : otherRef;
  if (!other)
    return undefined;
  const vector = unit(corner, other);
  if (!vector)
    return undefined;
  return {
    lineId: entry.line.id,
    part: entry.part,
    other: { x: other.x, y: other.y },
    direction: vector.direction,
    length: vector.length,
  };
}

/**
 * 扫描草图中的可圆角角点：两条非投影直线端点，坐标重合或由 coincident
 * 约束相连，且该连接组恰好包含两个端点（三条以上线共点诚实跳过）。
 */
export function findSketchFilletCorners(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
): FilletCorner[] {
  const points = pointMap(entities);
  const entries = lineEndpoints(entities, points);
  const dsu = makeDsu(entries.length);

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const first = entries[i]!;
      const second = entries[j]!;
      if (first.line.id === second.line.id)
        continue;
      if (Math.hypot(first.point.x - second.point.x, first.point.y - second.point.y) <= CORNER_TOL)
        dsu.union(i, j);
    }
  }
  for (const [a, b] of coincidentPairs(entries, constraints))
    dsu.union(a, b);

  const groups = new Map<number, number[]>();
  entries.forEach((_, index) => {
    const root = dsu.find(index);
    const members = groups.get(root) ?? [];
    members.push(index);
    groups.set(root, members);
  });

  const corners: FilletCorner[] = [];
  for (const members of groups.values()) {
    if (members.length !== 2)
      continue; // 三线以上共点/单端点：首切片不支持
    const first = entries[members[0]!]!;
    const second = entries[members[1]!]!;
    if (first.line.id === second.line.id)
      continue;
    const point = {
      x: (first.point.x + second.point.x) / 2,
      y: (first.point.y + second.point.y) / 2,
    };
    const one = cornerLine(first, point, points);
    const two = cornerLine(second, point, points);
    if (!one || !two)
      continue;
    const [a, b] = first.line.id <= second.line.id ? [one, two] : [two, one];
    corners.push({ id: `${endpointKey(a.lineId, a.part)}|${endpointKey(b.lineId, b.part)}`, point, a, b });
  }
  corners.sort((left, right) => left.id.localeCompare(right.id));
  return corners;
}

/** 由角点 + 半径计算相切圆弧（不修改实体；预览与提交共用）。 */
export function computeFilletGeometry(
  corner: FilletCorner,
  radius: number,
): FilletGeometryResult {
  if (!Number.isFinite(radius) || radius <= 1e-6)
    return { ok: false, reason: 'invalid-radius' };

  const { a, b, point } = corner;
  const dot = a.direction.x * b.direction.x + a.direction.y * b.direction.y;
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  // 共线/近共线（θ→0 或 π）无有限切点或圆心；诚实拒绝。
  if (theta <= 1e-4 || theta >= Math.PI - 1e-4)
    return { ok: false, reason: 'degenerate' };

  const half = theta / 2;
  const tangentDistance = radius / Math.tan(half);
  if (!(tangentDistance > 1e-6) || !Number.isFinite(tangentDistance))
    return { ok: false, reason: 'degenerate' };
  if (tangentDistance >= a.length - 1e-7 || tangentDistance >= b.length - 1e-7)
    return { ok: false, reason: 'radius-too-large' };

  const tangentA = {
    x: point.x + a.direction.x * tangentDistance,
    y: point.y + a.direction.y * tangentDistance,
  };
  const tangentB = {
    x: point.x + b.direction.x * tangentDistance,
    y: point.y + b.direction.y * tangentDistance,
  };

  const bisectorRaw = { x: a.direction.x + b.direction.x, y: a.direction.y + b.direction.y };
  const bisectorLength = Math.hypot(bisectorRaw.x, bisectorRaw.y);
  if (!(bisectorLength > 1e-9))
    return { ok: false, reason: 'degenerate' };
  const bisector = { x: bisectorRaw.x / bisectorLength, y: bisectorRaw.y / bisectorLength };
  const centerDistance = radius / Math.sin(half);
  const center = {
    x: point.x + bisector.x * centerDistance,
    y: point.y + bisector.y * centerDistance,
  };

  const startAngle = Math.atan2(tangentA.y - center.y, tangentA.x - center.x);
  const shortSweep = Math.PI - theta;
  const towardCorner = unit(center, point);
  if (!towardCorner)
    return { ok: false, reason: 'degenerate' };
  let sweepAngle = 0;
  let bestScore = -Infinity;
  for (const sign of [1, -1]) {
    const midAngle = startAngle + (sign * shortSweep) / 2;
    const mid = {
      x: center.x + radius * Math.cos(midAngle) - center.x,
      y: center.y + radius * Math.sin(midAngle) - center.y,
    };
    const midLength = Math.hypot(mid.x, mid.y);
    if (!(midLength > EPS))
      continue;
    const score = (mid.x / midLength) * towardCorner.direction.x + (mid.y / midLength) * towardCorner.direction.y;
    if (score > bestScore) {
      bestScore = score;
      sweepAngle = sign * shortSweep;
    }
  }

  return {
    ok: true,
    geometry: {
      tangentA, tangentB, center, radius,
      startAngle, sweepAngle, theta,
    },
  };
}

function sameEndpointRef(ref: SketchRef, lineId: number, part: EndpointPart): boolean {
  return typeof ref !== 'number' && 'entity' in ref && ref.entity === lineId && ref.part === part;
}

/**
 * 在角点生成圆角：回缩两条线端点、插入相切圆弧，并展开
 * coincident(arc.start,lineA)/coincident(arc.end,lineB)/tangent×2/radius 约束。
 * 旧的两线端点 coincident 行被移除（否则求解器会把切点拉回尖角）。
 * `nextId` 由调用方从实体与约束的最大 id + 1 传入；返回推进后的值。
 */
export function filletSketchCorner(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  corner: FilletCorner,
  radius: number,
  nextId: number,
  options: { construction?: boolean } = {},
): FilletCornerResult {
  const lineA = entities.find((entity): entity is SketchEntityDto & { kind: 'line' } =>
    entity.id === corner.a.lineId && entity.kind === 'line');
  const lineB = entities.find((entity): entity is SketchEntityDto & { kind: 'line' } =>
    entity.id === corner.b.lineId && entity.kind === 'line');
  if (!lineA || !lineB)
    return { ok: false, reason: 'no-corner', entities: [...entities], constraints: [...constraints] };
  if (lineA.projected || lineB.projected)
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };

  const computed = computeFilletGeometry(corner, radius);
  if (!computed.ok)
    return { ok: false, reason: computed.reason, entities: [...entities], constraints: [...constraints] };
  const geometry = computed.geometry;

  // 显式 point 端点：裁剪端改为内联点（旧 point 实体留在原位，稍后按引用
  // 计数清理孤儿；仍被其它约束引用时保留，不破坏共享点语义）。
  const nearRefA = corner.a.part === 'start' ? lineA.p1 : lineA.p2;
  const nearRefB = corner.b.part === 'start' ? lineB.p1 : lineB.p2;
  const detachedPointIds = [nearRefA, nearRefB].filter((ref): ref is number => typeof ref === 'number');

  const trimmed = entities.map((entity) => {
    if (entity.id !== lineA.id || entity.kind !== 'line')
      return entity;
    const next = { ...entity };
    if (corner.a.part === 'start')
      next.p1 = { ...geometry.tangentA };
    else
      next.p2 = { ...geometry.tangentA };
    return next;
  }).map((entity) => {
    if (entity.id !== lineB.id || entity.kind !== 'line')
      return entity;
    const next = { ...entity };
    if (corner.b.part === 'start')
      next.p1 = { ...geometry.tangentB };
    else
      next.p2 = { ...geometry.tangentB };
    return next;
  });

  const kept = constraints.filter((constraint) => {
    if (constraint.kind !== 'coincident' || constraint.refs.length !== 2)
      return true;
    const [first, second] = constraint.refs;
    const linksCorner =
      (sameEndpointRef(first!, corner.a.lineId, corner.a.part) && sameEndpointRef(second!, corner.b.lineId, corner.b.part))
      || (sameEndpointRef(second!, corner.a.lineId, corner.a.part) && sameEndpointRef(first!, corner.b.lineId, corner.b.part));
    return !linksCorner;
  });

  const arcId = nextId;
  const arc: SketchEntityDto = {
    kind: 'arc',
    id: arcId,
    center: { ...geometry.center },
    radius: geometry.radius,
    startAngle: geometry.startAngle,
    sweepAngle: geometry.sweepAngle,
    ...(options.construction ? { construction: true } : {}),
  };
  const added: SketchConstraintDto[] = [
    {
      kind: 'coincident', id: nextId + 1,
      refs: [{ entity: arcId, part: 'start' }, { entity: corner.a.lineId, part: corner.a.part }],
    },
    {
      kind: 'coincident', id: nextId + 2,
      refs: [{ entity: arcId, part: 'end' }, { entity: corner.b.lineId, part: corner.b.part }],
    },
    { kind: 'tangent', id: nextId + 3, refs: [arcId, corner.a.lineId] },
    { kind: 'tangent', id: nextId + 4, refs: [arcId, corner.b.lineId] },
    { kind: 'radius', id: nextId + 5, refs: [arcId], value: geometry.radius },
  ];

  const finalConstraints = [...kept, ...added];
  return {
    ok: true,
    entities: pruneUnreferencedPoints([...trimmed, arc], finalConstraints, detachedPointIds),
    constraints: finalConstraints,
    arcId,
    nextId: nextId + 6,
    geometry,
  };
}

/**
 * 显式 point 端点被裁剪分离后：仅当该 point 不再被任何曲线端点/约束引用时
 * 移除（否则保持原位——它仍承载其它几何关系）。绝不猜测/级联删除约束。
 */
function pruneUnreferencedPoints(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  candidates: readonly number[],
): SketchEntityDto[] {
  if (candidates.length === 0)
    return [...entities];
  const referenced = new Set<number>();
  for (const entity of entities) {
    if (entity.kind === 'line') {
      if (typeof entity.p1 === 'number') referenced.add(entity.p1);
      if (typeof entity.p2 === 'number') referenced.add(entity.p2);
    } else if (entity.kind === 'circle' || entity.kind === 'arc') {
      if (typeof entity.center === 'number') referenced.add(entity.center);
    }
  }
  for (const constraint of constraints) {
    for (const ref of constraint.refs) {
      if (typeof ref === 'number') referenced.add(ref);
      else if ('entity' in ref) referenced.add(ref.entity);
    }
  }
  const candidateSet = new Set(candidates);
  return entities.filter((entity) =>
    !(entity.kind === 'point' && candidateSet.has(entity.id) && !referenced.has(entity.id)));
}

interface ResolvedLine {
  line: SketchEntityDto & { kind: 'line' };
  start: { ref: number | LocalPoint; point: LocalPoint; part: 'start' | 'end' };
  end: { ref: number | LocalPoint; point: LocalPoint; part: 'start' | 'end' };
}

function resolveLine(
  entity: SketchEntityDto | undefined,
  points: ReadonlyMap<number, LocalPoint>,
): ResolvedLine | undefined {
  if (!entity || entity.kind !== 'line' || entity.projected)
    return undefined;
  const start = resolvePoint(entity.p1, points);
  const end = resolvePoint(entity.p2, points);
  if (!start || !end)
    return undefined;
  return {
    line: entity,
    start: { ref: entity.p1, point: start, part: 'start' },
    end: { ref: entity.p2, point: end, part: 'end' },
  };
}

interface VirtualCornerResult {
  ok: true;
  corner: FilletCorner;
  gapA: number;
  gapB: number;
}

/**
 * 两线选择 → 虚拟角点（Onshape Fillet 可拾取两条曲线）：无限延长求交点，
 * 每条线取离交点较近的端点作为被修剪端；要求交点在两线段之外（近端点外侧），
 * 避免“交点落在线段中间”的四解歧义。显式 point 近端点由 filletSketchCorner
 * 统一分离为内联点并按引用清理孤儿点。
 */
function virtualCornerFromLines(
  entities: readonly SketchEntityDto[],
  lineIdA: number,
  lineIdB: number,
): VirtualCornerResult | { ok: false; reason: FilletFailureReason } {
  if (lineIdA === lineIdB)
    return { ok: false, reason: 'unsupported' };
  const points = pointMap(entities);
  const lineA = resolveLine(entities.find((entity) => entity.id === lineIdA), points);
  const lineB = resolveLine(entities.find((entity) => entity.id === lineIdB), points);
  if (!lineA || !lineB)
    return { ok: false, reason: 'unsupported' };

  const rx = lineA.end.point.x - lineA.start.point.x;
  const ry = lineA.end.point.y - lineA.start.point.y;
  const sx = lineB.end.point.x - lineB.start.point.x;
  const sy = lineB.end.point.y - lineB.start.point.y;
  const det = rx * sy - ry * sx;
  if (Math.abs(det) < EPS * (Math.hypot(rx, ry) + Math.hypot(sx, sy) + 1))
    return { ok: false, reason: 'degenerate' }; // 平行/共线：无唯一虚拟角点
  const qpx = lineB.start.point.x - lineA.start.point.x;
  const qpy = lineB.start.point.y - lineA.start.point.y;
  const t = (qpx * sy - qpy * sx) / det;
  const cornerPoint = {
    x: lineA.start.point.x + rx * t,
    y: lineA.start.point.y + ry * t,
  };

  const nearOf = (line: ResolvedLine): { near: ResolvedLine['start']; far: ResolvedLine['start'] } => {
    const dStart = Math.hypot(line.start.point.x - cornerPoint.x, line.start.point.y - cornerPoint.y);
    const dEnd = Math.hypot(line.end.point.x - cornerPoint.x, line.end.point.y - cornerPoint.y);
    return dStart <= dEnd
      ? { near: line.start, far: line.end }
      : { near: line.end, far: line.start };
  };
  const a = nearOf(lineA);
  const b = nearOf(lineB);
  // 交点须位于近端点外侧（沿 far→near 的射线延长方向）：否则交点落在
  // 线段内部/近端方向，裁剪语义有歧义。
  const dotA = (cornerPoint.x - a.near.point.x) * (a.far.point.x - a.near.point.x)
    + (cornerPoint.y - a.near.point.y) * (a.far.point.y - a.near.point.y);
  const dotB = (cornerPoint.x - b.near.point.x) * (b.far.point.x - b.near.point.x)
    + (cornerPoint.y - b.near.point.y) * (b.far.point.y - b.near.point.y);
  if (dotA > 1e-7 || dotB > 1e-7)
    return { ok: false, reason: 'outside-segment' };

  const dirA = unit(cornerPoint, a.far.point);
  const dirB = unit(cornerPoint, b.far.point);
  if (!dirA || !dirB)
    return { ok: false, reason: 'degenerate' };
  const gapA = Math.hypot(a.near.point.x - cornerPoint.x, a.near.point.y - cornerPoint.y);
  const gapB = Math.hypot(b.near.point.x - cornerPoint.x, b.near.point.y - cornerPoint.y);
  const firstLineId = lineIdA < lineIdB ? lineIdA : lineIdB;
  const secondLineId = lineIdA < lineIdB ? lineIdB : lineIdA;
  const [first, second] = lineIdA < lineIdB ? [a, b] : [b, a];
  const [firstDir, secondDir] = lineIdA < lineIdB ? [dirA, dirB] : [dirB, dirA];
  const [firstGap, secondGap] = lineIdA < lineIdB ? [gapA, gapB] : [gapB, gapA];
  return {
    ok: true,
    corner: {
      id: `${endpointKey(firstLineId, first.near.part)}|${endpointKey(secondLineId, second.near.part)}`,
      point: cornerPoint,
      a: {
        lineId: firstLineId,
        part: first.near.part,
        other: first.far.point,
        direction: firstDir.direction,
        length: firstDir.length,
      },
      b: {
        lineId: secondLineId,
        part: second.near.part,
        other: second.far.point,
        direction: secondDir.direction,
        length: secondDir.length,
      },
    },
    gapA: firstGap,
    gapB: secondGap,
  };
}

/**
 * Onshape Fillet 两曲线选择首切片：点两条不相连的直线，在无限延长交点处
 * 生成圆角（两条线各自回缩到切点）。要求交点位于两线段之外、切点落在线段
 * 内；平行/共线、交点在段内、显式点端点诚实拒收。半径约束/切点/coincident/
 * tangent 展开与角点路径完全一致。
 */
export function filletSketchLinePair(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  lineIdA: number,
  lineIdB: number,
  radius: number,
  nextId: number,
  options: { construction?: boolean } = {},
): FilletCornerResult {
  const built = virtualCornerFromLines(entities, lineIdA, lineIdB);
  if (!built.ok)
    return { ok: false, reason: built.reason, entities: [...entities], constraints: [...constraints] };
  const computed = computeFilletGeometry(built.corner, radius);
  if (!computed.ok)
    return { ok: false, reason: computed.reason, entities: [...entities], constraints: [...constraints] };
  // 切点须落在线段内：从交点到切点的距离 >= 近端点间隙（否则切点在近端点
  // 外侧的延长段上，需要先把线“延长”再剪，首切片诚实拒收）。
  const tangentDistance = radius / Math.tan(computed.geometry.theta / 2);
  if (tangentDistance < built.gapA - 1e-7 || tangentDistance < built.gapB - 1e-7)
    return { ok: false, reason: 'outside-segment', entities: [...entities], constraints: [...constraints] };
  return filletSketchCorner(entities, constraints, built.corner, radius, nextId, options);
}

/** 下一步安全 id：实体与约束 id 的全局最大值 + 1（工具/测试共用）。 */
export function nextSketchId(entities: readonly SketchEntityDto[], constraints: readonly SketchConstraintDto[]): number {
  let max = 0;
  for (const entity of entities)
    max = Math.max(max, entity.id);
  for (const constraint of constraints)
    max = Math.max(max, constraint.id);
  return max + 1;
}
