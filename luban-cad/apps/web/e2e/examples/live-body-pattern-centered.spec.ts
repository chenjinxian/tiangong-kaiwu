/**
 * live body pattern centered 真栈验收（synthetic，2026-11-12）。
 *
 * 10×10×10 盒线性居中 3 实例、间距 20（位置 −20/0/20）：
 * 3000 mm³、产品 1 body、质心 x=0。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-body-pattern-centered-smoke',
  title: 'Synthetic box → centered body pattern',
  status: 'approx',
  imodelName: 'Onshape live centered body pattern: box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: -5, y: -5 }, p2: { x: 5, y: -5 } },
        { kind: 'line', id: 2, p1: { x: 5, y: -5 }, p2: { x: 5, y: 5 } },
        { kind: 'line', id: 3, p1: { x: 5, y: 5 }, p2: { x: -5, y: 5 } },
        { kind: 'line', id: 4, p1: { x: -5, y: 5 }, p2: { x: -5, y: -5 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Extrude 1', sketchName: 'Sketch 1', depthMm: 10, operation: 'new', regions: [0] },
    {
      kind: 'pattern',
      name: 'Pattern 1',
      patternKind: 'linear',
      count: 3,
      spacingMm: 20,
      axis: 'X',
      centered: true,
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 3000, tolerance: 0.005 },
  evidence: [],
  notes: ['产品 PART pattern 将实例并入同一 body（多 lump）；centered 位置 −20/0/20。'],
};

test.describe('live body pattern centered', () => {
  test('居中 3 实例，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-body-pattern-centered] volume=${volume.toFixed(3)} centroid=` +
      JSON.stringify(result.mass[0]?.centroid));
    expect(Math.abs(volume - 3000) / 3000).toBeLessThan(0.005);
    expect(result.mass[0]?.centroid.x).toBeCloseTo(0, 3);

    await pushExampleChanges(page, 'live centered body pattern smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
