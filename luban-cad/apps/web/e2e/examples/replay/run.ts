/**
 * Scenario runner（test-only）：顺序 apply translator 产出的 FeatureOp。
 *
 * 首版全部走标准 RPC（同一 LubanFeatureRpcInterface/事务/写租约），用于验证
 * registry + 多 PS 基础设施；UI 对话框路径由各能力的真实 e2e 单独覆盖。
 * 每个被近似的步骤写入 notes，调用方必须落到 manifest。
 */
import type { Page } from '@playwright/test';
import type {
  FeatureOpResult,
  FilletEdgeRef,
  LubanTopologyId,
  RegionBoundsMm,
  SketchPlaneDto,
  SketchRegionDto,
} from '@luban-cad/shared';
import {
  imprintEdgeSideFromSign,
  pickImprintRegionByEdgeSide,
  resolveImprintEdgeGeometry,
  selectProfileRegionsByArea,
  type RegionCentroidMm,
  type RegionFaceEvidence,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getBodiesRpc,
  getMassPropertiesRpc,
  getSketchRpc,
  releaseWriteLease,
  type BSeedEditorContext,
} from '../../helpers.js';
import {
  dominantImprintRegion,
  imprintSideFromSign,
  imprintSignFromQuery,
  mergeImprintRegions,
  pickImprintRegion,
  type ImprintSide,
} from './imprint-region.js';
import { selectEdgeTargetBody } from './multi-body-anchor.js';
import { resolveRegionsFromProfileEntities } from './region-entity-resolver.js';
import type { ImprintFaceResolution } from './imprint-face-resolver.js';
import type { CapFaceStartResolution } from './cap-face-start-resolver.js';
import {
  BlockedCapabilityError,
  translateScenarioFeature,
  type ParityScenario,
  type ScenarioFeature,
} from './scenario-to-op.js';

export interface RunScenarioOptions {
  /**
   * 仅用于已知 converter 约束 refs 不可靠的示例：保留 Onshape 解算坐标，
   * 不把残缺/错误 constraints 送 solver。调用方必须在 notes/registry 记录
   * `constraints=dropped`，不能宣称约束树完整。
   */
  skipSketchConstraints?: boolean;
  /**
   * fillet/chamfer 的边语义解析器（CAP_EDGE/SWEPT_EDGE → 持久边引用）。
   * 未提供时 translator 对 fillet/chamfer 抛 BlockedCapabilityError（诚实阻塞）。
   */
  edgeResolver?: (
    feature: ScenarioFeature,
    scenario: ParityScenario,
    /** v1.50：该步时点的 body 谱系（多体 resolver 用 operationSourceIds 限定候选体）。 */
    bodyContext: {
      bodyKeyBySource?: ReadonlyMap<string, string>;
      allBodyKeys?: readonly string[];
    },
  ) => Promise<{ refs: FilletEdgeRef[]; notes: string[]; bodyKeys?: string[] }>;
  /**
   * shell 移除面解析器（面 query → 持久面引用）。未提供时 translator 对 shell
   * 诚实阻塞；解析失败同样阻塞，绝不任取一面。
   */
  shellFaceResolver?: (
    feature: ScenarioFeature,
    scenario: ParityScenario,
    context: {
      bodyKeyBySource?: ReadonlyMap<string, string>;
      allBodyKeys?: readonly string[];
    },
  ) => Promise<{ refs: LubanTopologyId[]; notes: string[]; targetBodyKey?: string }>;
  /**
   * A1（test-only）：非 NEW imprintFace 拉伸的“整个草图区域 == 当前 body 平面面”
   * 匹配。成功时该步改走产品 faceExtrude；失败返回 ok:false 并回退既有草图面域近似。
   */
  /**
   * 能力覆盖轨（非严格轨）：把带拔模的 extrude 按直壁近似回放并显式标
   * approximate。仅用于 parallel capability-coverage 示例；严格轨必须保持 false
   * （translator 默认拔模即阻塞，禁止静默近似）。
   */
  allowApproximateDraft?: boolean;
  imprintFaceResolver?: (
    feature: ScenarioFeature,
    scenario: ParityScenario,
    data: {
      plane: SketchPlaneDto | undefined;
      regions: readonly SketchRegionDto[];
      regionIndices: readonly number[];
    },
  ) => Promise<ImprintFaceResolution>;
  /**
   * ADR-0016 A3（test-only）：S10 CAP_FACE profile 起始面解析。converter 输出
   * `selection.kind='capFaceProfile'` + 起始面证据；本回调在步骤时点把证据解析为
   * 持久 bodyId/faceRef，runner 随即改走产品 faceExtrude。未提供/解析失败一律
   * 阻塞（不退回 startOffset 近似；那条路径只保留给 start-reference 家族）。
   */
  capFaceResolver?: (
    feature: ScenarioFeature,
    scenario: ParityScenario,
    bodyContext: {
      bodyKeyBySource?: ReadonlyMap<string, string>;
      allBodyKeys?: readonly string[];
    },
  ) => Promise<CapFaceStartResolution>;
}

/** 面域包围盒（草图局部 mm）；无 outerBoundary 时返回 undefined（selector 失败闭合）。 */
function regionBounds(region: SketchRegionDto): RegionBoundsMm | undefined {
  const pts = region.outerBoundary ?? [];
  if (pts.length === 0) return undefined;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/**
 * 外环多边形的面积加权质心（mm）。仅作面选择证据的辅助 oracle；带孔面域
 * 的 Onshape 面质心含孔修正，因此调用方必须用有界容差，并在多解/失配时
 * 保持 blocked-selector，不得把该近似质心当精确几何事实。
 */
function regionCentroid(region: SketchRegionDto): RegionCentroidMm | undefined {
  // 带孔面域的外环质心不是面质心；分量证据只在无孔时启用，避免用错误质心
  // 匹配 Onshape face。含孔面域由调用方保持 blocked-selector（不猜）。
  if ((region.holeEntityIds?.length ?? 0) > 0 || (region.holeBoundaries?.length ?? 0) > 0) return undefined;
  const pts = region.outerBoundary ?? [];
  if (pts.length < 3) return undefined;
  let twiceArea = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    xSum += (a.x + b.x) * cross;
    ySum += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) return undefined;
  return { x: xSum / (3 * twiceArea), y: ySum / (3 * twiceArea) };
}

type Segment2 = readonly [number, number, number, number];
const SEGMENT_EPS = 1e-6;

function boundarySegments(points: readonly { x: number; y: number }[]): Segment2[] {
  if (points.length < 2) return [];
  const segments: Segment2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) > SEGMENT_EPS) segments.push([a.x, a.y, b.x, b.y]);
  }
  return segments;
}

/** 两线段共线且正长度重叠（不只共享端点）；端点容差 1e-6mm。 */
function segmentsOverlap(a: Segment2, b: Segment2): boolean {
  const [ax0, ay0, ax1, ay1] = a;
  const [bx0, by0, bx1, by1] = b;
  const adx = ax1 - ax0;
  const ady = ay1 - ay0;
  const alen = Math.hypot(adx, ady);
  if (alen <= SEGMENT_EPS) return false;
  const cross = (px: number, py: number) => Math.abs(adx * (py - ay0) - ady * (px - ax0)) / alen;
  if (cross(bx0, by0) > SEGMENT_EPS || cross(bx1, by1) > SEGMENT_EPS) return false;
  const ux = adx / alen;
  const uy = ady / alen;
  const project = (px: number, py: number) => (px - ax0) * ux + (py - ay0) * uy;
  const b0 = project(bx0, by0);
  const b1 = project(bx1, by1);
  const low = Math.max(0, Math.min(b0, b1));
  const high = Math.min(alen, Math.max(b0, b1));
  return high - low > SEGMENT_EPS;
}

/**
 * 面域邻接表：只有共享**边界线段**（正长度重叠）才相邻。仅共享草图实体 id
 * 不够——一条贯穿多格的网格线会是多个不相邻格的共同 outerEntityId；仅共享
 * 顶点（对角格）也不算相邻。缺 outerBoundary 的复杂面域不连通，分量证据
 * 由 shared fail closed，不猜。
 */
function regionAdjacency(regions: readonly SketchRegionDto[]): number[][] {
  const segments = regions.map((region) => boundarySegments(region.outerBoundary ?? []));
  const adjacency = Array.from({ length: regions.length }, () => new Set<number>());
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (segments[i]!.some((a) => segments[j]!.some((b) => segmentsOverlap(a, b)))) {
        adjacency[i]!.add(j);
        adjacency[j]!.add(i);
      }
    }
  }
  return adjacency.map((neighbors) => [...neighbors].sort((a, b) => a - b));
}

/**
 * 多体模型中无 booleanScope 的 insertFeature 需要显式 targetBodyId（产品契约
 * 禁止隐式全局链尾）。按场景顺序回溯最近的造体特征，取该特征谱系当前对应的
 * active body 作为锚定；结果写入 notes，可审计。
 */
function mostRecentCreatorBody(
  features: readonly ScenarioFeature[],
  currentIndex: number,
  bodyKeyBySource: ReadonlyMap<string, string> | undefined,
  allBodyKeys: readonly string[],
): string | undefined {
  for (let index = currentIndex - 1; index >= 0; index--) {
    const source = features[index]?.sourceFeatureId;
    if (!source) continue;
    const key = bodyKeyBySource?.get(source);
    if (key !== undefined && allBodyKeys.includes(key)) return key;
  }
  return allBodyKeys[0];
}

export interface RunScenarioResult {
  featureIds: string[];
  notes: string[];
  approximateSteps: number;
  steps: Array<{
    feature: string;
    /** 场景逻辑类型（imprintFace 被改走 faceExtrude 时仍保留原始 'extrude'）。 */
    type: string;
    /** 实际写入产品的 FeatureType（如 'faceExtrude'）；缺省同 type。 */
    opFeatureType?: string;
    featureId?: string;
    notes: string[];
    approximate: boolean;
  }>;
}

/** Apply a whole scenario to the given Part Studio scope. */
export async function runScenario(
  ctx: BSeedEditorContext,
  scenario: ParityScenario,
  accessToken: string,
  options: RunScenarioOptions = {},
): Promise<RunScenarioResult> {
  const lease = await borrowWriteLease(ctx, accessToken, `scenario:${scenario.id}`);
  const sketchIdBySource = new Map<string, string>();
  const sketchPlaneBySource = new Map<string, SketchPlaneDto>();
  const localFeatureIdBySource = new Map<string, string>();
  // body 谱系：body 被后续 ADD/REMOVE 改写后 sourceFeatureId 会变成最新特征，
  // 但 Onshape 的 booleanScope 仍引用最初创建该 body 的特征。按 bodyKey 保留
  // 历史别名（仅当该 body 仍 active），避免把合法 scope 误判为无 body。
  const bodyKeyAliases = new Map<string, string>();
  // 已应用特征（本地 featureId → scenario 特征）用于 body 谱系回溯：body 的
  // sourceFeatureId 指向最近修改它的特征（可能是 fillet），沿场景特征顺序回溯到
  // 最近的造体特征即可恢复 Onshape body 引用所指向的 extrude/revolve。
  const scenarioFeatureByLocalId = new Map<string, ScenarioFeature>();
  const BODY_CREATOR_TYPES = new Set(['extrude', 'revolve', 'booleanBodies', 'booleanAdd', 'booleanSubtract']);
  const MULTI_BODY_ANCHOR_TYPES = new Set(['extrude', 'revolve', 'hole', 'faceExtrude', 'featurePattern', 'mirror']);
  let latestSketchId: string | undefined;
  const featureIds: string[] = [];
  const notes: string[] = [];
  let approximateSteps = 0;
  const steps: RunScenarioResult['steps'] = [];

  try {
    const scenarioFeatures = scenario.features as ScenarioFeature[];
    for (let featureIndex = 0; featureIndex < scenarioFeatures.length; featureIndex++) {
      const feature = scenarioFeatures[featureIndex]!;
      // imprintFace 解析（test-only）：Onshape 的 imprint FACE 查询根节点是
      // `<sketchId>.imprint`——它指向**草图面/材料面域**，不是实体 BRep 面
      // （2026-11-06 真栈实证：iOS Extrude 1 顶盖是单一外环+两孔面，不存在环
      // 面片；实体 FACE 查询只出现在 CAP_FACE/SWEPT_FACE 派生边语义）。
      // 因此按面域回放：逐查询用 imprint 有向边侧（+1=左、-1=右）选面域，
      // 多查询合并为一次 extrude.regions；face split 不参与。
      // 2026-11-09：边侧语义由 shared `pickImprintRegionByEdgeSide` 精确实现；
      // 仅当全部查询都走精确选择时才不标 approximate（First Part 357566 vs
      // 目标 357568 的 0.0006% 尾部差来自数值积分/圆角）。未识别/回退/主导收敛
      // 时保留近似登记——绝不猜。
      let effectiveFeature = feature;
      const imprintNotes: string[] = [];
      let imprintApproximate = false;
      let imprintAllExact = true;
      // ADR-0016 A3：S10 面驱动 CAP_FACE profile（converter `capFaceProfile`）。
      // 必须在 bodyContext 建好之后解析起始面（见下方 capFaceResolver 分支）。
      const originalSelection = (feature.params as { selection?: { kind?: string } }).selection;
      const isCapFaceProfile = feature.type === 'extrude' && originalSelection?.kind === 'capFaceProfile';
      const capFaceNotes: string[] = [];
      if (feature.type === 'extrude') {
        const selection = (feature.params as {
          selection?: {
            kind?: string;
            sketchFeatureId?: string;
            sketchEntityId?: number;
            queryString?: string;
            imprintSign?: number;
            startOffsetMm?: number;
            oppositeDirection?: boolean;
            /** CAP_FACE `originalSetDisambiguation` 边界边 → 上游草图面域（P2.1b）。 */
            capFaceEdges?: { sketchFeatureId?: string; entityIds?: number[] };
            queries?: Array<{
              sketchFeatureId?: string;
              sketchEntityId?: number;
              queryString?: string;
              imprintSign?: number;
            }>;
          };
        }).selection;
        // 2026-11-09（P2.1b）：CAP_FACE 起始面的上游也可以是 imprintFace
        // （Drive Sleeve：Extrude 1 帽面）。此时面域仍按 sketch imprint 有向边侧
        // 选；startOffset/direction 由 converter 按草图法向预换算，保留在顶层参数。
        const isCapFace = selection?.kind === 'capFaceExtrude';
        const capFaceEdgeIds = isCapFace && Array.isArray(selection?.capFaceEdges?.entityIds)
          ? selection.capFaceEdges.entityIds.filter((id): id is number => Number.isInteger(id))
          : [];
        const hasCapFaceEdges = capFaceEdgeIds.length > 0;
        if (selection?.kind === 'imprintFace'
          || (isCapFace && ((selection.queries?.length ?? 0) > 0 || hasCapFaceEdges))) {
          const rawQueries = Array.isArray(selection.queries) && selection.queries.length > 0
            ? selection.queries
            : [];
          const queries = rawQueries.length > 0
            ? rawQueries
            : !hasCapFaceEdges ? [{
                sketchFeatureId: selection.sketchFeatureId,
                sketchEntityId: selection.sketchEntityId,
                queryString: selection.queryString,
                imprintSign: selection.imprintSign,
              }] : [];
          const sketchSources = new Set(
            [
              ...queries.map((query) => query.sketchFeatureId),
              ...(isCapFace && selection.capFaceEdges?.sketchFeatureId
                ? [selection.capFaceEdges.sketchFeatureId] : []),
            ].filter((value): value is string => typeof value === 'string'),
          );
          const regions: number[] = [];
          const parts: string[] = [];
          let reason: string | undefined;
          if (sketchSources.size !== 1) {
            reason = `草图来源不唯一（${sketchSources.size}）`;
          } else {
            const sourceSketchId = [...sketchSources][0]!;
            const localSketchId = sketchIdBySource.get(sourceSketchId);
            if (!localSketchId) {
              reason = `草图 ${sourceSketchId} 尚未构建`;
            } else {
              const sketch = await getSketchRpc(ctx, localSketchId, accessToken);
              if (process.env.EXAMPLE_DEBUG_IMPRINT === '1') {
                console.log(
                  `[imprint] ${feature.name} sketch regions=` +
                  JSON.stringify((sketch?.regions ?? []).map((region, index) => ({
                    i: index,
                    area: Number(region.area.toFixed(3)),
                    outer: region.outerEntityIds,
                    hole: region.holeEntityIds ?? [],
                  }))),
                );
              }
              if (process.env.EXAMPLE_DEBUG_REGION_BOUNDS === '1') {
                console.log(
                  `[region-bounds] ${feature.name} ` +
                  JSON.stringify(sketch?.regions ?? []),
                );
              }
              // P2.1b：实体面选择是“这些边界边共同围成的**一个**面”，不是逐边
              // 侧向并集。面域边界包含全部边界边时精确命中；否则回退到逐边侧向。
              let faceRegionPicked = false;
              if (hasCapFaceEdges) {
                const matched = (sketch?.regions ?? []).map((region, index) => {
                  const boundary = new Set([
                    ...(region.outerEntityIds ?? []),
                    ...(region.holeEntityIds ?? []),
                  ]);
                  return { index, boundary };
                }).filter((entry) => capFaceEdgeIds.every((id) => entry.boundary.has(id)));
                if (matched.length > 0) {
                  for (const entry of matched) regions.push(entry.index);
                  parts.push(
                    `CAP_FACE 边界边 ${capFaceEdgeIds.join(',')} → 面域 ${matched.map((entry) => entry.index).join(',')}（全部边在面域边界）`,
                  );
                  faceRegionPicked = true;
                } else {
                  imprintNotes.push(
                    `CAP_FACE 边界边 ${capFaceEdgeIds.join(',')} 无单一面域命中（回退逐边侧向）`,
                  );
                }
              }
              if (!faceRegionPicked) {
                for (const query of queries) {
                  if (typeof query.sketchEntityId !== 'number') {
                    reason = '查询缺 sketchEntityId';
                    imprintAllExact = false;
                    break;
                  }
                  const sign = typeof query.imprintSign === 'number'
                    ? query.imprintSign
                    : imprintSignFromQuery(query.queryString);
                  // v1.63+（2026-11-09）：Onshape 的 +1/−1 是**有向边左/右侧**，
                  // 不是孔侧/外环。优先用 shared 的边侧精确选择；边界/边型不支持时
                  // 才回退旧启发式并保持 approximate 登记。
                  const edgeSide = imprintEdgeSideFromSign(sign);
                  const edge = resolveImprintEdgeGeometry(sketch?.entities ?? [], query.sketchEntityId);
                  const exactPick = edge && edgeSide
                    ? pickImprintRegionByEdgeSide(sketch?.regions, query.sketchEntityId, edge, edgeSide)
                    : undefined;
                  const side: ImprintSide | undefined = imprintSideFromSign(sign);
                  const pick = exactPick ?? pickImprintRegion(sketch?.regions, query.sketchEntityId, side);
                  if (!exactPick) imprintAllExact = false;
                  if (!pick) {
                    reason = `实体 ${query.sketchEntityId} 无${edgeSide ? `边侧 ${edgeSide}` : side ?? '孔洞/外环'}候选面域`;
                    break;
                  }
                  regions.push(pick.regionIndex);
                  parts.push(
                    `实体 ${query.sketchEntityId} ${pick.basis}` +
                    `${exactPick ? `/edge-${edgeSide}` : side ? `/${side}(fallback)` : ''} area=${pick.area.toFixed(3)}`,
                  );
                }
              }
              // 面面积证据（P2.2）：面选择查询被草图内部分割成多个子面时，逐边
              // 查询无法唯一还原整组被选面。若 scenario 带 Onshape 面面积 oracle，
              // 在 product 面域里找唯一子集；非 CAP_FACE 查询必须包含逐边命中。
              const profileAreaMm2 = (feature.params as { profileAreaMm2?: unknown }).profileAreaMm2;
              // 位置证据（bbox）：同面积面域（如 Intro Part 3 的 9 个 645.16mm²
              // 网格）仅按面积多解；Onshape bodydetails 顶面 box 提供第二 oracle。
              const profileBoundsMm = (feature.params as { profileBoundsMm?: RegionBoundsMm }).profileBoundsMm;
              const profileCentroidMm = (feature.params as { profileCentroidMm?: RegionCentroidMm }).profileCentroidMm;
              const profileFaceCentroidsMm =
                (feature.params as { profileFaceCentroidsMm?: readonly RegionFaceEvidence[] }).profileFaceCentroidsMm;
              const adjacentRegions = sketch?.regions ? regionAdjacency(sketch.regions) : undefined;
              let profileAreaSelected = false;
              if (typeof profileAreaMm2 === 'number' && Number.isFinite(profileAreaMm2)
                && (sketch?.regions?.length ?? 0) > 0) {
                const required = isCapFace ? [] : Array.from(new Set(regions));
                const regionAreas = sketch!.regions!.map((region) => ({
                  area: region.area,
                  bounds: regionBounds(region),
                  centroid: regionCentroid(region),
                }));
                // 逐边命中优先作为“必须在选集内”的约束（保留查询选中的位置），
                // 面积证据只负责补全/裁决；只有被逐边约束后无唯一解时才独立按
                // 面积求解（Part 3/4 这类逐边命中本身错的极端情况）。
                // 面面积证据是精确值：主路径用 1e-7 相对容差并关闭 shared 的
                // 1mm² 绝对容差下限（toleranceMm2: 0；约 0.0004mm² @4069），
                // 避免把“面积接近但几何不同”的 5 面域子集也当候选。逐边命中仍
                // 优先作为必须面域；只有无唯一解时才独立按面积求解。该校准回退
                // 同样关闭绝对下限，改用有界 2e-7 相对容差：覆盖 Onshape
                // bodydetails 采集面积与产品面域求值的实测极小差（Drive Sleeve
                // 1.34e-7），仍比 1mm² 绝对下限严格约三个数量级。
                let areaSelection = selectProfileRegionsByArea(regionAreas, profileAreaMm2, {
                  ...(required.length > 0 ? { requireRegions: required } : {}),
                  ...(profileBoundsMm ? { profileBoundsMm } : {}),
                  ...(profileCentroidMm ? { profileCentroidMm } : {}),
                  ...(profileFaceCentroidsMm
                    ? { profileFaceCentroidsMm, ...(adjacentRegions ? { adjacentRegions } : {}) }
                    : {}),
                  toleranceRatio: 1e-7,
                  toleranceMm2: 0,
                });
                let usedRequired = required.length > 0;
                if ((!areaSelection || areaSelection.ambiguous) && required.length > 0) {
                  const withoutRequired = selectProfileRegionsByArea(regionAreas, profileAreaMm2, {
                    ...(profileBoundsMm ? { profileBoundsMm } : {}),
                    ...(profileCentroidMm ? { profileCentroidMm } : {}),
                    ...(profileFaceCentroidsMm
                      ? { profileFaceCentroidsMm, ...(adjacentRegions ? { adjacentRegions } : {}) }
                      : {}),
                    toleranceRatio: 2e-7,
                    toleranceMm2: 0,
                  });
                  if (withoutRequired && !withoutRequired.ambiguous) {
                    areaSelection = withoutRequired;
                    usedRequired = false;
                  }
                }
                if (areaSelection && !areaSelection.ambiguous) {
                  const overridesQueryPicks = !usedRequired
                    && required.some((index) => !areaSelection!.regions.includes(index));
                  regions.length = 0;
                  regions.push(...areaSelection.regions);
                  faceRegionPicked = true;
                  profileAreaSelected = true;
                  parts.push(
                    `profileArea=${profileAreaMm2}mm² → 面域 ${areaSelection.regions.join(',')}` +
                    `（Δ=${areaSelection.delta.toFixed(3)}mm²；Onshape 面面积证据` +
                    `${profileBoundsMm ? `+bbox ${JSON.stringify(profileBoundsMm)}` : ''}` +
                    `${profileCentroidMm ? `+centroid ${JSON.stringify(profileCentroidMm)}` : ''}` +
                    `${profileFaceCentroidsMm ? `+faces ${JSON.stringify(profileFaceCentroidsMm)}` : ''}` +
                    `${overridesQueryPicks ? '；覆盖逐边命中' : ''}）`,
                  );
                } else {
                  imprintNotes.push(
                    `profileArea=${profileAreaMm2}mm² 无唯一面域子集` +
                    `（${areaSelection?.ambiguous ? '多解等距' : '容差内无解'}；保留逐查询结果）`,
                  );
                }
              }
              if (process.env.EXAMPLE_DEBUG_IMPRINT === '1') {
                console.log(
                  `[imprint] ${feature.name}: queries=${JSON.stringify(queries.map((query) => ({
                    s: query.sketchFeatureId, e: query.sketchEntityId, sign: query.imprintSign ?? imprintSignFromQuery(query.queryString),
                  })))} capFaceEdges=${JSON.stringify(capFaceEdgeIds)} regions=${JSON.stringify(regions)} ` +
                  `regionData=${JSON.stringify((sketch?.regions ?? []).map((region, index) => ({
                    i: index, area: region.area, centroid: regionCentroid(region), outer: region.outerEntityIds,
                  })))} ` +
                  `areaSelected=${profileAreaSelected} parts=${JSON.stringify(parts)} notes=${JSON.stringify(imprintNotes)} reason=${reason ?? '-'}`,
                );
              }
              let merged = faceRegionPicked
                ? { regions: Array.from(new Set(regions)), partial: false }
                : mergeImprintRegions(regions, reason);
              if (merged && sketch?.regions) {
                const queryEntityIds = queries
                  .map((query) => query.sketchEntityId)
                  .filter((id): id is number => typeof id === 'number');
                // 仅 NEW：首段轮廓是“草图面本身”，多查询应收敛到大材料面；
                // add/remove 的 imprint 落在已演化 body 的某个子面上，静态收敛会过选。
                const dominantOp = String((feature.params as Record<string, unknown>).operation ?? '').toLowerCase();
                // 面面积证据已是完整选集；不能再被 NEW 主导面域启发式收敛回
                // region 0（Drive Sleeve Extrude 1 曾因此从 8 面域退回单环）。
                const dominant = dominantOp === 'new' && !profileAreaSelected
                  ? dominantImprintRegion(sketch.regions, queryEntityIds, merged.regions)
                  : undefined;
                if (dominant && (merged.regions.length > 1 || !merged.regions.includes(dominant.regionIndex))) {
                  merged = { regions: [dominant.regionIndex], partial: merged.partial };
                  imprintAllExact = false;
                  imprintNotes.push(
                    `imprintFace 多查询收敛到主导面域 ${dominant.regionIndex}` +
                    `（area=${dominant.area.toFixed(3)}；查询边全部位于该面边界）`,
                  );
                }
              }
              if (merged) {
                let usedFaceExtrude = false;
                // A1：非 NEW 且单区域时，尝试把“整面一致”的 imprint 改走 faceExtrude。
                // CAP_FACE 起始面必须走 startOffset 通道，不能被整面 faceExtrude 吞掉偏移。
                if (!isCapFace && options.imprintFaceResolver && merged.regions.length === 1 && sketch?.regions) {
                  const extrudeParams = feature.params as Record<string, unknown>;
                  const operation = String(extrudeParams.operation ?? '').toLowerCase();
                  const endBoundRaw = String(extrudeParams.endBound ?? 'blind')
                    .replace(/[_-]/g, '').toLowerCase();
                  if ((operation === 'add' || operation === 'remove' || operation === 'intersect')
                    && (endBoundRaw === 'blind' || endBoundRaw === 'throughall')) {
                    const resolution = await options.imprintFaceResolver(feature, scenario, {
                      plane: sketchPlaneBySource.get(sourceSketchId),
                      regions: sketch.regions,
                      regionIndices: merged.regions,
                    });
                    if (process.env.EXAMPLE_DEBUG_IMPRINT === '1') {
                      console.log(`[imprint-face] ${feature.name}: ` + (resolution.ok
                        ? `face=${resolution.bodyId}:${resolution.faceSubEntityId}`
                        : `fallback=${resolution.reason}`));
                    }
                    if (resolution.ok) {
                      effectiveFeature = {
                        ...feature,
                        type: 'faceExtrude',
                        params: {
                          bodyId: resolution.bodyId,
                          faceRef: resolution.faceRef,
                          operation,
                          endBound: endBoundRaw === 'throughall' ? 'throughAll' : 'blind',
                          ...(typeof extrudeParams.depthMm === 'number'
                            ? { depthMm: extrudeParams.depthMm } : {}),
                          direction: extrudeParams.oppositeDirection === true ? 'backward' : 'forward',
                        },
                      };
                      imprintNotes.push(`${resolution.note}（A1 整面匹配，标近似）`);
                      imprintApproximate = true;
                      imprintAllExact = false;
                      usedFaceExtrude = true;
                    } else {
                      imprintNotes.push(
                        `imprintFace 实体面未匹配：${resolution.reason}（回退草图面域近似）`,
                      );
                    }
                  }
                }
                if (!usedFaceExtrude) {
                  effectiveFeature = {
                    ...feature,
                    params: {
                      ...feature.params,
                      selection: {
                        kind: 'sketchRegions',
                        sketchFeatureId: sourceSketchId,
                        regionIndex: merged.regions[0],
                        regions: merged.regions,
                      },
                    },
                  };
                  const capFaceOffsets = isCapFace
                    ? `startOffset=${selection.startOffsetMm ?? '?'}mm/` +
                      `direction=${selection.oppositeDirection ? 'backward' : 'forward'}；`
                    : '';
                  imprintNotes.push(
                    `${isCapFace ? 'CAP_FACE 起始面→上游 imprint 草图面域' : 'imprintFace→草图面域'} ` +
                    `${merged.regions.join(',')}（${capFaceOffsets}${parts.join('；')}；` +
                    (merged.partial ? `部分查询未解析：${reason}；` : '') +
                    (imprintAllExact
                      ? '有向边左/右侧精确选择）'
                      : 'face split 未实现，近似）'),
                  );
                  if (!imprintAllExact || merged.partial) imprintApproximate = true;
                }
              }
            }
          }
          if (reason !== undefined) {
            imprintAllExact = false;
            imprintApproximate = true;
            imprintNotes.push(
              `${isCapFace ? 'CAP_FACE 起始面' : 'imprintFace'} 保留原查询近似：${reason}`,
            );
          }
        }
      }
      // 面面积证据（P2.3）：qSketchRegion 的 Onshape deterministicIds 数量/顺序
      // 没有产品面域语义（Alignment 4 个 id ↔ 产品 2 个面域；iOS 3 个 id 恰好是
      // 3 个材料面域但仍是前缀）。scenario 带 profileAreaMm2 时，用产品面域面积
      // 找唯一子集（与 imprintFace 面积证据同一 shared selector、同一 1e-7 相对
      // 容差且 toleranceMm2:0 关闭绝对下限，未放宽）；scenario 声明的 regions 必须
      // 是非空、非负整数且不重复，并与面积唯一解完全一致，否则 fail closed——
      // 不按前缀/顺序猜、不静默过滤畸形声明。唯一解时同时移除 selection 与顶层
      // params 的 regionRisk（不再标近似）。
      //
      // 只处理**原始** selection 就是 sketchRegions 的特征。P2.2 会把 imprintFace/
      // capFaceExtrude 改写成 sketchRegions 且保留 profileAreaMm2/profileBoundsMm；
      // 那条路径已用逐边命中作 requireRegions 消费证据，若此处再跑一次无 required
      // 的选集，会把 P2.2 的合法结果重新裁决甚至误阻塞（Drive Sleeve/Intro）。
      const originalSelectionKind = (feature.params as { selection?: { kind?: string } }).selection?.kind;
      let sketchRegionAreaNote: string | undefined;
      if (effectiveFeature.type === 'extrude' && originalSelectionKind === 'sketchRegions') {
        const areaParams = effectiveFeature.params as {
          profileAreaMm2?: unknown;
          profileBoundsMm?: RegionBoundsMm;
          profileCentroidMm?: RegionCentroidMm;
          profileFaceCentroidsMm?: readonly RegionFaceEvidence[];
          selection?: {
            kind?: string;
            sketchFeatureId?: string;
            regions?: unknown;
            regionIndex?: unknown;
            regionRisk?: boolean;
            [key: string]: unknown;
          };
        };
        const areaSelectionRaw = areaParams.selection;
        if (areaSelectionRaw?.kind === 'sketchRegions'
          && typeof areaParams.profileAreaMm2 === 'number'
          && Number.isFinite(areaParams.profileAreaMm2)) {
          const sourceSketchId = areaSelectionRaw.sketchFeatureId;
          const localSketchId = sourceSketchId ? sketchIdBySource.get(sourceSketchId) : undefined;
          if (!localSketchId) {
            throw new BlockedCapabilityError(
              'region-selector',
              `${feature.name} 面积证据草图 ${sourceSketchId ?? '?'} 尚未构建`,
            );
          }
          const sketch = await getSketchRpc(ctx, localSketchId, accessToken);
          const regionAreas = (sketch?.regions ?? []).map((region) => ({
            area: region.area,
            bounds: regionBounds(region),
            centroid: regionCentroid(region),
          }));
          const areaSelection = selectProfileRegionsByArea(regionAreas, areaParams.profileAreaMm2, {
            toleranceRatio: 1e-7,
            toleranceMm2: 0,
            ...(areaParams.profileBoundsMm ? { profileBoundsMm: areaParams.profileBoundsMm } : {}),
            ...(areaParams.profileCentroidMm ? { profileCentroidMm: areaParams.profileCentroidMm } : {}),
            ...(areaParams.profileFaceCentroidsMm
              ? {
                  profileFaceCentroidsMm: areaParams.profileFaceCentroidsMm,
                  adjacentRegions: regionAdjacency(sketch?.regions ?? []),
                }
              : {}),
          });
          if (!areaSelection || areaSelection.ambiguous) {
            throw new BlockedCapabilityError(
              'region-selector',
              `${feature.name} profileArea=${areaParams.profileAreaMm2}mm² ` +
              `${areaSelection?.ambiguous ? '多解等距' : '容差内无唯一面域子集'}`,
            );
          }
          // scenario 声明的 regions 是证据断言，不是可过滤的提示：非数组、空集、
          // 非整数、负数或重复都必须 fail closed（不得静默丢掉非法值后按剩余值
          // 通过）。
          const declaredRaw = areaSelectionRaw.regions;
          let declared: number[] = [];
          if (declaredRaw !== undefined) {
            const isNonEmptyIntegerArray = Array.isArray(declaredRaw)
              && declaredRaw.length > 0
              && declaredRaw.every((value) => typeof value === 'number'
                && Number.isInteger(value) && value >= 0);
            const hasDuplicates = isNonEmptyIntegerArray
              && new Set(declaredRaw).size !== declaredRaw.length;
            if (!isNonEmptyIntegerArray || hasDuplicates) {
              throw new BlockedCapabilityError(
                'region-selector',
                `${feature.name} scenario 声明 regions 非法：${JSON.stringify(declaredRaw)}` +
                `（必须是非空、非负整数且不重复）`,
              );
            }
            declared = declaredRaw as number[];
          }
          if (declared.length > 0
            && (declared.length !== areaSelection.regions.length
              || declared.some((value, index) => value !== areaSelection.regions[index]))) {
            throw new BlockedCapabilityError(
              'region-selector',
              `${feature.name} 面积证据选集 ${JSON.stringify(areaSelection.regions)} ` +
              `与 scenario 声明 ${JSON.stringify(declared)} 不一致`,
            );
          }
          const {
            regionRisk: _regionRisk,
            regions: _regions,
            regionIndex: _regionIndex,
            ...areaSelectionRest
          } = areaSelectionRaw;
          const {
            regionRisk: _topLevelRegionRisk,
            ...areaParamsRest
          } = effectiveFeature.params as Record<string, unknown>;
          effectiveFeature = {
            ...effectiveFeature,
            params: {
              ...areaParamsRest,
              selection: {
                ...areaSelectionRest,
                regions: areaSelection.regions,
                regionIndex: areaSelection.regions[0],
              },
            },
          };
          if (process.env.EXAMPLE_DEBUG_REGIONS === '1') {
            console.log(
              `[regions] ${feature.name} sketch=${sourceSketchId} area=${areaParams.profileAreaMm2} ` +
              `actual=` + JSON.stringify((sketch?.regions ?? []).map((region, index) => ({
                i: index,
                area: region.area,
                centroid: regionCentroid(region),
                outer: region.outerEntityIds,
                hole: region.holeEntityIds ?? [],
              }))) +
              ` selected=${JSON.stringify(areaSelection.regions)} delta=${areaSelection.delta}`,
            );
          }
          sketchRegionAreaNote =
            `profileArea=${areaParams.profileAreaMm2}mm² → 面域 ${areaSelection.regions.join(',')}` +
            `（Δ=${areaSelection.delta.toFixed(6)}mm²；产品面域面积唯一解）` +
            `${declared.length > 0 ? '，与 scenario 声明一致' : ''}`;
        }
      }
      // regionRisk：converter 用 deterministicIds 数量近似多面域选集，可能与实际
      // 面域数不符（单闭环被数成 2/3 个）。用产品真实面域数裁掉越界下标——只保留
      // 实际存在的面域，且必须非空；具体面域语义仍由 regionRisk 标记为待审计。
      let regionAuditNote: string | undefined;
      const regionFeature = effectiveFeature.type === 'extrude' || effectiveFeature.type === 'revolve'
        ? effectiveFeature : undefined;
      if (regionFeature) {
        const p = regionFeature.params as {
          sketchFeatureId?: string;
          regions?: unknown;
          regionRisk?: boolean;
          selection?: { kind?: string; sketchFeatureId?: string; regions?: unknown; regionRisk?: boolean };
        };
        const selection = p.selection;
        const risk = selection?.regionRisk === true || p.regionRisk === true;
        const requested = Array.isArray(selection?.regions)
          ? selection.regions
          : Array.isArray(p.regions) ? p.regions : undefined;
        const sketchSource = selection?.sketchFeatureId ?? p.sketchFeatureId;
        if (risk && requested && sketchSource) {
          const localSketchId = sketchIdBySource.get(sketchSource);
          if (localSketchId !== undefined) {
            const sketch = await getSketchRpc(ctx, localSketchId, accessToken);
            if (process.env.EXAMPLE_DEBUG_REGIONS === '1') {
              console.log(
                `[regions] ${feature.name} sketch=${sketchSource} requested=${JSON.stringify(requested)} actual=` +
                JSON.stringify((sketch?.regions ?? []).map((region, index) => ({
                  i: index, area: Number(region.area.toFixed(3)), outer: region.outerEntityIds, hole: region.holeEntityIds ?? [],
                }))),
              );
            }
            const regionCount = sketch?.regions?.length ?? 0;
            const valid = requested.filter(
              (value): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < regionCount,
            );
            if (valid.length === 0)
              throw new Error(
                `${scenario.id}/${feature.name}: regionRisk 选集 ${JSON.stringify(requested)} ` +
                `与实际 ${regionCount} 个面域无交集`,
              );
            if (valid.length !== requested.length) {
              regionAuditNote = `regionRisk ${JSON.stringify(requested)} → 实际 ${regionCount} 面域，收敛为 ${JSON.stringify(valid)}`;
              effectiveFeature = {
                ...regionFeature,
                params: selection
                  ? {
                      ...p,
                      selection: { ...selection, regions: valid, regionRisk: true },
                    }
                  : { ...p, regions: valid, regionRisk: true },
              };
            }
          }
        }
      }
      let edgeRefsByFeatureName: ReadonlyMap<string, FilletEdgeRef[]> | undefined;
      let edgeBodyKeys: string[] = [];
      const edgeNotes: string[] = [];
      let shellRefsByFeatureName: ReadonlyMap<string, LubanTopologyId[]> | undefined;
      let shellTargetBodyByFeatureName: ReadonlyMap<string, string> | undefined;
      // body 引用（booleanBodies 目标/工具、extrude/revolve/hole 的 booleanScope）
      // 必须在**该步时点**解析：后续特征会改变 body 集。
      const stepParams = effectiveFeature.params as Record<string, unknown>;
      const scopeSources = Array.isArray(stepParams.booleanScopeFeatureIds)
        ? stepParams.booleanScopeFeatureIds.filter((source): source is string => typeof source === 'string')
        : [];
      // v1.50：revolve 轮廓实体 → 产品真实面域（converter `profileEntityIds`）。
      // 显式 `regions`（示例审计覆盖）优先，不被自动覆盖；映射不收敛时沿旧
      // converter 口径（regionIndex/regionRisk）并标近似，绝不静默猜面域。
      // 旧口径对单 query revolve 盲取 region 0，同一草图的多个 NEW revolve 会
      // 全部落进同一面域（Handle Parts 三体实测）。
      let profileRegionNote: string | undefined;
      const profileEntityIds = Array.isArray(stepParams.profileEntityIds)
        ? stepParams.profileEntityIds.filter((id): id is number => Number.isInteger(id) && id > 0)
        : [];
      if (effectiveFeature.type === 'revolve'
        && profileEntityIds.length > 0
        && !Array.isArray(stepParams.regions)) {
        const sketchSource = typeof stepParams.sketchFeatureId === 'string' ? stepParams.sketchFeatureId : undefined;
        const localSketchId = sketchSource ? sketchIdBySource.get(sketchSource) : undefined;
        if (localSketchId !== undefined) {
          const sketch = await getSketchRpc(ctx, localSketchId, accessToken);
          const mapping = resolveRegionsFromProfileEntities(sketch?.regions, profileEntityIds);
          const converged = mapping.regions.length > 0
            && mapping.unmatchedEntityIds.length === 0
            && mapping.ambiguousEntityIds.length === 0;
          if (converged) {
            const rest = { ...stepParams };
            delete rest.regionIndex;
            delete rest.regionRisk;
            delete rest.regionQueryCount;
            effectiveFeature = {
              ...effectiveFeature,
              params: { ...rest, regions: mapping.regions },
            };
            profileRegionNote =
              `profile 实体 ${JSON.stringify(profileEntityIds)} → 面域 ${JSON.stringify(mapping.regions)}` +
              '（SketchRegionDto 边界映射）';
          } else {
            profileRegionNote =
              `profile 实体映射未收敛（regions=${JSON.stringify(mapping.regions)} ` +
              `unmatched=${JSON.stringify(mapping.unmatchedEntityIds)} ` +
              `ambiguous=${JSON.stringify(mapping.ambiguousEntityIds)}），沿用 converter 近似`;
          }
        }
      }
      // 多体 ADD/NEW 无 booleanScope 时产品要求显式 targetBodyId；仅当此前
      // 已出现 ≥2 个造体特征（可能多体）才读 body 集，避免单体示例多付 RPC。
      const priorCreatorCount = scenarioFeatures.slice(0, featureIndex).filter(
        (candidate) => (candidate.type === 'extrude' || candidate.type === 'revolve')
          && (candidate.params?.operation === 'new' || candidate.params?.newBody === true),
      ).length;
      const anchorEligible = MULTI_BODY_ANCHOR_TYPES.has(effectiveFeature.type)
        && scopeSources.length === 0
        && priorCreatorCount >= 2;
      // fillet/chamfer 的边引用本身已确定目标体：多体模型按被选边所在 bodyKey
      // 显式锚定（产品契约禁止隐式链尾）。边缘跨 body 时不做猜测，直接阻塞。
      // v1.50：body 集必须在边解析**之前**读出并传给 resolver——resolver 用
      // selector.operationSourceIds 谱系限定候选 body（Handle Parts 同一草图三
      // revolve 的共享顶点圆边几何相同，不限定会跨 3 body）。
      const edgeBodyContextEligible = (effectiveFeature.type === 'fillet' || effectiveFeature.type === 'chamfer')
        && priorCreatorCount >= 2;
      // transform 的 entities 查询显式给出目标 body 源特征：必须在该步时点解析
      // bodyKey（多体模型禁止隐式链尾）。仅当 scenario 携带源 id 时多付一次 RPC。
      const transformAnchorEligible = effectiveFeature.type === 'transform'
        && Array.isArray(stepParams.targetSourceFeatureIds)
        && stepParams.targetSourceFeatureIds.length > 0;
      // shell 的多体目标同样由面查询源特征决定（resolver 在步骤时点解析 bodyKey）。
      const shellAnchorEligible = effectiveFeature.type === 'shell';
      let bodyContext: {
        bodyKeyBySource?: Map<string, string>;
        allBodyKeys?: string[];
        bodyCentroidByKey?: Map<string, { x: number; y: number; z: number }>;
      } = {};
      if (effectiveFeature.type === 'booleanBodies' || scopeSources.length > 0
        || anchorEligible || edgeBodyContextEligible || transformAnchorEligible || shellAnchorEligible
        || isCapFaceProfile) {
        const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
          (body) => body.active !== false && body.authored !== false,
        );
        const bodyKeyBySource = new Map<string, string>();
        for (const body of bodies) {
          if (typeof body.sourceFeatureId !== 'string') continue;
          bodyKeyBySource.set(body.sourceFeatureId, body.bodyKey);
          // getBodies.sourceFeatureId 是本地 featureId；scenario 的源 id 先经
          // localFeatureIdBySource 映射，保证 step 的源特征可解析到 bodyKey。
          localFeatureIdBySource.forEach((local, source) => {
            if (local === body.sourceFeatureId) bodyKeyBySource.set(source, body.bodyKey);
          });
          // 回溯造体特征：body.sourceFeatureId 可能已被 fillet/hole 等改写。
          // 注意 ADD/revolve-add 只是「修饰已有 body」，其 sourceFeatureId 会覆盖
          // body 的原造体特征；不能在这里停止，否则后续 booleanScope 引用原始
          // extrude/revolve-new 时会找不到 body（Top, Ring, Key 实测）。只有真正
          // 新建 body 的 newBody/extrude-new 才是谱系终点；修饰型 creator 继续回溯。
          const startsNewBody = (candidate: ScenarioFeature): boolean => {
            const p = (candidate.params ?? {}) as Record<string, unknown>;
            if (candidate.type === 'extrude' || candidate.type === 'revolve')
              return p.operation === 'new' || p.newBody === true;
            if (candidate.type === 'booleanBodies' || candidate.type === 'booleanAdd'
              || candidate.type === 'booleanSubtract')
              return true; // 布尔结果 body 的谱系边界：无法继续静态回溯两侧原始体
            return false;
          };
          const sourceFeature = scenarioFeatureByLocalId.get(body.sourceFeatureId);
          const sourceIndex = sourceFeature ? scenario.features.indexOf(sourceFeature) : -1;
          for (let index = sourceIndex; index >= 0; index--) {
            const candidate = scenario.features[index];
            if (!candidate?.sourceFeatureId || !BODY_CREATOR_TYPES.has(candidate.type)) continue;
            if (!bodyKeyBySource.has(candidate.sourceFeatureId))
              bodyKeyBySource.set(candidate.sourceFeatureId, body.bodyKey);
            if (startsNewBody(candidate)) break;
          }
        }
        const activeKeys = new Set(bodies.map((body) => body.bodyKey));
        bodyKeyAliases.forEach((bodyKey, source) => {
          if (activeKeys.has(bodyKey) && !bodyKeyBySource.has(source)) bodyKeyBySource.set(source, bodyKey);
        });
        bodyKeyBySource.forEach((bodyKey, source) => bodyKeyAliases.set(source, bodyKey));
        bodyContext = {
          bodyKeyBySource,
          allBodyKeys: bodies.map((body) => body.bodyKey),
        };
        if (effectiveFeature.type === 'hole') {
          const mass = await getMassPropertiesRpc(ctx, accessToken);
          bodyContext.bodyCentroidByKey = new Map(
            mass.map((item) => [item.bodyKey, item.centroid]),
          );
        }
      }
      // ADR-0016 A3：CAP_FACE profile 起始面解析 → 改走产品 faceExtrude。
      // 解析失败/无 resolver 一律阻塞；不得回退旧 capFaceExtrude(startOffset)
      // 近似（A4 严格轨不得用近似冒充精确）。
      if (isCapFaceProfile) {
        if (!options.capFaceResolver)
          throw new BlockedCapabilityError(
            'face-extrude',
            `${feature.name} capFaceProfile 缺起始面解析器（runner 能力未接线）`,
          );
        const resolution = await options.capFaceResolver(feature, scenario, bodyContext);
        if (!resolution.ok)
          throw new BlockedCapabilityError(
            'face-extrude',
            `${feature.name} CAP_FACE 起始面解析失败：${resolution.reason}`,
          );
        const sourceParams = feature.params as Record<string, unknown>;
        const endBoundRaw = String(sourceParams.endBound ?? 'blind')
          .replace(/[_-]/g, '').toLowerCase();
        // ADR-0016 A3 首版：ADD/BLIND；S3（2026-11-10）扩展证据形态：
        // REMOVE/INTERSECT + THROUGH_ALL。其余（upTo*）仍 fail closed。
        if (endBoundRaw !== 'blind' && endBoundRaw !== 'throughall')
          throw new BlockedCapabilityError(
            'face-extrude',
            `${feature.name} capFaceProfile 终止条件未支持（当前 ${endBoundRaw}）`,
          );
        if (sourceParams.secondDirection !== undefined)
          throw new BlockedCapabilityError(
            'face-extrude',
            `${feature.name} capFaceProfile 与 secondDirection 互斥`,
          );
        const depthMm = typeof sourceParams.depthMm === 'number' ? sourceParams.depthMm : undefined;
        if (endBoundRaw === 'blind' && (depthMm === undefined || !(depthMm > 0)))
          throw new BlockedCapabilityError('face-extrude', `${feature.name} capFaceProfile 缺有效 depthMm`);
        // S3：REMOVE/INTERSECT 已由 Onshape 原始 oppositeDirection + rb 切削侧证据
        // 校准（Wheel Extrude 1 / Rocker Extrude 10）；此处仍拒绝 NEW（产品
        // faceExtrude 无 NEW）。THROUGH_ALL 不透传 depthMm（review 2026-11-10：
        // blind 深度对该终止条件无意义，避免“throughAll 按 blind 深”假绿）。
        const operation = String(sourceParams.operation ?? '').toLowerCase();
        if (operation !== 'add' && operation !== 'remove' && operation !== 'intersect')
          throw new BlockedCapabilityError(
            'face-extrude',
            `${feature.name} capFaceProfile 操作未支持（当前 ${operation || 'missing'}）`,
          );
        const selectionStart = (originalSelection as { startOffsetMm?: unknown }).startOffsetMm;
        const startOffsetMm = typeof selectionStart === 'number' && Number.isFinite(selectionStart)
          ? selectionStart
          : 0;
        // A3 已发布 ADD/BLIND 形态保持原 sketch-normal 方向映射（Bumper 不变）。
        const legacyDirection = operation === 'add' && endBoundRaw !== 'throughall';
        let productDirection: 'forward' | 'backward';
        if (legacyDirection) {
          productDirection = sourceParams.oppositeDirection === true ? 'backward' : 'forward';
        } else {
          // S3：converter 给出**世界实体外法向**（bodydetails orientation），
          // Onshape oppositeDirection 相对该外法向；产品 direction 相对解析到的
          // 产品面法向（可能朝内/朝外任意，合成盒体底面实测朝内）。用点积把
          // 世界方向换算为产品 direction；任何缺失/退化 → fail closed。
          const outwardRaw = (originalSelection as { outwardNormal?: unknown }).outwardNormal;
          const outwardRecord = outwardRaw && typeof outwardRaw === 'object'
            ? outwardRaw as Record<string, unknown>
            : undefined;
          const outward = ['x', 'y', 'z'].map((axis) => outwardRecord?.[axis]);
          if (outward.some((value) => typeof value !== 'number' || !Number.isFinite(value)))
            throw new BlockedCapabilityError(
              'face-extrude',
              `${feature.name} capFaceProfile 缺有效 outwardNormal（S3 世界外法向）`,
            );
          const outwardVector = outward as [number, number, number];
          const outwardLength = Math.hypot(outwardVector[0], outwardVector[1], outwardVector[2]);
          if (!(outwardLength > 1e-9))
            throw new BlockedCapabilityError(
              'face-extrude',
              `${feature.name} capFaceProfile outwardNormal 退化`,
            );
          const desiredSign = sourceParams.oppositeDirection === true ? -1 : 1;
          const desired = outwardVector.map((value) => value / outwardLength * desiredSign);
          const faceNormal = resolution.faceNormal;
          const faceNormalLength = Math.hypot(faceNormal[0], faceNormal[1], faceNormal[2]);
          const dotProduct = desired[0]! * faceNormal[0]
            + desired[1]! * faceNormal[1]
            + desired[2]! * faceNormal[2];
          if (!(faceNormalLength > 1e-9) || !Number.isFinite(dotProduct)
            || Math.abs(dotProduct) < 1e-9)
            throw new BlockedCapabilityError(
              'face-extrude',
              `${feature.name} capFaceProfile 方向无法由 outwardNormal/产品面法向判定` +
              `（dot=${String(dotProduct)}）`,
            );
          productDirection = dotProduct > 0 ? 'forward' : 'backward';
        }
        effectiveFeature = {
          ...feature,
          type: 'faceExtrude',
          params: {
            bodyId: resolution.bodyId,
            faceRef: resolution.faceRef,
            operation,
            endBound: endBoundRaw === 'throughall' ? 'throughAll' : 'blind',
            ...(endBoundRaw === 'blind' && depthMm !== undefined ? { depthMm } : {}),
            direction: productDirection,
            startOffsetMm,
            ...(sourceParams.hasDraft === true && typeof sourceParams.draftAngleDeg === 'number'
              ? {
                hasDraft: true,
                draftAngleDeg: sourceParams.draftAngleDeg,
                ...(sourceParams.draftPullDirection === true ? { draftPullDirection: true } : {}),
              }
              : {}),
          },
        };
        capFaceNotes.push(
          `${resolution.note}（${operation}/${endBoundRaw === 'throughall' ? 'throughAll' : 'blind'}` +
          `；direction=${productDirection}；startOffset=${startOffsetMm}mm；S10 面驱动 profile，精确轨）`,
        );
      }
      // fillet/chamfer 边解析：多体时把当前 body 谱系交给 resolver 限定候选体。
      if ((feature.type === 'fillet' || feature.type === 'chamfer') && options.edgeResolver) {
        const resolved = await options.edgeResolver(feature, scenario, bodyContext);
        edgeRefsByFeatureName = new Map([[feature.name, resolved.refs]]);
        edgeBodyKeys = resolved.bodyKeys ?? [];
        edgeNotes.push(...resolved.notes);
      }
      // shell 面解析依赖该步时点的 body 集（多体模型须先锚定目标 body）。
      if (feature.type === 'shell' && options.shellFaceResolver) {
        const resolved = await options.shellFaceResolver(feature, scenario, bodyContext);
        shellRefsByFeatureName = new Map([[feature.name, resolved.refs]]);
        if (resolved.targetBodyKey !== undefined)
          shellTargetBodyByFeatureName = new Map([[feature.name, resolved.targetBodyKey]]);
        edgeNotes.push(...resolved.notes);
      }
      // 能力覆盖轨：拔模按直壁近似（仅显式开启；translator 的默认阻塞不变）。
      let approximateDraft = false;
      if (options.allowApproximateDraft
        && effectiveFeature.type === 'extrude'
        && (effectiveFeature.params as { hasDraft?: unknown }).hasDraft === true) {
        effectiveFeature = {
          ...effectiveFeature,
          params: { ...(effectiveFeature.params as Record<string, unknown>), hasDraft: false, draftAngleDeg: 0 },
        };
        approximateDraft = true;
      }
      const translated = translateScenarioFeature(effectiveFeature, {
        sketchIdBySource,
        sketchPlaneBySource,
        latestSketchId,
        featureIdBySource: localFeatureIdBySource,
        ...(edgeRefsByFeatureName ? { edgeRefsByFeatureName } : {}),
        ...(shellRefsByFeatureName ? { shellRefsByFeatureName } : {}),
        ...(shellTargetBodyByFeatureName ? { shellTargetBodyByFeatureName } : {}),
        ...bodyContext,
      });
      if (imprintNotes.length > 0) {
        translated.notes.push(...imprintNotes);
        if (imprintApproximate) translated.approximate = true;
      }
      if (capFaceNotes.length > 0) translated.notes.push(...capFaceNotes);
      if (profileRegionNote !== undefined) {
        translated.notes.push(profileRegionNote);
        if (!profileRegionNote.includes('→ 面域')) translated.approximate = true;
      }
      if (sketchRegionAreaNote !== undefined) translated.notes.push(sketchRegionAreaNote);
      if (regionAuditNote !== undefined) {
        translated.notes.push(regionAuditNote);
        translated.approximate = true;
      }
      if (approximateDraft) {
        translated.notes.push('拔模按直壁近似（产品无内核通道，approximate）');
        translated.approximate = true;
      }
      // 多体无 scope：显式锚定（不在产品侧使用隐式全局链尾）。
      if (translated.op.kind === 'insertFeature'
        && translated.op.targetBodyId === undefined
        && MULTI_BODY_ANCHOR_TYPES.has(translated.op.featureType)
        && bodyContext.allBodyKeys !== undefined
        && bodyContext.allBodyKeys.length > 1) {
        const anchor = mostRecentCreatorBody(
          scenarioFeatures,
          featureIndex,
          bodyContext.bodyKeyBySource,
          bodyContext.allBodyKeys,
        );
        if (anchor !== undefined) {
          translated.op = { ...translated.op, targetBodyId: anchor };
          translated.notes.push(
            `multi-body anchor=${anchor}（Onshape 无 booleanScope；按最近造体谱系显式锚定）`,
          );
        }
      }
      // fillet/chamfer：目标体由解析后的边决定，不按“最近造体”猜。跨 body 的
      // 单次圆角/倒角在产品契约里没有合法目标，诚实阻塞。
      if (translated.op.kind === 'insertFeature'
        && (translated.op.featureType === 'fillet' || translated.op.featureType === 'chamfer')
        && translated.op.targetBodyId === undefined
        && bodyContext.allBodyKeys !== undefined
        && bodyContext.allBodyKeys.length > 1) {
        const selection = selectEdgeTargetBody(edgeBodyKeys, bodyContext.allBodyKeys);
        if (selection.targetBodyId === undefined) {
          throw new BlockedCapabilityError(
            'edge-selector',
            `${feature.name}：${selection.blockedReason ?? '无法显式锚定目标体'}`,
          );
        }
        translated.op = { ...translated.op, targetBodyId: selection.targetBodyId };
        translated.notes.push(
          `multi-body anchor=${selection.targetBodyId}（由选中边所属 body 显式锚定）`,
        );
      }
      const op = options.skipSketchConstraints && translated.op.kind === 'insertSketch'
        ? { ...translated.op, constraints: [] }
        : translated.op;
      if (op !== translated.op)
        translated.notes.push('constraints=dropped（converter 约束 refs 不可靠，保留解算坐标）');
      const result = (await applyFeatureOpRpc(
        ctx,
        op,
        lease,
        accessToken,
      )) as FeatureOpResult;
      assertFeatureOpOk(result, `${scenario.id}/${feature.name}`);
      const featureId = result.featureId;
      if (!featureId) throw new Error(`${scenario.id}/${feature.name} 未返回 featureId`);
      featureIds.push(featureId);
      if (feature.sourceFeatureId) localFeatureIdBySource.set(feature.sourceFeatureId, featureId);
      scenarioFeatureByLocalId.set(featureId, feature);
      // ADD/REMOVE 写回同一 body：把本步所有 scope 源别名钉到显式目标 body，
      // 后续步骤继续按 Onshape 源特征引用同一 body。
      if (translated.op.kind === 'insertFeature' && translated.op.targetBodyId !== undefined) {
        for (const source of scopeSources) bodyKeyAliases.set(source, translated.op.targetBodyId);
      }
      if (process.env.EXAMPLE_DEBUG_BODIES === '1') {
        const bodies = await getBodiesRpc(ctx, accessToken);
        console.log(
          `[bodies] after ${feature.name}: ` +
          bodies.map((body) =>
            `${body.bodyKey}:src=${body.sourceFeatureId ?? '-'}:active=${body.active}:authored=${body.authored}`).join(' | '),
        );
      }
      if (process.env.EXAMPLE_DEBUG_VOLUMES === '1') {
        const mass = await getMassPropertiesRpc(ctx, accessToken);
        const total = mass.reduce((sum, item) => sum + item.volume, 0);
        console.log(
          `[volumes] after ${feature.name}: ` +
          `${mass.map((item) => item.volume.toFixed(3)).join(',')} total=${total.toFixed(3)}`,
        );
      }
      if (translated.op.kind === 'insertSketch') {
        latestSketchId = featureId;
        if (feature.sourceFeatureId) {
          sketchIdBySource.set(feature.sourceFeatureId, featureId);
          if (translated.op.plane) sketchPlaneBySource.set(feature.sourceFeatureId, translated.op.plane);
        }
      }
      if (translated.approximate) approximateSteps++;
      const stepNotes = [...translated.notes, ...edgeNotes];
      notes.push(...stepNotes.map((note) => `${feature.name}: ${note}`));
      steps.push({
        feature: feature.name,
        type: feature.type,
        ...(translated.op.kind === 'insertFeature'
          ? { opFeatureType: translated.op.featureType } : {}),
        featureId,
        notes: stepNotes,
        approximate: translated.approximate,
      });
    }
  } finally {
    // 若租约是本 helper 自己取得的，必须释放；否则后续真实 UI 工具（chamfer/sketch）
    // 可能因租约被占而卡在拾取/确认。页面自己的租约（borrowed）不释放。
    await releaseWriteLease(ctx, lease, accessToken).catch(() => undefined);
  }

  return { featureIds, notes, approximateSteps, steps };
}

/** 可选 UI 截图辅助（当前 runner 不强制逐步截图，避免把 RPC 演示伪装成鼠标）。 */
export async function screenshotScenarioResult(page: Page, path: string): Promise<void> {
  await page.screenshot({ path, fullPage: false });
}
