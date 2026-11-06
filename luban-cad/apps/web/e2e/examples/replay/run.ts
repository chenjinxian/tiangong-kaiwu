/**
 * Scenario runner（test-only）：顺序 apply translator 产出的 FeatureOp。
 *
 * 首版全部走标准 RPC（同一 LubanFeatureRpcInterface/事务/写租约），用于验证
 * registry + 多 PS 基础设施；UI 对话框路径由各能力的真实 e2e 单独覆盖。
 * 每个被近似的步骤写入 notes，调用方必须落到 manifest。
 */
import type { Page } from '@playwright/test';
import type { FeatureOpResult, FilletEdgeRef, SketchPlaneDto } from '@luban-cad/shared';
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
import { pickImprintRegion } from './imprint-region.js';
import {
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
  ) => Promise<{ refs: FilletEdgeRef[]; notes: string[] }>;
}

export interface RunScenarioResult {
  featureIds: string[];
  notes: string[];
  approximateSteps: number;
  steps: Array<{ feature: string; type: string; featureId?: string; notes: string[]; approximate: boolean }>;
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
  let latestSketchId: string | undefined;
  const featureIds: string[] = [];
  const notes: string[] = [];
  let approximateSteps = 0;
  const steps: RunScenarioResult['steps'] = [];

  try {
    for (const feature of scenario.features as ScenarioFeature[]) {
      // imprintFace 近似解析（test-only）：converter 记录面查询引用的草图实体；
      // 用 getSketch 面域读面选“该实体为孔洞边界”的最大面域，替代一律 region 0。
      // face split 仍未实现，步骤保持 approximate=true 并写 note。
      let effectiveFeature = feature;
      let imprintNote: string | undefined;
      if (feature.type === 'extrude') {
        const selection = (feature.params as {
          selection?: { kind?: string; sketchFeatureId?: string; sketchEntityId?: number };
        }).selection;
        if (selection?.kind === 'imprintFace'
          && selection.sketchFeatureId !== undefined
          && typeof selection.sketchEntityId === 'number') {
          const localSketchId = sketchIdBySource.get(selection.sketchFeatureId);
          if (localSketchId !== undefined) {
            const sketch = await getSketchRpc(ctx, localSketchId, accessToken);
            const pick = pickImprintRegion(sketch?.regions, selection.sketchEntityId);
            if (pick !== undefined) {
              effectiveFeature = {
                ...feature,
                params: {
                  ...feature.params,
                  selection: {
                    kind: 'sketchRegions',
                    sketchFeatureId: selection.sketchFeatureId,
                    regionIndex: pick.regionIndex,
                    regions: [pick.regionIndex],
                  },
                },
              };
              imprintNote = `imprintFace→草图面域 ${pick.regionIndex}` +
                `（实体 ${selection.sketchEntityId} ${pick.basis}，area=${pick.area.toFixed(3)}；` +
                'face split 未实现，近似）';
            }
          }
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
      const edgeNotes: string[] = [];
      if ((feature.type === 'fillet' || feature.type === 'chamfer') && options.edgeResolver) {
        const resolved = await options.edgeResolver(feature, scenario);
        edgeRefsByFeatureName = new Map([[feature.name, resolved.refs]]);
        edgeNotes.push(...resolved.notes);
      }
      // body 引用（booleanBodies 目标/工具、extrude/revolve/hole 的 booleanScope）
      // 必须在**该步时点**解析：后续特征会改变 body 集。
      const stepParams = effectiveFeature.params as Record<string, unknown>;
      const scopeSources = Array.isArray(stepParams.booleanScopeFeatureIds)
        ? stepParams.booleanScopeFeatureIds.filter((source): source is string => typeof source === 'string')
        : [];
      let bodyContext: {
        bodyKeyBySource?: Map<string, string>;
        allBodyKeys?: string[];
        bodyCentroidByKey?: Map<string, { x: number; y: number; z: number }>;
      } = {};
      if (effectiveFeature.type === 'booleanBodies' || scopeSources.length > 0) {
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
          const sourceFeature = scenarioFeatureByLocalId.get(body.sourceFeatureId);
          const sourceIndex = sourceFeature ? scenario.features.indexOf(sourceFeature) : -1;
          for (let index = sourceIndex; index >= 0; index--) {
            const candidate = scenario.features[index];
            if (!candidate?.sourceFeatureId || !BODY_CREATOR_TYPES.has(candidate.type)) continue;
            if (!bodyKeyBySource.has(candidate.sourceFeatureId))
              bodyKeyBySource.set(candidate.sourceFeatureId, body.bodyKey);
            break;
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
      const translated = translateScenarioFeature(effectiveFeature, {
        sketchIdBySource,
        sketchPlaneBySource,
        latestSketchId,
        featureIdBySource: localFeatureIdBySource,
        ...(edgeRefsByFeatureName ? { edgeRefsByFeatureName } : {}),
        ...bodyContext,
      });
      if (imprintNote !== undefined) {
        translated.notes.push(imprintNote);
        translated.approximate = true;
      }
      if (regionAuditNote !== undefined) {
        translated.notes.push(regionAuditNote);
        translated.approximate = true;
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
