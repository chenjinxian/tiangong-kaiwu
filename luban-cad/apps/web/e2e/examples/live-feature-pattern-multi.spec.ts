/**
 * live featurePattern 多源真栈验收（synthetic，2026-11-11）。
 *
 * 80×20×10 板 + 两个 4×4×5 凸台（x=−25、x=−20），一次线性阵列 3 实例、
 * 间距 15：6 个互不重叠凸台，16000 + 6×80 = 16480 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

function square(cx: number, cy: number, half: number) {
  return [
    { kind: 'line' as const, id: 1, p1: { x: cx - half, y: cy - half }, p2: { x: cx + half, y: cy - half } },
    { kind: 'line' as const, id: 2, p1: { x: cx + half, y: cy - half }, p2: { x: cx + half, y: cy + half } },
    { kind: 'line' as const, id: 3, p1: { x: cx + half, y: cy + half }, p2: { x: cx - half, y: cy + half } },
    { kind: 'line' as const, id: 4, p1: { x: cx - half, y: cy + half }, p2: { x: cx - half, y: cy - half } },
  ];
}

const TOP = { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } };

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-feature-pattern-multi-smoke',
  title: 'Synthetic plate with two bosses → multi-source featurePattern',
  status: 'approx',
  imodelName: 'Onshape live multi-source featurePattern: plate',
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
    { kind: 'sketch', name: 'Sketch Boss A', plane: TOP, entities: square(-25, 0, 2), constraints: [] },
    { kind: 'extrude', name: 'Boss A', sketchName: 'Sketch Boss A', depthMm: 5, operation: 'add', regions: [0] },
    { kind: 'sketch', name: 'Sketch Boss B', plane: TOP, entities: square(-20, 0, 2), constraints: [] },
    { kind: 'extrude', name: 'Boss B', sketchName: 'Sketch Boss B', depthMm: 5, operation: 'add', regions: [0] },
    {
      kind: 'featurePattern',
      name: 'Pattern 1',
      sourceFeatureNames: ['Boss A', 'Boss B'],
      patternKind: 'linear',
      count: 3,
      spacingMm: 15,
      axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 16480, tolerance: 0.01 },
  evidence: [],
};

test.describe('live featurePattern 多源', () => {
  test('两凸台一次线性阵列，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern',
    ]);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-feature-pattern-multi] volume=${volume.toFixed(3)} expected=16480.000`);
    expect(Math.abs(volume - 16480) / 16480).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live multi-source featurePattern smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
