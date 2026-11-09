/**
 * 回滚快照边曲线 oracle（test-only）：Onshape 特征执行前（rollbackBarIndex）
 * 的面/边选择 → 产品持久边引用。
 *
 * 数据形态：私有数据仓 `manifest/face-oracle-edges.json` 由
 * `tools/collect-face-oracle-edges.mjs` 生成；每条 oracle 曲线已归一化为 mm
 * （LINE p0/p1；CIRCLE/ARC center/radius/normal/start/end/sweepRadians）。
 *
 * 匹配纪律：
 * - 每条 oracle 曲线必须命中**恰好一条**产品 `EdgeHandle.curve`；0 条或多条一律
 *   `BlockedCapabilityError('edge-oracle', ...)`，不猜；
 * - 产品句柄按 `bodyKey:subEntityId` 去重；同一产品边被两条 oracle 曲线命中同样
 *   视为歧义（oracle 侧重复/产品侧共线）；
 * - fillet/chamfer 必须是单 body：多 body 枚举必须有唯一显式 `bodyScope`，否则
 *   阻塞（与 generic resolver 的跨 body 纪律一致）。
 *
 * 公共源码不内嵌任何私有 id / 绝对路径；私有 manifest 由调用方在运行时从
 * `ONSHAPE_PARITY_DATA` 读取后传入。
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { msRpc, type BSeedEditorContext } from '../../helpers.js';
import { readBodyEdgeHandles, type EdgeHandle, type ResolveEdgesResult } from './edge-resolver.js';
import { BlockedCapabilityError, type ScenarioFeature } from './scenario-to-op.js';

/** 默认几何容差（mm）。端点/圆心/半径均按欧氏距离；线段长度按 2×该容差。 */
export const ORACLE_TOLERANCE_MM = 0.05;
/** ARC sweep 一致性容差（rad，约 0.057°）；端点匹配为主判据。 */
export const ORACLE_SWEEP_TOLERANCE_RAD = 1e-3;
const NORMAL_DOT_TOLERANCE = 1e-6;

export type Vec3 = [number, number, number];

export interface OracleLineEdge {
  kind: 'line';
  p0: Vec3;
  p1: Vec3;
  lengthMm?: number;
}

export interface OracleCircleEdge {
  kind: 'circle';
  center: Vec3;
  radius: number;
  normal?: Vec3;
  lengthMm?: number;
}

export interface OracleArcEdge {
  kind: 'arc';
  center: Vec3;
  radius: number;
  normal?: Vec3;
  start: Vec3;
  end: Vec3;
  sweepRadians?: number;
  lengthMm?: number;
}

export type OracleEdgeCurve = OracleLineEdge | OracleCircleEdge | OracleArcEdge;

/**
 * 私有 manifest 的单特征条目（公共侧只依赖通用字段；docId/psName/edgeIds 等
 * 仅作审计透传，匹配算法不使用）。`status:"blocked"` 表示私有采集侧无法完整
 * 解析该特征的选择，调用方必须 fail closed（不得静默跳过）。
 */
export interface RollbackEdgeOracle {
  docId?: string;
  elementId?: string;
  psName?: string;
  featureId?: string;
  featureName: string;
  featureType?: string;
  rollbackBarIndex?: number;
  status?: 'ready' | 'blocked';
  blockedReason?: string;
  selectedFaceIds?: readonly string[];
  matchedEdgeIds?: readonly string[];
  bodyIds?: readonly string[];
  bodyEdgeCount?: number;
  edgeCount?: number;
  coversAllBodyEdges?: boolean;
  unselectedBodyEdgeIds?: readonly string[];
  edges: readonly OracleEdgeCurve[];
}

export interface RollbackEdgeOracleManifest {
  schemaVersion: number;
  generatedAt?: string;
  units?: { length?: string };
  summary?: Record<string, number>;
  features: RollbackEdgeOracle[];
}

export interface EdgeOracleMatchOptions {
  /** 几何容差（mm），缺省 0.05。 */
  toleranceMm?: number;
  /** CIRCLE/ARC 法向一致性校验（缺省开启；仅当两侧都给出法向时生效）。 */
  checkNormals?: boolean;
}

export interface OracleEdgeMatch {
  oracleIndex: number;
  handle: EdgeHandle;
}

export interface OracleMatchResult {
  matches: OracleEdgeMatch[];
  /** 去重后的命中华产品边（按首次命中顺序）。 */
  handles: EdgeHandle[];
  notes: string[];
}

/** 边枚举的 body 谱系（与 `resolveScenarioEdges` 的 `EdgeBodyScope` 同形）。 */
export interface OracleBodyScope {
  bodyKeyBySource?: ReadonlyMap<string, string>;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
const near = (a: Vec3, b: Vec3, tol: number): boolean => distance(a, b) <= tol;

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function unit(vector: Vec3): Vec3 | undefined {
  const magnitude = length(vector);
  if (!(magnitude > 0)) return undefined;
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function normalsConsistent(a: Vec3 | undefined, b: Vec3 | undefined): boolean {
  if (!a || !b) return true;
  const ua = unit(a);
  const ub = unit(b);
  if (!ua || !ub) return false;
  // 产品法向符号可能随 coedge/面朝向翻转；平行或反平行都接受。
  return Math.abs(dot(ua, ub)) >= 1 - NORMAL_DOT_TOLERANCE;
}

function lineLength(p0: Vec3, p1: Vec3): number {
  return distance(p0, p1);
}

/** 产品侧整圆判定：edge-resolver 把整圆也编码为 kind:'arc' + start≈end。 */
function isFullCircle(handle: EdgeHandle, tol: number): boolean {
  const curve = handle.curve;
  if (curve.kind !== 'arc') return false;
  if (!curve.start || !curve.end) return false;
  if (curve.sweepRadians !== undefined)
    return Math.abs(Math.abs(curve.sweepRadians) - 2 * Math.PI) <= ORACLE_SWEEP_TOLERANCE_RAD;
  return near(curve.start, curve.end, tol);
}

function isArcSweep(handle: EdgeHandle): number | undefined {
  const sweep = handle.curve.sweepRadians;
  return sweep !== undefined && Number.isFinite(sweep) ? Math.abs(sweep) : undefined;
}

function oracleCurveMatchesHandle(
  oracle: OracleEdgeCurve,
  handle: EdgeHandle,
  toleranceMm: number,
  checkNormals: boolean,
): boolean {
  const curve = handle.curve;
  if (oracle.kind === 'line') {
    if (curve.kind !== 'line' || !curve.p0 || !curve.p1) return false;
    const forward = near(curve.p0, oracle.p0, toleranceMm) && near(curve.p1, oracle.p1, toleranceMm);
    const reversed = near(curve.p0, oracle.p1, toleranceMm) && near(curve.p1, oracle.p0, toleranceMm);
    if (!forward && !reversed) return false;
    // 端点匹配已足以判定；长度只作额外防呆（2×容差覆盖两端点各自的最大漂移）。
    if (oracle.lengthMm !== undefined)
      return Math.abs(lineLength(curve.p0, curve.p1) - oracle.lengthMm) <= 2 * toleranceMm;
    return true;
  }
  if (curve.kind !== 'arc' || !curve.center || curve.radius === undefined) return false;
  if (curve.radius <= 0) return false;
  if (!near(curve.center, oracle.center, toleranceMm)) return false;
  if (Math.abs(curve.radius - oracle.radius) > toleranceMm) return false;
  if (checkNormals && !normalsConsistent(curve.normal, oracle.normal)) return false;
  if (oracle.kind === 'circle') return isFullCircle(handle, toleranceMm);
  // oracle.kind === 'arc'
  if (isFullCircle(handle, toleranceMm)) return false;
  if (!curve.start || !curve.end) return false;
  const forward = near(curve.start, oracle.start, toleranceMm) && near(curve.end, oracle.end, toleranceMm);
  const reversed = near(curve.start, oracle.end, toleranceMm) && near(curve.end, oracle.start, toleranceMm);
  if (!forward && !reversed) return false;
  if (oracle.sweepRadians !== undefined) {
    const sweep = isArcSweep(handle);
    if (sweep !== undefined && Math.abs(sweep - Math.abs(oracle.sweepRadians)) > ORACLE_SWEEP_TOLERANCE_RAD)
      return false;
  }
  return true;
}

function handleKey(handle: EdgeHandle): string {
  return `${handle.bodyKey}:${handle.subEntityId}`;
}

/** 0 匹配诊断：产品边 kind 分布（如 line=16, other:curvePrimitive=4）。 */
function handleKindSummary(handles: readonly EdgeHandle[]): string {
  const counts = new Map<string, number>();
  for (const handle of handles) {
    const key = handle.curve.kind === 'other'
      ? `other:${handle.curve.geometryType}`
      : handle.curve.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return JSON.stringify(Object.fromEntries(counts));
}

function describeCurve(curve: OracleEdgeCurve): string {
  if (curve.kind === 'line')
    return `line ${JSON.stringify(curve.p0)}→${JSON.stringify(curve.p1)}`;
  if (curve.kind === 'circle')
    return `circle c=${JSON.stringify(curve.center)} r=${curve.radius}`;
  return `arc c=${JSON.stringify(curve.center)} r=${curve.radius} ` +
    `${JSON.stringify(curve.start)}→${JSON.stringify(curve.end)}`;
}

/**
 * 逐条 oracle 曲线匹配产品边（纯函数）。0/多匹配、重复 oracle 曲线命中同一
 * 产品边、非法容差全部抛 `BlockedCapabilityError('edge-oracle', ...)`。
 */
export function matchOracleToProductEdges(
  oracle: Pick<RollbackEdgeOracle, 'edges'>,
  handles: readonly EdgeHandle[],
  options: EdgeOracleMatchOptions = {},
): OracleMatchResult {
  const curves = oracle.edges;
  if (!Array.isArray(curves) || curves.length === 0)
    throw new BlockedCapabilityError('edge-oracle', 'oracle 不含任何边曲线');
  const toleranceMm = options.toleranceMm ?? ORACLE_TOLERANCE_MM;
  if (!(toleranceMm > 0) || !Number.isFinite(toleranceMm))
    throw new BlockedCapabilityError('edge-oracle', `非法容差 ${String(options.toleranceMm)}`);
  const checkNormals = options.checkNormals !== false;
  const matches: OracleEdgeMatch[] = [];
  const used = new Map<string, number>();
  for (let index = 0; index < curves.length; index++) {
    const curve = curves[index]!;
    const candidates = handles.filter((handle) =>
      oracleCurveMatchesHandle(curve, handle, toleranceMm, checkNormals));
    if (candidates.length === 0) {
      throw new BlockedCapabilityError(
        'edge-oracle',
        `oracle edge[${index}]（${describeCurve(curve)}）匹配 0 条产品边` +
        `（tol=${toleranceMm}mm；产品边 kind=${handleKindSummary(handles)}）`,
      );
    }
    if (candidates.length > 1) {
      throw new BlockedCapabilityError(
        'edge-oracle',
        `oracle edge[${index}]（${describeCurve(curve)}）匹配 ${candidates.length} 条产品边` +
        `（${candidates.map(handleKey).join(', ')}），不猜`,
      );
    }
    const handle = candidates[0]!;
    const key = handleKey(handle);
    const previous = used.get(key);
    if (previous !== undefined) {
      throw new BlockedCapabilityError(
        'edge-oracle',
        `oracle edge[${index}] 与 edge[${previous}] 命中同一产品边 ${key}` +
        '（oracle 曲线重复或产品侧几何重合）',
      );
    }
    used.set(key, index);
    matches.push({ oracleIndex: index, handle });
  }
  const uniqueHandles = new Map(matches.map((match) => [handleKey(match.handle), match.handle]));
  return {
    matches,
    handles: [...uniqueHandles.values()],
    notes: [`edge-oracle match: ${curves.length} curves → ${uniqueHandles.size} product edges（tol=${toleranceMm}mm）`],
  };
}

/**
 * 多 body 边枚举收敛：单 body 直接使用；多 body 必须有唯一显式 bodyScope，
 * 否则阻塞（不按“命中都在同一 body”猜）。
 */
export function scopeOracleHandles(
  handles: readonly EdgeHandle[],
  bodyScope?: OracleBodyScope,
): { handles: EdgeHandle[]; bodyKeys: string[]; note?: string } {
  const bodyKeys = [...new Set(handles.map((handle) => handle.bodyKey))];
  if (bodyKeys.length <= 1) return { handles: [...handles], bodyKeys };
  const explicit = new Set<string>();
  bodyScope?.bodyKeyBySource?.forEach((bodyKey) => {
    if (bodyKeys.includes(bodyKey)) explicit.add(bodyKey);
  });
  if (explicit.size !== 1) {
    throw new BlockedCapabilityError(
      'edge-oracle',
      `边枚举跨 ${bodyKeys.length} 个 body，且无唯一显式 bodyScope` +
      `（显式=${explicit.size}），拒绝猜测目标体`,
    );
  }
  const [bodyKey] = [...explicit];
  return {
    handles: handles.filter((handle) => handle.bodyKey === bodyKey),
    bodyKeys: [bodyKey!],
    note: `edge-oracle bodyScope=${bodyKey}（多 body 枚举收敛）`,
  };
}

const FINITE_STRING = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parseCurve(value: unknown, featureIndex: number): OracleEdgeCurve {
  const label = `features[${featureIndex}].edges`;
  if (!value || typeof value !== 'object')
    throw new Error(`${label} 含非对象曲线：${JSON.stringify(value)}`);
  const curve = value as Record<string, unknown>;
  const optionalNormal = curve.normal === undefined ? undefined : (isVec3(curve.normal) ? curve.normal : null);
  if (optionalNormal === null)
    throw new Error(`${label} 法向非法：${JSON.stringify(curve.normal)}`);
  const optionalLength = curve.lengthMm === undefined
    ? undefined
    : (typeof curve.lengthMm === 'number' && Number.isFinite(curve.lengthMm) ? curve.lengthMm : null);
  if (optionalLength === null)
    throw new Error(`${label} lengthMm 非法：${JSON.stringify(curve.lengthMm)}`);
  if (curve.kind === 'line') {
    if (!isVec3(curve.p0) || !isVec3(curve.p1))
      throw new Error(`${label} LINE 端点非法：${JSON.stringify(curve)}`);
    return {
      kind: 'line',
      p0: curve.p0,
      p1: curve.p1,
      ...(optionalLength !== undefined ? { lengthMm: optionalLength } : {}),
    };
  }
  if (curve.kind === 'circle' || curve.kind === 'arc') {
    if (!isVec3(curve.center) || typeof curve.radius !== 'number'
      || !Number.isFinite(curve.radius) || curve.radius <= 0)
      throw new Error(`${label} ${curve.kind} 圆心/半径非法：${JSON.stringify(curve)}`);
    if (curve.kind === 'circle') {
      return {
        kind: 'circle',
        center: curve.center,
        radius: curve.radius,
        ...(optionalNormal ? { normal: optionalNormal } : {}),
        ...(optionalLength !== undefined ? { lengthMm: optionalLength } : {}),
      };
    }
    if (!isVec3(curve.start) || !isVec3(curve.end))
      throw new Error(`${label} ARC 起终点非法：${JSON.stringify(curve)}`);
    const sweep = curve.sweepRadians === undefined
      ? undefined
      : (typeof curve.sweepRadians === 'number' && Number.isFinite(curve.sweepRadians)
        ? curve.sweepRadians
        : null);
    if (sweep === null)
      throw new Error(`${label} ARC sweepRadians 非法：${JSON.stringify(curve.sweepRadians)}`);
    return {
      kind: 'arc',
      center: curve.center,
      radius: curve.radius,
      ...(optionalNormal ? { normal: optionalNormal } : {}),
      start: curve.start,
      end: curve.end,
      ...(sweep !== undefined ? { sweepRadians: sweep } : {}),
      ...(optionalLength !== undefined ? { lengthMm: optionalLength } : {}),
    };
  }
  throw new Error(`${label} 不支持的曲线 kind：${String(curve.kind)}`);
}

function parseFeature(value: unknown, featureIndex: number): RollbackEdgeOracle {
  if (!value || typeof value !== 'object')
    throw new Error(`features[${featureIndex}] 必须是对象`);
  const feature = value as Record<string, unknown>;
  if (!FINITE_STRING(feature.featureName))
    throw new Error(`features[${featureIndex}].featureName 缺失`);
  const status = feature.status === 'blocked' ? 'blocked' : feature.status === 'ready' || feature.status === undefined
    ? 'ready'
    : undefined;
  if (status === undefined)
    throw new Error(`features[${featureIndex}].status 非法：${String(feature.status)}`);
  const rawEdges = feature.edges === undefined ? [] : feature.edges;
  if (!Array.isArray(rawEdges))
    throw new Error(`features[${featureIndex}].edges 必须是数组`);
  const edges = rawEdges.map((edge, index) => parseCurve(edge, featureIndex));
  if (status === 'ready' && edges.length === 0)
    throw new Error(`features[${featureIndex}]（${feature.featureName}）ready 但 edges 为空`);
  const stringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter(FINITE_STRING) : undefined;
  const numberOrUndefined = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    ...(FINITE_STRING(feature.docId) ? { docId: feature.docId } : {}),
    ...(FINITE_STRING(feature.elementId) ? { elementId: feature.elementId } : {}),
    ...(FINITE_STRING(feature.psName) ? { psName: feature.psName } : {}),
    ...(FINITE_STRING(feature.featureId) ? { featureId: feature.featureId } : {}),
    featureName: feature.featureName,
    ...(FINITE_STRING(feature.featureType) ? { featureType: feature.featureType } : {}),
    ...(numberOrUndefined(feature.rollbackBarIndex) !== undefined
      ? { rollbackBarIndex: numberOrUndefined(feature.rollbackBarIndex)! } : {}),
    status,
    ...(FINITE_STRING(feature.blockedReason) ? { blockedReason: feature.blockedReason } : {}),
    ...(stringArray(feature.selectedFaceIds) ? { selectedFaceIds: stringArray(feature.selectedFaceIds)! } : {}),
    ...(stringArray(feature.matchedEdgeIds) ? { matchedEdgeIds: stringArray(feature.matchedEdgeIds)! } : {}),
    ...(stringArray(feature.bodyIds) ? { bodyIds: stringArray(feature.bodyIds)! } : {}),
    ...(numberOrUndefined(feature.bodyEdgeCount) !== undefined
      ? { bodyEdgeCount: numberOrUndefined(feature.bodyEdgeCount)! } : {}),
    ...(numberOrUndefined(feature.edgeCount) !== undefined
      ? { edgeCount: numberOrUndefined(feature.edgeCount)! } : {}),
    ...(typeof feature.coversAllBodyEdges === 'boolean'
      ? { coversAllBodyEdges: feature.coversAllBodyEdges } : {}),
    ...(stringArray(feature.unselectedBodyEdgeIds)
      ? { unselectedBodyEdgeIds: stringArray(feature.unselectedBodyEdgeIds)! } : {}),
    edges,
  };
}

/** 严格解析私有 manifest（结构/曲线非法即抛错，不透传坏数据）。 */
export function parseRollbackEdgeOracleManifest(value: unknown): RollbackEdgeOracleManifest {
  if (!value || typeof value !== 'object')
    throw new Error('face-oracle manifest 必须是 JSON 对象');
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1)
    throw new Error(`face-oracle manifest schemaVersion 必须为 1（实际 ${String(manifest.schemaVersion)}）`);
  if (!Array.isArray(manifest.features))
    throw new Error('face-oracle manifest.features 必须是数组');
  const features = manifest.features.map((feature, index) => parseFeature(feature, index));
  return {
    schemaVersion: 1,
    ...(FINITE_STRING(manifest.generatedAt) ? { generatedAt: manifest.generatedAt } : {}),
    ...(manifest.units && typeof manifest.units === 'object'
      ? { units: manifest.units as RollbackEdgeOracleManifest['units'] } : {}),
    ...(manifest.summary && typeof manifest.summary === 'object'
      ? { summary: manifest.summary as Record<string, number> } : {}),
    features,
  };
}

/** 读取并严格解析私有 manifest（路径由调用方从数据根解析；公共源码不内嵌路径）。 */
export function loadRollbackEdgeOracleManifest(file: string): RollbackEdgeOracleManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取 face-oracle manifest ${file}: ${(error as Error).message}`);
  }
  return parseRollbackEdgeOracleManifest(raw);
}

/**
 * 按 Part Studio 过滤并建 runner 索引（featureId + featureName 双键；id 优先）。
 * `status:"blocked"` 条目保留在 map 中，让调用方在步骤时点得到明确阻塞原因，
 * 而不是静默回退 generic resolver。
 */
export function edgeOracleMapForPartStudio(
  manifest: RollbackEdgeOracleManifest,
  filter: { docId?: string; elementId?: string; psName?: string } = {},
): Map<string, RollbackEdgeOracle> {
  const map = new Map<string, RollbackEdgeOracle>();
  for (const feature of manifest.features) {
    if (filter.docId !== undefined && feature.docId !== filter.docId) continue;
    if (filter.elementId !== undefined && feature.elementId !== filter.elementId) continue;
    if (filter.psName !== undefined && feature.psName !== filter.psName) continue;
    if (feature.featureId !== undefined) map.set(feature.featureId, feature);
    if (!map.has(feature.featureName)) map.set(feature.featureName, feature);
  }
  return map;
}

/**
 * fillet/chamfer 的 oracle 解析：枚举当前 body 全部边 → 几何唯一匹配 →
 * `resolveEdgeRef` → `FilletEdgeRef`。单 body 或唯一显式 bodyScope 才继续。
 */
export async function resolveOracleEdges(
  page: Page,
  ctx: BSeedEditorContext,
  feature: ScenarioFeature,
  oracle: RollbackEdgeOracle,
  accessToken: string,
  bodyScope?: OracleBodyScope,
): Promise<ResolveEdgesResult> {
  if (oracle.status === 'blocked') {
    throw new BlockedCapabilityError(
      'edge-oracle',
      `${feature.name}: oracle 采集不完整（${oracle.blockedReason ?? 'blocked'}），拒绝回退猜测`,
    );
  }
  if (oracle.edges.length === 0)
    throw new BlockedCapabilityError('edge-oracle', `${feature.name}: oracle 不含边曲线`);
  const handles = await readBodyEdgeHandles(page, ctx, accessToken);
  if (handles.length === 0)
    throw new BlockedCapabilityError('edge-oracle', `${feature.name}: 当前 body 无可枚举边`);
  if (process.env.EDGE_DEBUG === '1') {
    console.log(
      `[edge-oracle] ${feature.name} handles=` +
      JSON.stringify(handles.map((handle) => ({
        bodyKey: handle.bodyKey,
        id: handle.subEntityId,
        curve: handle.curve,
      }))),
    );
  }
  const scoped = scopeOracleHandles(handles, bodyScope);
  const match = matchOracleToProductEdges(oracle, scoped.handles);
  const matchedBodyKeys = [...new Set(match.handles.map((handle) => handle.bodyKey))];
  if (matchedBodyKeys.length !== 1) {
    throw new BlockedCapabilityError(
      'edge-oracle',
      `${feature.name}: oracle 命中 ${matchedBodyKeys.length} 个 body，拒绝跨 body 圆角/倒角`,
    );
  }
  const refs = new Map<string, FilletEdgeRef>();
  for (const handle of match.handles) {
    const result = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveEdgeRef',
      [ctx.dbKey, handle.bodyKey, handle.subEntityId],
      accessToken,
    )) as { ok: boolean; ref?: FilletEdgeRef; error?: string };
    if (!result.ok || !result.ref) {
      throw new BlockedCapabilityError(
        'edge-oracle',
        `${feature.name} resolveEdgeRef 失败: ${result.error ?? 'unknown'}`,
      );
    }
    refs.set(`${result.ref.edge.nodeId}:${result.ref.edge.entityId}`, result.ref);
  }
  if (refs.size === 0)
    throw new BlockedCapabilityError('edge-oracle', `${feature.name} 解析结果为空`);
  const coverage = oracle.bodyEdgeCount !== undefined
    ? `；oracle 覆盖 ${match.handles.length}/${oracle.bodyEdgeCount} body 边`
    : '';
  return {
    refs: [...refs.values()],
    bodyKeys: matchedBodyKeys,
    notes: [
      `edgeOracle=${feature.name}: ${oracle.edges.length} curves → ${refs.size} refs` +
      `（rollbackBarIndex=${oracle.rollbackBarIndex ?? '?'}${coverage}）`,
      ...match.notes,
      ...(scoped.note ? [scoped.note] : []),
    ],
  };
}
