/**
 * live body mirror 真栈验收（synthetic，2026-11-11）。
 *
 * x∈[10,20] 的 10×10×10 盒以 YZ（x=0）镜像：原件 + 镜像体
 * 2000 mm³，产品按 keepOriginal Unite 为 1 body（多 lump），质心 x=0。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-body-mirror-smoke',
  title: 'Synthetic box → body mirror about YZ',
  status: 'approx',
  imodelName: 'Onshape live body mirror: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'line', id: 1, p1: { x: 10, y: -5 }, p2: { x: 20, y: -5 } },
        { kind: 'line', id: 2, p1: { x: 20, y: -5 }, p2: { x: 20, y: 5 } },
        { kind: 'line', id: 3, p1: { x: 20, y: 5 }, p2: { x: 10, y: 5 } },
        { kind: 'line', id: 4, p1: { x: 10, y: 5 }, p2: { x: 10, y: -5 } },
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
      kind: 'mirror',
      name: 'Mirror 1',
      plane: 'YZ',
      targetBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 2000, tolerance: 0.005 },
  evidence: [],
  notes: ['产品 body mirror 以 keepOriginal Unite 为单 body 多 lump；Onshape 可能生成独立 part。'],
};

test.describe('live body mirror 通道', () => {
  test('YZ 镜像合并单 body，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    console.log(`[live-body-mirror] bodies=${bodies.length} masses=` +
      JSON.stringify(result.mass.map((entry) => Number(entry.volume.toFixed(3)))));
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    expect(Math.abs(volume - 2000) / 2000).toBeLessThan(0.005);
    expect(result.mass[0]?.centroid.x).toBeCloseTo(0, 3);

    await pushExampleChanges(page, 'live body mirror smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
