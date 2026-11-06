/**
 * T5 首切片：世界平面整件镜像（converter → translator → 标准 FeatureOp）。
 *
 * 合成：偏置盒体 x=10..30、20×20×10 → mirror YZ（Right 面，过原点）→
 * 原件 + 镜像件 Union，体积 2×8000? 实际单件 4000 → 8000 mm³。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Mirror';
const BOX_VOLUME_MM3 = 20 * 20 * 10;
const EXPECTED_VOLUME_MM3 = BOX_VOLUME_MM3 * 2;

function mirrorScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-mirror-world-plane',
    name: 'T5 mirror world plane',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sketch-1',
        params: {
          plane: {
            origin: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            xDir: { x: 1, y: 0, z: 0 },
          },
          entities: [
            { kind: 'line', id: 1, p1: { x: 10, y: 0 }, p2: { x: 30, y: 0 } },
            { kind: 'line', id: 2, p1: { x: 30, y: 0 }, p2: { x: 30, y: 20 } },
            { kind: 'line', id: 3, p1: { x: 30, y: 20 }, p2: { x: 10, y: 20 } },
            { kind: 'line', id: 4, p1: { x: 10, y: 20 }, p2: { x: 10, y: 0 } },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Extrude 1',
        sourceFeatureId: 'extrude-1',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          symmetric: false,
          oppositeDirection: false,
          selection: {
            kind: 'sketchRegions',
            sketchFeatureId: 'sketch-1',
            regionIndex: 0,
            regions: [0],
          },
        },
      },
      {
        type: 'mirror',
        name: 'Mirror 1',
        sourceFeatureId: 'mirror-1',
        params: { plane: 'YZ', keepOriginal: true, scope: 'PART' },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

test.describe('T5 mirror', () => {
  test('世界平面整件镜像 → 树/体积/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const built = await runScenario(ctx, mirrorScenario(), token);
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(built.notes.some((note) => note.includes('mirror=world-plane'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[mirror] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'T5 mirror world plane');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = (await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType);
    expect(reopened).toEqual(['sketch', 'extrude', 'mirror']);
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
