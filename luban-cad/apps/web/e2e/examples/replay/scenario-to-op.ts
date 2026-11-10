/**
 * Parity scenario → FeatureOp translator（test-only）。
 *
 * 只做结构映射：不解析 geometry、不猜 selector、不直接写 iModel。
 * 面域/body/边 selector 由 runner 的 resolver 处理；本文件遇到无法安全
 * 映射的步骤抛 BlockedCapabilityError，绝不静默使用 region 0。
 */
import type {
  BodyRef,
  FaceExtrudeParams,
  FeatureBooleanOperation,
  FeatureOp,
  FilletEdgeRef,
  HoleParams,
  LubanTopologyId,
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
  /** shell 步骤已解析的持久面引用（键=scenario feature name）。 */
  shellRefsByFeatureName?: ReadonlyMap<string, LubanTopologyId[]>;
  /** shell 多体目标 body（键=scenario feature name；单体示例缺省）。 */
  shellTargetBodyByFeatureName?: ReadonlyMap<string, string>;
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

function normalizeEndBound(value: unknown): 'blind' | 'throughAll' | 'upToNext' | 'upToSurface' | 'upToVertex' | 'upToBody' | undefined {
  switch (String(value ?? '').toLowerCase()) {
    case 'blind': return 'blind';
    case 'through_all': case 'throughall': return 'throughAll';
    case 'up_to_next': case 'uptonext': return 'upToNext';
    case 'up_to_surface': case 'uptosurface': return 'upToSurface';
    case 'up_to_vertex': case 'uptovertex': return 'upToVertex';
    case 'up_to_body': case 'uptobody': return 'upToBody';
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
  // P2.1：CAP_FACE 起始面 → 上游草图面域 + startOffset；位置/拔模在真栈校验前
  // 保持 approximate（起始面是 cap，草图为基准面）。
  const capFaceApprox = selection?.approximateStartOffset === true || selection?.approximateDraft === true;
  const riskNotes = [
    ...(risk ? ['面域为 converter 前缀映射（regionRisk，需审计）'] : []),
    ...(capFaceApprox ? ['CAP_FACE 起始面/拔模映射待真栈校验（approximate）'] : []),
  ];
  const explicit = selection?.regions ?? params.regions;
  if (Array.isArray(explicit) && explicit.every((value) => Number.isInteger(value) && value >= 0)) {
    return {
      regions: Array.from(new Set(explicit as number[])),
      notes: riskNotes,
      approximate: risk || capFaceApprox,
    };
  }
  const single = selection?.regionIndex ?? params.regionIndex;
  if (Number.isInteger(single) && (single as number) >= 0) {
    return { regions: [single as number], notes: riskNotes, approximate: risk || capFaceApprox };
  }
  const kind = String(selection?.kind ?? '');
  if (kind === 'imprintFace') {
    // 兼容已有人工示例的语义，但明确标 approximate；通用面 split 尚未实现。
    return { regions: [0], notes: ['imprintFace 以最近草图 region 0 近似（face split 未实现）'], approximate: true };
  }
  if (kind === 'capFaceProfile') {
    // ADR-0016 A3：S10 面驱动 profile（CAP_FACE 起始面）必须由 runner 在步骤时点
    // 解析为 bodyId/faceRef 并改走产品 faceExtrude。未解析时诚实阻塞，绝不退回
    // 草图面域/startOffset 近似（那条路径仅保留给 start-reference 家族）。
    throw new BlockedCapabilityError(
      'face-extrude',
      `${feature.name} CAP_FACE 起始面尚未解析为 bodyId/faceRef（capFaceProfile）`,
    );
  }
  if (kind === 'face') {
    // 2026-11-09：CAP_FACE/SWEPT_FACE 是上游实体面选择（如 Bumper Block 从
    // Extrude 1 顶面再拉），不是 imprint 草图面域；产品 faceExtrude 尚无
    // 起始面/draft 语义，诚实阻塞，不能退化成 region 0 近似。
    throw new BlockedCapabilityError(
      'face-extrude',
      `${feature.name} 从上游实体面拉伸（CAP_FACE/SWEPT_FACE）未实现`,
    );
  }
  throw new BlockedCapabilityError('region-selector', `${feature.name} 缺少可解析面域`);
}

function extrudeOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  // v1.51（ADR-0005 Phase 4）：拔模已落产品契约/后端（sketchId + blind）。converter
  // 的 draftAngleDeg 为弧度（quantityMm 语义），产品契约为度。Onshape「反向」=
  // draftPullDirection 直接映射；方向符号尚未用 live 几何独立校准 → 回放标 approximate。
  const rawDraftRad = numberParam(params, 'draftAngleDeg');
  const draftAngleDeg = booleanParam(params, 'hasDraft') === true
    && rawDraftRad !== undefined && Math.abs(rawDraftRad) > 1e-9
    ? rawDraftRad * 180 / Math.PI
    : undefined;
  const draftPullDirection = booleanParam(params, 'draftPullDirection') === true;
  const { sketchId, notes: sketchNotes } = resolveSketchId(feature, params, context);
  const { regions, notes: regionNotes, approximate: regionApproximate } = resolveRegions(params, feature);
  const operation = normalizeOperation(params.operation);
  const rawEndBound = normalizeEndBound(params.endBound);
  const solvedDepth = numberParam(params, 'depthMm') ?? numberParam(params, 'distance');
  // v1.53：upToNext 已落产品（最近平行面，无需目标查询）——回放直接映射 endBound，
  // 不再用 blind 静态近似。upToSurface 仍缺目标 faceRef 查询，继续静态近似；
  // upToVertex/upToBody 无产品契约。
  // v1.60：upToVertex 已落产品（草图顶点投影深度）——converter 解析出草图顶点时
  // 直通 endVertexRef；目标查询缺失/非草图顶点时退回既有静态深度近似（标 approximate）。
  const endVertexRaw = asRecord(params.endVertexRef);
  const endVertexSketchSource = endVertexRaw === undefined ? undefined
    : stringParam(endVertexRaw, 'sketchFeatureId') ?? stringParam(endVertexRaw, 'sketchId');
  const endVertexEntityId = endVertexRaw === undefined ? undefined : numberParam(endVertexRaw, 'entityId');
  const endVertexPartRaw = endVertexRaw === undefined ? undefined : stringParam(endVertexRaw, 'part');
  const endVertexPart = endVertexPartRaw === 'start' || endVertexPartRaw === 'end' || endVertexPartRaw === 'center'
    ? endVertexPartRaw : undefined;
  let exactEndVertex: { sketchId: string; entityId: number; part: 'start' | 'end' | 'center' } | undefined;
  if (rawEndBound === 'upToVertex' && endVertexRaw !== undefined) {
    if (endVertexSketchSource === undefined || endVertexEntityId === undefined
      || !Number.isInteger(endVertexEntityId) || endVertexEntityId < 0 || endVertexPart === undefined)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} upToVertex 的 endVertexRef 形态非法`);
    const localTarget = context.sketchIdBySource?.get(endVertexSketchSource);
    if (localTarget === undefined)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} upToVertex 目标草图 ${endVertexSketchSource} 不在已应用草图映射`);
    exactEndVertex = { sketchId: localTarget, entityId: endVertexEntityId, part: endVertexPart };
  }
  const productUpToVertex = exactEndVertex !== undefined;
  const productUpToNext = rawEndBound === 'upToNext';
  const staticUpTo = rawEndBound === 'upToSurface'
    || (rawEndBound === 'upToVertex' && !productUpToVertex) || rawEndBound === 'upToBody';
  let approximate = regionApproximate;
  const notes = [...sketchNotes, ...regionNotes];
  if (productUpToNext) {
    if (operation === 'new' || params.newBody === true)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} upToNext 需要上游实体（operation=new/newBody 不可用）`);
    if (booleanParam(params, 'symmetric') === true
      || draftAngleDeg !== undefined || asRecord(params.secondDirection) !== undefined)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} upToNext 与 symmetric/draft/secondDirection 互斥`);
    notes.push('endBound=upToNext（产品最近平行面；无需目标查询）');
  }
  if (productUpToVertex) {
    // upToVertex 的深度来自目标草图顶点（不依赖上游体），operation=new 合法。
    if (booleanParam(params, 'symmetric') === true
      || draftAngleDeg !== undefined || asRecord(params.secondDirection) !== undefined)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} upToVertex 与 symmetric/draft/secondDirection 互斥`);
    notes.push(`endBound=upToVertex（产品草图顶点 ${endVertexSketchSource}#${endVertexEntityId}:${endVertexPart} 投影深度）`);
  }
  if (staticUpTo) {
    if (solvedDepth === undefined || solvedDepth <= 0)
      throw new BlockedCapabilityError('extrude-end-bound', `${feature.name} 终止条件 ${rawEndBound} 缺已解算深度（无法近似）`);
    approximate = true;
    notes.push(`endBound=${rawEndBound}→blind(${solvedDepth}mm，静态近似；目标查询未采集（产品 upToSurface 需 endFaceRef））`);
  }
  // 未知/缺省终止条件沿用 blind；throughAll/upToNext 直通，其余 up-to 走静态近似。
  const endBound = productUpToVertex ? 'upToVertex'
    : rawEndBound === 'throughAll' ? 'throughAll'
      : rawEndBound === 'upToNext' ? 'upToNext'
        : 'blind';
  const distance = solvedDepth ?? (rawEndBound === 'upToNext' || productUpToVertex ? 1 : 0);
  const symmetric = booleanParam(params, 'symmetric') === true;
  // symmetric 已覆盖双向；再传 backward 会被后端 zod 以互斥拒收。
  const direction = !symmetric && booleanParam(params, 'oppositeDirection') === true
    ? 'backward' as const
    : undefined;
  const selectionRecord = asRecord(params.selection);
  const startOffsetMm = numberParam(params, 'startOffsetMm')
    ?? (selectionRecord ? numberParam(selectionRecord, 'startOffsetMm') : undefined);
  if (stringParam(selectionRecord ?? {}, 'kind') === 'capFaceExtrude') {
    notes.push(
      `CAP_FACE 起始面 → 上游草图面域 + startOffsetMm=${startOffsetMm ?? '?'}（产品 extrude 偏移/拔模通道）`,
    );
  }
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
    // 2026-11-08：UP_TO_SURFACE 第二方向由 converter 传 blind(solvedDepth) +
    // approximate 标记；回放必须显式标近似（目标查询未采集；产品 secondDirection
    // 目前仅 blind/throughAll，up-to 未映射）。
    if (booleanParam(secondRaw, 'approximate') === true) {
      approximate = true;
      notes.push(
        `secondDirection=${String(secondRaw.sourceBound ?? 'UP_TO_SURFACE')}→blind(` +
        `${secondDistance ?? 0}mm，静态近似；目标查询未采集，产品第二方向 up-to 未映射）`,
      );
    }
    secondDirection = {
      endBound: bound,
      ...(bound === 'blind' && secondDistance !== undefined ? { distanceMm: secondDistance } : {}),
      ...(secondDir ? { direction: secondDir } : {}),
    };
  }
  if (draftAngleDeg !== undefined) {
    if (symmetric)
      throw new BlockedCapabilityError('extrude-draft', `${feature.name} 拔模与 symmetric 互斥`);
    if (secondDirection !== undefined)
      throw new BlockedCapabilityError('extrude-draft', `${feature.name} 拔模与 secondDirection 互斥`);
    if (endBound !== 'blind')
      throw new BlockedCapabilityError('extrude-draft', `${feature.name} 拔模首版仅支持 blind（当前 ${endBound}）`);
    approximate = true;
    notes.push(
      `draft=${draftAngleDeg.toFixed(3)}°${draftPullDirection ? '(reverse)' : ''}：` +
      '方向符号按 draftPullDirection 直接映射（Onshape live 几何未独立校准）',
    );
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
        ...(exactEndVertex ? { endVertexRef: exactEndVertex } : {}),
        ...(direction ? { direction } : {}),
        ...(startOffsetMm !== undefined ? { startOffsetMm } : {}),
        ...(draftAngleDeg !== undefined
          ? {
            draftAngleDeg,
            ...(draftPullDirection ? { draftPullDirection: true } : {}),
          }
          : {}),
        ...(secondDirection ? { secondDirection } : {}),
      },
    },
    notes: [
      ...notes,
      ...(secondDirection ? ['secondDirection（v1.24）'] : []),
      ...(scopeTarget ? [scopeTarget.note] : []),
    ],
    approximate,
  };
}

/**
 * shell（ADR-0008 第一切片）：由 runner 的 shellFaceResolver 产出持久面引用；
 * 本函数只做结构校验与方向符号（Onshape oppositeDirection=false = 内缩 → 负距离）。
 */
function shellOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const thickness = numberParam(params, "defaultDistance");
  if (thickness === undefined || !(thickness > 0))
    throw new BlockedCapabilityError('shell', `${feature.name} 壁厚无效: ${String(params.defaultDistance)}`);
  const opposite = booleanParam(params, "oppositeDirection") === true;
  const refs = context.shellRefsByFeatureName?.get(feature.name);
  if (!refs || refs.length === 0)
    throw new BlockedCapabilityError('shell', `${feature.name} 移除面引用未解析（面选择器）`);
  const targetBodyId = context.shellTargetBodyByFeatureName?.get(feature.name);
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'shell',
      ...(targetBodyId !== undefined ? { targetBodyId } : {}),
      params: {
        defaultDistance: opposite ? thickness : -thickness,
        faces: refs,
        distances: 0,
      },
    },
    notes: [
      `shell faces=${refs.length}（面选择器，${opposite ? '外扩' : '内缩'} ${thickness} mm）`,
      ...(targetBodyId !== undefined ? [`targetBody=${targetBodyId}（shell 面源）`] : []),
    ],
    approximate: false,
  };
}

/**
 * faceExtrude（ADR-0006 切片 D）：由 runner 的 imprintFaceResolver 产出，
 * params 已含持久 faceRef/bodyId/direction；这里只做结构校验，不解析几何。
 */
function faceExtrudeOp(feature: ScenarioFeature): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const operation = normalizeOperation(params.operation);
  if (!operation || operation === 'new')
    throw new BlockedCapabilityError('face-extrude', `${feature.name} 需要 add/remove/intersect（NEW 未实现）`);
  const endBound = normalizeEndBound(params.endBound) ?? 'blind';
  if (endBound !== 'blind' && endBound !== 'throughAll')
    throw new BlockedCapabilityError('face-extrude', `${feature.name} 终止条件 ${endBound} 未实现`);
  const depthMm = numberParam(params, 'depthMm');
  if (endBound === 'blind' && (depthMm === undefined || depthMm <= 0))
    throw new BlockedCapabilityError('face-extrude', `${feature.name} 盲端缺少有效距离`);
  const bodyId = stringParam(params, 'bodyId');
  const faceRef = asRecord(params.faceRef);
  const nodeId = faceRef?.nodeId;
  const entityId = faceRef?.entityId;
  if (!bodyId || !Number.isInteger(nodeId) || !Number.isInteger(entityId))
    throw new BlockedCapabilityError('face-extrude', `${feature.name} 缺少已解析的 bodyId/faceRef`);
  // S3 review（2026-11-10）：direction 只接受 forward/backward；未知值必须 fail
  // closed，不能静默降级为 forward（方向错会变成零相交/错误去材）。
  const directionRaw = params.direction;
  let direction: 'forward' | 'backward' = 'forward';
  if (directionRaw !== undefined) {
    if (directionRaw === 'forward' || directionRaw === 'backward') direction = directionRaw;
    else throw new BlockedCapabilityError(
      'face-extrude', `${feature.name} direction 非法：${String(directionRaw)}（仅 forward/backward）`,
    );
  }
  const mergeScopeRaw = Array.isArray(params.mergeScope) ? params.mergeScope : [];
  const mergeScope: BodyRef[] = [];
  for (const entry of mergeScopeRaw) {
    const record = asRecord(entry);
    const bodyKey = typeof record?.bodyKey === 'string' ? record.bodyKey : undefined;
    if (!bodyKey)
      throw new BlockedCapabilityError('face-extrude', `${feature.name} mergeScope 含无 bodyKey 的项`);
    mergeScope.push({ bodyKey });
  }
  // ADR-0016 A3（CAP_FACE profile → faceExtrude）：converter 仍以弧度存
  // `draftAngleDeg`（quantityMm 语义，与 extrudeOp 同口径），这里换算成产品度制。
  const rawDraftRad = numberParam(params, 'draftAngleDeg');
  const hasDraft = booleanParam(params, 'hasDraft') === true;
  const draftAngleDeg = hasDraft && rawDraftRad !== undefined && Math.abs(rawDraftRad) > 1e-9
    ? rawDraftRad * 180 / Math.PI
    : undefined;
  if (hasDraft && draftAngleDeg === undefined)
    throw new BlockedCapabilityError('face-extrude', `${feature.name} hasDraft 缺有效 draftAngleDeg`);
  const draftPullDirection = booleanParam(params, 'draftPullDirection') === true;
  if (draftPullDirection && draftAngleDeg === undefined)
    throw new BlockedCapabilityError('face-extrude', `${feature.name} draftPullDirection 缺 draftAngleDeg`);
  if (draftAngleDeg !== undefined) {
    if (!(Math.abs(draftAngleDeg) > 0 && Math.abs(draftAngleDeg) < 89))
      throw new BlockedCapabilityError('face-extrude', `${feature.name} draftAngleDeg 越界：${draftAngleDeg}`);
    if (endBound !== 'blind')
      throw new BlockedCapabilityError('face-extrude', `${feature.name} faceExtrude draft 首版仅支持 blind`);
    if (asRecord(params.secondDirection) !== undefined)
      throw new BlockedCapabilityError('face-extrude', `${feature.name} faceExtrude draft 与 secondDirection 互斥`);
  }
  const startOffsetMm = numberParam(params, 'startOffsetMm');
  if (params.startOffsetMm !== undefined && startOffsetMm === undefined)
    throw new BlockedCapabilityError('face-extrude', `${feature.name} startOffsetMm 非有限数`);
  if (startOffsetMm !== undefined && asRecord(params.secondDirection) !== undefined)
    throw new BlockedCapabilityError('face-extrude', `${feature.name} faceExtrude startOffset 与 secondDirection 互斥`);
  // review 2026-11-10：THROUGH_ALL 不透传 depthMm（即使输入里带了也显式忽略），
  // 防止 blind 深度冒充 throughAll；盲端才写 depthMm。
  const faceParams: FaceExtrudeParams = {
    bodyId,
    faceRef: { nodeId: nodeId as number, entityId: entityId as number },
    operation,
    endBound,
    ...(endBound === 'blind' && depthMm !== undefined ? { depthMm } : {}),
    direction,
    ...(startOffsetMm !== undefined ? { startOffsetMm } : {}),
    ...(draftAngleDeg !== undefined
      ? {
        draftAngleDeg,
        ...(draftPullDirection ? { draftPullDirection: true } : {}),
      }
      : {}),
    ...(mergeScope.length > 0 ? { mergeScope } : {}),
  };
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'faceExtrude',
      targetBodyId: bodyId,
      params: faceParams,
    },
    notes: [
      `${startOffsetMm !== undefined ? 'CAP_FACE 起始面 ' : ''}faceExtrude 精确面拉伸（direction=${direction}，` +
      `${endBound === 'throughAll' ? 'throughAll' : `${depthMm} mm`}` +
      `${startOffsetMm !== undefined ? `，startOffset=${startOffsetMm} mm` : ''}` +
      `${draftAngleDeg !== undefined ? `，draft=${draftAngleDeg.toFixed(3)}°${draftPullDirection ? '(reverse)' : ''}` : ''}）`,
      ...(endBound === 'throughAll' && depthMm !== undefined
        ? ['endBound=throughAll：忽略 depthMm（不进入产品载荷）'] : []),
    ],
    approximate: false,
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
      : rawOperation === 'intersect' || rawOperation === 'intersection'
        ? 'intersect' as const
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

/**
 * transform（ADR-0010）：scenario 只携带平移量与目标 body 源特征 id。
 * 目标 body 由 runner 在步骤时点注入 bodyKeyBySource 解析；多体模型缺上下文
 * 即阻塞，绝不隐式落到链尾 body。directionApprox=true 表示方向由端盖静态推导
 * （面可能被后续特征修改），步骤标近似。
 */
function transformOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  if (params.copy === true)
    throw new BlockedCapabilityError('transform', `${feature.name} 独立副本 body 未支持`);
  const translation = asRecord(params.translation);
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (!translation || !finite(translation.x) || !finite(translation.y) || !finite(translation.z))
    throw new BlockedCapabilityError('transform', `${feature.name} 平移量非有限数`);
  const targetSources = stringArray(params.targetSourceFeatureIds);
  const notes: string[] = [];
  let targetBodyId: string | undefined;
  if (targetSources.length > 0) {
    const bodyKeyBySource = context.bodyKeyBySource;
    if (bodyKeyBySource) {
      const key = targetSources
        .map((source) => bodyKeyBySource.get(source))
        .find((candidate): candidate is string => candidate !== undefined);
      if (key === undefined)
        throw new BlockedCapabilityError(
          'transform',
          `${feature.name} 的目标 body 源 ${targetSources.join(',')} 无可解析 body`,
        );
      targetBodyId = key;
      notes.push(`targetBody=${key}（transform entities）`);
    } else if ((context.allBodyKeys?.length ?? 0) > 1) {
      throw new BlockedCapabilityError('transform', `${feature.name} 多体模型缺 body 解析上下文`);
    }
  }
  const approximate = params.directionApprox === true;
  if (approximate) notes.push('方向由端盖静态推导（directionApprox）');
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'transform',
      ...(targetBodyId !== undefined ? { targetBodyId } : {}),
      params: { translation: { x: translation.x, y: translation.y, z: translation.z }, copy: false },
    },
    notes,
    approximate,
  };
}

function cPlaneOp(feature: ScenarioFeature): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const reference = stringParam(params, 'reference');
  if (reference !== 'top' && reference !== 'front' && reference !== 'right')
    throw new BlockedCapabilityError('cplane-reference', `${feature.name} 参考面未映射：${String(reference)}`);
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const vec = (value: unknown): { x: number; y: number; z: number } | undefined => {
    const record = asRecord(value);
    return record && finite(record.x) && finite(record.y) && finite(record.z)
      ? { x: record.x, y: record.y, z: record.z }
      : undefined;
  };
  // v1.44：THREE_POINT（converter 对非世界参考 cPlane 的 frame 派生等价平面）。
  // reference 仅为契约占位，三点决定平面；三点共线/非有限 → 诚实阻塞。
  const rawThree = params.threePoints;
  let threePoints: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }] | undefined;
  if (rawThree !== undefined) {
    if (!Array.isArray(rawThree) || rawThree.length !== 3)
      throw new BlockedCapabilityError('cplane-three-points', `${feature.name} threePoints 必须为 3 个点`);
    const p1 = vec(rawThree[0]), p2 = vec(rawThree[1]), p3 = vec(rawThree[2]);
    if (!p1 || !p2 || !p3)
      throw new BlockedCapabilityError('cplane-three-points', `${feature.name} threePoints 含非有限坐标`);
    const a = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const b = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
    const cross = {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
    if (!(Math.hypot(cross.x, cross.y, cross.z) > 1e-9))
      throw new BlockedCapabilityError('cplane-three-points', `${feature.name} threePoints 共线（退化平面）`);
    threePoints = [p1, p2, p3];
  }
  const offsetMm = numberParam(params, 'offsetMm');
  const rawOrigin = asRecord(params.origin);
  const origin = vec(rawOrigin);
  if (rawOrigin !== undefined && origin === undefined)
    throw new BlockedCapabilityError('cplane-origin', `${feature.name} 平面点原点非有限数`);
  if (threePoints !== undefined && (offsetMm !== undefined || origin !== undefined))
    throw new BlockedCapabilityError('cplane-three-points', `${feature.name} threePoints 与 offset/origin 互斥`);
  // v1.31：origin 与 offsetMm 互斥（平面点不叠加偏移）。
  const approximate = threePoints !== undefined && params.constructionApprox === true;
  const notes = threePoints !== undefined
    ? ['THREE_POINT（converter frame 派生；constructionApprox）']
    : origin !== undefined ? [`PLANE_POINT origin=(${origin.x},${origin.y},${origin.z})`] : [];
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: {
        reference,
        ...(threePoints !== undefined
          ? { threePoints }
          : origin !== undefined
            ? { origin }
            : offsetMm !== undefined ? { offsetMm } : {}),
        ...(booleanParam(params, 'flipNormal') !== undefined
          ? { flipNormal: booleanParam(params, 'flipNormal') }
          : {}),
      },
    },
    notes,
    approximate,
  };
}

function holeOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = asRecord(feature.params) ?? {};
  const { sketchId } = resolveSketchId(feature, params, context);
  const diameterMm = numberParam(params, 'diameterMm');
  if (diameterMm === undefined)
    throw new BlockedCapabilityError('hole-diameter', `${feature.name} 缺少孔径`);
  const endBound = normalizeEndBound(params.endBound);
  if (endBound !== 'blind' && endBound !== 'throughAll' && endBound !== 'upToNext')
    throw new BlockedCapabilityError('hole-end-bound', `${feature.name} 终止条件未映射`);
  const upToNext = endBound === 'upToNext';
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
  const tipAngleDeg = numberParam(params, 'tipAngleDeg');
  // converter 对 UP_TO_ENTITY 用 Onshape 计算深度做 blind 复现（endApprox）；
  // 不是产品 up-to-entity 能力，必须显式标 approximate。
  const endApprox = booleanParam(params, 'endApprox') === true;
  const holeParams: HoleParams = {
    sketchId,
    diameterMm,
    endBound,
    ...(pointIds?.length ? { pointIds } : {}),
    ...(vertexRefs?.length ? { vertexRefs: vertexRefs as HoleParams['vertexRefs'] } : {}),
    ...(counterbore ?? {}),
    ...(countersink ?? {}),
    ...(depthMm !== undefined && endBound === 'blind' ? { depthMm } : {}),
    ...(direction ? { direction } : {}),
    ...(tipAngleDeg !== undefined ? { tipAngleDeg } : {}),
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
      ...(upToNext ? ['endBound=upToNext（单孔位，产品最近平行面）'] : []),
      ...(endApprox ? ['UP_TO_ENTITY 以 Onshape 计算深度 blind 复现（endApprox，非动态目标）'] : []),
    ],
    approximate: endApprox,
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

/** v1.48：mirror operation 透传；缺省 unite（旧载荷逐字兼容）。 */
function mirrorOperation(feature: ScenarioFeature): 'unite' | 'subtract' | 'intersect' | undefined {
  const raw = stringParam(feature.params, 'operation');
  if (raw === undefined) return undefined;
  if (raw === 'unite' || raw === 'subtract' || raw === 'intersect') return raw;
  throw new BlockedCapabilityError('mirror-operation', `${feature.name} 未支持的 mirror operation：${raw}`);
}

/** mirror（T5 首切片）：仅世界基准面 XY/YZ/XZ + 整件镜像（keepOriginal 恒 true）。 */
function mirrorOp(feature: ScenarioFeature): TranslatedStep {
  const plane = stringParam(feature.params, 'plane');
  const planeLineRaw = asRecord(feature.params.planeLine);
  const operation = mirrorOperation(feature);
  const newBodyApproximation = booleanParam(feature.params, 'newBodyApproximation') === true;
  if (plane === undefined && planeLineRaw !== undefined) {
    const originRaw = asRecord(planeLineRaw.origin);
    const normalRaw = asRecord(planeLineRaw.normal);
    const vec = (value: Record<string, unknown> | undefined): { x: number; y: number; z: number } | undefined => {
      if (value === undefined) return undefined;
      const x = value.x, y = value.y, z = value.z;
      return typeof x === 'number' && Number.isFinite(x)
        && typeof y === 'number' && Number.isFinite(y)
        && typeof z === 'number' && Number.isFinite(z) ? { x, y, z } : undefined;
    };
    const origin = vec(originRaw);
    const normal = vec(normalRaw);
    if (origin === undefined || normal === undefined)
      throw new BlockedCapabilityError('mirror-plane', `${feature.name} planeLine 缺失/非有限数`);
    if (normal.x === 0 && normal.y === 0 && normal.z === 0)
      throw new BlockedCapabilityError('mirror-plane', `${feature.name} planeLine.normal 为零向量`);
    const planeApprox = booleanParam(feature.params, 'planeApprox') === true;
    const featureAllApproximation = booleanParam(feature.params, 'featureAllApproximation') === true;
    const notes = ['mirror planeLine（任意世界平面）'];
    if (planeApprox) notes.push('镜像面由源 extrude 端盖静态推导（平面位置近似，未经实体面复核）');
    if (featureAllApproximation) notes.push('mirror FEATURE_ALL 以整件镜像近似（含切除时语义不保真）');
    if (newBodyApproximation) notes.push('mirror 新建独立体需多体输出（ADR-0015），回放合并为单 body');
    if (operation !== undefined && operation !== 'unite') notes.push(`mirror operation=${operation}`);
    return {
      scenario: feature,
      op: {
        kind: 'insertFeature',
        featureType: 'mirror',
        params: {
          planeLine: { origin, normal },
          keepOriginal: true,
          ...(operation !== undefined && operation !== 'unite' ? { operation } : {}),
        },
      },
      notes,
      approximate: planeApprox || featureAllApproximation || newBodyApproximation,
    };
  }
  if (plane !== 'XY' && plane !== 'YZ' && plane !== 'XZ') {
    throw new BlockedCapabilityError('mirror-plane', `${feature.name} 镜像面未映射：${String(plane)}`);
  }
  const featureAllApproximation = booleanParam(feature.params, 'featureAllApproximation') === true;
  const notes = [featureAllApproximation
    ? 'mirror FEATURE_ALL 以整件镜像近似（含切除时语义不保真）'
    : 'mirror=world-plane，整件镜像（T5 首切片）'];
  if (newBodyApproximation) notes.push('mirror 新建独立体需多体输出（ADR-0015），回放合并为单 body');
  if (operation !== undefined && operation !== 'unite') notes.push(`mirror operation=${operation}`);
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'mirror',
      params: {
        plane,
        keepOriginal: true,
        ...(operation !== undefined && operation !== 'unite' ? { operation } : {}),
      },
    },
    notes,
    approximate: featureAllApproximation || newBodyApproximation,
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
 * v1.42+（ADR-0007 切片 2）：scenario featurePattern → FeatureOp featurePattern。
 * 场景里的 `sourceFeatureId` 是 Onshape 原始 id，翻译期经 featureIdBySource 换成
 * 本地 featureId（源特征必须先建链）；轴线段为世界坐标（converter 由圆柱轴解析）。
 */
function featurePatternOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = feature.params;
  const sourceRaw = stringParam(params, 'sourceFeatureId');
  const sourceListRaw = Array.isArray(params.sourceFeatureIds)
    ? params.sourceFeatureIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;
  if (sourceRaw !== undefined && sourceListRaw !== undefined)
    throw new BlockedCapabilityError('feature-pattern-source', `${feature.name}: sourceFeatureId 与 sourceFeatureIds 同时存在`);
  if (sourceRaw === undefined && (sourceListRaw === undefined || sourceListRaw.length === 0))
    throw new BlockedCapabilityError('feature-pattern-source', `${feature.name}: 缺少 sourceFeatureId/sourceFeatureIds`);
  const sourcesRaw = sourceListRaw ?? [sourceRaw!];
  if (new Set(sourcesRaw).size !== sourcesRaw.length)
    throw new BlockedCapabilityError('feature-pattern-source', `${feature.name}: 源特征重复`);
  const sourcesLocal: string[] = [];
  for (const raw of sourcesRaw) {
    const local = context.featureIdBySource?.get(raw);
    if (local === undefined)
      throw new BlockedCapabilityError(
        'feature-pattern-source',
        `${feature.name}: 源特征 ${raw} 尚未建链（featureIdBySource 缺失）`,
      );
    sourcesLocal.push(local);
  }
  const kind = stringParam(params, 'kind');
  if (kind !== 'linear' && kind !== 'circular')
    throw new BlockedCapabilityError('feature-pattern-kind', `${feature.name}: 未知 kind ${String(kind)}`);
  const count = numberParam(params, 'count');
  if (count === undefined || !Number.isInteger(count) || count < 2 || count > 1000)
    throw new BlockedCapabilityError('feature-pattern-count', `${feature.name}: count 非法 ${String(count)}`);
  const axisRaw = asRecord(params.axis);
  const originRaw = asRecord(axisRaw?.origin);
  const directionRaw = asRecord(axisRaw?.direction);
  const vec = (value: Record<string, unknown> | undefined): { x: number; y: number; z: number } | undefined => {
    if (value === undefined) return undefined;
    const x = value.x, y = value.y, z = value.z;
    return typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)
      && typeof z === 'number' && Number.isFinite(z) ? { x, y, z } : undefined;
  };
  const origin = vec(originRaw);
  const direction = vec(directionRaw);
  if (origin === undefined || direction === undefined)
    throw new BlockedCapabilityError('feature-pattern-axis', `${feature.name}: axis 线段缺失/非有限数`);
  if (direction.x === 0 && direction.y === 0 && direction.z === 0)
    throw new BlockedCapabilityError('feature-pattern-axis', `${feature.name}: axis.direction 为零向量`);
  const spacing = numberParam(params, 'spacing');
  const angle = numberParam(params, 'angle');
  if (kind === 'linear' && (spacing === undefined || !(spacing > 0)))
    throw new BlockedCapabilityError('feature-pattern-spacing', `${feature.name}: linear spacing 须 >0`);
  if (kind === 'circular' && (angle === undefined || !(angle > 0 && angle <= 360)))
    throw new BlockedCapabilityError('feature-pattern-angle', `${feature.name}: circular angle 须在 (0,360]`);
  // linear 方向取自草图线 p1→p2；Onshape edge 真实方向（可能反向）未采集，
  // 回放必须标近似，不能当 exact。
  // v1.49（ADR-0007 切片 6）：居中阵列；count 为总实例数（含原件，须奇数）。
  const centered = booleanParam(params, 'centered') === true;
  if (centered && kind !== 'linear')
    throw new BlockedCapabilityError('feature-pattern-centered', `${feature.name}: centered 仅支持 linear`);
  if (centered && count % 2 !== 1)
    throw new BlockedCapabilityError('feature-pattern-centered', `${feature.name}: centered count 必须为奇数`);
  // v1.61（ADR-0007 切片 10）：第二方向网格（仅 linear）。
  const secondRaw = asRecord(params.secondDirection);
  let secondDirection:
    | { count: number; spacing?: number; centered?: boolean; axis: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } } }
    | undefined;
  if (secondRaw !== undefined) {
    if (kind !== 'linear')
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向仅支持 linear`);
    const secondCount = numberParam(secondRaw, 'count');
    if (secondCount === undefined || !Number.isInteger(secondCount) || secondCount < 2 || secondCount > 1000)
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向 count 非法 ${String(secondCount)}`);
    const secondSpacing = numberParam(secondRaw, 'spacing');
    if (secondSpacing === undefined || !(secondSpacing > 0))
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向 spacing 须 >0`);
    const secondCentered = booleanParam(secondRaw, 'centered') === true;
    if (secondCentered && secondCount % 2 !== 1)
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向 centered count 必须为奇数`);
    if (count * secondCount > 1000)
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 两方向总实例数超过 1000`);
    const secondAxisRaw = asRecord(secondRaw.axis);
    const secondOrigin = vec(asRecord(secondAxisRaw?.origin));
    const secondDir = vec(asRecord(secondAxisRaw?.direction));
    if (secondOrigin === undefined || secondDir === undefined)
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向 axis 缺失/非有限数`);
    if (secondDir.x === 0 && secondDir.y === 0 && secondDir.z === 0)
      throw new BlockedCapabilityError('feature-pattern-second-direction', `${feature.name}: 第二方向 axis.direction 为零向量`);
    secondDirection = {
      count: secondCount,
      spacing: secondSpacing,
      ...(secondCentered ? { centered: true } : {}),
      axis: { origin: secondOrigin, direction: secondDir },
    };
  }
  // linear 方向取自草图线 p1→p2；Onshape edge 真实方向（可能反向）未采集，
  // 回放必须标近似，不能当 exact。
  const directionRisk = params.directionRisk === true;
  const notes = [
    sourcesRaw.length === 1
      ? `featurePattern source=${sourcesRaw[0]}→${sourcesLocal[0]} kind=${kind} count=${count}（converter pattern）`
      : `featurePattern sources=${sourcesRaw.length} kind=${kind} count=${count}（converter pattern 多源）`,
  ];
  if (centered) notes.push('居中阵列（seed 居中，实例 ±k·spacing）');
  if (secondDirection) notes.push(`第二方向 ${secondDirection.count}×spacing ${secondDirection.spacing}（网格）`);
  if (directionRisk) notes.push('方向取自草图线 p1→p2，与 Onshape edge 方向一致性未验证（近似）');
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'featurePattern',
      params: {
        ...(sourcesRaw.length === 1
          ? { sourceFeatureId: sourcesLocal[0]! }
          : { sourceFeatureIds: sourcesLocal }),
        kind,
        count,
        ...(kind === 'linear' ? { spacing } : { angle }),
        axis: { origin, direction },
        ...(centered ? { centered: true } : {}),
        ...(secondDirection ? { secondDirection } : {}),
      },
    },
    notes,
    approximate: directionRisk,
  };
}

/**
 * v1.47（ADR-0011 切片 3）：scenario featureMirror → FeatureOp featureMirror。
 * 源特征 id 经 featureIdBySource 换本地 id；世界平面线段透传（normal 非零）。
 */
function featureMirrorOp(feature: ScenarioFeature, context: TranslateContext): TranslatedStep {
  const params = feature.params;
  const sourceRaw = stringParam(params, 'sourceFeatureId');
  const sourceListRaw = Array.isArray(params.sourceFeatureIds)
    ? params.sourceFeatureIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;
  if (sourceRaw !== undefined && sourceListRaw !== undefined)
    throw new BlockedCapabilityError('feature-mirror-source', `${feature.name}: sourceFeatureId 与 sourceFeatureIds 同时存在`);
  if (sourceRaw === undefined && (sourceListRaw === undefined || sourceListRaw.length === 0))
    throw new BlockedCapabilityError('feature-mirror-source', `${feature.name}: 缺少 sourceFeatureId/sourceFeatureIds`);
  const sourcesRaw = sourceListRaw ?? [sourceRaw!];
  if (new Set(sourcesRaw).size !== sourcesRaw.length)
    throw new BlockedCapabilityError('feature-mirror-source', `${feature.name}: 源特征重复`);
  const sourcesLocal: string[] = [];
  for (const raw of sourcesRaw) {
    const local = context.featureIdBySource?.get(raw);
    if (local === undefined)
      throw new BlockedCapabilityError(
        'feature-mirror-source',
        `${feature.name}: 源特征 ${raw} 尚未建链（featureIdBySource 缺失）`,
      );
    sourcesLocal.push(local);
  }
  const plane = asRecord(params.planeLine);
  const originRaw = asRecord(plane?.origin);
  const normalRaw = asRecord(plane?.normal);
  const vec = (value: Record<string, unknown> | undefined): { x: number; y: number; z: number } | undefined => {
    if (value === undefined) return undefined;
    const x = value.x, y = value.y, z = value.z;
    return typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)
      && typeof z === 'number' && Number.isFinite(z) ? { x, y, z } : undefined;
  };
  const origin = vec(originRaw);
  const normal = vec(normalRaw);
  if (origin === undefined || normal === undefined)
    throw new BlockedCapabilityError('feature-mirror-plane', `${feature.name}: planeLine 缺失/非有限数`);
  if (normal.x === 0 && normal.y === 0 && normal.z === 0)
    throw new BlockedCapabilityError('feature-mirror-plane', `${feature.name}: planeLine.normal 为零向量`);
  const planeApprox = booleanParam(params, 'planeApprox') === true;
  const newBodyApproximation = booleanParam(params, 'newBodyApproximation') === true;
  const notes = [sourcesRaw.length === 1
    ? `featureMirror source=${sourcesRaw[0]}→${sourcesLocal[0]}（converter FEATURE mirror）`
    : `featureMirror sources=${sourcesRaw.length}（converter FEATURE mirror 多源）`];
  if (planeApprox) notes.push('镜像面由源 extrude 端盖静态推导（平面位置近似，未经实体面复核）');
  if (newBodyApproximation) notes.push('mirror 新建独立体需多体输出（ADR-0015），回放按源操作合并');
  return {
    scenario: feature,
    op: {
      kind: 'insertFeature',
      featureType: 'featureMirror',
      params: sourcesRaw.length === 1
        ? { sourceFeatureId: sourcesLocal[0]!, planeLine: { origin, normal } }
        : { sourceFeatureIds: sourcesLocal, planeLine: { origin, normal } },
    },
    notes,
    approximate: planeApprox || newBodyApproximation,
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
    case 'faceExtrude':
      return faceExtrudeOp(feature);
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
    case 'transform':
      return transformOp(feature, context);
    case 'featurePattern':
      return featurePatternOp(feature, context);
    case 'featureMirror':
      return featureMirrorOp(feature, context);
    case 'booleanAdd':
    case 'booleanSubtract':
    case 'shell':
      return shellOp(feature, context);
    case 'pattern':
    case 'loft':
    case 'sweep':
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
