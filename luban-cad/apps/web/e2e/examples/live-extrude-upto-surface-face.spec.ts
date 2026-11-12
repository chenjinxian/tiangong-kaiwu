/**
 * live extrude upToSurface 目标面（synthetic，2026-11-12）。
 *
 * 步骤：20×20 底板（2 mm）→ 板上 10×10 凸台（5 mm，顶面 z=7）→
 * 板面外 4×4 草图，upToSurface 到凸台顶面 → 4×4×5 = 80 mm³
 * 总 800 + 500 + 80 = 1380 mm³。验证 `endFace` 面选择 → resolveFaceRef
 * → 产品 `endFaceRef` 全链，push+冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

function rect(idBase: number, minX: number, minY: number, maxX: number, maxY: number) {
  return [
    { kind: 'line' as const, id: idBase, p1: { x: minX, y: minY }, p2: { x: maxX, y: minY } },
    { kind: 'line' as const, id: idBase + 1, p1: { x: maxX, y: minY }, p2: { x: maxX, y: maxY } },
    { kind: 'line' as const, id: idBase + 2, p1: { x: maxX, y: maxY }, p2: { x: minX, y: maxY } },
    { kind: 'line' as const, id: idBase + 3, p1: { x: minX, y: maxY }, p2: { x: minX, y: minY } },
  ];
}

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-extrude-upto-surface-face-smoke',
  title: 'Synthetic boss → extrude up to surface face',
  status: 'approx',
  imodelName: 'Onshape live extrude upToSurface face: boss',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic boss' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: rect(101, 0, 0, 20, 20),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 2,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'sketch',
      name: 'Sketch 2',
      plane: { origin: { x: 0, y: 0, z: 2 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: rect(201, 0, 0, 10, 10),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 2',
      sketchName: 'Sketch 2',
      depthMm: 5,
      operation: 'add',
      regions: [0],
    },
    {
      kind: 'sketch',
      name: 'Sketch 3',
      plane: { origin: { x: 0, y: 0, z: 2 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: rect(301, 14, 8, 18, 12),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 3',
      sketchName: 'Sketch 3',
      depthMm: 5,
      operation: 'add',
      regions: [0],
      extraParams: { endBound: 'upToSurface' },
      endFace: { center: { x: 5, y: 5, z: 7 }, normal: { x: 0, y: 0, z: 1 }, loopCount: 1 },
      endFaceBodyFeatureName: 'Extrude 1',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 1380, tolerance: 0.001 },
  evidence: [],
};

test.describe('live extrude upToSurface face', () => {
  test('目标面参考求值，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude',
    ]);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-extrude-upto-face] volume=${volume.toFixed(3)} expected=1380.000`);
    expect(Math.abs(volume - 1380) / 1380).toBeLessThan(0.001);

    await pushExampleChanges(page, 'live extrude upToSurface face smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
