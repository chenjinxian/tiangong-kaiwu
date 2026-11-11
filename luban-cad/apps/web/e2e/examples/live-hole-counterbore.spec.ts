/**
 * live 沉头孔真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒上一个 Ø4 through-all 沉头孔（Ø8 深 3）：
 * 去材 π·2²·10 + π·(4²−2²)·3 = 238.761 mm³，
 * 期望 4000 − 238.761 = 3761.239 mm³。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const EXPECTED = 4000 - (Math.PI * 4 * 10 + Math.PI * (16 - 4) * 3);

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-hole-counterbore-smoke',
  title: 'Synthetic box → counterbore hole',
  status: 'approx',
  imodelName: 'Onshape live counterbore: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch Box',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
        { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 20, y: 20 } },
        { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: 0, y: 20 } },
        { kind: 'line', id: 4, p1: { x: 0, y: 20 }, p2: { x: 0, y: 0 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Extrude 1', sketchName: 'Sketch Box', depthMm: 10, operation: 'new', regions: [0] },
    {
      kind: 'sketch',
      name: 'Hole Positions',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'point', id: 1, x: 10, y: 10 },
      ],
      constraints: [],
    },
    {
      kind: 'hole',
      name: 'Hole 1',
      sketchName: 'Hole Positions',
      pointEntityIds: [1],
      diameterMm: 4,
      holeStyle: 'counterbore',
      counterboreDiameterMm: 8,
      counterboreDepthMm: 3,
      endBound: 'throughAll',
      direction: 'backward',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: EXPECTED, tolerance: 0.005 },
  evidence: [],
};

test.describe('live 沉头孔', () => {
  test('Ø8×3 沉头 + Ø4 通孔，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'hole']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-hole-counterbore] volume=${volume.toFixed(3)} expected=${EXPECTED.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED) / EXPECTED).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live counterbore smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
