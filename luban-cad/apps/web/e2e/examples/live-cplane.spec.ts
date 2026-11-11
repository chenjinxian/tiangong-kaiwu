/**
 * live cPlane 真栈验收（synthetic，2026-11-11）。
 *
 * Top 基准面偏移 10 mm 建草图为 20×20，拉伸 10 mm：
 * 期望 4000 mm³、质心 z=15（平面 z=10 起）。验证 cPlane 特征 +
 * 草图按名引用平面快照（sourceFeatureId）与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-cplane-smoke',
  title: 'Synthetic Top cPlane offset 10 → sketch → extrude',
  status: 'approx',
  imodelName: 'Onshape live cPlane: synthetic offset plane',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic offset plane' },
  steps: [
    {
      kind: 'cPlane',
      name: 'Plane 1',
      reference: 'top',
      offsetMm: 10,
      plane: {
        origin: { x: 0, y: 0, z: 10 },
        normal: { x: 0, y: 0, z: 1 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    },
    {
      kind: 'sketch',
      name: 'Sketch 1',
      planeFeatureName: 'Plane 1',
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
  ],
  expected: { bodyCount: 1, volumeMm3: 4000, tolerance: 0.005 },
  evidence: [],
};

test.describe('live cPlane 通道', () => {
  test('Top 偏移 10 平面建草图并拉伸，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['cPlane', 'sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(
      `[live-cplane] volume=${volume.toFixed(3)} centroid=` +
      JSON.stringify(result.mass[0]?.centroid),
    );
    expect(Math.abs(volume - 4000) / 4000).toBeLessThan(0.005);
    expect(result.mass[0]?.centroid.z).toBeCloseTo(15, 3);

    await pushExampleChanges(page, 'live cPlane smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
