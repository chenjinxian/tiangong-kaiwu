/**
 * live booleanBodies 真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒 A 与 10×10×10 盒 B（z=5..15，重叠体积 500）做 unite：
 * 期望单 body 4500 mm³。验证按 feature 名解析 bodyKey → BodyRef →
 * 标准 booleanBodies FeatureOp 的完整通道。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

function square(half: number, baseId: number) {
  return [
    { kind: 'line' as const, id: baseId, p1: { x: -half, y: -half }, p2: { x: half, y: -half } },
    { kind: 'line' as const, id: baseId + 1, p1: { x: half, y: -half }, p2: { x: half, y: half } },
    { kind: 'line' as const, id: baseId + 2, p1: { x: half, y: half }, p2: { x: -half, y: half } },
    { kind: 'line' as const, id: baseId + 3, p1: { x: -half, y: half }, p2: { x: -half, y: -half } },
  ];
}

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-boolean-bodies-smoke',
  title: 'Synthetic two boxes → booleanBodies unite',
  status: 'approx',
  imodelName: 'Onshape live booleanBodies: synthetic boxes',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic boxes' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch A',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(10, 1),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude A',
      sketchName: 'Sketch A',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'sketch',
      name: 'Sketch B',
      plane: { origin: { x: 0, y: 0, z: 5 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(5, 1),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude B',
      sketchName: 'Sketch B',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'booleanBodies',
      name: 'Boolean 1',
      operation: 'unite',
      targetBodyFeatureNames: ['Extrude A'],
      toolBodyFeatureNames: ['Extrude B'],
      keepTools: false,
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 4500, tolerance: 0.005 },
  evidence: [],
};

test.describe('live booleanBodies 通道', () => {
  test('feature→bodyKey→BodyRef→unite，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'booleanBodies',
    ]);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-boolean] volume=${volume.toFixed(3)} expected=4500.000`);
    expect(Math.abs(volume - 4500) / 4500).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live booleanBodies smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
