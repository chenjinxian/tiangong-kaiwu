/**
 * live transform 真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒沿 +X 平移 30 mm：体积与 body 数不变，质心 x=30。
 * 验证 live step → 标准 transform FeatureOp 的完整通道与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-transform-smoke',
  title: 'Synthetic box → transform translate',
  status: 'approx',
  imodelName: 'Onshape live transform: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: -10, y: -10 }, p2: { x: 10, y: -10 } },
        { kind: 'line', id: 2, p1: { x: 10, y: -10 }, p2: { x: 10, y: 10 } },
        { kind: 'line', id: 3, p1: { x: 10, y: 10 }, p2: { x: -10, y: 10 } },
        { kind: 'line', id: 4, p1: { x: -10, y: 10 }, p2: { x: -10, y: -10 } },
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
      kind: 'transform',
      name: 'Transform 1',
      translation: { x: 30, y: 0, z: 0 },
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 4000, tolerance: 0.005 },
  evidence: [],
};

test.describe('live transform 通道', () => {
  test('translation → transform FeatureOp，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'transform']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(
      `[live-transform] volume=${volume.toFixed(3)} centroid=` +
      JSON.stringify(result.mass[0]?.centroid),
    );
    expect(Math.abs(volume - 4000) / 4000).toBeLessThan(0.005);
    expect(result.mass[0]?.centroid.x).toBeCloseTo(30, 3);
    expect(result.mass[0]?.centroid.y).toBeCloseTo(0, 3);
    expect(result.mass[0]?.centroid.z).toBeCloseTo(5, 3);

    await pushExampleChanges(page, 'live transform smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
