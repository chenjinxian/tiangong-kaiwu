/**
 * Live spec → luban-cad Part Studio 构建器（首切片：sketch + extrude）。
 */
import type { Page, APIRequestContext } from '@playwright/test';
import type { BodyInfo, FeatureTreeEntry } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../../helpers.js';
import { ensureExampleImodel, openExampleEditor } from '../imodel.js';
import type { LiveSpec } from './live-spec.js';

export interface LiveRunResult {
  token: string;
  ids: Awaited<ReturnType<typeof ensureExampleImodel>>;
  ctx: Awaited<ReturnType<typeof openExampleEditor>>;
  tree: FeatureTreeEntry[];
  bodies: BodyInfo[];
  mass: Awaited<ReturnType<typeof getMassPropertiesRpc>>;
  notes: string[];
}

export async function runLiveSpec(
  page: Page,
  request: APIRequestContext,
  spec: LiveSpec,
): Promise<LiveRunResult> {
  const token = await getApiToken();
  const ids = await ensureExampleImodel(request, token, spec.imodelName, { reset: true });
  const ctx = await openExampleEditor(page, ids);
  const lease = await borrowWriteLease(ctx, token, `live-${spec.id}`);
  const sketchIdByName = new Map<string, string>();
  const notes: string[] = [];

  const apply = async (op: Parameters<typeof applyFeatureOpRpc>[1], label: string): Promise<string> => {
    const result = await applyFeatureOpRpc(ctx, op, lease, token);
    assertFeatureOpOk(result, `${spec.id}/${label}`);
    if (!result.featureId) throw new Error(`${spec.id}/${label} 未返回 featureId`);
    return result.featureId;
  };

  for (const step of spec.steps) {
    if (step.kind === 'skipped') {
      notes.push(`${step.name} skipped：${step.reason}`);
      continue;
    }
    if (step.kind === 'sketch') {
      if (sketchIdByName.has(step.name)) throw new Error(`${spec.id}: 草图名重复 ${step.name}`);
      const id = await apply({
        kind: 'insertSketch',
        entities: step.entities,
        constraints: spec.skipConstraints === true ? [] : step.constraints,
        plane: step.plane,
      }, step.name);
      sketchIdByName.set(step.name, id);
      if (spec.skipConstraints === true) notes.push('constraints=dropped（live-spec skipConstraints）');
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'extrude') {
      const sketchId = sketchIdByName.get(step.sketchName);
      if (!sketchId) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${step.sketchName}`);
      await apply({
        kind: 'insertFeature',
        featureType: 'extrude',
        params: {
          profile: [],
          distance: step.depthMm,
          sketchId,
          regions: step.regions ?? [0],
          ...(step.operation ? { operation: step.operation } : {}),
          ...(step.extraParams ?? {}),
        },
      }, step.name);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'revolve') {
      const sketchId = sketchIdByName.get(step.sketchName);
      if (!sketchId) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${step.sketchName}`);
      await apply({
        kind: 'insertFeature',
        featureType: 'revolve',
        params: {
          sketchId,
          regions: step.regions ?? [0],
          axis: { sketchEntityId: step.axisSketchEntityId },
          fullRevolve: step.fullRevolve !== false,
          ...(step.angleRad !== undefined ? { angle: step.angleRad } : {}),
          operation: step.operation ?? 'new',
        },
      }, step.name);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    // 类型级兜底：新增 LiveStep 变体必须先在此实现，否则诚实阻塞。
    throw new Error(`${spec.id}: 未支持的 live step ${(step as { kind: string }).kind}`);
  }

  const tree = await getFeatureTreeRpc(ctx, token);
  const bodies = await getBodiesRpc(ctx, token);
  const mass = await getMassPropertiesRpc(ctx, token);
  return { token, ids, ctx, tree, bodies, mass, notes };
}
