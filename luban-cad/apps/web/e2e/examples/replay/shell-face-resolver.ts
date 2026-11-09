/**
 * shell 移除面解析（test-only 回放层，ADR-0008 第一切片）。
 *
 * Onshape shell 的 entities 是面 query。converter 保留每条 query 的语义描述
 * （SWEPT_FACE/CAP_FACE + 草图实体 + 上游 op）。本切片只解析
 * **revolve 的 SWEPT_FACE 端面**：草图实体为与回转轴垂直的直线时，绕轴旋转
 * 得到垂直于轴的平面圆/环面。按“轴线段 + 平面位置 + 外半径”在当前体面集
 * 中唯一匹配，再经 resolveFaceRef 取得持久面引用。
 *
 * 其它 query 形态（CAP_FACE、曲面侧面、跨特征面）零/多匹配一律
 * BlockedCapabilityError，绝不任取一面。
 */
import type { Page } from '@playwright/test';
import type { BodyInfo, LubanTopologyId, SketchPlaneDto } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';
import { BlockedCapabilityError, type ParityScenario, type ScenarioFeature } from './scenario-to-op.js';

export interface ShellFaceResolution {
  refs: LubanTopologyId[];
  notes: string[];
  /** 多体模型显式目标 body（runner 注入 shell op.targetBodyId）。 */
  targetBodyKey?: string;
}

/** runner 在 shell 步骤时点解析的 body 上下文（多体模型必需）。 */
export interface ShellFaceContext {
  bodyKeyBySource?: ReadonlyMap<string, string>;
  allBodyKeys?: readonly string[];
}

interface Vec3 { x: number; y: number; z: number }
interface Vec2 { x: number; y: number }

type FaceLoopCurve =
  | { kind: 'line'; p0: [number, number, number]; p1: [number, number, number] }
  | {
    kind: 'arc';
    center: [number, number, number];
    radius: number;
    normal: [number, number, number];
    start: [number, number, number];
    end: [number, number, number];
    sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };

interface FaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
  loops: FaceLoopCurve[][];
}

export interface ShellQuery {
  kind?: string;
  sketchFeatureId?: string;
  sketchEntityId?: number;
  sketchEntityKind?: string;
  operationSourceIds?: string[];
  isStart?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function v3(x: number, y: number, z: number): Vec3 { return { x, y, z }; }
function sub(a: Vec3, b: Vec3): Vec3 { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
function add(a: Vec3, b: Vec3): Vec3 { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function mul(a: Vec3, k: number): Vec3 { return v3(a.x * k, a.y * k, a.z * k); }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function len(a: Vec3): number { return Math.sqrt(dot(a, a)); }
function unit(a: Vec3): Vec3 | undefined {
  const l = len(a);
  return l < 1e-12 ? undefined : mul(a, 1 / l);
}

/** 草图平面帧（与后端一致：y = normal × xDir）。 */
interface Frame { origin: Vec3; x: Vec3; y: Vec3; normal: Vec3 }

function frameOf(plane: SketchPlaneDto): Frame | undefined {
  const normal = unit(v3(plane.normal.x, plane.normal.y, plane.normal.z));
  if (!normal) return undefined;
  const rawX = v3(plane.xDir.x, plane.xDir.y, plane.xDir.z);
  const x = unit(sub(rawX, mul(normal, dot(rawX, normal))));
  if (!x) return undefined;
  return {
    origin: v3(plane.origin.x, plane.origin.y, plane.origin.z),
    x,
    y: cross(normal, x),
    normal,
  };
}

function world2(frame: Frame, p: Vec2): Vec3 {
  return add(frame.origin, add(mul(frame.x, p.x), mul(frame.y, p.y)));
}

function point2(value: unknown): Vec2 | undefined {
  const record = asRecord(value);
  if (!record || typeof record.x !== 'number' || typeof record.y !== 'number') return undefined;
  return { x: record.x, y: record.y };
}

/** 弧段采样（世界点，绕弧法向按 sweep 旋转）。 */
function sampleArc(curve: Extract<FaceLoopCurve, { kind: 'arc' }>): Vec3[] {
  const center = v3(curve.center[0], curve.center[1], curve.center[2]);
  const axis = unit(v3(curve.normal[0], curve.normal[1], curve.normal[2]));
  const start = v3(curve.start[0], curve.start[1], curve.start[2]);
  if (!axis) return [start, v3(curve.end[0], curve.end[1], curve.end[2])];
  const radial = sub(start, center);
  const points: Vec3[] = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const angle = (curve.sweepRadians * i) / steps;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotated = add(
      add(mul(radial, cos), mul(cross(axis, radial), sin)),
      mul(axis, dot(axis, radial) * (1 - cos)),
    );
    points.push(add(center, rotated));
  }
  return points;
}

function loopPoints(face: FaceHandle): Vec3[] | undefined {
  const points: Vec3[] = [];
  for (const loop of face.loops) {
    for (const curve of loop) {
      if (curve.kind === 'line') {
        points.push(v3(curve.p0[0], curve.p0[1], curve.p0[2]), v3(curve.p1[0], curve.p1[1], curve.p1[2]));
      } else if (curve.kind === 'arc') {
        points.push(...sampleArc(curve));
      } else {
        return undefined;
      }
    }
  }
  return points.length > 0 ? points : undefined;
}

/** 点到轴线的径向距离（去掉沿轴分量）。 */
function radialDistance(point: Vec3, axisOrigin: Vec3, axisDir: Vec3): number {
  const v = sub(point, axisOrigin);
  return len(sub(v, mul(axisDir, dot(v, axisDir))));
}

export interface ExpectedEndFace {
  center: Vec3;
  axisDir: Vec3;
  outerRadius: number;
  innerRadius: number;
}

/** 计算 query 对应的 revolve 端面（直线 ⟂ 轴）。 */
function expectedEndFace(
  query: ShellQuery,
  scenario: ParityScenario,
): ExpectedEndFace | undefined {
  const sketchFeature = scenario.features.find(
    (feature) => feature.type === 'sketch' && feature.sourceFeatureId === query.sketchFeatureId,
  );
  if (!sketchFeature) return undefined;
  const planeRecord = asRecord(sketchFeature.params.plane);
  const plane = planeRecord as unknown as SketchPlaneDto | undefined;
  if (!plane) return undefined;
  const frame = frameOf(plane);
  if (!frame) return undefined;
  const entities = Array.isArray(sketchFeature.params.entities)
    ? sketchFeature.params.entities as Array<Record<string, unknown>>
    : [];
  const entity = entities.find((entry) => Number(entry.id) === query.sketchEntityId);
  if (!entity || entity.kind !== 'line') return undefined;

  const sourceId = query.operationSourceIds?.[0];
  const source = sourceId ? scenario.features.find((feature) => feature.sourceFeatureId === sourceId) : undefined;
  if (!source || source.type !== 'revolve') return undefined;
  const revolveParams = asRecord(source.params) ?? {};
  const axisEntityId = typeof revolveParams.axisSketchEntityId === 'number'
    ? revolveParams.axisSketchEntityId
    : asRecord(revolveParams.axis)?.sketchEntityId;
  if (typeof axisEntityId !== 'number') return undefined;
  const axisEntity = entities.find((entry) => Number(entry.id) === axisEntityId);
  if (!axisEntity || axisEntity.kind !== 'line') return undefined;
  const a1 = point2(axisEntity.p1);
  const a2 = point2(axisEntity.p2);
  const p1 = point2(entity.p1);
  const p2 = point2(entity.p2);
  if (!a1 || !a2 || !p1 || !p2) return undefined;
  const axis2 = { x: a2.x - a1.x, y: a2.y - a1.y };
  const axis2Length = Math.hypot(axis2.x, axis2.y);
  if (!(axis2Length > 1e-9)) return undefined;
  const d2 = { x: axis2.x / axis2Length, y: axis2.y / axis2Length };
  const e2 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const e2Length = Math.hypot(e2.x, e2.y);
  if (!(e2Length > 1e-9)) return undefined;
  // 实体线须与轴垂直（端面直母线）；否则不是平面端面。
  if (Math.abs((d2.x * e2.x + d2.y * e2.y) / e2Length) > 1e-6) return undefined;
  const rel1 = { x: p1.x - a1.x, y: p1.y - a1.y };
  const rel2 = { x: p2.x - a1.x, y: p2.y - a1.y };
  const t1 = rel1.x * d2.x + rel1.y * d2.y;
  const t2 = rel2.x * d2.x + rel2.y * d2.y;
  if (Math.abs(t1 - t2) > 1e-6) return undefined;
  const n2 = { x: -d2.y, y: d2.x };
  const s1 = rel1.x * n2.x + rel1.y * n2.y;
  const s2 = rel2.x * n2.x + rel2.y * n2.y;
  if (s1 * s2 < 0) return undefined; // 跨越轴线：不是单侧圆/环端面
  const outerRadius = Math.max(Math.abs(s1), Math.abs(s2));
  const innerRadius = Math.min(Math.abs(s1), Math.abs(s2));
  if (!(outerRadius > 1e-9)) return undefined;

  const axisWorldOrigin = world2(frame, a1);
  const axisWorldEnd = world2(frame, a2);
  const axisDir = unit(sub(axisWorldEnd, axisWorldOrigin));
  if (!axisDir) return undefined;
  const center = add(axisWorldOrigin, mul(axisDir, t1));
  return { center, axisDir, outerRadius, innerRadius };
}

/**
 * 计算 query 对应的拉伸端盖面（CAP_FACE，circle profile）。
 *
 * 首切片仅支持 **blind/symmetric 拉伸的圆端盖**（我们的语料形态）：圆心由草图圆
 * 的圆心实体得出，端盖沿草图法向偏移 w（start=0 / end=depth；symmetric=±depth/2；
 * oppositeDirection 翻转 end 侧）；轴向=草图法向。through-all 的实际端盖由 body
 * 决定，无法静态定位 → 拒收。矩形/环形端盖待后续切片。
 */
export function expectedCapFace(
  query: ShellQuery,
  scenario: ParityScenario,
): ExpectedEndFace | undefined {
  const sources = (query.operationSourceIds ?? [])
    .map((id) => scenario.features.find((feature) => feature.sourceFeatureId === id && feature.type === 'extrude'))
    .filter((feature): feature is ScenarioFeature => feature !== undefined);
  const extrude = sources[0];
  if (!extrude) return undefined;
  const extrudeParams = asRecord(extrude.params) ?? {};
  const endBound = String(extrudeParams.endBound ?? 'blind').toLowerCase();
  if (endBound === 'throughall' || endBound === 'through_all') return undefined;
  const depth = typeof extrudeParams.depthMm === 'number' && Number.isFinite(extrudeParams.depthMm)
    ? extrudeParams.depthMm
    : undefined;
  if (depth === undefined || !(depth > 0)) return undefined;
  const sketchId = query.sketchFeatureId
    ?? (asRecord(extrudeParams.selection)?.sketchFeatureId as string | undefined);
  const sketchFeature = scenario.features.find(
    (feature) => feature.type === 'sketch' && feature.sourceFeatureId === sketchId,
  );
  if (!sketchFeature) return undefined;
  const plane = asRecord(sketchFeature.params.plane) as unknown as SketchPlaneDto | undefined;
  if (!plane) return undefined;
  const frame = frameOf(plane);
  if (!frame) return undefined;
  const entities = Array.isArray(sketchFeature.params.entities)
    ? sketchFeature.params.entities as Array<Record<string, unknown>>
    : [];
  const entity = entities.find((entry) => Number(entry.id) === query.sketchEntityId);
  if (!entity || entity.kind !== 'circle') return undefined;
  const radius = typeof entity.radius === 'number' ? entity.radius : undefined;
  if (radius === undefined || !(radius > 1e-9)) return undefined;
  const centerId = typeof entity.center === 'number' ? entity.center : undefined;
  const centerEntity = centerId === undefined
    ? undefined
    : entities.find((entry) => Number(entry.id) === centerId && entry.kind === 'point');
  const center2 = point2(centerEntity);
  if (!center2) return undefined;
  const symmetric = extrudeParams.symmetric === true;
  const opposite = extrudeParams.oppositeDirection === true;
  const offset = query.isStart === true
    ? (symmetric ? -depth / 2 : 0)
    : (symmetric ? depth / 2 : (opposite ? -depth : depth));
  const center = add(world2(frame, center2), mul(frame.normal, offset));
  return { center, axisDir: frame.normal, outerRadius: radius, innerRadius: 0 };
}

/** query → 期望移除面（sweptFace=revolve 端面；capFace=拉伸圆端盖）。 */
export function expectedShellFace(
  query: ShellQuery,
  scenario: ParityScenario,
): ExpectedEndFace | undefined {
  if (query.kind === 'capFace') return expectedCapFace(query, scenario);
  if (query.kind === 'sweptFace') return expectedEndFace(query, scenario);
  return undefined;
}

function centerOf(face: FaceHandle): Vec3 {
  return v3(
    (face.range.low[0] + face.range.high[0]) / 2,
    (face.range.low[1] + face.range.high[1]) / 2,
    (face.range.low[2] + face.range.high[2]) / 2,
  );
}

function matchEndFace(
  expected: ExpectedEndFace,
  faces: readonly FaceHandle[],
  roundingAllowanceMm: number,
): { face?: FaceHandle; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const candidates: FaceHandle[] = [];
  for (const face of faces) {
    const label = `${face.bodyKey}:${face.subEntityId}`;
    const normal = unit(v3(face.normal[0], face.normal[1], face.normal[2]));
    if (!normal || Math.abs(dot(normal, expected.axisDir)) < 0.999) continue;
    const center = centerOf(face);
    const planeOffset = dot(sub(center, expected.center), expected.axisDir);
    if (Math.abs(planeOffset) > 0.05) {
      diagnostics.push(`${label} 平面偏移 ${planeOffset.toFixed(3)}`);
      continue;
    }
    if (radialDistance(center, expected.center, expected.axisDir) > 0.05) {
      diagnostics.push(`${label} 面中心不在轴线上`);
      continue;
    }
    const points = loopPoints(face);
    if (!points) {
      diagnostics.push(`${label} 含未识别曲线`);
      continue;
    }
    let maxRadius = 0;
    for (const point of points)
      maxRadius = Math.max(maxRadius, radialDistance(point, expected.center, expected.axisDir));
    const tolerance = Math.max(0.05, expected.outerRadius * 0.005);
    // 前序 fillet/chamfer 会圆掉端面外缘（Gaiter：R7 端面 → R6，倒角 1 mm）。
    // 允许外半径在 [r - 前序最大圆角, r + tol] 内；更小/更大仍拒收。
    const lowRadius = expected.outerRadius - roundingAllowanceMm - tolerance;
    const highRadius = expected.outerRadius + tolerance;
    if (maxRadius < lowRadius || maxRadius > highRadius) {
      diagnostics.push(
        `${label} 外半径 ${maxRadius.toFixed(3)} 不在 [${lowRadius.toFixed(3)}, ${highRadius.toFixed(3)}]`,
      );
      continue;
    }
    candidates.push(face);
  }
  if (candidates.length === 1) return { face: candidates[0]!, diagnostics };
  diagnostics.push(candidates.length === 0 ? '无唯一端面' : `${candidates.length} 个端面满足条件`);
  return { diagnostics };
}

/**
 * shell 目标 body 解析（多体模型）：查询的 operationSourceIds 经 runner 的
 * bodyKeyBySource 映射；恰 1 个 body 时直接用；0/多候选一律阻塞。
 */
export function resolveShellTargetBodyKey(
  label: string,
  queries: readonly ShellQuery[],
  bodyKeys: readonly string[],
  context: ShellFaceContext,
): string {
  if (bodyKeys.length === 0)
    throw new BlockedCapabilityError('shell-faces', `${label} 无 active authored body`);
  if (bodyKeys.length === 1) return bodyKeys[0]!;
  const sourceIds = Array.from(new Set(queries.flatMap((query) => query.operationSourceIds ?? [])))
    .filter((id) => context.bodyKeyBySource?.has(id));
  const keys = Array.from(new Set(sourceIds
    .map((id) => context.bodyKeyBySource!.get(id))
    .filter((key): key is string => key !== undefined)));
  if (keys.length !== 1)
    throw new BlockedCapabilityError(
      'shell-faces',
      `${label} 多体模型无法唯一解析目标 body（候选 ${keys.length}）`,
    );
  return keys[0]!;
}

/** 解析 shell 移除面（切片 2：revolve SWEPT_FACE 端面 / 拉伸 CAP_FACE 圆端盖）。 */
export async function resolveScenarioShellFaces(
  page: Page,
  ctx: BSeedEditorContext,
  scenario: ParityScenario,
  feature: ScenarioFeature,
  accessToken: string,
  context: ShellFaceContext = {},
): Promise<ShellFaceResolution> {
  const params = asRecord(feature.params) ?? {};
  const selection = asRecord(params.selection);
  const queries = Array.isArray(selection?.queries) ? selection.queries as ShellQuery[] : [];
  if (queries.length === 0)
    throw new BlockedCapabilityError('shell-faces', `${feature.name} 缺面查询`);
  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body: BodyInfo) => body.active !== false && body.authored !== false,
  );
  // 多体模型：以查询的 operationSourceIds（剔除草图引用）解析唯一目标 body；
  // 无 body 映射上下文或命中 0/多 body 一律阻塞，绝不任取一体。
  const targetBodyKey = resolveShellTargetBodyKey(
    feature.name,
    queries,
    bodies.map((body: BodyInfo) => body.bodyKey),
    context,
  );
  let faces: FaceHandle[] | undefined;
  try {
    faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, allBodies: readonly unknown[]): Promise<FaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos) as Promise<FaceHandle[] | undefined>;
    }, { key: ctx.dbKey, bodyInfos: bodies });
  } catch (error) {
    throw new BlockedCapabilityError(
      'shell-faces',
      `${feature.name} 面枚举失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!faces)
    throw new BlockedCapabilityError('shell-faces', `${feature.name} SolidModeling 命令槽被占用，未读到面`);
  // 多体模型：面集裁到目标 body（readFaceHandles 返回全 body 面）。
  faces = faces.filter((face) => face.bodyKey === targetBodyKey);
  if (faces.length === 0)
    throw new BlockedCapabilityError('shell-faces', `${feature.name} 目标 body ${targetBodyKey} 无面`);

  const shellIndex = scenario.features.indexOf(feature);
  const roundingAllowanceMm = scenario.features
    .slice(0, shellIndex < 0 ? scenario.features.length : shellIndex)
    .filter((entry) => entry.type === 'fillet' || entry.type === 'chamfer')
    .map((entry) => {
      const entryParams = asRecord(entry.params) ?? {};
      const radius = entryParams.radiusMm ?? entryParams.widthMm ?? entryParams.width1Mm;
      return typeof radius === 'number' && Number.isFinite(radius) ? radius : 0;
    })
    .reduce((max, value) => Math.max(max, value), 0);
  const refs: LubanTopologyId[] = [];
  const seen = new Set<number>();
  const notes: string[] = [];
  for (const query of queries) {
    if (query.kind !== 'sweptFace' && query.kind !== 'capFace')
      throw new BlockedCapabilityError('shell-faces', `${feature.name} 面 query ${query.kind ?? 'unknown'} 未支持`);
    const expected = expectedShellFace(query, scenario);
    if (!expected)
      throw new BlockedCapabilityError(
        'shell-faces',
        `${feature.name} 面 query（${query.kind}，sketch=${query.sketchFeatureId}#${query.sketchEntityId}）`
        + '不可静态定位（sweptFace 需 revolve 垂直端面；capFace 需 blind/symmetric 拉伸圆端盖）',
      );
    if (process.env.EXAMPLE_DEBUG_SHELL === '1') {
      console.log(`[shell-faces] expected center=${JSON.stringify(expected.center)} dir=${JSON.stringify(expected.axisDir)} r=${expected.outerRadius.toFixed(3)}`);
      console.log(`[shell-faces] faces=${JSON.stringify(faces.map((face) => ({
        id: face.subEntityId,
        normal: face.normal.map((n) => Number(n.toFixed(3))),
        center: Object.values(centerOf(face)).map((n) => Number(n.toFixed(3))),
        range: face.range,
        loops: face.loops.length,
      })))}`);
    }
    const matched = matchEndFace(expected, faces, roundingAllowanceMm);
    if (process.env.EXAMPLE_DEBUG_SHELL === '1') {
      console.log(`[shell-faces] diag=${JSON.stringify(matched.diagnostics)} match=${matched.face?.subEntityId ?? null}`);
    }
    if (!matched.face)
      throw new BlockedCapabilityError(
        'shell-faces',
        `${feature.name} 端面匹配失败：${matched.diagnostics.slice(-3).join('；')}`,
      );
    const face = matched.face;
    if (seen.has(face.subEntityId)) continue;
    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, face.bodyKey, face.subEntityId],
      accessToken,
    )) as { ok: boolean; ref?: LubanTopologyId; error?: string };
    if (!resolved.ok || !resolved.ref
      || !Number.isInteger(resolved.ref.nodeId) || !Number.isInteger(resolved.ref.entityId)) {
      throw new BlockedCapabilityError(
        'shell-faces',
        `${feature.name} resolveFaceRef 失败：${resolved.error ?? '无持久面引用'}`,
      );
    }
    seen.add(face.subEntityId);
    refs.push(resolved.ref);
    notes.push(`shell face=${face.bodyKey}:${face.subEntityId} r=${expected.outerRadius.toFixed(3)}`);
  }
  if (refs.length === 0)
    throw new BlockedCapabilityError('shell-faces', `${feature.name} 未解析出任何移除面`);
  return { refs, notes, ...(targetBodyKey !== undefined ? { targetBodyKey } : {}) };
}
