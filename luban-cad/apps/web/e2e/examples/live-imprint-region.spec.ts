/**
 * live imprintRegions 真栈验收（synthetic，2026-11-12）。
 *
 * 20×20 板带 R5 中心孔；对圆实体 side=outside 解析到“孔侧”外环面域，
 * 拉伸 10：面积 400−π·25 = 321.4602，体积 3214.602 mm³。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const EXPECTED = (400 - Math.PI * 25) * 10;

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-imprint-region-smoke',
  title: 'Synthetic plate with hole → imprintRegions extrude',
  status: 'approx',
  imodelName: 'Onshape live imprintRegions: plate with hole',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic plate' },
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
        { kind: 'circle', id: 5, center: { x: 0, y: 0 }, radius: 5 },
      ],
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      imprintRegions: [{ entityId: 5, side: 'outside' }],
    },
  ],
  expected: { bodyCount: 1, volumeMm3: EXPECTED, tolerance: 0.005 },
  evidence: [],
};

test.describe('live imprintRegions', () => {
  test('孔侧外环面域拉伸，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-imprint-region] volume=${volume.toFixed(3)} expected=${EXPECTED.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED) / EXPECTED).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live imprintRegions smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
