/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「使用」模型候选加载（S1 2026-11-21；S1b 2026-11-21 增平面面）：
 * 复用既有只读通道 `readBrepEdgeHandles` / `readBrepFaceHandles`（BRep 显示/拾取
 * 同一 SolidModeling 命令）+ `resolveEdgeRef`/`resolveFaceRef` RPC 把拾取 id
 * 换成持久拓扑 id，产出 Use 覆盖层的候选。**不新增工具族/选择管道**；命令槽由
 * 调用方经 `withExclusiveBrepCommand` 串行（与显示拓扑读面共用粘性缓存）。
 *
 * 诚实边界：
 * - 边：仅 line/arc（其他曲线精确投影不可证，跳过并计数/收集错误）；
 *   resolveEdgeRef 失败逐边跳过（不猜 ref）；读边通道不可用返回错误码，候选为空。
 * - 面：仅平面面（`BrepFaceHandle` 由构造即平面）。任一环含 `other` 曲线 →
 *   整面跳过（后端整面拒收，不产出半环）；外环几何判定（法向投影 + 弧采样 +
 *   最大绝对面积），等面积/退化/开口环一律跳过（不猜）；resolveFaceRef 失败
 *   逐面跳过。块长按后端口径由外环曲线数得到（line=3、arc/circle=2），
 *   不近似面边界。
 */
import type { BodyInfo, LubanTopologyId } from '@luban-cad/shared';
import type { BrepEdgeCurve, BrepEdgeHandle, BrepFaceHandle, BrepFaceLoopCurve } from './brep-topology.js';
import type { SketchUseBodyPart } from './sketch-use.js';

export type SketchUseBodyCurveKind = 'line' | 'arc';

/** 模型边候选（S1）。 */
export interface SketchUseBodyCandidate {
  kind: 'edge';
  bodyKey: string;
  subEntityId: number;
  topologyRef: LubanTopologyId;
  part: SketchUseBodyPart;
  curveKind: SketchUseBodyCurveKind;
  curve: BrepEdgeCurve;
}

export type SketchUseVec3 = [number, number, number];

/** 模型面候选（S1b）：loops 为世界坐标闭合折线（显示 + 屏幕命中用）。 */
export interface SketchUseFaceCandidate {
  kind: 'face';
  bodyKey: string;
  subEntityId: number;
  topologyRef: LubanTopologyId;
  normal: SketchUseVec3;
  /** 面边界全部环的折线（外环 + 孔环；仅显示，数据事实源在后端）。 */
  loops: SketchUseVec3[][];
  /** `loops` 中外环下标（几何判定：最大绝对面积；其余视为孔环）。 */
  outerLoopIndex: number;
  /** 外环实体 id 块长（line=3、arc/circle=2；与后端块分配同口径）。 */
  blockLength: number;
}

/** Use 覆盖层的模型候选联合（边/面判别，既有边消费者保持类型安全）。 */
export type SketchUseModelCandidate = SketchUseBodyCandidate | SketchUseFaceCandidate;

/** 跳过原因（locale-neutral；覆盖层负责 zh/en 映射）。 */
export type SketchUseBodyCandidateError =
  | 'unsupported-curve'
  | 'resolve-failed'
  | 'read-edges-unavailable';

/** 面跳过原因（locale-neutral；覆盖层负责 zh/en 映射）。 */
export type SketchUseFaceCandidateError =
  | 'unsupported-curve'
  | 'resolve-failed'
  | 'read-faces-unavailable'
  | 'no-outer-loop';

export interface LoadBodyCandidatesArgs {
  iModelKey: string;
  bodies: readonly BodyInfo[];
  readEdges: (iModelKey: string, bodies: readonly BodyInfo[]) => Promise<BrepEdgeHandle[] | undefined>;
  resolveEdgeRef: (iModelKey: string, bodyKey: string, subEntityId: number) =>
    Promise<{ ok: boolean; ref?: { edge: LubanTopologyId }; error?: string }>;
}

export interface LoadBodyCandidatesResult {
  candidates: SketchUseBodyCandidate[];
  skipped: number;
  errors: SketchUseBodyCandidateError[];
}

export async function loadSketchUseBodyCandidates(
  args: LoadBodyCandidatesArgs,
): Promise<LoadBodyCandidatesResult> {
  if (args.bodies.length === 0)
    return { candidates: [], skipped: 0, errors: [] };
  let edges: BrepEdgeHandle[] | undefined;
  try {
    edges = await args.readEdges(args.iModelKey, args.bodies);
  } catch {
    return { candidates: [], skipped: 0, errors: ['read-edges-unavailable'] };
  }
  if (!edges)
    return { candidates: [], skipped: 0, errors: ['read-edges-unavailable'] };

  const candidates: SketchUseBodyCandidate[] = [];
  const errors: SketchUseBodyCandidateError[] = [];
  let skipped = 0;
  for (const edge of edges) {
    if (edge.curve.kind !== 'line' && edge.curve.kind !== 'arc') {
      skipped += 1;
      errors.push('unsupported-curve');
      continue;
    }
    let resolved: Awaited<ReturnType<LoadBodyCandidatesArgs['resolveEdgeRef']>>;
    try {
      resolved = await args.resolveEdgeRef(args.iModelKey, edge.bodyKey, edge.subEntityId);
    } catch {
      resolved = { ok: false };
    }
    if (!resolved.ok || !resolved.ref?.edge) {
      skipped += 1;
      errors.push('resolve-failed');
      continue;
    }
    const curveKind: SketchUseBodyCurveKind = edge.curve.kind;
    const base = {
      kind: 'edge' as const,
      bodyKey: edge.bodyKey,
      subEntityId: edge.subEntityId,
      topologyRef: resolved.ref.edge,
      curveKind,
      curve: edge.curve,
    };
    candidates.push(
      { ...base, part: 'curve' },
      { ...base, part: 'start' },
      { ...base, part: 'end' },
    );
  }
  return { candidates, skipped, errors };
}

// ---------------------------------------------------------------------------
// S1b（2026-11-21）：平面面候选
// ---------------------------------------------------------------------------

export interface LoadFaceCandidatesArgs {
  iModelKey: string;
  bodies: readonly BodyInfo[];
  readFaces: (iModelKey: string, bodies: readonly BodyInfo[]) => Promise<BrepFaceHandle[] | undefined>;
  resolveFaceRef: (iModelKey: string, bodyKey: string, subEntityId: number) =>
    Promise<{ ok: boolean; ref?: LubanTopologyId; error?: string }>;
}

export interface LoadFaceCandidatesResult {
  candidates: SketchUseFaceCandidate[];
  skipped: number;
  errors: SketchUseFaceCandidateError[];
}

const VECTOR_EPSILON = 1e-12;
/** 环闭合容差（iModel 米制；0.0001 mm）。 */
const LOOP_CLOSURE_TOLERANCE = 1e-7;
/** 面积退化阈值（m²；1e-6 mm²）。 */
const LOOP_AREA_EPSILON = 1e-12;
/** 等面积判定（相对；外环与任一孔环面积相同 → 歧义，整面跳过）。 */
const LOOP_AREA_TIE_RATIO = 1e-9;

function cross3(a: SketchUseVec3, b: SketchUseVec3): SketchUseVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: SketchUseVec3): SketchUseVec3 | undefined {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length <= VECTOR_EPSILON)
    return undefined;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function distance3(a: SketchUseVec3, b: SketchUseVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 弧采样（与边显示同口径：y = normal × x，sweep 符号直接作用到采样角）。 */
export function sampleFaceArcPoints(
  curve: Extract<BrepFaceLoopCurve, { kind: 'arc' }>,
): SketchUseVec3[] {
  const [cx, cy, cz] = curve.center;
  const xAxis = normalize3([curve.start[0] - cx, curve.start[1] - cy, curve.start[2] - cz]);
  const normal = normalize3(curve.normal);
  if (!xAxis || !normal)
    return [curve.start, curve.end];
  const yAxis = cross3(normal, xAxis);
  const sweep = Number.isFinite(curve.sweepRadians) ? curve.sweepRadians : 0;
  const steps = Math.max(8, Math.min(96, Math.ceil(Math.abs(sweep) / (Math.PI / 32))));
  const points: SketchUseVec3[] = [];
  for (let index = 0; index <= steps; index++) {
    if (index === steps) {
      points.push(curve.end);
      break;
    }
    const angle = (sweep * index) / steps;
    const cos = Math.cos(angle) * curve.radius;
    const sin = Math.sin(angle) * curve.radius;
    points.push([
      cx + cos * xAxis[0] + sin * yAxis[0],
      cy + cos * xAxis[1] + sin * yAxis[1],
      cz + cos * xAxis[2] + sin * yAxis[2],
    ]);
  }
  return points;
}

/**
 * 面环 → 闭合折线（世界坐标）。任一段不可精确描述（`other`）→ undefined
 * （调用方按整面拒收处理，不产出半环）。
 */
export function faceLoopPolyline(curves: readonly BrepFaceLoopCurve[]): SketchUseVec3[] | undefined {
  const points: SketchUseVec3[] = [];
  const push = (point: SketchUseVec3): void => {
    const last = points.at(-1);
    if (!last || distance3(last, point) > VECTOR_EPSILON)
      points.push(point);
  };
  for (const curve of curves) {
    if (curve.kind === 'line') {
      push(curve.p0);
      push(curve.p1);
    } else if (curve.kind === 'arc') {
      for (const point of sampleFaceArcPoints(curve))
        push(point);
    } else {
      return undefined;
    }
  }
  return points.length >= 3 ? points : undefined;
}

function planeBasis(normal: SketchUseVec3): { u: SketchUseVec3; v: SketchUseVec3 } | undefined {
  const n = normalize3(normal);
  if (!n)
    return undefined;
  const helper: SketchUseVec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize3(cross3(helper, n));
  if (!u)
    return undefined;
  return { u, v: cross3(n, u) };
}

/** 环折线在面内平面的绝对面积（鞋带公式；平面基由面法向构造）。 */
export function faceLoopArea(
  points: readonly SketchUseVec3[],
  normal: SketchUseVec3,
): number | undefined {
  if (points.length < 3)
    return undefined;
  const basis = planeBasis(normal);
  if (!basis)
    return undefined;
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const au = a[0] * basis.u[0] + a[1] * basis.u[1] + a[2] * basis.u[2];
    const av = a[0] * basis.v[0] + a[1] * basis.v[1] + a[2] * basis.v[2];
    const bu = b[0] * basis.u[0] + b[1] * basis.u[1] + b[2] * basis.u[2];
    const bv = b[0] * basis.v[0] + b[1] * basis.v[1] + b[2] * basis.v[2];
    sum += au * bv - bu * av;
  }
  return Math.abs(sum) / 2;
}

function loopIsClosed(points: readonly SketchUseVec3[]): boolean {
  return points.length >= 3 && distance3(points[0]!, points.at(-1)!) <= LOOP_CLOSURE_TOLERANCE;
}

/**
 * 外环几何判定：最大绝对面积环即外环（孔环在面内被外环包含，面积更小）。
 * 退化（面积 ~0）或最大/次大面积并列 → 歧义，返回 undefined（诚实跳过）。
 */
export function chooseOuterFaceLoop(
  polylines: readonly (readonly SketchUseVec3[])[],
  normal: SketchUseVec3,
): { index: number; area: number } | undefined {
  let bestIndex = -1;
  let bestArea = -1;
  let secondArea = -1;
  for (let index = 0; index < polylines.length; index++) {
    const area = faceLoopArea(polylines[index]!, normal);
    if (area === undefined)
      continue;
    if (area > bestArea) {
      secondArea = bestArea;
      bestArea = area;
      bestIndex = index;
    } else if (area > secondArea) {
      secondArea = area;
    }
  }
  if (bestIndex < 0 || !(bestArea > LOOP_AREA_EPSILON))
    return undefined;
  if (secondArea > 0 && secondArea >= bestArea * (1 - LOOP_AREA_TIE_RATIO))
    return undefined;
  return { index: bestIndex, area: bestArea };
}

/** 外环实体 id 块长（后端口径：line=3、arc/circle=2；other → undefined）。 */
export function faceLoopEntityBlockLength(curves: readonly BrepFaceLoopCurve[]): number | undefined {
  let sum = 0;
  for (const curve of curves) {
    if (curve.kind === 'line')
      sum += 3;
    else if (curve.kind === 'arc')
      sum += 2;
    else
      return undefined;
  }
  return sum > 0 ? sum : undefined;
}

export async function loadSketchUseFaceCandidates(
  args: LoadFaceCandidatesArgs,
): Promise<LoadFaceCandidatesResult> {
  if (args.bodies.length === 0)
    return { candidates: [], skipped: 0, errors: [] };
  let faces: BrepFaceHandle[] | undefined;
  try {
    faces = await args.readFaces(args.iModelKey, args.bodies);
  } catch {
    return { candidates: [], skipped: 0, errors: ['read-faces-unavailable'] };
  }
  if (!faces)
    return { candidates: [], skipped: 0, errors: ['read-faces-unavailable'] };

  const candidates: SketchUseFaceCandidate[] = [];
  const errors: SketchUseFaceCandidateError[] = [];
  let skipped = 0;
  const skip = (code: SketchUseFaceCandidateError): void => {
    skipped += 1;
    errors.push(code);
  };

  for (const face of faces) {
    if (face.loops.length === 0) {
      skip('no-outer-loop');
      continue;
    }
    const polylines: SketchUseVec3[][] = [];
    let unusable = false;
    for (const loop of face.loops) {
      if (loop.length === 0) {
        unusable = true;
        break;
      }
      const polyline = faceLoopPolyline(loop);
      if (!polyline) {
        skip('unsupported-curve');
        unusable = true;
        break;
      }
      polylines.push(polyline);
    }
    if (unusable)
      continue;
    if (polylines.some((polyline) => !loopIsClosed(polyline))) {
      skip('no-outer-loop');
      continue;
    }
    const outer = chooseOuterFaceLoop(polylines, face.normal);
    if (!outer) {
      skip('no-outer-loop');
      continue;
    }
    const blockLength = faceLoopEntityBlockLength(face.loops[outer.index]!);
    if (blockLength === undefined) {
      skip('no-outer-loop');
      continue;
    }
    let resolved: Awaited<ReturnType<LoadFaceCandidatesArgs['resolveFaceRef']>>;
    try {
      resolved = await args.resolveFaceRef(args.iModelKey, face.bodyKey, face.subEntityId);
    } catch {
      resolved = { ok: false };
    }
    if (!resolved.ok || !resolved.ref) {
      skip('resolve-failed');
      continue;
    }
    candidates.push({
      kind: 'face',
      bodyKey: face.bodyKey,
      subEntityId: face.subEntityId,
      topologyRef: resolved.ref,
      normal: face.normal,
      loops: polylines,
      outerLoopIndex: outer.index,
      blockLength,
    });
  }
  return { candidates, skipped, errors };
}

// ---------------------------------------------------------------------------
// 屏幕多边形命中（纯逻辑，jsdom 可直接测；覆盖层传入 worldToView 结果）
// ---------------------------------------------------------------------------

export interface ScreenPoint { x: number; y: number }

/** 奇偶规则点在多边形内（多边形按闭合处理；重复首尾点无影响）。 */
export function pointInPolygon(point: ScreenPoint, polygon: readonly ScreenPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) === (b.y > point.y))
      continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < x)
      inside = !inside;
  }
  return inside;
}

export interface ScreenFaceLoops {
  outer: readonly ScreenPoint[];
  holes: readonly (readonly ScreenPoint[])[];
}

/** 面命中：外环内且不在任何孔环内（屏幕空间）。 */
export function faceLoopContainsPoint(point: ScreenPoint, loops: ScreenFaceLoops): boolean {
  if (!pointInPolygon(point, loops.outer))
    return false;
  return !loops.holes.some((hole) => pointInPolygon(point, hole));
}
