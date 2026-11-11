/**
 * live thin extrude 真栈验收（synthetic，2026-11-11）。
 *
 * 20×20 矩形薄壁拉伸 10 mm、壁厚 2 mm 内向：面积 20²−16² = 144，
 * 期望 1440 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-thin-extrude-smoke',
  title: 'Synthetic thin-wall extruded frame',
  status: 'approx',
  imodelName: 'Onshape live thin extrude: frame',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic frame' },
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
      extraParams: { bodyType: 'THIN', thinThicknessMm: 2 },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 1440, tolerance: 0.01 },
  evidence: [],
};

test.describe('live thin extrude', () => {
  test('20×20 薄壁 2 mm 内向拉伸，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-thin-extrude] volume=${volume.toFixed(3)} expected=1440.000`);
    expect(Math.abs(volume - 1440) / 1440).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live thin extrude smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
