/**
 * Scenario 边选择器解析（test-only）：CAP_EDGE / SWEPT_EDGE → 持久边引用。
 *
 * 通道：
 * 1. 页面 dev-only 观测面 `__lubanE2EExamples.readEdgeHandles` 读 active body
 *    的全部边（缓存子实体 id + 精确曲线），与 BRep 显示同一 SolidModeling
 *    命令/几何缓存，不新增产品建模 API；
 * 2. 本文件按草图实体 + 端盖/上游操作做几何唯一匹配（零/多匹配即失败）；
 * 3. 每条命中边走既有 `resolveEdgeRef` RPC → `FilletEdgeRef`，再交给标准
 *    FeatureOp。绝不把任意边 id 当作成功。
 *
 * 匹配语义必须与私有后端 `ScenarioReplay.ts` 保持一致；两边都有各自测试，
 * 任何一侧的规则变更都必须同步，否则场景会被一侧拒收。
 */
import type { Page } from '@playwright/test';
import type { BodyInfo, FilletEdgeRef } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';
import {
  BlockedCapabilityError,
  type ParityScenario,
  type ScenarioFeature,
} from './scenario-to-op.js';

const TOL = 1e-5;

type Vec3 = [number, number, number];

interface EdgeCurve {
  kind: 'line' | 'arc' | 'other';
  p0?: Vec3;
  p1?: Vec3;
  center?: Vec3;
  radius?: number;
  normal?: Vec3;
  start?: Vec3;
  end?: Vec3;
  sweepRadians?: number;
  geometryType?: string;
}

export interface EdgeHandle {
  bodyKey: string;
  subEntityId: number;
  curve: EdgeCurve;
}

interface SketchMeta {
  sourceFeatureId: string;
  plane?: {
    origin: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    xDir: { x: number; y: number; z: number };
  };
  entities: Array<Record<string, unknown>>;
}

interface OpMeta {
  kind: 'extrude' | 'revolve';
  sourceFeatureId: string;
  sketchSource?: string;
  depthMm?: number;
  symmetric?: boolean;
  oppositeDirection?: boolean;
  /** throughAll 的物理深度由 body 决定，不能用 depthMm 当扫掠范围。 */
  endBound?: string;
  axisSketchEntityId?: number;
}

interface EdgeSelector {
  kind: string;
  sketchFeatureId?: string;
  sketchEntityId?: number;
  sketchEntityKind?: string;
  isStart?: boolean;
  operationSourceIds?: string[];
  contextSketchEntityIds?: number[];
}

export interface ResolveEdgesResult {
  refs: FilletEdgeRef[];
  notes: string[];
  /** 被选中边所在的 bodyKey（去重）。多体模型用它给 fillet/chamfer 显式锚定目标体。 */
  bodyKeys: string[];
}

/**
 * v1.50：该步时点的 body 谱系。多体模型中相同几何边可能同时存在于多个 body
 * （同一草图多 profile 共享顶点/边），必须用 selector.operationSourceIds 限定到
 * 源操作所在的 body，否则单边选择器会“匹配不唯一/跨 body”。
 */
export interface EdgeBodyScope {
  bodyKeyBySource?: ReadonlyMap<string, string>;
}

export interface Frame {
  o: Vec3;
  x: Vec3;
  y: Vec3;
  n: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
};

function frameFromPlane(plane: SketchMeta['plane'], oppositeDirection: boolean): Frame | undefined {
  if (!plane) return undefined;
  const x = norm([plane.xDir.x, plane.xDir.y, plane.xDir.z]);
  const nRaw = norm([plane.normal.x, plane.normal.y, plane.normal.z]);
  const y = cross(nRaw, x);
  return {
    o: [plane.origin.x, plane.origin.y, plane.origin.z],
    x,
    y,
    n: oppositeDirection ? [-nRaw[0], -nRaw[1], -nRaw[2]] : nRaw,
  };
}

function worldOf(frame: Frame, u: number, v: number, w: number): Vec3 {
  return [
    frame.o[0] + u * frame.x[0] + v * frame.y[0] + w * frame.n[0],
    frame.o[1] + u * frame.x[1] + v * frame.y[1] + w * frame.n[1],
    frame.o[2] + u * frame.x[2] + v * frame.y[2] + w * frame.n[2],
  ];
}

const near = (a: Vec3, b: Vec3, tol = TOL): boolean =>
  Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

/** 世界点 → 草图坐标系 (u, v, w)；w 沿拉伸方向。 */
function frameCoords(frame: Frame, p: Vec3): [number, number, number] {
  const v = sub(p, frame.o);
  return [dot(v, frame.x), dot(v, frame.y), dot(v, frame.n)];
}

const near2 = (a: readonly [number, number], b: readonly [number, number], tol = TOL): boolean =>
  Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;

/**
 * through-all 拉伸的侧边：不依赖记录深度，只要求边沿草图法向、且在某个
 * 草图端点 (u,v) 上（实际 w 范围由 body 决定）。
 */
function sweptSideUv(edge: EdgeHandle, frame: Frame): [number, number] | undefined {
  if (edge.curve.kind !== 'line' || !edge.curve.p0 || !edge.curve.p1) return undefined;
  const a = frameCoords(frame, edge.curve.p0);
  const b = frameCoords(frame, edge.curve.p1);
  if (Math.abs(a[2] - b[2]) < TOL) return undefined; // 必须跨法向
  if (!near2([a[0], a[1]], [b[0], b[1]])) return undefined; // 必须平行法向
  return [a[0], a[1]];
}

/** 端盖边所在的 w（线取共面 w；弧取圆心 w）；非共面返回 undefined。 */
function capEdgeW(edge: EdgeHandle, frame: Frame): number | undefined {
  if (edge.curve.kind === 'line' && edge.curve.p0 && edge.curve.p1) {
    const a = frameCoords(frame, edge.curve.p0);
    const b = frameCoords(frame, edge.curve.p1);
    return Math.abs(a[2] - b[2]) < TOL ? (a[2] + b[2]) / 2 : undefined;
  }
  if (edge.curve.kind === 'arc' && edge.curve.center)
    return frameCoords(frame, edge.curve.center)[2];
  return undefined;
}

/** 面边界选择器在 through-all/任意深度下的端盖边：投影回草图坐标系比对。 */
/** through-all 端盖边被布尔边界裁剪时端点不再等于草图段——按“同一支撑线 +
 * 投影重叠”匹配（仅 CAP_EDGE line 通道；CIRCLE/ARC 仍走精确投影）。 */
export function projectedCapEdgeOnLine(edge: EdgeHandle, entity: Record<string, unknown>, frame: Frame): boolean {
  if (entity.kind !== 'line' || edge.curve.kind !== 'line' || !edge.curve.p0 || !edge.curve.p1) return false;
  const p1 = point2(entity.p1);
  const p2 = point2(entity.p2);
  if (!p1 || !p2) return false;
  const a = frameCoords(frame, edge.curve.p0);
  const b = frameCoords(frame, edge.curve.p1);
  if (Math.abs(a[2] - b[2]) > TOL) return false;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return false;
  const len = Math.sqrt(len2);
  const perp = (q: [number, number]): number => Math.abs((q[0] - p1[0]) * dy - (q[1] - p1[1]) * dx) / len;
  const along = (q: [number, number]): number => ((q[0] - p1[0]) * dx + (q[1] - p1[1]) * dy) / len2;
  if (perp([a[0], a[1]]) > TOL || perp([b[0], b[1]]) > TOL) return false;
  const lo = Math.min(along([a[0], a[1]]), along([b[0], b[1]]));
  const hi = Math.max(along([a[0], a[1]]), along([b[0], b[1]]));
  return hi >= -1e-4 && lo <= 1 + 1e-4;
}

function projectedCapEdgeMatches(edge: EdgeHandle, entity: Record<string, unknown>, frame: Frame): boolean {
  if (entity.kind === 'line') {
    if (edge.curve.kind !== 'line' || !edge.curve.p0 || !edge.curve.p1) return false;
    const p1 = point2(entity.p1);
    const p2 = point2(entity.p2);
    if (!p1 || !p2) return false;
    const a = frameCoords(frame, edge.curve.p0);
    const b = frameCoords(frame, edge.curve.p1);
    if (Math.abs(a[2] - b[2]) > TOL) return false;
    return (near2([a[0], a[1]], p1) && near2([b[0], b[1]], p2))
      || (near2([a[0], a[1]], p2) && near2([b[0], b[1]], p1));
  }
  if (entity.kind === 'circle' || entity.kind === 'arc') {
    if (edge.curve.kind !== 'arc' || !edge.curve.center || edge.curve.radius === undefined || !edge.curve.normal)
      return false;
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    if (!center || !Number.isFinite(radius)) return false;
    if (Math.abs(dot(edge.curve.normal, frame.n)) < 1 - 1e-9) return false;
    if (Math.abs(edge.curve.radius - radius) > TOL) return false;
    const c = frameCoords(frame, edge.curve.center);
    if (!near2([c[0], c[1]], center)) return false;
    if (entity.kind === 'circle') return true;
    const expected = arcEndpoints(entity, frame, 0);
    if (!expected || !edge.curve.start || !edge.curve.end) return false;
    const start = frameCoords(frame, edge.curve.start);
    const end = frameCoords(frame, edge.curve.end);
    const s = frameCoords(frame, expected.start);
    const e = frameCoords(frame, expected.end);
    return (near2([start[0], start[1]], [s[0], s[1]]) && near2([end[0], end[1]], [e[0], e[1]]))
      || (near2([start[0], start[1]], [e[0], e[1]]) && near2([end[0], end[1]], [s[0], s[1]]));
  }
  return false;
}

function point2(value: unknown): [number, number] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const p = value as { x?: unknown; y?: unknown };
  return typeof p.x === 'number' && typeof p.y === 'number' ? [p.x, p.y] : undefined;
}

function lineMatches(edge: EdgeHandle, a: Vec3, b: Vec3): boolean {
  if (edge.curve.kind !== 'line' || !edge.curve.p0 || !edge.curve.p1) return false;
  return (near(edge.curve.p0, a) && near(edge.curve.p1, b))
    || (near(edge.curve.p0, b) && near(edge.curve.p1, a));
}

function circleMatches(edge: EdgeHandle, center: Vec3, radius: number, normal: Vec3): boolean {
  const c = edge.curve;
  if (c.kind !== 'arc' || !c.center || c.radius === undefined || !c.normal) return false;
  return Math.abs(dot(c.normal, normal)) > 1 - 1e-9
    && near(c.center, center)
    && Math.abs(c.radius - radius) < TOL;
}

function arcEndpoints(
  entity: Record<string, unknown>,
  frame: Frame,
  w: number,
): { start: Vec3; end: Vec3 } | undefined {
  const center = point2(entity.center);
  const radius = Number(entity.radius);
  const startAngle = Number(entity.startAngle);
  const sweep = Number(entity.sweepAngle);
  if (!center || !Number.isFinite(radius) || !Number.isFinite(startAngle) || !Number.isFinite(sweep))
    return undefined;
  const at = (angle: number): Vec3 =>
    worldOf(frame, center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), w);
  return { start: at(startAngle), end: at(startAngle + sweep) };
}

function matchCapEdge(edge: EdgeHandle, entity: Record<string, unknown>, frame: Frame, capW: number): boolean {
  if (entity.kind === 'circle') {
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    if (!center || !Number.isFinite(radius)) return false;
    return circleMatches(edge, worldOf(frame, center[0], center[1], capW), radius, frame.n);
  }
  if (entity.kind === 'arc') {
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    if (!center || !Number.isFinite(radius)) return false;
    if (!circleMatches(edge, worldOf(frame, center[0], center[1], capW), radius, frame.n)) return false;
    const expected = arcEndpoints(entity, frame, capW);
    if (!expected || !edge.curve.start || !edge.curve.end) return false;
    return (near(edge.curve.start, expected.start) && near(edge.curve.end, expected.end))
      || (near(edge.curve.start, expected.end) && near(edge.curve.end, expected.start));
  }
  if (entity.kind === 'line') {
    const p1 = point2(entity.p1);
    const p2 = point2(entity.p2);
    if (!p1 || !p2) return false;
    return lineMatches(
      edge,
      worldOf(frame, p1[0], p1[1], capW),
      worldOf(frame, p2[0], p2[1], capW),
    );
  }
  return false;
}

function sketchEntityEndpoints(entity: Record<string, unknown>): Array<[number, number]> {
  if (entity.kind === 'point') {
    const p = point2(entity);
    return p ? [p] : [];
  }
  if (entity.kind === 'line') {
    const p1 = point2(entity.p1);
    const p2 = point2(entity.p2);
    return [p1, p2].filter((p): p is [number, number] => p !== undefined);
  }
  if (entity.kind === 'arc') {
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    const startAngle = Number(entity.startAngle);
    const sweep = Number(entity.sweepAngle);
    if (!center || !Number.isFinite(radius) || !Number.isFinite(startAngle) || !Number.isFinite(sweep))
      return [];
    return [
      [center[0] + radius * Math.cos(startAngle), center[1] + radius * Math.sin(startAngle)],
      [center[0] + radius * Math.cos(startAngle + sweep), center[1] + radius * Math.sin(startAngle + sweep)],
    ];
  }
  return [];
}

/**
 * 圆实体没有端点；当 selector 用相邻实体消歧时（Hydraulic Fillet 1 实测：
 * 外圆 + 两条相邻直线，各查询命中六边形一个角点），取相邻实体之间**唯一且落在
 * 圆上**的共享端点作为扫掠边位置。共享点不唯一/不在圆上 → 空集（匹配失败，不猜）。
 */
function circleContextCandidatePoints(
  circle: Record<string, unknown>,
  contextEntities: readonly Record<string, unknown>[],
): Array<[number, number]> {
  const center = point2(circle.center);
  const radius = Number(circle.radius);
  if (!center || !Number.isFinite(radius) || contextEntities.length < 2) return [];
  const shared = new Map<string, [number, number]>();
  for (let i = 0; i < contextEntities.length; i += 1) {
    for (let j = i + 1; j < contextEntities.length; j += 1) {
      for (const p of sketchEntityEndpoints(contextEntities[i]!)) {
        for (const q of sketchEntityEndpoints(contextEntities[j]!)) {
          if (Math.abs(p[0] - q[0]) >= TOL || Math.abs(p[1] - q[1]) >= TOL) continue;
          const radial = Math.hypot(p[0] - center[0], p[1] - center[1]);
          if (Math.abs(radial - radius) < TOL) shared.set(`${p[0].toFixed(9)}:${p[1].toFixed(9)}`, p);
        }
      }
    }
  }
  return shared.size === 1 ? Array.from(shared.values()) : [];
}

/** 相邻实体消歧：共享端点唯一时只用该点，否则回退全部端点（随后会以多匹配失败）。 */
export function sweptCandidatePoints(
  entity: Record<string, unknown>,
  contextEntities: readonly Record<string, unknown>[],
): Array<[number, number]> {
  const primary = sketchEntityEndpoints(entity);
  if (contextEntities.length === 0) return primary;
  if (primary.length === 0 && entity.kind === 'circle') return circleContextCandidatePoints(entity, contextEntities);
  const shared: Array<[number, number]> = [];
  for (const context of contextEntities) {
    for (const p of sketchEntityEndpoints(context)) {
      for (const q of primary) {
        if (Math.abs(p[0] - q[0]) < TOL && Math.abs(p[1] - q[1]) < TOL) shared.push(q);
      }
    }
  }
  const unique = new Map(shared.map((p) => [`${p[0].toFixed(9)}:${p[1].toFixed(9)}`, p]));
  return unique.size === 1 ? Array.from(unique.values()) : primary;
}

function matchSweptExtrude(
  edge: EdgeHandle,
  points: ReadonlyArray<readonly [number, number]>,
  frame: Frame,
  wLow: number,
  wHigh: number,
): boolean {
  return points.some((p) =>
    lineMatches(edge, worldOf(frame, p[0], p[1], wLow), worldOf(frame, p[0], p[1], wHigh)));
}

function projectToAxis(point: Vec3, origin: Vec3, dir: Vec3): { center: Vec3; radius: number } {
  const u = norm(dir);
  const v = sub(point, origin);
  const t = dot(v, u);
  const center: Vec3 = [origin[0] + t * u[0], origin[1] + t * u[1], origin[2] + t * u[2]];
  return { center, radius: Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]) };
}

function matchSweptRevolve(
  edge: EdgeHandle,
  points: ReadonlyArray<readonly [number, number]>,
  frame: Frame,
  axis: { origin: Vec3; dir: Vec3 },
): boolean {
  const projected = points
    .map((p) => projectToAxis(worldOf(frame, p[0], p[1], 0), axis.origin, axis.dir))
    .filter((p) => p.radius > TOL);
  if (projected.length === 0) return false;
  const first = projected[0]!;
  const same = projected.every((p) =>
    Math.abs(p.radius - first.radius) < TOL && near(p.center, first.center));
  if (!same) return false;
  return circleMatches(edge, first.center, first.radius, axis.dir);
}

function collectMetadata(scenario: ParityScenario): {
  sketches: Map<string, SketchMeta>;
  ops: OpMeta[];
} {
  const sketches = new Map<string, SketchMeta>();
  const ops: OpMeta[] = [];
  let latestSketchSource: string | undefined;
  for (const feature of scenario.features as ScenarioFeature[]) {
    if (feature.type === 'sketch') {
      if (!feature.sourceFeatureId) continue;
      latestSketchSource = feature.sourceFeatureId;
      const params = feature.params as {
        plane?: SketchMeta['plane'];
        entities?: Array<Record<string, unknown>>;
      };
      sketches.set(feature.sourceFeatureId, {
        sourceFeatureId: feature.sourceFeatureId,
        ...(params.plane ? { plane: params.plane } : {}),
        entities: params.entities ?? [],
      });
      continue;
    }
    if (feature.type === 'extrude') {
      const p = feature.params as {
        depthMm?: number;
        symmetric?: boolean;
        oppositeDirection?: boolean;
        direction?: 'forward' | 'backward';
        endBound?: string;
        selection?: { kind?: string; sketchFeatureId?: string };
      };
      if (!feature.sourceFeatureId) continue;
      ops.push({
        kind: 'extrude',
        sourceFeatureId: feature.sourceFeatureId,
        ...((p.selection?.sketchFeatureId ?? latestSketchSource)
          ? { sketchSource: p.selection?.sketchFeatureId ?? latestSketchSource }
          : {}),
        depthMm: p.depthMm ?? 1,
        symmetric: p.symmetric === true,
        oppositeDirection: p.oppositeDirection === true || p.direction === 'backward',
        ...(p.endBound ? { endBound: p.endBound } : {}),
      });
      continue;
    }
    if (feature.type === 'revolve') {
      const p = feature.params as {
        sketchFeatureId?: string;
        axisSketchEntityId?: number;
      };
      if (!feature.sourceFeatureId) continue;
      ops.push({
        kind: 'revolve',
        sourceFeatureId: feature.sourceFeatureId,
        ...((p.sketchFeatureId ?? latestSketchSource)
          ? { sketchSource: p.sketchFeatureId ?? latestSketchSource }
          : {}),
        ...(p.axisSketchEntityId !== undefined ? { axisSketchEntityId: p.axisSketchEntityId } : {}),
      });
    }
  }
  return { sketches, ops };
}

function findSourceOp(selector: EdgeSelector, ops: readonly OpMeta[]): OpMeta | undefined {
  return (selector.operationSourceIds ?? [])
    .map((id) => ops.find((op) => op.sourceFeatureId === id))
    .find((op) => op !== undefined)
    ?? [...ops].reverse().find((op) => op.sketchSource === selector.sketchFeatureId);
}

/** 期望边几何（面边界选择器可一次命中多条边）。 */
type ExpectedEdge =
  | { kind: 'line'; p0: Vec3; p1: Vec3 }
  | { kind: 'arc'; center: Vec3; radius: number; normal: Vec3; start: Vec3; end: Vec3 }
  | { kind: 'circle'; center: Vec3; radius: number; normal: Vec3 };

function edgeMatchesExpected(edge: EdgeHandle, expected: ExpectedEdge): boolean {
  if (expected.kind === 'line') return lineMatches(edge, expected.p0, expected.p1);
  if (expected.kind === 'circle')
    return circleMatches(edge, expected.center, expected.radius, expected.normal);
  if (!circleMatches(edge, expected.center, expected.radius, expected.normal)) return false;
  if (!edge.curve.start || !edge.curve.end) return false;
  return (near(edge.curve.start, expected.start) && near(edge.curve.end, expected.end))
    || (near(edge.curve.start, expected.end) && near(edge.curve.end, expected.start));
}

function entityCapEdgeAtWorld(
  entity: Record<string, unknown>,
  frame: Frame,
  w: number,
): ExpectedEdge | undefined {
  if (entity.kind === 'circle') {
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    if (!center || !Number.isFinite(radius)) return undefined;
    return { kind: 'circle', center: worldOf(frame, center[0], center[1], w), radius, normal: frame.n };
  }
  if (entity.kind === 'arc') {
    const center = point2(entity.center);
    const radius = Number(entity.radius);
    const ends = arcEndpoints(entity, frame, w);
    if (!center || !Number.isFinite(radius) || !ends) return undefined;
    return {
      kind: 'arc',
      center: worldOf(frame, center[0], center[1], w),
      radius,
      normal: frame.n,
      start: ends.start,
      end: ends.end,
    };
  }
  if (entity.kind === 'line') {
    const p1 = point2(entity.p1);
    const p2 = point2(entity.p2);
    if (!p1 || !p2) return undefined;
    return { kind: 'line', p0: worldOf(frame, p1[0], p1[1], w), p1: worldOf(frame, p2[0], p2[1], w) };
  }
  return undefined;
}

/**
 * SWEPT_FACE 的期望边界边：草图实体沿 extrude 方向扫出的侧面的 4 条边界
 * （圆为两端圆环；线/弧为两端盖边 + 两条侧边）。
 */
function sweptFaceExpectedEdges(
  entity: Record<string, unknown>,
  frame: Frame,
  wLow: number,
  wHigh: number,
): ExpectedEdge[] {
  const edges: ExpectedEdge[] = [];
  if (entity.kind === 'circle') {
    const low = entityCapEdgeAtWorld(entity, frame, wLow);
    const high = entityCapEdgeAtWorld(entity, frame, wHigh);
    return [...(low ? [low] : []), ...(high ? [high] : [])];
  }
  if (entity.kind === 'line') {
    const p1 = point2(entity.p1);
    const p2 = point2(entity.p2);
    if (!p1 || !p2) return edges;
    const at = (p: [number, number], w: number) => worldOf(frame, p[0], p[1], w);
    edges.push({ kind: 'line', p0: at(p1, wLow), p1: at(p1, wHigh) });
    edges.push({ kind: 'line', p0: at(p2, wLow), p1: at(p2, wHigh) });
    const lowCap = entityCapEdgeAtWorld(entity, frame, wLow);
    const highCap = entityCapEdgeAtWorld(entity, frame, wHigh);
    if (lowCap) edges.push(lowCap);
    if (highCap) edges.push(highCap);
    return edges;
  }
  if (entity.kind === 'arc') {
    const lowEnds = arcEndpoints(entity, frame, wLow);
    const highEnds = arcEndpoints(entity, frame, wHigh);
    if (lowEnds && highEnds) {
      edges.push({ kind: 'line', p0: lowEnds.start, p1: highEnds.start });
      edges.push({ kind: 'line', p0: lowEnds.end, p1: highEnds.end });
    }
    const lowCap = entityCapEdgeAtWorld(entity, frame, wLow);
    const highCap = entityCapEdgeAtWorld(entity, frame, wHigh);
    if (lowCap) edges.push(lowCap);
    if (highCap) edges.push(highCap);
  }
  return edges;
}

const endpointKey = (p: readonly [number, number]): string =>
  `${p[0].toFixed(6)}:${p[1].toFixed(6)}`;

/**
 * 包含指定实体的闭合草图轮廓环（点忽略；圆独立成环）。
 * 组成环的每条线/弧端点必须恰好出现 2 次；分叉/开口/多个环一律诚实失败。
 */
function profileLoopOf(
  entities: readonly Record<string, unknown>[],
  reference: Record<string, unknown>,
): Record<string, unknown>[] {
  if (reference.kind === 'circle') return [reference];
  if (reference.kind !== 'line' && reference.kind !== 'arc') return [];

  const loopable = entities.filter((e) => e.kind === 'line' || e.kind === 'arc');
  const byEndpoint = new Map<string, Record<string, unknown>[]>();
  for (const entity of loopable) {
    for (const p of sketchEntityEndpoints(entity)) {
      const key = endpointKey(p);
      const list = byEndpoint.get(key) ?? [];
      list.push(entity);
      byEndpoint.set(key, list);
    }
  }

  const allowed = new Set<Record<string, unknown>>([reference]);
  const queue = [reference];
  while (queue.length) {
    const current = queue.pop()!;
    for (const p of sketchEntityEndpoints(current)) {
      for (const next of byEndpoint.get(endpointKey(p)) ?? []) {
        if (allowed.has(next)) continue;
        allowed.add(next);
        queue.push(next);
      }
    }
  }

  // 闭合环的每个端点必须恰有 2 条实体相接；分叉（T 接）或开口都不猜。
  for (const entity of Array.from(allowed)) {
    for (const p of sketchEntityEndpoints(entity)) {
      const count = (byEndpoint.get(endpointKey(p)) ?? []).filter((c) => allowed.has(c)).length;
      if (count !== 2)
        throw new BlockedCapabilityError(
          'edge-selector',
          `CAP_FACE 轮廓环不闭合/分叉（端点 ${endpointKey(p)} 接 ${count} 条实体）`,
        );
    }
  }
  return Array.from(allowed);
}

function resolveSelector(
  selector: EdgeSelector,
  handles: readonly EdgeHandle[],
  sketches: ReadonlyMap<string, SketchMeta>,
  ops: readonly OpMeta[],
): EdgeHandle[] {
  if (
    selector.kind !== 'capEdge' &&
    selector.kind !== 'sweptEdge' &&
    selector.kind !== 'capFace' &&
    selector.kind !== 'sweptFace'
  )
    throw new BlockedCapabilityError('edge-selector', `不支持的边选择器 ${selector.kind}`);
  if (!selector.sketchFeatureId || selector.sketchEntityId === undefined)
    throw new BlockedCapabilityError('edge-selector', `${selector.kind} 缺少草图/实体`);
  const sketch = sketches.get(selector.sketchFeatureId);
  if (!sketch)
    throw new BlockedCapabilityError('edge-selector', `${selector.kind} 引用的草图未构建: ${selector.sketchFeatureId}`);
  const entity = sketch.entities.find((e) => Number(e.id) === selector.sketchEntityId);
  if (!entity)
    throw new BlockedCapabilityError(
      'edge-selector',
      `${selector.kind} 草图实体不存在: ${selector.sketchFeatureId}#${selector.sketchEntityId}`,
    );
  const source = findSourceOp(selector, ops);
  if (!source)
    throw new BlockedCapabilityError('edge-selector', `${selector.kind} 未找到源操作`);
  const frame = frameFromPlane(sketch.plane, source.oppositeDirection === true);
  if (!frame) throw new BlockedCapabilityError('edge-selector', `${selector.kind} 草图缺少平面`);
  const contextEntities = (selector.contextSketchEntityIds ?? [])
    .map((id) => sketch.entities.find((candidate) => Number(candidate.id) === id))
    .filter((candidate): candidate is Record<string, unknown> => candidate !== undefined);
  const sweptPoints = selector.kind === 'sweptEdge'
    ? sweptCandidatePoints(entity, contextEntities)
    : [];

  let matches: EdgeHandle[];
  if (selector.kind === 'capEdge') {
    if (source.kind !== 'extrude')
      throw new BlockedCapabilityError('edge-selector', `CAP_EDGE 仅支持拉伸源（当前 ${source.kind}）`);
    const distance = source.depthMm ?? 0;
    const wLow = source.symmetric === true ? -distance / 2 : 0;
    const wHigh = source.symmetric === true ? distance / 2 : distance;
    const capW = selector.isStart === true ? wLow : wHigh;
    if (source.endBound === 'throughAll' || source.endBound === 'through_all') {
      // v1.38（Stirrup 实测）：through-all 的实际端盖位置由 body 决定，depthMm 是
      // 记录值不是扫掠范围；CAP_EDGE 与 CAP_FACE 同口径——投影回草图系匹配后
      // 按 isStart 取最小/最大 w。旧实现对 through-all 用 depthMm，Fillet 2 的
      // 线端盖 matches=0。
      const candidates: Array<{ edge: EdgeHandle; w: number }> = [];
      for (const edge of handles) {
        const w = capEdgeW(edge, frame);
        const matched = entity.kind === 'line'
          ? projectedCapEdgeOnLine(edge, entity, frame)
          : projectedCapEdgeMatches(edge, entity, frame);
        if (w !== undefined && matched)
          candidates.push({ edge, w });
      }
      if (candidates.length === 0) {
        matches = [];
      } else {
        const targetW = selector.isStart === true
          ? Math.min(...candidates.map((entry) => entry.w))
          : Math.max(...candidates.map((entry) => entry.w));
        matches = candidates
          .filter((entry) => Math.abs(entry.w - targetW) < TOL)
          .map((entry) => entry.edge);
      }
    } else {
      matches = handles.filter((edge) => matchCapEdge(edge, entity, frame, capW));
    }
  } else if (selector.kind === 'sweptEdge') {
    if (source.kind === 'extrude') {
      const distance = source.depthMm ?? 0;
      const wLow = source.symmetric === true ? -distance / 2 : 0;
      const wHigh = source.symmetric === true ? distance / 2 : distance;
      if (source.endBound === 'throughAll' || source.endBound === 'through_all') {
        // through-all 的实际深度由 body 决定：按“沿法向 + 草图端点 (u,v)”匹配，
        // 不拿记录里的 depthMm 当扫掠范围（Pedal 实测：记录 25.4，实际 15.875）。
        matches = handles.filter((edge) => {
          const uv = sweptSideUv(edge, frame);
          return uv !== undefined && sweptPoints.some((p) => near2(uv, p));
        });
      } else {
        matches = handles.filter((edge) => matchSweptExtrude(edge, sweptPoints, frame, wLow, wHigh));
      }
    } else {
      if (source.axisSketchEntityId === undefined)
        throw new BlockedCapabilityError('edge-selector', 'SWEPT_EDGE 旋转源缺少轴线');
      const axisEntity = sketch.entities.find((e) => Number(e.id) === source.axisSketchEntityId);
      if (!axisEntity || axisEntity.kind !== 'line')
        throw new BlockedCapabilityError('edge-selector', `SWEPT_EDGE 轴线实体无效: ${source.axisSketchEntityId}`);
      const a1 = point2(axisEntity.p1);
      const a2 = point2(axisEntity.p2);
      if (!a1 || !a2) throw new BlockedCapabilityError('edge-selector', 'SWEPT_EDGE 轴线端点缺失');
      const origin = worldOf(frame, a1[0], a1[1], 0);
      const end = worldOf(frame, a2[0], a2[1], 0);
      matches = handles.filter((edge) =>
        matchSweptRevolve(edge, sweptPoints, frame, { origin, dir: sub(end, origin) }));
    }
  } else {
    // CAP_FACE / SWEPT_FACE：面边界边集。首版仅支持 extrude 源。
    if (source.kind !== 'extrude')
      throw new BlockedCapabilityError('edge-selector', `${selector.kind} 仅支持拉伸源（当前 ${source.kind}）`);
    const distance = source.depthMm ?? 0;
    const wLow = source.symmetric === true ? -distance / 2 : 0;
    const wHigh = source.symmetric === true ? distance / 2 : distance;
    const throughAll = source.endBound === 'throughAll' || source.endBound === 'through_all';
    if (selector.kind === 'sweptFace' && throughAll) {
      // 实际 w 范围由 body 决定：侧边按法向/端点匹配，端盖边投影回草图坐标系。
      const endpoints = sketchEntityEndpoints(entity);
      matches = handles.filter((edge) => {
        const uv = sweptSideUv(edge, frame);
        if (uv !== undefined && endpoints.some((p) => near2(uv, p))) return true;
        return projectedCapEdgeMatches(edge, entity, frame);
      });
    } else if (selector.kind === 'sweptFace') {
      const expected = sweptFaceExpectedEdges(entity, frame, wLow, wHigh);
      if (expected.length === 0)
        throw new BlockedCapabilityError('edge-selector', `${selector.kind} 期望边为空`);
      matches = handles.filter((edge) => expected.some((candidate) => edgeMatchesExpected(edge, candidate)));
    } else if (throughAll) {
      // 端盖面：through-all 两端轮廓同形，投影匹配后按 w 选起点（min）或终点（max）。
      const loop = profileLoopOf(sketch.entities, entity);
      const projected = handles
        .map((edge) => ({ edge, w: capEdgeW(edge, frame) }))
        .filter(({ edge, w }) => w !== undefined && loop.some((loopEntity) => projectedCapEdgeMatches(edge, loopEntity, frame)))
        .map(({ edge, w }) => ({ edge, w: w! }));
      if (projected.length === 0)
        throw new BlockedCapabilityError('edge-selector', 'CAP_FACE through-all 端盖边无匹配');
      const targetW = selector.isStart === true
        ? Math.min(...projected.map((entry) => entry.w))
        : Math.max(...projected.map((entry) => entry.w));
      matches = projected
        .filter((entry) => Math.abs(entry.w - targetW) < TOL)
        .map((entry) => entry.edge);
    } else {
      const expected = profileLoopOf(sketch.entities, entity)
        .map((loopEntity) =>
          entityCapEdgeAtWorld(loopEntity, frame, selector.isStart === true ? wLow : wHigh))
        .filter((edge): edge is ExpectedEdge => edge !== undefined);
      if (expected.length === 0)
        throw new BlockedCapabilityError('edge-selector', `${selector.kind} 期望边为空`);
      matches = handles.filter((edge) => expected.some((candidate) => edgeMatchesExpected(edge, candidate)));
    }
    if (process.env.EDGE_DEBUG === '1')
      console.log(`[edge-resolver] ${selector.kind} throughAll=${throughAll} matches=${matches.length}`);
  }

  const unique = new Map(matches.map((edge) => [`${edge.bodyKey}:${edge.subEntityId}`, edge]));
  const faceDerived = selector.kind === 'capFace' || selector.kind === 'sweptFace';
  const invalid = faceDerived ? unique.size === 0 : unique.size !== 1;
  if (invalid) {
    if (process.env.EDGE_DEBUG === '1') {
      // 大模型下完整 edges 可能超过 Playwright console 捕获上限被截断；
      // 先打印紧凑摘要（id/kind/端点），完整 JSON 供小模型使用。
      const summary = handles.map((handle) => {
        const curve = handle.curve as {
          kind?: string;
          p0?: readonly number[];
          p1?: readonly number[];
          start?: readonly number[];
          end?: readonly number[];
        };
        return {
          id: handle.subEntityId,
          kind: curve.kind,
          points: curve.kind === 'line' ? [curve.p0, curve.p1] : [curve.start, curve.end],
        };
      });
      console.log('[edge-resolver] handle-summary', JSON.stringify(summary));
      console.log('[edge-resolver] selector', JSON.stringify(selector), 'matches', unique.size);
      console.log('[edge-resolver] edges', JSON.stringify(handles, null, 2));
      console.log('[edge-resolver] sketch entity', JSON.stringify(entity), 'frame', JSON.stringify(frame), 'source', JSON.stringify(source));
    }
    throw new BlockedCapabilityError(
      'edge-selector',
      `${selector.kind} ${faceDerived ? '无匹配' : '匹配不唯一'}: ` +
      `sketch=${selector.sketchFeatureId}#${selector.sketchEntityId} ` +
      `source=${source.sourceFeatureId} matches=${unique.size}`,
    );
  }
  return Array.from(unique.values());
}

/**
 * 读取当前 active body 的全部 BRep 边句柄（test-only 观测面）。
 * 2026-11-09 导出供审计边覆盖（Bumper Fillet 1 全 20 边）复用同一枚举通道；
 * 通用 `resolveScenarioEdges` 行为不变。
 */
export async function readBodyEdgeHandles(
  page: Page,
  ctx: BSeedEditorContext,
  accessToken: string,
): Promise<EdgeHandle[]> {
  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body: BodyInfo) => body.active !== false && body.authored !== false,
  );
  if (process.env.EDGE_DEBUG === '1')
    console.log('[edge-resolver] active bodies', JSON.stringify(bodies));
  let handles: Array<{ bodyKey: string; subEntityId: number; curve: unknown }> | undefined;
  // 显示拓扑读面/拾取会话可能刚清过粘性缓存；空结果重试（有 active body 时）。
  for (let attempt = 0; attempt < 3; attempt++) {
    handles = await page.evaluate(
      async ({ iModelKey, bodyInfos }) => {
        const hook = (window as unknown as {
          __lubanE2EExamples?: {
            readEdgeHandles(
              key: string,
              bodies: readonly unknown[],
            ): Promise<Array<{ bodyKey: string; subEntityId: number; curve: unknown }> | undefined>;
          };
        }).__lubanE2EExamples;
        if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
        return hook.readEdgeHandles(iModelKey, bodyInfos);
      },
      { iModelKey: ctx.dbKey, bodyInfos: bodies },
    );
    if (handles === undefined)
      throw new BlockedCapabilityError('edge-selector', 'BRep 边枚举命令无法启动');
    if (handles.length > 0 || bodies.length === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (process.env.EDGE_DEBUG === '1')
    console.log(`[edge-resolver] handles=${handles?.length ?? -1} bodies=${bodies.length}`);
  return (handles ?? []) as EdgeHandle[];
}

/**
 * 解析 scenario 中 fillet/chamfer 的边查询为持久边引用。
 * @param feature scenario 特征（必须是 fillet/chamfer）
 * @param scenario 完整 scenario（用于定位草图/上游操作）
 */
export async function resolveScenarioEdges(
  page: Page,
  ctx: BSeedEditorContext,
  scenario: ParityScenario,
  feature: ScenarioFeature,
  accessToken: string,
  bodyScope?: EdgeBodyScope,
): Promise<ResolveEdgesResult> {
  const params = feature.params as { edges?: Array<{ selector?: EdgeSelector }> };
  const entries = params.edges ?? [];
  if (entries.length === 0)
    throw new BlockedCapabilityError('edge-selector', `${feature.name} 无边查询`);
  const missing = entries.filter((entry) => !entry.selector);
  if (missing.length > 0)
    throw new BlockedCapabilityError(
      'edge-selector',
      `${feature.name} 有 ${missing.length}/${entries.length} 条边查询未转换为 selector`,
    );

  const { sketches, ops } = collectMetadata(scenario);
  const handles = await readBodyEdgeHandles(page, ctx, accessToken);
  const refs = new Map<string, FilletEdgeRef>();
  const bodyKeys = new Set<string>();
  for (const entry of entries) {
    // v1.50：源操作谱系限定候选 body（bodyKeyBySource 由 runner 在步骤时点注入）。
    // 只有在 selector 明确给出 operationSourceIds 且至少一个映射到当前 body 时
    // 才收窄；否则保持旧行为（单 body 示例/未映射 selector 不受影响）。
    const allowedBodyKeys = new Set<string>();
    for (const sourceId of entry.selector!.operationSourceIds ?? []) {
      const bodyKey = bodyScope?.bodyKeyBySource?.get(sourceId);
      if (bodyKey !== undefined) allowedBodyKeys.add(bodyKey);
    }
    const candidateHandles = allowedBodyKeys.size > 0
      ? handles.filter((handle) => allowedBodyKeys.has(handle.bodyKey))
      : handles;
    if (allowedBodyKeys.size > 0 && candidateHandles.length === 0)
      throw new BlockedCapabilityError(
        'edge-selector',
        `${feature.name}: 源操作 body ${JSON.stringify(Array.from(allowedBodyKeys))} 无可枚举边`,
      );
    // 单边选择器（CAP_EDGE/SWEPT_EDGE）恒 1 条；面边界选择器（CAP_FACE/
    // SWEPT_FACE）可命中多条——逐条 resolveEdgeRef，失败即整特征阻塞。
    const selected = resolveSelector(entry.selector!, candidateHandles, sketches, ops);
    for (const handle of selected) bodyKeys.add(handle.bodyKey);
    if (process.env.EDGE_DEBUG === '1') {
      console.log(`[edge-resolver] ${feature.name} query=${JSON.stringify(entry.selector)} ` +
        `matches=${JSON.stringify(selected.map((handle) => ({ id: handle.subEntityId, curve: handle.curve })))}`);
    }
    for (const handle of selected) {
      const result = (await msRpc(
        ctx.itwinId,
        ctx.imodelId,
        'resolveEdgeRef',
        [ctx.dbKey, handle.bodyKey, handle.subEntityId],
        accessToken,
      )) as { ok: boolean; ref?: FilletEdgeRef; error?: string };
      if (!result.ok || !result.ref)
        throw new BlockedCapabilityError(
          'edge-selector',
          `${feature.name} resolveEdgeRef 失败: ${result.error ?? 'unknown'}`,
        );
      refs.set(`${result.ref.edge.nodeId}:${result.ref.edge.entityId}`, result.ref);
    }
  }
  if (refs.size === 0)
    throw new BlockedCapabilityError('edge-selector', `${feature.name} 解析结果为空`);
  if (process.env.EDGE_DEBUG === '1') {
    console.log(`[edge-resolver] ${feature.name} refs=${JSON.stringify(Array.from(refs.keys()))}`);
  }
  return {
    refs: Array.from(refs.values()),
    notes: [`edgeResolver=${feature.name}: ${entries.length} queries → ${refs.size} refs`],
    bodyKeys: Array.from(bodyKeys),
  };
}
