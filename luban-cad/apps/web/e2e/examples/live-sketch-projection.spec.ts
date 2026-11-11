/**
 * live sketch→sketch 投影真栈验收（synthetic，2026-11-11）。
 *
 * Sketch 1 的 R10 整圆投影到 z=10 的 Sketch 2，再由 Sketch 2 拉伸 10 mm：
 * 期望 π·10²·10 = 3141.593 mm³，验证 insertSketch.projections 全链与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-sketch-projection-smoke',
  title: 'Synthetic circle → projected sketch → extrude',
  status: 'approx',
  imodelName: 'Onshape live sketch projection: synthetic circle',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic circle' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 10 },
      ],
      constraints: [],
    },
    {
      kind: 'sketch',
      name: 'Sketch 2',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [],
      constraints: [],
      projections: [
        { sourceSketchName: 'Sketch 1', sourceEntityId: 1, entityId: 101 },
      ],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 2',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
  ],
  expected: { bodyCount: 1, volumeMm3: Math.PI * 100 * 10, tolerance: 0.005 },
  evidence: [],
};

test.describe('live sketch 投影通道', () => {
  test('投影整圆拉伸，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    const expected = Math.PI * 100 * 10;
    console.log(`[live-sketch-projection] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live sketch projection smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
