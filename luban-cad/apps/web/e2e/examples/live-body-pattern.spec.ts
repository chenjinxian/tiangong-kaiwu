/**
 * live body pattern 真栈验收（synthetic，2026-11-11）。
 *
 * 10×10×10 盒沿世界 X 阵列 3 个（间距 20 mm）：总体积 3000 mm³。
 * 产品 PART pattern 把副本并入同一 body（多 lump），与 Onshape 生成
 * 3 个 part 实例不同；本测试按产品真实语义断言 1 body，并记录该差异。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-body-pattern-smoke',
  title: 'Synthetic box → linear body pattern',
  status: 'approx',
  imodelName: 'Onshape live body pattern: synthetic box',
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
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'pattern',
      name: 'Pattern 1',
      patternKind: 'linear',
      count: 3,
      spacingMm: 20,
      axis: 'X',
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 3000, tolerance: 0.005 },
  evidence: [],
  notes: ['产品 PART pattern 将实例并入同一 body（多 lump）；Onshape 为 3 个 part 实例。'],
};

test.describe('live body pattern 通道', () => {
  test('线性阵列 3 实例（产品并入单 body），冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    console.log(`[live-body-pattern] bodies=${bodies.length} masses=` +
      JSON.stringify(result.mass.map((entry) => Number(entry.volume.toFixed(3)))));
    // 产品语义：实例并入同一 body 的多 lump，而不是 Onshape 的多个 part 实例。
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    expect(Math.abs(volume - 3000) / 3000).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live body pattern smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
