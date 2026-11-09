/**
 * FACE pattern → featurePattern 转换链真栈验收（ADR-0007 切片 2，test-only translator）。
 *
 * 合成场景：40×40×10 板 → 圆孔切除（sketch circle + extrude remove 12）→
 * featurePattern（源=切除，circular count 6 / 360°，轴 (20,20) +Z）。
 * 期望：6 个孔共 540π ≈ 1696.460 mm³ 去材 → 板 16000 − 1696.460 = 14303.540 mm³；
 * push + 重开一致。
 *
 * 说明：真实 Onshape FACE pattern PS（Universal Joint 族）的转换已落，但其上游
 * imprintFace 面域回放偏差导致体积/切孔不成立（见计划台账），本 spec 用合成场景
 * 验证 translator→backend 的 featurePattern 全链，不冒充真实 PS 绿色。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { runScenario } from './examples/replay/run.js';
import type { ParityScenario } from './examples/replay/scenario-to-op.js';

const PLATE_VOLUME_MM3 = 40 * 40 * 10;
const HOLE_VOLUME_MM3 = Math.PI * 3 * 3 * 10; // 6 孔：6 × πr²h
const EXPECTED_VOLUME_MM3 = PLATE_VOLUME_MM3 - 6 * HOLE_VOLUME_MM3;

function facePatternScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-feature-pattern-face',
    name: 'FACE pattern → featurePattern',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Plate Sketch',
        sourceFeatureId: 'plate-sketch',
        params: {
          plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
          entities: [
            { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
            { kind: 'line', id: 2, p1: { x: 40, y: 0 }, p2: { x: 40, y: 40 } },
            { kind: 'line', id: 3, p1: { x: 40, y: 40 }, p2: { x: 0, y: 40 } },
            { kind: 'line', id: 4, p1: { x: 0, y: 40 }, p2: { x: 0, y: 0 } },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Plate',
        sourceFeatureId: 'plate-extrude',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          symmetric: false,
          oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'plate-sketch', regionIndex: 0, regions: [0] },
        },
      },
      {
        type: 'sketch',
        name: 'Hole Sketch',
        sourceFeatureId: 'hole-sketch',
        params: {
          plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
          entities: [{ kind: 'circle', id: 1, center: { x: 30, y: 20 }, radius: 3 }],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Hole Cut',
        sourceFeatureId: 'hole-cut',
        params: {
          operation: 'remove',
          endBound: 'blind',
          depthMm: 12,
          symmetric: false,
          oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'hole-sketch', regionIndex: 0, regions: [0] },
        },
      },
      {
        type: 'featurePattern',
        name: 'Circular pattern 1',
        sourceFeatureId: 'hole-pattern',
        params: {
          sourceFeatureId: 'hole-cut',
          kind: 'circular',
          count: 6,
          angle: 360,
          axis: { origin: { x: 20, y: 20, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
        },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-07', status: 'complete', missing: [] },
  };
}

test.describe('FACE pattern → featurePattern（合成全链）', () => {
  test('6 圆孔阵列 → 14303.540 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern FACE', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    const scenario = facePatternScenario();
    await runScenario(ctx, scenario, token);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    let volume = await mass();
    console.log(`[feature-pattern-face] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'featurePattern FACE acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = await mass();
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
