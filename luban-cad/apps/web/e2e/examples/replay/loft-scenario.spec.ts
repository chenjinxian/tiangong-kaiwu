/**
 * loft scenario→FeatureOp 真栈验收（2026-11-21）。
 *
 * 1) 有序两截面（20×20 @z=0 → 10×10 @z=10）经通用 scenario channel：
 *    sketch → sketch → loft（`sketchFeatureIds` 有序源 id）翻译为产品
 *    LoftParams `{ sketchIds, bodyType:'SOLID' }`，真实 FeatureOp RPC 放样成
 *    线性锥台 **7000/3 ≈ 2333.333 mm³**。断言 1 body、树 status=0、树 sketchIds
 *    等于两张草图 featureId（有序）、push 后冷重开体积一致。
 * 2) 多体锚定：先建两体（A=1000 mm³ 远离；B=4400 mm³，z=-10..1），再对 B 上方
 *    两截面 loft（4000 mm³，z=0..10）→ runner 必须显式 targetBodyId 锚定 B，
 *    产品 Unite 成 **B=8000 / A=1000，2 body**；push+冷重开一致。
 *    若未锚定（后端多体门禁）或锚到 A，体积/体数断言会失败。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from '../imodel.js';
import { runScenario } from './run.js';
import type { ParityScenario } from './scenario-to-op.js';

const FRUSTUM_VOLUME_MM3 = 7000 / 3;

function rectangle(w: number, h: number, x0 = 0, y0 = 0) {
  return {
    entities: [
      { kind: 'point' as const, id: 1, x: x0, y: y0 },
      { kind: 'point' as const, id: 2, x: x0 + w, y: y0 },
      { kind: 'point' as const, id: 3, x: x0 + w, y: y0 + h },
      { kind: 'point' as const, id: 4, x: x0, y: y0 + h },
      { kind: 'point' as const, id: 5, x: x0, y: y0 },
      { kind: 'point' as const, id: 6, x: x0 + w, y: y0 },
      { kind: 'point' as const, id: 7, x: x0 + w, y: y0 + h },
      { kind: 'point' as const, id: 8, x: x0, y: y0 + h },
      { kind: 'line' as const, id: 11, p1: 5, p2: 6 },
      { kind: 'line' as const, id: 12, p1: 6, p2: 7 },
      { kind: 'line' as const, id: 13, p1: 7, p2: 8 },
      { kind: 'line' as const, id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident' as const, id: 21, refs: [1, 5] },
      { kind: 'coincident' as const, id: 22, refs: [2, 6] },
      { kind: 'coincident' as const, id: 23, refs: [3, 7] },
      { kind: 'coincident' as const, id: 24, refs: [4, 8] },
      { kind: 'horizontal' as const, id: 25, refs: [11] },
      { kind: 'horizontal' as const, id: 26, refs: [13] },
      { kind: 'vertical' as const, id: 27, refs: [12] },
      { kind: 'vertical' as const, id: 28, refs: [14] },
      { kind: 'distance' as const, id: 29, refs: [1, 2], value: w },
      { kind: 'distance' as const, id: 30, refs: [2, 3], value: h },
    ],
  };
}

const planeAt = (z: number) => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

function sketchStep(name: string, sourceId: string, w: number, h: number, z: number, x0 = 0, y0 = 0) {
  const rect = rectangle(w, h, x0, y0);
  return {
    type: 'sketch', name, sourceFeatureId: sourceId,
    params: { plane: planeAt(z), entities: rect.entities, constraints: rect.constraints },
  };
}

function extrudeStep(name: string, sourceId: string, sketchSourceId: string, depthMm: number) {
  return {
    type: 'extrude', name, sourceFeatureId: sourceId,
    params: {
      operation: 'new',
      endBound: 'blind',
      depthMm,
      symmetric: false,
      oppositeDirection: false,
      selection: { kind: 'sketchRegions', sketchFeatureId: sketchSourceId, regionIndex: 0, regions: [0] },
    },
  };
}

function frustumScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-loft-scenario',
    name: 'loft frustum scenario',
    units: 'mm',
    features: [
      sketchStep('Section Bottom', 'section-bottom', 20, 20, 0),
      sketchStep('Section Top', 'section-top', 10, 10, 10),
      {
        type: 'loft', name: 'Loft 1', sourceFeatureId: 'loft-1',
        params: {
          operation: 'add',
          bodyType: 'SOLID',
          sketchFeatureIds: ['section-bottom', 'section-top'],
        },
      },
    ],
    expected: { volumeM3: FRUSTUM_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-21', status: 'complete', missing: [] },
  };
}

function multiBodyScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-loft-multibody-anchor',
    name: 'loft multi-body anchor scenario',
    units: 'mm',
    features: [
      sketchStep('Sketch A', 'sketch-a', 10, 10, 0, 100, 0),
      extrudeStep('Extrude A', 'extrude-a', 'sketch-a', 10),
      sketchStep('Sketch B', 'sketch-b', 20, 20, -10),
      // 深度 11（z=-10..1）与 loft（z=0..10）真实相交，Unite 体积确定 8000。
      extrudeStep('Extrude B', 'extrude-b', 'sketch-b', 11),
      sketchStep('Loft Bottom', 'loft-bottom', 20, 20, 0),
      sketchStep('Loft Top', 'loft-top', 20, 20, 10),
      {
        type: 'loft', name: 'Loft 1', sourceFeatureId: 'loft-1',
        params: {
          operation: 'add',
          bodyType: 'SOLID',
          sketchFeatureIds: ['loft-bottom', 'loft-top'],
        },
      },
    ],
    expected: { volumeM3: 9000 * 1e-9, bodyCount: 2 },
    provenance: { capturedAt: '2026-11-21', status: 'complete', missing: [] },
  };
}

async function readVolumes(ctx: Parameters<typeof getMassPropertiesRpc>[0], token: string) {
  const volumes = (await getMassPropertiesRpc(ctx, token))
    .map((entry) => entry.volume)
    .sort((a, b) => a - b);
  return volumes;
}

test.describe('loft scenario（通用 channel）', () => {
  test('有序两截面 loft 锥台 → 7000/3 mm³ / 1 body / status=0 / push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Loft Scenario', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    const applied = await runScenario(ctx, frustumScenario(), token);
    expect(applied.featureIds).toHaveLength(3);

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'sketch', 'loft']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const loftParams = (tree[2]?.params ?? {}) as { sketchIds?: unknown; bodyType?: unknown };
    expect(loftParams.bodyType).toBe('SOLID');
    expect(loftParams.sketchIds).toEqual([applied.featureIds[0], applied.featureIds[1]]);

    const bodies = (await getBodiesRpc(ctx, token))
      .filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volumes = await readVolumes(ctx, token);
    expect(volumes).toHaveLength(1);
    console.log(`[loft-scenario] volume=${volumes[0]!.toFixed(3)} expected=${FRUSTUM_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volumes[0]! - FRUSTUM_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'loft frustum scenario acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const reopenedTree = await getFeatureTreeRpc(ctx, token);
    expect(reopenedTree.map((row) => row.featureType)).toEqual(['sketch', 'sketch', 'loft']);
    expect(reopenedTree.every((row) => row.status === 0)).toBe(true);
    const reopenedBodies = (await getBodiesRpc(ctx, token))
      .filter((body) => body.active !== false && body.authored !== false);
    expect(reopenedBodies).toHaveLength(1);
    const reopened = await readVolumes(ctx, token);
    expect(Math.abs(reopened[0]! - FRUSTUM_VOLUME_MM3) / FRUSTUM_VOLUME_MM3).toBeLessThan(0.005);
  });

  test('多体 loft：runner 锚定最近 body → Unite 8000/1000，2 body push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Loft Multi Body Anchor', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    const applied = await runScenario(ctx, multiBodyScenario(), token);
    expect(applied.featureIds).toHaveLength(7);
    const loftStep = applied.steps.find((step) => step.opFeatureType === 'loft');
    expect(loftStep?.notes.some((note) => note.includes('multi-body anchor='))).toBe(true);

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType))
      .toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'sketch', 'loft']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const loftParams = (tree[6]?.params ?? {}) as { sketchIds?: unknown };
    expect(loftParams.sketchIds).toEqual([applied.featureIds[4], applied.featureIds[5]]);

    const bodies = (await getBodiesRpc(ctx, token))
      .filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(2);
    const volumes = await readVolumes(ctx, token);
    console.log(`[loft-multibody] volumes=${volumes.map((v) => v.toFixed(3)).join(',')} expected=1000,8000`);
    expect(Math.abs(volumes[0]! - 1000)).toBeLessThan(0.5);
    expect(Math.abs(volumes[1]! - 8000)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'loft multi-body anchor acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);
    const reopenedBodies = (await getBodiesRpc(ctx, token))
      .filter((body) => body.active !== false && body.authored !== false);
    expect(reopenedBodies).toHaveLength(2);
    const reopened = await readVolumes(ctx, token);
    expect(Math.abs(reopened[0]! - 1000)).toBeLessThan(0.5);
    expect(Math.abs(reopened[1]! - 8000)).toBeLessThan(0.5);
  });
});
