/**
 * live featurePattern circular 真栈验收（synthetic，2026-11-12）。
 *
 * 40×40×10 板 + 4×4×5 凸台（x=10），绕 Z 全周阵列 4 个：
 * 16000 + 4×80 = 16320 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-feature-pattern-circular-smoke',
  title: 'Synthetic plate with boss → circular featurePattern',
  status: 'approx',
  imodelName: 'Onshape live circular featurePattern: plate',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic plate' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch Plate',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: -20, y: -20 }, p2: { x: 20, y: -20 } },
        { kind: 'line', id: 2, p1: { x: 20, y: -20 }, p2: { x: 20, y: 20 } },
        { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: -20, y: 20 } },
        { kind: 'line', id: 4, p1: { x: -20, y: 20 }, p2: { x: -20, y: -20 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Plate', sketchName: 'Sketch Plate', depthMm: 10, operation: 'new', regions: [0] },
    {
      kind: 'sketch',
      name: 'Sketch Boss',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: 8, y: -2 }, p2: { x: 12, y: -2 } },
        { kind: 'line', id: 2, p1: { x: 12, y: -2 }, p2: { x: 12, y: 2 } },
        { kind: 'line', id: 3, p1: { x: 12, y: 2 }, p2: { x: 8, y: 2 } },
        { kind: 'line', id: 4, p1: { x: 8, y: 2 }, p2: { x: 8, y: -2 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Boss', sketchName: 'Sketch Boss', depthMm: 5, operation: 'add', regions: [0] },
    {
      kind: 'featurePattern',
      name: 'Pattern 1',
      sourceFeatureName: 'Boss',
      patternKind: 'circular',
      count: 4,
      angleDeg: 360,
      axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 16320, tolerance: 0.01 },
  evidence: [],
};

test.describe('live featurePattern circular', () => {
  test('绕 Z 4 实例，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern',
    ]);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-feature-pattern-circular] volume=${volume.toFixed(3)} expected=16320.000`);
    expect(Math.abs(volume - 16320) / 16320).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live circular featurePattern smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
