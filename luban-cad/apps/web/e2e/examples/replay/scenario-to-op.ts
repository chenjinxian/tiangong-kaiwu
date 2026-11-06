/**
 * Parity scenario → FeatureOp translator（test-only）。
 *
 * 只做结构映射：不解析 geometry、不猜 selector、不直接写 iModel。
 * 面域/body/边 selector 由 runner 的 resolver 处理；本文件遇到无法安全
 * 映射的步骤抛 BlockedCapabilityError，绝不静默使用 region 0。
 */
import type {
  BodyRef,
  FeatureBooleanOperation,
  FeatureOp,
  FilletEdgeRef,
  HoleParams,
  SketchConstraintDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';

export interface ScenarioFeature {
  type: string;
  name: string;
  sourceFeatureId?: string;
  sourceType?: string;
  params: Record<string, unknown>;
}

export interface ParityScenario {
  schemaVersion: number;
  id: string;
  docId?: string;
  elementId?: string;
  owner?: string;
  name?: string;
  units?: 'mm' | 'm';
  features: ScenarioFeature[];
  expected?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export class BlockedCapabilityError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'BlockedCapabilityError';
    this.code = code;
  }
}

export interface TranslateContext {
  /** Onshape sketch sourceFeatureId → 本地 sketch featureId（runner 顺序 apply 后维护）。 */
  sketchIdBySource?: ReadonlyMap<string, string>;
  /** 最近一次成功插入的 sketch featureId（Onshape 特征未显式引用 sketch 时使用）。 */
  latestSketchId?: string;
  /** 已由 runner 的边解析器换成持久边引用的特征（键=scenario feature name）。 */
  edgeRefsByFeatureName?: ReadonlyMap<string, FilletEdgeRef[]>;
  /** booleanBodies 步骤由 runner 在当前时点读 getBodies 注入（源特征 id → bodyKey）。 */
  bodyKeyBySource?: ReadonlyMap<string, string>;
  /** 当前 active authored body 集（union 无显式 target 时选首个体）。 */
  allBodyKeys?: readonly string[];
  /** Onshape 任意特征 sourceFeatureId → 本地 featureId（cPlane/sketch 依赖等）。 */
  featureIdBySource?: ReadonlyMap<string, string>;
  /** 已应用草图的平面快照（Onshape 源 id → plane），孔方向判定用。 */
  sketchPlaneBySource?: ReadonlyMap<string, SketchPlaneDto>;
  /** 当前时点 body 质心（bodyKey → 世界质心），孔方向判定用。 */
  bodyCentroidByKey?: ReadonlyMap<string, { x: number; y: number; z: number }>;
}

export interface TranslatedStep {
  scenario: ScenarioFeature;
  op: FeatureOp;
  /** 该步依赖的 selector/近似语义；runner 必须记录到 manifest。 */
  notes: string[];
  approximate: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanParam(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeOperation(value: unknown): FeatureBooleanOperation | undefined {
  switch (String(value ?? '').toLowerCase()) {
    case 'new': return 'new';
    case 'add': case 'unite': return 'add';
    case 'remove': case 'subtract': return 'remove';
    case 'intersect': return 'intersect';
    default: return undefined;
  }
}

function normalizeEndBound(value: unknown): 'blind' | 'throughAll' | 'upToNext' | 'upToSurface' | 'upToVertex' | undefined {
  switch (String(value ?? '').toLowerCase()) {
    case 'blind': return 'blind';
    case 'through_all': case 'throughall': return 'throughAll';
    case 'up_to_next': case 'uptonext': return 'upToNext';
    case 'up_to_surface': case 'uptosurface': return 'upToSurface';
    case 'up_to_vertex': case 'uptovertex': return 'upToVertex';
    default: return undefined;
  }
}

function sanitizeEntities(value: unknown): SketchEntityDto[] {
  if (!Array.isArray(value)) throw new BlockedCapabilityError('sketch-entities', '草图 entities 不是数组');
  return value.map((entity) => {
    const source = asRecord(entity);
    if (!source) throw new BlockedCapabilityError('sketch-entity', '草图 entity 不是对象');
    const { sourceId: _sourceId, ...rest } = source;
    return rest as unknown as SketchEntityDto;
  });
}

function sanitizeConstraints(value: unknown): SketchConstraintDto[] {
  if (!Array.isArray(value)) return [];
  return value.map((constraint) => {
    const source = asRecord(constraint);
    if (!source) throw new BlockedCapabilityError('sketch-constraint', '草图 constraint 不是对象');
    const { sourceIndex: _sourceIndex, sourceType: _sourceType, ...rest } = source;
    return rest as unknown as SketchConstraintDto;
  });
}

function sketchOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const rawPlane = asRecord(params.plane);
  // 草图落在 cPlane 上：planeSourceFeatureId 是 Onshape 源 id，必须映射为本地
  // cPlane featureId 才能建立产品侧依赖（改参/删除守卫读这个 id）。
  const planeSource = stringParam(params, 'planeSourceFeatureId');
  let localPlaneSource: string | undefined;
  if (planeSource !== undefined) {
    localPlaneSource = context.featureIdBySource?.get(planeSource);
    if (!localPlaneSource)
      throw new BlockedCapabilityError('cplane-source', `${feature.name} 引用的基准面 ${planeSource} 尚未构建`);
  }
  const planeSourceFeatureId = localPlaneSource
    ?? (typeof rawPlane?.sourceFeatureId === 'string' ? rawPlane.sourceFeatureId : undefined);
  const plane: SketchPlaneDto | undefined = rawPlane ? {
    origin: rawPlane.origin as SketchPlaneDto['origin'],
    normal: rawPlane.normal as SketchPlaneDto['normal'],
    xDir: rawPlane.xDir as SketchPlaneDto['xDir'],
    ...(planeSourceFeatureId ? { sourceFeatureId: planeSourceFeatureId } : {}),
  } : undefined;
  return {
    scenario: feature,
    op: {
      kind: 'insertSketch',
      entities: sanitizeEntities(params.entities),
      constraints: sanitizeConstraints(params.constraints),
      ...(plane ? { plane } : {}),
    },
    notes: localPlaneSource ? [`cPlane source=${localPlaneSource}`] : [],
    approximate: false,
  };
}

function resolveSketchId(
  feature: ScenarioFeature,
  params: Record<string, unknown>,
  context: TranslateContext,
): { sketchId: string; notes: string[] } {
  const selection = asRecord(params.selection);
  const sourceSketchId = stringParam(params, 'sketchFeatureId')
    ?? (selection ? stringParam(selection, 'sketchFeatureId') : undefined);
  const notes: string[] = [];
  if (sourceSketchId) {
    const mapped = context.sketchIdBySource?.get(sourceSketchId);
    if (!mapped)
      throw new BlockedCapabilityError('sketch-selector', `${feature.name} 引用的草图 ${sourceSketchId} 尚未构建`);
    return { sketchId: mapped, notes };
  }
  if (context.latestSketchId) {
    notes.push(`未显式指定草图，沿用最近草图 ${context.latestSketchId}`);
    return { sketchId: context.latestSketchId, notes };
  }
  throw new BlockedCapabilityError('sketch-selector', `${feature.name} 无法定位草图`);
}

function resolveRegions(
  params: Record<string, unknown>,
  feature: ScenarioFeature,
): { regions: number[]; notes: string[]; approximate: boolean } {
  const selection = asRecord(params.selection);
  // converter 的“面积降序前缀”多选映射是 best-effort（Onshape 查询是边/面语义，
  // 不能静态反推面域下标）；消费方必须保留 regionRisk 标记，不得当完整复刻。
  const risk = selection?.regionRisk === true || params.regionRisk === true;
  const riskNotes = risk ? ['面域为 converter 前缀映射（regionRisk，需审计）'] : [];
  const explicit = selection?.regions ?? params.regions;
  if (Array.isArray(explicit) && explicit.every((value) => Number.isInteger(value) && value >= 0)) {
    return {
      regions: Array.from(new Set(explicit as number[])),
      notes: riskNotes,
      approximate: risk,
    };
  }
  const single = selection?.regionIndex ?? params.regionIndex;
  if (Number.isInteger(single) && (single as number) >= 0) {
    return { regions: [single as number], notes: riskNotes, approximate: risk };
  }
  const kind = String(selection?.kind ?? '');
  if (kind === 'imprintFace') {
    // 兼容已有人工示例的语义，但明确标 approximate；通用面 split 尚未实现。
    return { regions: [0], notes: ['imprintFace 以最近草图 region 0 近似（face split 未实现）'], approximate: true };
  }
  throw new BlockedCapabilityError('region-selector', `${feature.name} 缺少可解析面域`);
}

function extrudeOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  // 拔模角当前无产品契约/内核通道（原生 api_taper_faces 未暴露）；静默按直体
  // 拉伸会伪造几何，4 个 PS / 15 个特征会因此假绿。显式阻塞到独立 ADR。
  const draftAngle = numberParam(params, 'draftAngleDeg');
  if (booleanParam(params, 'hasDraft') === true && draftAngle !== undefined && Math.abs(draftAngle) > 1e-9) {
    throw new BlockedCapabilityError(
      'extrude-draft',
      `${feature.name} 拔模角 ${(draftAngle * 180 / Math.PI).toFixed(3)}° 尚无产品契约/内核通道`,
    );
  }
  const { sketchId, notes: sketchNotes } = resolveSketchId(feature, params, context);
  const { regions, notes: regionNotes, approximate } = resolveRegions(params, feature);
  const operation = normalizeOperation(params.operation);
  const endBound = normalizeEndBound(params.endBound) ?? 'blind';
  if (endBound === 'upToNext' || endBound === 'upToSurface' || endBound === 'upToVertex') {
    // 契约保留但当前后端尚未实现；不把它静默降成 blind。
    throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} 终止条件 ${endBound} 尚未实现`);
  }
  const distance = numberParam(params, 'depthMm') ?? numberParam(params, 'distance') ?? 0;
  const symmetric = booleanParam(params, 'symmetric') === true;
  // symmetric 已覆盖双向；再传 backward 会被后端 zod 以互斥拒收。
  const direction = !symmetric && booleanParam(params, 'oppositeDirection') === true
    ? 'backward' as const
    : undefined;
  const startOffsetMm = numberParam(params, 'startOffsetMm');
  // v1.24 secondDirection：契约缺省=主方向相反侧；scenario 只在 Onshape
  // secondDirectionOppositeDirection=true 时显式带 direction（回主方向同侧）。
  const secondRaw = asRecord(params.secondDirection);
  let secondDirection:
    | { endBound: 'blind' | 'throughAll'; distanceMm?: number; direction?: 'forward' | 'backward' }
    | undefined;
  if (secondRaw) {
    if (symmetric)
      throw new BlockedCapabilityError('extrude-second-direction', `${feature.name} symmetric 与 secondDirection 互斥`);
    const bound = normalizeEndBound(secondRaw.endBound) ?? 'blind';
    if (bound !== 'blind' && bound !== 'throughAll')
      throw new BlockedCapabilityError('extrude-second-direction', `${feature.name} 第二方向终止条件 ${String(secondRaw.endBound)} 未映射`);
    const secondDistance = numberParam(secondRaw, 'distanceMm');
    if (bound === 'blind' && (secondDistance === undefined || secondDistance <= 0))
      throw new BlockedCapabilityError('extrude-second-direction', `${feature.name} 第二方向缺有效距离`);
    const dirRaw = stringParam(secondRaw, 'direction');
    const secondDir = dirRaw === 'backward' || dirRaw === 'forward' ? dirRaw : undefined;
    secondDirection = {
      endBound: bound,
      ...(bound === 'blind' && secondDistance !== undefined ? { distanceMm: secondDistance } : {}),
      ...(secondDir ? { direction: secondDir } : {}),
    };
  }
  // Onshape ADD/REMOVE 的合并范围必须落到具体 body（多体模型）；NEW 的目标由
  // newBody 规划决定，不能把 scope 当 target。
  const scopeTarget = operation !== undefined && operation !== 'new'
    ? scopeBodyTarget(feature, params, context)
    : undefined;
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'extrude',
      ...(scopeTarget ? { targetBodyId: scopeTarget.bodyKey } : {}),
      params: {
        profile: [],
        distance,
        sketchId,
        regions,
        ...(operation ? { operation } : {}),
        endBound,
        symmetric,
        ...(direction ? { direction } : {}),
        ...(startOffsetMm !== undefined ? { startOffsetMm } : {}),
        ...(secondDirection ? { secondDirection } : {}),
      },
    },
    notes: [
      ...sketchNotes,
      ...regionNotes,
      ...(secondDirection ? ['secondDirection（v1.24）'] : []),
      ...(scopeTarget ? [scopeTarget.note] : []),
    ],
    approximate,
  };
}

function revolveOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const { sketchId, notes: sketchNotes } = resolveSketchId(feature, params, context);
  const { regions, notes, approximate } = resolveRegions(params, feature);
  const axisEntityId = numberParam(params, 'axisEntityId')
    ?? numberParam(params, 'axisSketchEntityId');
  if (axisEntityId === undefined)
    throw new BlockedCapabilityError('revolve-axis', `${feature.name} 缺少轴实体 id`);
  const operation = normalizeOperation(params.operation);
  const fullRevolve = booleanParam(params, 'fullRevolve') === true;
  const angle = numberParam(params, 'angle') ?? numberParam(params, 'angleRad');
  if (!fullRevolve && angle === undefined)
    throw new BlockedCapabilityError('revolve-angle', `${feature.name} 非全周旋转缺少角度`);
  const scopeTarget = operation !== undefined && operation !== 'new'
    ? scopeBodyTarget(feature, params, context)
    : undefined;
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'revolve',
      ...(scopeTarget ? { targetBodyId: scopeTarget.bodyKey } : {}),
      params: {
        sketchId,
        regions,
        axis: { sketchEntityId: axisEntityId },
        fullRevolve,
        ...(angle !== undefined ? { angle } : {}),
        ...(operation ? { operation } : {}),
      },
    },
    notes: [...sketchNotes, ...notes, ...(scopeTarget ? [scopeTarget.note] : [])],
    approximate,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0)))
    : [];
}

/**
 * extrude/revolve/hole 的 Onshape booleanScope（合并范围）→ 当前时点 bodyKey。
 * 只在步骤显式带 scope 时解析；解析不到即诚实阻塞，绝不把多体模型切到默认体。
 */
function scopeBodyTarget(
  feature: ScenarioFeature,
  params: Record<string, unknown>,
  context: TranslateContext,
): { bodyKey: string; note: string } | undefined {
  const sources = stringArray(params.booleanScopeFeatureIds);
  if (sources.length === 0) return undefined;
  const bodyKey = sources
    .map((source) => context.bodyKeyBySource?.get(source))
    .find((key): key is string => key !== undefined);
  if (bodyKey === undefined)
    throw new BlockedCapabilityError(
      'body-scope',
      `${feature.name} 的 booleanScope ${sources.join(',')} 无可解析 body`,
    );
  return { bodyKey, note: `targetBody=${bodyKey}（booleanScope）` };
}

/**
 * booleanBodies：scenario 只存源侧特征 id；runner 在步骤时点注入
 * bodyKeyBySource（getBodies 的 sourceFeatureId → bodyKey）。产品 v1 要求恰 1 个
 * target；union 且 scenario 未给 target 时选工具集之外的第一个 body。
 * keepTools=true 的产品语义尚未实现（求值器返回单一结果 body），标 approximate。
 */
function booleanBodiesOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const rawOperation = String(params.operation ?? params.operationType ?? '').toLowerCase();
  const operation = rawOperation === 'unite' || rawOperation === 'union'
    ? 'unite' as const
    : rawOperation === 'subtract' || rawOperation === 'subtraction'
      ? 'subtract' as const
      : undefined;
  if (!operation)
    throw new BlockedCapabilityError('boolean-bodies', `${feature.name} 不支持的布尔操作 ${rawOperation || 'unknown'}`);
  const toolSources = stringArray(params.toolSourceFeatureIds ?? params.tools);
  if (toolSources.length === 0)
    throw new BlockedCapabilityError('boolean-bodies', `${feature.name} 缺少 tool body`);
  const targetSources = stringArray(params.targetSourceFeatureIds ?? params.targets);
  const bodyKeyBySource = context.bodyKeyBySource;
  const allBodyKeys = context.allBodyKeys ?? [];
  if (!bodyKeyBySource)
    throw new BlockedCapabilityError('boolean-bodies', `${feature.name} 缺少 body 解析上下文`);
  const resolve = (source: string): string => {
    const key = bodyKeyBySource.get(source);
    if (!key) throw new BlockedCapabilityError('boolean-bodies', `${feature.name} 的 body 源 ${source} 无对应 body`);
    return key;
  };
  const tools: BodyRef[] = toolSources.map((source) => ({ bodyKey: resolve(source) }));
  let targets: BodyRef[];
  if (targetSources.length > 0) {
    targets = targetSources.map((source) => ({ bodyKey: resolve(source) }));
  } else if (operation === 'unite') {
    const candidate = allBodyKeys.find((key) => !tools.some((tool) => tool.bodyKey === key));
    if (!candidate)
      throw new BlockedCapabilityError('boolean-bodies', `${feature.name} union 无可作为 target 的 body`);
    targets = [{ bodyKey: candidate }];
  } else {
    throw new BlockedCapabilityError('boolean-bodies', `${feature.name} subtract 缺少 target body`);
  }
  if (targets.length !== 1)
    throw new BlockedCapabilityError('boolean-bodies', `${feature.name} v1 只支持恰 1 个 target（当前 ${targets.length}）`);
  const keepTools = params.keepTools === true;
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'booleanBodies',
      params: { targets, tools, operation, keepTools },
    },
    notes: [
      `booleanBodies target=${targets[0]!.bodyKey} tools=${tools.map((tool) => tool.bodyKey).join(',')}`,
      ...(keepTools ? ['keepTools=true：产品求值器暂不保留工具体，标 approximate'] : []),
    ],
    approximate: keepTools,
  };
}

function cPlaneOp(feature: ScenarioFeature): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const reference = stringParam(params, 'reference');
  if (reference !== 'top' && reference !== 'front' && reference !== 'right')
    throw new BlockedCapabilityError('cplane-reference', `${feature.name} 参考面未映射：${String(reference)}`);
  const offsetMm = numberParam(params, 'offsetMm');
  const rawOrigin = asRecord(params.origin);
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const origin = rawOrigin && finite(rawOrigin.x) && finite(rawOrigin.y) && finite(rawOrigin.z)
    ? { x: rawOrigin.x, y: rawOrigin.y, z: rawOrigin.z }
    : undefined;
  if (rawOrigin !== undefined && origin === undefined)
    throw new BlockedCapabilityError('cplane-origin', `${feature.name} 平面点原点非有限数`);
  // v1.31：origin 与 offsetMm 互斥（平面点不叠加偏移）。
  const notes = origin !== undefined ? [`PLANE_POINT origin=(${origin.x},${origin.y},${origin.z})`] : [];
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: {
        reference,
        ...(origin !== undefined
          ? { origin }
          : offsetMm !== undefined ? { offsetMm } : {}),
        ...(booleanParam(params, 'flipNormal') !== undefined
          ? { flipNormal: booleanParam(params, 'flipNormal') }
          : {}),
      },
    },
    notes,
    approximate: false,
  };
}

function holeOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const { sketchId } = resolveSketchId(feature, params, context);
  const diameterMm = numberParam(params, 'diameterMm');
  if (diameterMm === undefined)
    throw new BlockedCapabilityError('hole-diameter', `${feature.name} 缺少孔径`);
  const endBound = normalizeEndBound(params.endBound);
  if (endBound !== 'blind' && endBound !== 'throughAll')
    throw new BlockedCapabilityError('hole-end-bound', `${feature.name} 终止条件未映射`);
  const holeStyle = stringParam(params, 'holeStyle');
  const counterbore = holeStyle === 'counterbore'
    ? {
        holeStyle: 'counterbore' as const,
        counterboreDiameterMm: numberParam(params, 'counterboreDiameterMm'),
        counterboreDepthMm: numberParam(params, 'counterboreDepthMm'),
      }
    : undefined;
  if (holeStyle === 'counterbore'
    && (counterbore?.counterboreDiameterMm === undefined || counterbore?.counterboreDepthMm === undefined))
    throw new BlockedCapabilityError('hole-counterbore', `${feature.name} 沉头孔参数不完整`);
  const countersink = holeStyle === 'countersink'
    ? {
        holeStyle: 'countersink' as const,
        countersinkDiameterMm: numberParam(params, 'countersinkDiameterMm'),
        countersinkAngleDeg: numberParam(params, 'countersinkAngleDeg'),
      }
    : undefined;
  if (holeStyle === 'countersink'
    && (countersink?.countersinkDiameterMm === undefined || countersink?.countersinkAngleDeg === undefined))
    throw new BlockedCapabilityError('hole-countersink', `${feature.name} 倒角孔参数不完整`);
  const pointIds = Array.isArray(params.pointIds)
    ? params.pointIds.filter((value): value is number => Number.isInteger(value) && (value as number) > 0)
    : undefined;
  const vertexRefs = Array.isArray(params.vertexRefs) ? params.vertexRefs : undefined;
  const target = scopeBodyTarget(feature, params, context);
  // 孔轴线默认沿草图法线；若目标 body 质心在平面 −法线侧（草图法线朝外），
  // Onshape 的孔仍钻入材料，产品需显式 direction=backward。用质心侧判定，
  // 不按示例硬编码；证据写入 note。
  const sketchSource = stringParam(params, 'sketchFeatureId') ?? stringParam(params, 'sketchId');
  const plane = sketchSource ? context.sketchPlaneBySource?.get(sketchSource) : undefined;
  const centroid = target ? context.bodyCentroidByKey?.get(target.bodyKey) : undefined;
  let direction: 'forward' | 'backward' | undefined;
  if (plane && centroid) {
    const dot =
      (centroid.x - plane.origin.x) * plane.normal.x +
      (centroid.y - plane.origin.y) * plane.normal.y +
      (centroid.z - plane.origin.z) * plane.normal.z;
    if (dot < 0) direction = 'backward';
  }
  const depthMm = numberParam(params, 'depthMm');
  const holeParams: HoleParams = {
    sketchId,
    diameterMm,
    endBound,
    ...(pointIds?.length ? { pointIds } : {}),
    ...(vertexRefs?.length ? { vertexRefs: vertexRefs as HoleParams['vertexRefs'] } : {}),
    ...(counterbore ?? {}),
    ...(countersink ?? {}),
    ...(depthMm !== undefined ? { depthMm } : {}),
    ...(direction ? { direction } : {}),
  };
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'hole',
      ...(target ? { targetBodyId: target.bodyKey } : {}),
      params: holeParams,
    },
    notes: [
      ...(target ? [target.note] : []),
      ...(direction ? [`holeDirection=${direction}（质心在草图法线负侧）`] : []),
    ],
    approximate: false,
  };
}

/** runner 已解析的持久边引用；缺失即拒绝，绝不回退到任意边。 */
function resolvedEdgeRefs(feature: ScenarioFeature, context: TranslateContext): FilletEdgeRef[] {
  const refs = context.edgeRefsByFeatureName?.get(feature.name);
  if (!refs || refs.length === 0) {
    throw new BlockedCapabilityError(
      'edge-selector',
      `${feature.name} 缺少已解析的持久边引用（edge-resolver 未运行或匹配失败）`,
    );
  }
  return refs;
}

/** fillet：半径 + 持久边引用（边由 CAP_EDGE/SWEPT_EDGE resolver 解析）。 */
function filletOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const radius = numberParam(feature.params, 'radiusMm');
  if (radius === undefined || !(radius > 0))
    throw new BlockedCapabilityError('fillet-radius', `${feature.name} 缺少有效半径`);
  const edges = resolvedEdgeRefs(feature, context);
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'fillet',
      params: {
        radius,
        propagateSmooth: booleanParam(feature.params, 'propagateSmooth') !== false,
        edges,
      },
    },
    notes: [`edges=${edges.length}（scenario edge-resolver）`],
    approximate: false,
  };
}

/** mirror（T5 首切片）：仅世界基准面 XY/YZ/XZ + 整件镜像（keepOriginal 恒 true）。 */
function mirrorOp(feature: ScenarioFeature): TranslatedStep {
  const plane = stringParam(feature.params, 'plane');
  if (plane !== 'XY' && plane !== 'YZ' && plane !== 'XZ') {
    throw new BlockedCapabilityError('mirror-plane', `${feature.name} 镜像面未映射：${String(plane)}`);
  }
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { plane, keepOriginal: true },
    },
    notes: ['mirror=world-plane，整件镜像（T5 首切片）'],
    approximate: false,
  };
}

/** chamfer：Onshape 三种模式 → 产品 mode/values（与后端 ScenarioReplay 同口径）。 */
function chamferOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = feature.params;
  const type = stringParam(params, 'chamferType');
  const width = numberParam(params, 'widthMm');
  const width1 = numberParam(params, 'width1Mm');
  const width2 = numberParam(params, 'width2Mm');
  const angle = numberParam(params, 'angleDeg');
  let mode: number;
  let values1: number;
  let values2: number;
  if (type === 'TWO_OFFSETS' && width1 !== undefined && width2 !== undefined) {
    mode = 2; values1 = width1; values2 = width2;
  } else if (type === 'OFFSET_ANGLE' && width !== undefined && angle !== undefined) {
    mode = 3; values1 = width; values2 = angle;
  } else if (width !== undefined) {
    mode = 2; values1 = width; values2 = width;
  } else {
    throw new BlockedCapabilityError(
      'chamfer-params',
      `${feature.name} 参数未映射（${type ?? 'unknown'}）`,
    );
  }
  const edges = resolvedEdgeRefs(feature, context);
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'chamfer',
      params: {
        mode,
        propagateSmooth: booleanParam(params, 'tangentPropagation') !== false,
        edges,
        values1,
        values2,
      },
    },
    notes: [`edges=${edges.length} mode=${mode}（scenario edge-resolver）`],
    approximate: false,
  };
}

/**
 * Map one scenario feature. `sketch` returns insertSketch; feature steps return
 * insertFeature. Unsupported selectors/features throw BlockedCapabilityError.
 */
export function translateScenarioFeature(
  feature: ScenarioFeature,
  context: TranslateContext = {},
): TranslatedStep {
  switch (feature.type) {
    case 'sketch':
      return sketchOp(feature, context);
    case 'extrude':
      return extrudeOp(feature, context);
    case 'revolve':
      return revolveOp(feature, context);
    case 'hole':
      return holeOp(feature, context);
    case 'cPlane':
      return cPlaneOp(feature);
    case 'fillet':
      return filletOp(feature, context);
    case 'chamfer':
      return chamferOp(feature, context);
    case 'mirror':
      return mirrorOp(feature);
    case 'booleanBodies':
      return booleanBodiesOp(feature, context);
    case 'booleanAdd':
    case 'booleanSubtract':
    case 'pattern':
    case 'loft':
    case 'sweep':
    case 'shell':
      throw new BlockedCapabilityError(
        'feature-channel',
        `${feature.name}（${feature.type}）尚未接入通用 scenario channel`,
      );
    default:
      throw new BlockedCapabilityError('feature-type', `未支持的 scenario feature type: ${feature.type}`);
  }
}

/** Translate a whole scenario; stops at the first blocked step. */
export function translateScenario(
  scenario: ParityScenario,
  context: TranslateContext = {},
): TranslatedStep[] {
  return scenario.features.map((feature) => translateScenarioFeature(feature, context));
}
