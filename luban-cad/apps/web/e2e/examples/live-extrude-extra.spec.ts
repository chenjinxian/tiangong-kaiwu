/**
 * live extrude 第二方向/拔模回归（synthetic，2026-11-11）。
 *
 * 1) 10×10 草图，深度 10 + 第二方向 blind 5 → 10×10×15 = 1500 mm³。
 * 2) 10×10 草图，深度 10、拔模 10°（外扩）→ 棱台体积 ≈1394.109 mm³。
 * 两者均验证 extraParams 透传与冷重开。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

function square(half: number) {
  return [
    { kind: 'line' as const, id: 1, p1: { x: -half, y: -half }, p2: { x: half, y: -half } },
    { kind: 'line' as const, id: 2, p1: { x: half, y: -half }, p2: { x: half, y: half } },
    { kind: 'line' as const, id: 3, p1: { x: half, y: half }, p2: { x: -half, y: half } },
    { kind: 'line' as const, id: 4, p1: { x: -half, y: half }, p2: { x: -half, y: -half } },
  ];
}

function frustumVolume(angleDeg: number): number {
  const delta = 10 * Math.tan((angleDeg * Math.PI) / 180);
  const top = 10 + 2 * delta;
  return (10 / 3) * (100 + top * top + 10 * top);
}

const SECOND: LiveSpec = {
  schemaVersion: 1,
  id: 'live-extrude-second-direction-smoke',
  title: 'Synthetic box → extrude second direction',
  status: 'approx',
  imodelName: 'Onshape live extrude second direction: box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(5),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      regions: [0],
      extraParams: { secondDirection: { endBound: 'blind', distanceMm: 5 } },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: 1500, tolerance: 0.01 },
  evidence: [],
};

const DRAFT: LiveSpec = {
  schemaVersion: 1,
  id: 'live-extrude-draft-smoke',
  title: 'Synthetic box → extrude 10 deg draft',
  status: 'approx',
  imodelName: 'Onshape live extrude draft: box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch 1',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(5),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch 1',
      depthMm: 10,
      operation: 'new',
      regions: [0],
      extraParams: { draftAngleDeg: 10 },
    },
  ],
  expected: { bodyCount: 1, volumeMm3: frustumVolume(10), tolerance: 0.01 },
  evidence: [],
};

async function verify(
  page: Parameters<typeof runLiveSpec>[0],
  request: Parameters<typeof runLiveSpec>[1],
  spec: LiveSpec,
): Promise<void> {
  const result = await runLiveSpec(page, request, spec);
  expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
  expect(result.tree.every((row) => row.status === 0)).toBe(true);
  expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
  const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
  const expected = spec.expected?.volumeMm3 ?? 0;
  console.log(`[${spec.id}] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
  expect(Math.abs(volume - expected) / expected).toBeLessThan(0.01);

  await pushExampleChanges(page, `live ${spec.id}`);
  await page.reload();
  await openExampleEditor(page, result.ids);
  expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
  expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
  expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
}

test.describe('live extrude 第二方向/拔模', () => {
  test('第二方向 10+5，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    await verify(page, request, SECOND);
  });

  test('10° 拔模，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    await verify(page, request, DRAFT);
  });
});
