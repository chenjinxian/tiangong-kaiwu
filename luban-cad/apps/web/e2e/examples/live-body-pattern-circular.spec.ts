/**
 * live body pattern circular 真栈验收（synthetic，2026-11-12）。
 *
 * 10×10×10 盒（中心 x=20）绕 Z 全周阵列 4 个：
 * 4×1000 = 4000 mm³、产品 1 body、质心 x≈0。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-body-pattern-circular-smoke',
  title: 'Synthetic box → circular body pattern',
  status: 'approx',
  imodelName: 'Onshape live circular body pattern: box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: 15, y: -5 }, p2: { x: 25, y: -5 } },
        { kind: 'line', id: 2, p1: { x: 25, y: -5 }, p2: { x: 25, y: 5 } },
        { kind: 'line', id: 3, p1: { x: 25, y: 5 }, p2: { x: 15, y: 5 } },
        { kind: 'line', id: 4, p1: { x: 15, y: 5 }, p2: { x: 15, y: -5 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Extrude 1', sketchName: 'Sketch 1', depthMm: 10, operation: 'new', regions: [0] },
    {
      kind: 'pattern',
      name: 'Pattern 1',
      patternKind: 'circular',
      count: 4,
      angleDeg: 360,
      axis: 'Z',
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 4000, tolerance: 0.005 },
  evidence: [],
  notes: ['产品 PART pattern 将实例并入同一 body（多 lump）；centroid x≈0。'],
};

test.describe('live body pattern circular', () => {
  test('绕 Z 4 实例，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-body-pattern-circular] volume=${volume.toFixed(3)} centroid=` +
      JSON.stringify(result.mass[0]?.centroid));
    expect(Math.abs(volume - 4000) / 4000).toBeLessThan(0.005);
    expect(Math.abs(result.mass[0]?.centroid.x ?? 999)).toBeLessThan(0.05);

    await pushExampleChanges(page, 'live circular body pattern smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
