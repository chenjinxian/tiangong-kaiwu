/**
 * live moveFace 逐面距离真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒：顶面 +5、右面 +2（distancesMm）→ 6600 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-move-face-distances-smoke',
  title: 'Synthetic box → moveFace per-face distances',
  status: 'approx',
  imodelName: 'Onshape live moveFace distances: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
        { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 20, y: 20 } },
        { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: 0, y: 20 } },
        { kind: 'line', id: 4, p1: { x: 0, y: 20 }, p2: { x: 0, y: 0 } },
      ],
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'moveFace',
      name: 'Move Face 1',
      faces: [
        { center: { x: 10, y: 10, z: 10 }, normal: { x: 0, y: 0, z: 1 } },
        { center: { x: 20, y: 10, z: 5 }, normal: { x: 1, y: 0, z: 0 } },
      ],
      distancesMm: [5, 2],
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 6600, tolerance: 0.01 },
  evidence: [],
};

test.describe('live moveFace 逐面距离', () => {
  test('顶面 +5、右面 +2，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'moveFace']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-move-face-distances] volume=${volume.toFixed(3)} expected=6600.000`);
    expect(Math.abs(volume - 6600) / 6600).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live moveFace distances smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
