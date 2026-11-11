/**
 * live body pattern 第二方向/反向真栈验收（synthetic，2026-11-11）。
 *
 * 产品 PART pattern 将实例并入同一 body（多 lump），与 Onshape 多 part 不同。
 * 1) 10×10×10 盒 3×2 网格（X 间距 20、Y 间距 30）→ 6 实例 6000 mm³、1 body。
 * 2) 同盒线性 3 实例、间距 20、反向 → 3000 mm³、1 body。
 */
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

function baseSpec(id: string, imodelName: string, secondDirection: boolean, opposite: boolean): LiveSpec {
  return {
    schemaVersion: 1,
    id,
    title: `Synthetic box → body pattern ${secondDirection ? '3x2 grid' : 'opposite'}`,
    status: 'approx',
    imodelName,
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
      { kind: 'extrude', name: 'Extrude 1', sketchName: 'Sketch 1', depthMm: 10, operation: 'new', regions: [0] },
      {
        kind: 'pattern',
        name: 'Pattern 1',
        patternKind: 'linear',
        count: 3,
        spacingMm: 20,
        axis: 'X',
        ...(secondDirection
          ? { secondDirection: { count: 2, spacing: 30, axis: 'Y' as const } }
          : { oppositeDirection: opposite }),
        targetBodyFeatureName: 'Extrude 1',
      },
    ],
    expected: { bodyCount: 1, volumeMm3: secondDirection ? 6000 : 3000, tolerance: 0.005 },
    evidence: [],
    notes: ['产品 PART pattern 将实例并入同一 body（多 lump）；Onshape 为多个 part 实例。'],
  };
}

const GRID = baseSpec(
  'live-body-pattern-grid-smoke',
  'Onshape live body pattern grid: synthetic box',
  true,
  false,
);
const OPPOSITE = baseSpec(
  'live-body-pattern-opposite-smoke',
  'Onshape live body pattern opposite: synthetic box',
  false,
  true,
);

async function verify(spec: LiveSpec, page: Parameters<typeof runLiveSpec>[0], request: Parameters<typeof runLiveSpec>[1]) {
  const result = await runLiveSpec(page, request, spec);
  expect(result.tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
  expect(result.tree.every((row) => row.status === 0)).toBe(true);
  expect(result.bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(1);
  const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
  const expected = spec.expected?.volumeMm3 ?? 0;
  console.log(`[${spec.id}] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
  expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

  await pushExampleChanges(page, `live ${spec.id}`);
  await page.reload();
  await openExampleEditor(page, result.ids);
  expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
  expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
  expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
}

test.describe('live body pattern 第二方向/反向', () => {
  test('3×2 网格，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    await verify(GRID, page, request);
  });

  test('反向阵列，冷重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    await verify(OPPOSITE, page, request);
  });
});
