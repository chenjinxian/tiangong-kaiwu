/**
 * live shell 面选择器真栈验收（synthetic，2026-11-11）。
 *
 * 与 `live/face-select.ts` 配套：readFaceHandles → 唯一几何面 → resolveFaceRef
 * → 标准 shell FeatureOp。预期 20×20×10 盒减去 16×16×8 内腔 = 1952 mm³。
 * 不依赖私有 Onshape 数据，作为 live shell 通道的公共回归。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { pushExampleChanges, openExampleEditor } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-shell-smoke',
  title: 'Synthetic box → shell top face',
  status: 'approx',
  imodelName: 'Onshape live shell: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box shell' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDir: { x: 1, y: 0, z: 0 },
      },
      entities: [
        { kind: 'line', id: 1, p1: { x: -10, y: -10 }, p2: { x: 10, y: -10 } },
        { kind: 'line', id: 2, p1: { x: 10, y: -10 }, p2: { x: 10, y: 10 } },
        { kind: 'line', id: 3, p1: { x: 10, y: 10 }, p2: { x: -10, y: 10 } },
        { kind: 'line', id: 4, p1: { x: -10, y: 10 }, p2: { x: -10, y: -10 } },
      ],
      constraints: [],
      note: 'synthetic 20×20',
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      regions: [0],
      note: 'NEW 10 mm',
    },
    {
      kind: 'shell',
      name: 'Shell 1',
      thicknessMm: 2,
      faces: [{
        center: { x: 0, y: 0, z: 10 },
        normal: { x: 0, y: 0, z: 1 },
        loopCount: 1,
        toleranceMm: 0.5,
        angleToleranceDeg: 2,
      }],
      note: 'remove top face, 2 mm inward',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 1952, tolerance: 0.005 },
  evidence: [],
};

test.describe('live shell 面选择器', () => {
  test('几何面 → resolveFaceRef → shell 内缩，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'shell']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    const bodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
    expect(bodies).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-shell] volume=${volume.toFixed(3)} expected=1952.000`);
    expect(Math.abs(volume - 1952) / 1952).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live shell smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
