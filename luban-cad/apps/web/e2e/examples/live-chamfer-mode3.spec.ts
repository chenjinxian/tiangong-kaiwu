/**
 * live chamfer mode3（距离+角度）真栈验收（synthetic，2026-11-12）。
 *
 * 20×20×10 盒顶面前边（长度 20）倒角：距离 2、角度 45°；
 * 去材三角形截面 2×2/2 × 20 = 40 mm³，期望 3960 mm³。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-chamfer-mode3-smoke',
  title: 'Synthetic box → chamfer distance+angle',
  status: 'approx',
  imodelName: 'Onshape live chamfer mode3: box',
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
    { kind: 'extrude', name: 'Extrude 1', sketchName: 'Sketch 1', depthMm: 10, operation: 'new', regions: [0] },
    {
      kind: 'chamfer',
      name: 'Chamfer 1',
      mode: 3,
      distanceMm: 2,
      values1: 2,
      values2: Math.PI / 4,
      edges: [{
        curveKind: 'line',
        direction: { x: 1, y: 0, z: 0 },
        midpoint: { x: 10, y: 0, z: 10 },
        lengthMm: 20,
      }],
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 3960, tolerance: 0.01 },
  evidence: [],
};

test.describe('live chamfer mode3', () => {
  test('距离 2 / 45°，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'chamfer']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-chamfer-mode3] volume=${volume.toFixed(3)} expected=3960.000`);
    expect(Math.abs(volume - 3960) / 3960).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live chamfer mode3 smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
