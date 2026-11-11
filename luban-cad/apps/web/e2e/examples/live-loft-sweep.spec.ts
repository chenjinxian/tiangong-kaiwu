/**
 * live loft / sweep 真栈验收（synthetic，2026-11-11）。
 *
 * loft：20×20（z=0）→ 10×10（z=10）两截面，线性截面边长 20−z，
 * 体积 ∫0..10 (20−z)² dz = 7000/3 ≈ 2333.333 mm³。
 * sweep：10×10 轮廓在 XY 平面，沿 YZ 平面内 +Z 直线路径 20 mm 扫掠 = 2000 mm³。
 * 两者均验证 live step → 标准 FeatureOp 与冷重开。
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

const LOFT_SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-loft-smoke',
  title: 'Synthetic two sections → loft',
  status: 'approx',
  imodelName: 'Onshape live loft: synthetic frustum',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic frustum' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch Bottom',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(10, 1),
      constraints: [],
    },
    {
      kind: 'sketch',
      name: 'Sketch Top',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(5, 1),
      constraints: [],
    },
    { kind: 'loft', name: 'Loft 1', sketchNames: ['Sketch Bottom', 'Sketch Top'] },
  ],
  expected: { bodyCount: 1, volumeMm3: 7000 / 3, tolerance: 0.01 },
  evidence: [],
};

const SWEEP_SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-sweep-smoke',
  title: 'Synthetic profile + line path → sweep',
  status: 'approx',
  imodelName: 'Onshape live sweep: synthetic prism',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic prism' },
  steps: [
    {
      kind: 'sketch',
      name: 'Profile',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(5, 1),
      constraints: [],
    },
    {
      kind: 'sketch',
      name: 'Path',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 }, xDir: { x: 0, y: 0, z: 1 } },
      entities: [
        { kind: 'line' as const, id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
      ],
      constraints: [],
    },
    { kind: 'sweep', name: 'Sweep 1', profileSketchName: 'Profile', pathSketchName: 'Path' },
  ],
  expected: { bodyCount: 1, volumeMm3: 2000, tolerance: 0.01 },
  evidence: [],
};

test.describe('live loft / sweep 通道', () => {
  test('两截面 loft，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, LOFT_SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'sketch', 'loft']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-loft] volume=${volume.toFixed(3)} expected=${(7000 / 3).toFixed(3)}`);
    expect(Math.abs(volume - 7000 / 3) / (7000 / 3)).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live loft smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });

  test('轮廓+直线路径 sweep，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SWEEP_SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'sketch', 'sweep']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-sweep] volume=${volume.toFixed(3)} expected=2000.000`);
    expect(Math.abs(volume - 2000) / 2000).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live sweep smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
