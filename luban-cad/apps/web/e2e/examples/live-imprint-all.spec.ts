/**
 * live imprintRegions all:true 真栈验收（synthetic，2026-11-12）。
 *
 * 20×20 矩形被中间竖线（id5）分成两个面域；对共享边界 line5 使用
 * side=inside, all=true 应收齐两个面域，拉伸 10 → 4000 mm³。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-imprint-all-smoke',
  title: 'Synthetic split rectangle → imprint all regions',
  status: 'approx',
  imodelName: 'Onshape live imprint all: split rectangle',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic split rectangle' },
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
        { kind: 'line', id: 5, p1: { x: 0, y: -10 }, p2: { x: 0, y: 10 } },
      ],
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      imprintRegions: [{ entityId: 5, side: 'inside', all: true }],
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 4000, tolerance: 0.005 },
  evidence: [],
};

test.describe('live imprintRegions all', () => {
  test('共享边界收齐两个面域，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-imprint-all] volume=${volume.toFixed(3)} expected=4000.000`);
    expect(Math.abs(volume - 4000) / 4000).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live imprint all smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
