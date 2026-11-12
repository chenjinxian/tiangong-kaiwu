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
 * 边界（诚实登记，不伪造）：首发只支持**两条非投影直线**在端点处的角点；
 * 角点由坐标重合或两线端点的 coincident 约束识别（内联端点）。显式 point
 * 实体端点、直线-圆弧组合、两线延长线交点、三条以上线交于一点、投影线
 * 暂不支持——工具提示 unsupported 且不写数据。
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
    reason: 'no-corner' | 'unsupported' | 'degenerate' | 'radius-too-large' | 'invalid-radius';
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

function cornerLine(entry: EndpointEntry, corner: LocalPoint): FilletCornerLine | undefined {
  const otherRef = entry.part === 'start' ? entry.line.p2 : entry.line.p1;
  const other = typeof otherRef === 'number' ? undefined : otherRef;
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
    if (!first.inline || !second.inline)
      continue; // 显式 point 实体端点：无法在不破坏共享点的前提下回缩
    if (first.line.id === second.line.id)
      continue;
    const point = {
      x: (first.point.x + second.point.x) / 2,
      y: (first.point.y + second.point.y) / 2,
    };
    const one = cornerLine(first, point);
    const two = cornerLine(second, point);
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

/** 角点端点是否仍可由直线实体修剪（防调用方误传旧角点）。 */
function endpointIsInline(line: SketchEntityDto & { kind: 'line' }, part: EndpointPart): boolean {
  return typeof (part === 'start' ? line.p1 : line.p2) !== 'number';
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
  if (lineA.projected || lineB.projected
    || !endpointIsInline(lineA, corner.a.part) || !endpointIsInline(lineB, corner.b.part)) {
    return { ok: false, reason: 'unsupported', entities: [...entities], constraints: [...constraints] };
  }

  const computed = computeFilletGeometry(corner, radius);
  if (!computed.ok)
    return { ok: false, reason: computed.reason, entities: [...entities], constraints: [...constraints] };
  const geometry = computed.geometry;

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

  return {
    ok: true,
    entities: [...trimmed, arc],
    constraints: [...kept, ...added],
    arcId,
    nextId: nextId + 6,
    geometry,
  };
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
