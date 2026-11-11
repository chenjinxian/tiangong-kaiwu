/**
 * live hole vertexRefs 真栈验收（synthetic，2026-11-11）。
 *
 * 20×20×10 盒上，用第二张草图的两个圆心作为孔位（不是 point 实体）：
 * 两个 Ø4 through-all 去材 2·π·2²·10 = 251.327 mm³，
 * 期望 4000 − 251.327 = 3748.673 mm³。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const EXPECTED = 4000 - 2 * Math.PI * 4 * 10;

function square(half: number) {
  return [
    { kind: 'line' as const, id: 1, p1: { x: -half, y: -half }, p2: { x: half, y: -half } },
    { kind: 'line' as const, id: 2, p1: { x: half, y: -half }, p2: { x: half, y: half } },
    { kind: 'line' as const, id: 3, p1: { x: half, y: half }, p2: { x: -half, y: half } },
    { kind: 'line' as const, id: 4, p1: { x: -half, y: half }, p2: { x: -half, y: -half } },
  ];
}

const SPEC: LiveSpec = {
  schemaVersion: 1,
  id: 'live-hole-vertex-refs-smoke',
  title: 'Synthetic box → hole at circle centers',
  status: 'approx',
  imodelName: 'Onshape live hole vertexRefs: synthetic box',
  source: { docId: 'synthetic', elementId: 'synthetic', name: 'synthetic box' },
  steps: [
    {
      kind: 'sketch',
      name: 'Sketch Box',
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: square(10),
      constraints: [],
    },
    {
      kind: 'extrude',
      name: 'Extrude 1',
      sketchName: 'Sketch Box',
      depthMm: 10,
      operation: 'new',
      regions: [0],
    },
    {
      kind: 'sketch',
      name: 'Hole Positions',
      plane: { origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
      entities: [
        { kind: 'circle', id: 1, center: { x: 5, y: 5 }, radius: 1 },
        { kind: 'circle', id: 2, center: { x: -5, y: -5 }, radius: 1 },
      ],
      constraints: [],
    },
    {
      kind: 'hole',
      name: 'Hole 1',
      sketchName: 'Hole Positions',
      pointEntityIds: [],
      vertexRefs: [
        { entityId: 1, part: 'center' },
        { entityId: 2, part: 'center' },
      ],
      diameterMm: 4,
      endBound: 'throughAll',
      direction: 'backward',
    },
  ],
  expected: { bodyCount: 1, volumeMm3: EXPECTED, tolerance: 0.005 },
  evidence: [],
};

test.describe('live hole vertexRefs 通道', () => {
  test('两个圆心孔位去材，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const result = await runLiveSpec(page, request, SPEC);
    expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'hole']);
    expect(result.tree.every((row) => row.status === 0)).toBe(true);
    expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
    const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[live-hole-vertex] volume=${volume.toFixed(3)} expected=${EXPECTED.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED) / EXPECTED).toBeLessThan(0.005);

    await pushExampleChanges(page, 'live hole vertexRefs smoke');
    await page.reload();
    await openExampleEditor(page, result.ids);
    expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
    expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
    expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
  });
});
