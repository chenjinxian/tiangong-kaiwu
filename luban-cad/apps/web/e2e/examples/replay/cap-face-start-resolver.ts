/**
 * CAP_FACE profile 起始面解析（ADR-0016 A3，test-only 回放层）。
 *
 * 背景（S10/S11 已解析）：Bumper/37 个 CAP_FACE 特征的 **profile 就是被选中的
 * 上游实体面**（`entities` 槽，`startOffset=false`、`startOffsetEntity` 空）。
 * converter 为这类特征输出 `capFaceProfile` 选择 + 起始面证据（世界平面法向/
 * 平面点 + Onshape bodydetails 面面积/AABB）；runner 在本步骤时点用
 * `readFaceHandles` 枚举当前 body 面，按“平面 + 面积 + AABB + 边数”唯一匹配，
 * 再 `resolveFaceRef` 取持久面引用。0/多候选、缺证据、非平面/非解析边界一律
 * 返回 ok:false（调用方 fail closed），绝不按最近面/草图面域猜。
 *
 * 证据容差：平面偏移 0.05 mm、法向点积 ≥0.999、面积相对 1e-3、AABB 每轴
 * 0.05 mm + 1e-3·span。匹配算法是纯函数，单测直接覆盖。
 */
import type { Page } from '@playwright/test';
import type { BodyInfo, LubanTopologyId } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';
import type { ScenarioFeature } from './scenario-to-op.js';

export type CapFaceStartResolution =
  | {
    ok: true;
    bodyId: string;
    faceRef: LubanTopologyId;
    faceSubEntityId: number;
    /** 解析到的产品面参数化法向（`CurveOps.isPlanar` columnZ）。S3：产品面
     *  法向可能朝内/朝外（合成盒体底面实测朝内），runner 用它把世界方向
     *  换算成产品 `direction`，不得假设它等于实体外法向。 */
    faceNormal: [number, number, number];
    note: string;
  }
  | { ok: false; reason: string };

export interface Vec3Tuple { x: number; y: number; z: number }

type LoopCurve =
  | { kind: 'line'; p0: [number, number, number]; p1: [number, number, number] }
  | {
    kind: 'arc'; center: [number, number, number]; radius: number; normal: [number, number, number];
    start: [number, number, number]; end: [number, number, number]; sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };

export interface FaceHandleLike {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
  loops: LoopCurve[][];
}

export interface CapFaceStartEvidence {
  /** 起始面世界平面（点 + 法向；来自上游 blind 拉伸端盖，S11）。 */
  plane: { origin: Vec3Tuple; normal: Vec3Tuple };
  /** Onshape bodydetails 面面积（mm²）。 */
  areaMm2?: number;
  /** Onshape bodydetails 面 AABB（世界 mm）。 */
  boxMm?: { min: Vec3Tuple; max: Vec3Tuple };
  /** 期望边界曲线数（可选，来自上游草图单闭环）。 */
  edgeCount?: number;
  /** S3（ADR-0016 review 2026-11-10）：bodydetails 的 surface.normal 是面参数化
   *  法向、不是实体外法向（Bumper 盒体实测有朝内面）；S3 新形态
   *  （REMOVE/INTERSECT/THROUGH_ALL）**一律**标记本字段（即使采用上游 cap 平面，
   *  也不依赖法向符号），面匹配接受 ±法向（仍要求平面/面积/AABB 唯一）。
   *  方向由 converter 的 world outwardNormal + 解析到的产品面法向换算，不用本
   *  法向符号。 */
  normalSignAmbiguous?: boolean;
}

export interface CapFaceStartMatch {
  face?: FaceHandleLike;
  diagnostics: string[];
}

const v3 = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const sub = (a: readonly number[], b: readonly number[]): [number, number, number] =>
  [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const magnitude = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);

function unit(a: readonly number[]): [number, number, number] | undefined {
  const length = magnitude(a);
  if (!(length > 1e-12)) return undefined;
  return [a[0]! / length, a[1]! / length, a[2]! / length];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function vec3Field(record: Record<string, unknown> | undefined): Vec3Tuple | undefined {
  if (!record) return undefined;
  const x = numberField(record, 'x');
  const y = numberField(record, 'y');
  const z = numberField(record, 'z');
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

/** 严格解析 converter 的 `startFace` 证据；缺平面即无证据（不猜）。 */
export function parseCapFaceStartEvidence(value: unknown): CapFaceStartEvidence | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const plane = asRecord(record.plane);
  const origin = vec3Field(asRecord(plane?.origin));
  const normal = vec3Field(asRecord(plane?.normal));
  if (!origin || !normal) return undefined;
  const areaMm2 = numberField(record, 'areaMm2');
  const box = asRecord(record.boxMm);
  const boxMin = vec3Field(asRecord(box?.min));
  const boxMax = vec3Field(asRecord(box?.max));
  const edgeCount = numberField(record, 'edgeCount');
  return {
    plane: { origin, normal },
    ...(areaMm2 !== undefined && areaMm2 > 0 ? { areaMm2 } : {}),
    ...(boxMin && boxMax ? { boxMm: { min: boxMin, max: boxMax } } : {}),
    ...(edgeCount !== undefined && Number.isInteger(edgeCount) && edgeCount > 0 ? { edgeCount } : {}),
    ...(record.normalSignAmbiguous === true ? { normalSignAmbiguous: true } : {}),
  };
}

/** 弧段采样；非圆/退化弧返回 undefined（面证据不完整 → 不猜面积）。 */
function sampleArc(curve: Extract<LoopCurve, { kind: 'arc' }>): [number, number, number][] | undefined {
  const center = curve.center;
  const radius = curve.radius;
  if (!(radius > 0) || !Number.isFinite(radius) || !Number.isFinite(curve.sweepRadians)) return undefined;
  const normal = unit(curve.normal);
  if (!normal) return undefined;
  const startRel = sub(curve.start, center);
  if (Math.abs(dot(startRel, normal)) > Math.max(0.05, radius * 1e-3)) return undefined;
  // 以 start 相对圆心的径向为 0 角，绕法向旋转 sweep；正交化径向。
  const radial = unit(sub(startRel, normal.map((value) => value * dot(startRel, normal)) as [number, number, number]));
  if (!radial) return undefined;
  const tangent: [number, number, number] = [
    normal[1]! * radial[2]! - normal[2]! * radial[1]!,
    normal[2]! * radial[0]! - normal[0]! * radial[2]!,
    normal[0]! * radial[1]! - normal[1]! * radial[0]!,
  ];
  const steps = 48;
  const points: [number, number, number][] = [];
  for (let index = 0; index <= steps; index++) {
    const angle = curve.sweepRadians * (index / steps);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push([
      center[0]! + radius * (cos * radial[0]! + sin * tangent[0]!),
      center[1]! + radius * (cos * radial[1]! + sin * tangent[1]!),
      center[2]! + radius * (cos * radial[2]! + sin * tangent[2]!),
    ]);
  }
  const end = points[points.length - 1]!;
  if (magnitude(sub(end, curve.end)) > Math.max(0.05, radius * 1e-3)) return undefined;
  return points;
}

function loopPoints(loop: readonly LoopCurve[]): [number, number, number][] | undefined {
  const points: [number, number, number][] = [];
  for (const curve of loop) {
    if (curve.kind === 'line') {
      points.push(curve.p0, curve.p1);
    } else if (curve.kind === 'arc') {
      const sampled = sampleArc(curve);
      if (!sampled) return undefined;
      points.push(...sampled);
    } else {
      return undefined;
    }
  }
  return points.length >= 3 ? points : undefined;
}

/** 平面多边形面积（Newell 法；点序任意但必须构成闭环）。 */
function polygonArea(points: readonly [number, number, number][]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    nx += (a[1]! - b[1]!) * (a[2]! + b[2]!);
    ny += (a[2]! - b[2]!) * (a[0]! + b[0]!);
    nz += (a[0]! - b[0]!) * (a[1]! + b[1]!);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

export interface FaceBoundaryStats {
  areaMm2: number;
  box: { min: [number, number, number]; max: [number, number, number] };
  edgeCount: number;
  loopCount: number;
}

/**
 * 面边界统计：所有环按面积降序，最大环为外环、其余为孔环（面面积=外环−孔环）。
 * 含非解析曲线/开环/退化面积返回 undefined（fail closed）。
 */
export function faceBoundaryStats(face: FaceHandleLike): FaceBoundaryStats | undefined {
  if (!Array.isArray(face.loops) || face.loops.length === 0) return undefined;
  const loops: [number, number, number][][] = [];
  let edgeCount = 0;
  for (const loop of face.loops) {
    // 纵深防御：BRep Loop 应闭合；开环/断点不参与面积/AABB 匹配。
    if (!loopIsClosed(loop)) return undefined;
    const points = loopPoints(loop);
    if (!points) return undefined;
    loops.push(points);
    edgeCount += loop.length;
  }
  const areas = loops.map(polygonArea).sort((a, b) => b - a);
  const outer = areas[0]!;
  const holes = areas.slice(1).reduce((sum, area) => sum + area, 0);
  const areaMm2 = outer - holes;
  if (!Number.isFinite(areaMm2) || !(areaMm2 > 1e-9)) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const points of loops) {
    for (const point of points) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
        max[axis] = Math.max(max[axis]!, point[axis]!);
      }
    }
  }
  return { areaMm2, box: { min, max }, edgeCount, loopCount: loops.length };
}

const PLANE_OFFSET_TOLERANCE_MM = 0.05;
const NORMAL_DOT_TOLERANCE = 0.999;
const AREA_RELATIVE_TOLERANCE = 1e-3;
const BOX_TOLERANCE_MM = 0.05;
const BOX_RELATIVE_TOLERANCE = 1e-3;
/** 面边界环闭合容差（mm）：相邻曲线端点/首尾必须连续，否则不猜面积。 */
const LOOP_CLOSURE_TOLERANCE_MM = 0.05;

function curveEndpoints(curve: LoopCurve): { start?: [number, number, number]; end?: [number, number, number] } {
  if (curve.kind === 'line') return { start: curve.p0, end: curve.p1 };
  if (curve.kind === 'arc') return { start: curve.start, end: curve.end };
  return {};
}

/** 环必须闭合：每条曲线的终点与下一条曲线起点连续（含首尾 wrap）。 */
function loopIsClosed(loop: readonly LoopCurve[]): boolean {
  if (loop.length === 0) return false;
  for (let index = 0; index < loop.length; index++) {
    const current = curveEndpoints(loop[index]!);
    const next = curveEndpoints(loop[(index + 1) % loop.length]!);
    if (!current.end || !next.start) return false;
    if (magnitude(sub(current.end, next.start)) > LOOP_CLOSURE_TOLERANCE_MM) return false;
  }
  return true;
}

/**
 * 唯一面匹配（纯函数）：平面法向/偏移 + 面积 + AABB + 边数；0/多候选返回诊断。
 */
export function matchCapFaceStartFaces(
  evidence: CapFaceStartEvidence,
  faces: readonly FaceHandleLike[],
): CapFaceStartMatch {
  const diagnostics: string[] = [];
  const expectedNormal = unit([evidence.plane.normal.x, evidence.plane.normal.y, evidence.plane.normal.z]);
  if (!expectedNormal) return { diagnostics: ['起始面法向退化'] };
  const origin: [number, number, number] = [
    evidence.plane.origin.x, evidence.plane.origin.y, evidence.plane.origin.z,
  ];
  const candidates: FaceHandleLike[] = [];
  for (const face of faces) {
    const label = `${face.bodyKey}:${face.subEntityId}`;
    const normal = unit(face.normal);
    // S3：bodydetails 法向符号不可信时接受 ±法向；平面/面积/AABB 仍须唯一。
    const normalDot = normal ? dot(normal, expectedNormal) : Number.NaN;
    const normalMatches = evidence.normalSignAmbiguous === true
      ? Math.abs(normalDot) >= NORMAL_DOT_TOLERANCE
      : normalDot >= NORMAL_DOT_TOLERANCE;
    if (!normalMatches) {
      diagnostics.push(`${label} 法向不符`);
      continue;
    }
    const stats = faceBoundaryStats(face);
    if (!stats) {
      diagnostics.push(`${label} 边界含非解析曲线/开环`);
      continue;
    }
    const center: [number, number, number] = [
      (stats.box.min[0] + stats.box.max[0]) / 2,
      (stats.box.min[1] + stats.box.max[1]) / 2,
      (stats.box.min[2] + stats.box.max[2]) / 2,
    ];
    const planeOffset = dot(sub(center, origin), expectedNormal);
    if (Math.abs(planeOffset) > PLANE_OFFSET_TOLERANCE_MM) {
      diagnostics.push(`${label} 平面偏移 ${planeOffset.toFixed(3)}`);
      continue;
    }
    if (evidence.areaMm2 !== undefined) {
      const delta = Math.abs(stats.areaMm2 - evidence.areaMm2);
      if (delta > Math.max(0.05, evidence.areaMm2 * AREA_RELATIVE_TOLERANCE)) {
        diagnostics.push(
          `${label} 面积 ${stats.areaMm2.toFixed(3)} ≠ 证据 ${evidence.areaMm2.toFixed(3)}（Δ=${delta.toFixed(3)}mm²）`,
        );
        continue;
      }
    }
    if (evidence.boxMm) {
      const axes = ['x', 'y', 'z'] as const;
      const mismatch = axes.find((axis, index) => {
        const span = evidence.boxMm!.max[axis] - evidence.boxMm!.min[axis];
        const tolerance = BOX_TOLERANCE_MM + Math.abs(span) * BOX_RELATIVE_TOLERANCE;
        return Math.abs(stats.box.min[index]! - evidence.boxMm!.min[axis]) > tolerance
          || Math.abs(stats.box.max[index]! - evidence.boxMm!.max[axis]) > tolerance;
      });
      if (mismatch !== undefined) {
        diagnostics.push(`${label} AABB 不符（轴 ${mismatch}）`);
        continue;
      }
    }
    if (evidence.edgeCount !== undefined && stats.edgeCount !== evidence.edgeCount) {
      diagnostics.push(`${label} 边数 ${stats.edgeCount} ≠ 证据 ${evidence.edgeCount}`);
      continue;
    }
    candidates.push(face);
  }
  if (candidates.length === 1) return { face: candidates[0]!, diagnostics };
  diagnostics.push(candidates.length === 0
    ? '无唯一起始面（平面/面积/AABB/边数证据不命中）'
    : `${candidates.length} 个起始面满足证据，拒绝猜`);
  return { diagnostics };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/**
 * 解析 capFaceProfile 起始面 → 当前 body 持久 faceRef。多体模型必须能由
 * 选择/上游特征唯一锚定目标 body；否则返回 ok:false（不按“首个 body”猜）。
 */
export async function resolveScenarioCapFaceStart(args: {
  page: Page;
  ctx: BSeedEditorContext;
  feature: ScenarioFeature;
  accessToken: string;
  bodyContext?: {
    bodyKeyBySource?: ReadonlyMap<string, string>;
    allBodyKeys?: readonly string[];
  };
}): Promise<CapFaceStartResolution> {
  const { page, ctx, feature, accessToken, bodyContext } = args;
  const params = asRecord(feature.params) ?? {};
  const selection = asRecord(params.selection);
  if (selection?.kind !== 'capFaceProfile') {
    return { ok: false, reason: `选择 kind=${String(selection?.kind ?? 'missing')}，不是 capFaceProfile` };
  }
  const evidence = parseCapFaceStartEvidence(selection.startFace);
  if (!evidence) return { ok: false, reason: '缺起始面证据（plane/area/AABB）' };
  if (evidence.areaMm2 === undefined && evidence.boxMm === undefined)
    return { ok: false, reason: '起始面证据不足（面积/AABB 均缺失）' };

  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body: BodyInfo) => body.active !== false && body.authored !== false,
  );
  if (bodies.length === 0) return { ok: false, reason: '无 active authored body' };
  let targetBodies = bodies;
  if (bodies.length > 1) {
    const sourceIds = [
      ...stringArray(selection.operationSourceIds),
      ...(typeof selection.upstreamId === 'string' ? [selection.upstreamId] : []),
      ...stringArray(params.booleanScopeFeatureIds),
    ];
    const keys = new Set<string>();
    for (const source of sourceIds) {
      const key = bodyContext?.bodyKeyBySource?.get(source);
      if (key !== undefined && bodies.some((body) => body.bodyKey === key)) keys.add(key);
    }
    if (keys.size !== 1)
      return { ok: false, reason: `多体模型无法唯一解析起始面目标 body（候选 ${keys.size}）` };
    const [targetKey] = [...keys];
    targetBodies = bodies.filter((body) => body.bodyKey === targetKey);
  }
  const targetBody = targetBodies[0]!;

  let faces: FaceHandleLike[] | undefined;
  try {
    faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, allBodies: readonly unknown[]): Promise<FaceHandleLike[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos) as Promise<FaceHandleLike[] | undefined>;
    }, { key: ctx.dbKey, bodyInfos: bodies });
  } catch (error) {
    return { ok: false, reason: `面枚举失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!faces) return { ok: false, reason: '面枚举命令槽被占用，未读到面' };
  const scoped = faces.filter((face) => face.bodyKey === targetBody.bodyKey);
  if (scoped.length === 0) return { ok: false, reason: `目标 body ${targetBody.bodyKey} 无面` };

  const matched = matchCapFaceStartFaces(evidence, scoped);
  if (!matched.face)
    return { ok: false, reason: matched.diagnostics.slice(-3).join('；') };
  const face = matched.face;
  const resolved = (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'resolveFaceRef',
    [ctx.dbKey, face.bodyKey, face.subEntityId],
    accessToken,
  )) as { ok: boolean; ref?: LubanTopologyId; error?: string };
  if (!resolved.ok || !resolved.ref
    || !Number.isInteger(resolved.ref.nodeId) || !Number.isInteger(resolved.ref.entityId)) {
    return { ok: false, reason: `resolveFaceRef 失败：${resolved.error ?? '无持久面引用'}` };
  }
  return {
    ok: true,
    bodyId: face.bodyKey,
    faceRef: resolved.ref,
    faceSubEntityId: face.subEntityId,
    faceNormal: face.normal,
    note: `CAP_FACE 起始面 → body ${face.bodyKey}:${face.subEntityId}` +
      `（plane=${evidence.plane.origin.x},${evidence.plane.origin.y},${evidence.plane.origin.z}` +
      `${evidence.areaMm2 !== undefined ? `, area=${evidence.areaMm2.toFixed(3)}mm²` : ''} → faceExtrude）`,
  };
}
