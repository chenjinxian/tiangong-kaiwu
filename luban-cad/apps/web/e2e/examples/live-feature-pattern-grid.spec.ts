/**
 * live featurePattern 第二方向真栈验收（synthetic，2026-11-11）。
 *
 * 80×20×10 板 + 4×4×5 凸台（−10,−5），线性 3×2 网格（X 间距 6、Y 间距 8）：
 * 6 个凸台，16000 + 6×80 = 16480 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-feature-pattern-grid-smoke',
  title: 'Synthetic plate with boss → 3x2 featurePattern grid',
  status: 'approx',
  imodelName: 'Onshape live featurePattern grid: plate',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic plate' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch Plate',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: -40, y: -10 }, p2: { x: 40, y: -10 } },
        { kind: 'line', id: 2, p1: { x: 40, y: -10 }, p2: { x: 40, y: 10 } },
        { kind: 'line', id: 3, p1: { x: 40, y: 10 }, p2: { x: -40, y: 10 } },
        { kind: 'line', id: 4, p1: { x: -40, y: 10 }, p2: { x: -40, y: -10 } },
      ],
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Plate',
      sketchName: 'Sketch Plate',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'sketch',
      name: 'Sketch Boss',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: -12, y: -7 }, p2: { x: -8, y: -7 } },
        { kind: 'line', id: 2, p1: { x: -8, y: -7 }, p2: { x: -8, y: -3 } },
        { kind: 'line', id: 3, p1: { x: -8, y: -3 }, p2: { x: -12, y: -3 } },
        { kind: 'line', id: 4, p1: { x: -12, y: -3 }, p2: { x: -12, y: -7 } },
      ],
      constraints: [],
    },
    { kind: 'extrude', name: 'Boss', sketchName: 'Sketch Boss', depthMm: 5, operation: 'add', regions: [0] },
    {
      kind: 'featurePattern',
      name: 'Pattern 1',
      sourceFeatureName: 'Boss',
      patternKind: 'linear',
      count: 3,
      spacingMm: 6,
      axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      secondDirection: {
        count: 2,
        spacingMm: 8,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
      },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 16480, tolerance: 0.01 },
  evidence: [],
};

test.describe('live featurePattern 第二方向', () => {
  test('3×2 网格，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern',
    ]);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-feature-pattern-grid] volume=${volume.toFixed(3)} expected=16480.000`);
    expect(Math.abs(volume - 16480) / 16480).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live featurePattern grid smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
