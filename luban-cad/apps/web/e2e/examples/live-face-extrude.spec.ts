/**
 * live faceExtrude 真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒顶面（z=10，法向 +Z）add blind 5 mm：4000 → 6000 mm³、
 * 质心 z=7.5、单 body。验证 live face selector → resolveFaceRef →
 * 标准 faceExtrude FeatureOp 与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-face-extrude-smoke',
  title: 'Synthetic box → faceExtrude top add 5',
  status: 'approx',
  imodelName: 'Onshape live faceExtrude: synthetic box',
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
      kind: 'faceExtrude',
      name: 'Face Extrude 1',
      face: { center: { x: 10, y: 10, z: 10 }, normal: { x: 0, y: 0, z: 1 } },
      operation: 'add',
      endBound: 'blind',
      depthMm: 5,
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 6000, tolerance: 0.005 },
  evidence: [],
};

test.describe('live faceExtrude 通道', () => {
  test('顶面 add blind 5 mm，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'faceExtrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(
      `[live-face-extrude] volume=${volume.toFixed(3)} centroid=` +
      JSON.stringify(result.mass[0]?.centroid),
    );
    expect(Math.abs(volume - 6000) / 6000).toBeLessThan(0.005);
    expect(result.mass[0]?.centroid.z).toBeCloseTo(7.5, 3);

    await pushExampleChanges(page, 'live faceExtrude smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
