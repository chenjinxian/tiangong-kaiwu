/**
 * live imprintRegions edgeSide 真栈验收（synthetic，2026-11-12）。
 *
 * 20×20 矩形被中间竖线（id5，从 (0,−10) 指向 (0,10)）分成两个面域；
 * 有向边左侧 = x<0（面积 200），右侧 = x>0。取 right → 拉伸 10，
 * 期望 2000 mm³，质心 x=+5。精确语义由 shared `pickImprintRegionByEdgeSide`
 * 单一实现（+1=left / −1=right），此处验证 live runner 的接线与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-imprint-edgeside-smoke',
  title: 'Synthetic split rectangle → imprint directed edge side',
  status: 'approx',
  imodelName: 'Onshape live imprint edgeSide: split rectangle',
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
      imprintRegions: [{ entityId: 5, edgeSide: 'right' }],
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 2000, tolerance: 0.005 },
  evidence: [],
};

test.describe('live imprintRegions edgeSide', () => {
  test('有向边右侧面域，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    const centroidX = result.mass[0]!.centroid.x;
    console.log(
      `[live-imprint-edgeside] volume=${volume.toFixed(3)} expected=2000.000 centroidX=${centroidX.toFixed(3)}`,
    );
    expect(Math.abs(volume - 2000) / 2000).toBeLessThan(0.005);
    expect(Math.abs(centroidX - 5)).toBeLessThan(0.01);

    await pushExampleChanges(page, 'live imprint edgeSide smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
