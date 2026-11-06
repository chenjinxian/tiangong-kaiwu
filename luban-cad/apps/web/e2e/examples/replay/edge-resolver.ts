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

interface EdgeHandle {
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
}

interface Frame {
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

/** 相邻实体消歧：共享端点唯一时只用该点，否则回退全部端点（随后会以多匹配失败）。 */
function sweptCandidatePoints(
  entity: Record<string, unknown>,
  contextEntities: readonly Record<string, unknown>[],
): Array<[number, number]> {
  const primary = sketchEntityEndpoints(entity);
  if (contextEntities.length === 0) return primary;
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

function resolveSelector(
  selector: EdgeSelector,
  handles: readonly EdgeHandle[],
  sketches: ReadonlyMap<string, SketchMeta>,
  ops: readonly OpMeta[],
): EdgeHandle {
  if (selector.kind !== 'capEdge' && selector.kind !== 'sweptEdge')
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
    matches = handles.filter((edge) => matchCapEdge(edge, entity, frame, capW));
  } else if (source.kind === 'extrude') {
    const distance = source.depthMm ?? 0;
    const wLow = source.symmetric === true ? -distance / 2 : 0;
    const wHigh = source.symmetric === true ? distance / 2 : distance;
    matches = handles.filter((edge) => matchSweptExtrude(edge, sweptPoints, frame, wLow, wHigh));
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

  const unique = new Map(matches.map((edge) => [`${edge.bodyKey}:${edge.subEntityId}`, edge]));
  if (unique.size !== 1) {
    if (process.env.EDGE_DEBUG === '1') {
      console.log('[edge-resolver] selector', JSON.stringify(selector), 'matches', unique.size);
      console.log('[edge-resolver] edges', JSON.stringify(handles, null, 2));
      console.log('[edge-resolver] sketch entity', JSON.stringify(entity), 'frame', JSON.stringify(frame), 'source', JSON.stringify(source));
    }
    throw new BlockedCapabilityError(
      'edge-selector',
      `${selector.kind} 匹配不唯一: sketch=${selector.sketchFeatureId}#${selector.sketchEntityId} ` +
      `source=${source.sourceFeatureId} matches=${unique.size}`,
    );
  }
  return Array.from(unique.values())[0]!;
}

async function readHandles(
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
  const handles = await readHandles(page, ctx, accessToken);
  const refs = new Map<string, FilletEdgeRef>();
  for (const entry of entries) {
    const handle = resolveSelector(entry.selector!, handles, sketches, ops);
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
  if (refs.size === 0)
    throw new BlockedCapabilityError('edge-selector', `${feature.name} 解析结果为空`);
  return {
    refs: Array.from(refs.values()),
    notes: [`edgeResolver=${feature.name}: ${entries.length} queries → ${refs.size} refs`],
  };
}
