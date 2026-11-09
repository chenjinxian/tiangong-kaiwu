/**
 * v1.53 / ADR-0005 Phase 6：scenario→FeatureOp translator 的 upToNext 直通真栈验收。
 *
 * 板 20×20×5（2000 mm³）→ z=0 内嵌 10×10 草图 → extrude remove endBound=upToNext
 * （产品自动选最近平行面=板顶 z=5）→ **1500 mm³**；验证 translator 不再把
 * up_to_next 静态近似为 blind，push+重开一致。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from '../imodel.js';
import { runScenario } from './run.js';
import type { ParityScenario } from './scenario-to-op.js';

const EXPECTED_VOLUME_MM3 = 2000 - 10 * 10 * 5;
const PLANE = { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } };

function rectangle(w: number, h: number) {
  return {
    entities: [
      { kind: 'point' as const, id: 1, x: 0, y: 0 },
      { kind: 'point' as const, id: 2, x: w, y: 0 },
      { kind: 'point' as const, id: 3, x: w, y: h },
      { kind: 'point' as const, id: 4, x: 0, y: h },
      { kind: 'point' as const, id: 5, x: 0, y: 0 },
      { kind: 'point' as const, id: 6, x: w, y: 0 },
      { kind: 'point' as const, id: 7, x: w, y: h },
      { kind: 'point' as const, id: 8, x: 0, y: h },
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

function scenario(): ParityScenario {
  const plate = rectangle(20, 20);
  const cut = rectangle(10, 10);
  return {
    schemaVersion: 1,
    id: 'e2e-extrude-up-to-next',
    name: 'extrude upToNext scenario',
    units: 'mm',
    features: [
      {
        type: 'sketch', name: 'Plate Sketch', sourceFeatureId: 'plate-sketch',
        params: { plane: PLANE, entities: plate.entities, constraints: plate.constraints },
      },
      {
        type: 'extrude', name: 'Plate', sourceFeatureId: 'plate-extrude',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 5, symmetric: false, oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'plate-sketch', regionIndex: 0, regions: [0] },
        },
      },
      {
        type: 'sketch', name: 'Cut Sketch', sourceFeatureId: 'cut-sketch',
        params: { plane: PLANE, entities: cut.entities, constraints: cut.constraints },
      },
      {
        type: 'extrude', name: 'Cut', sourceFeatureId: 'cut-extrude',
        params: {
          operation: 'remove', endBound: 'up_to_next', depthMm: 1, symmetric: false, oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'cut-sketch', regionIndex: 0, regions: [0] },
        },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-08', status: 'complete', missing: [] },
  };
}

test.describe('extrude upToNext scenario（v1.53）', () => {
  test('translator 直通 upToNext → 1500 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Up To Next Scenario', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    await runScenario(ctx, scenario(), token);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[3]?.params).toMatchObject({ endBound: 'upToNext', operation: 'remove' });
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-next-scenario] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToNext scenario acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const reopened = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopened - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
