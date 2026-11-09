/**
 * transform converter 回放通道真栈验收（合成，test-only）：
 * scenario 的 `targetSourceFeatureIds` → runner bodyKey 解析 → FeatureOp.targetBodyId
 * → 只变换目标 body。两个独立圆柱体，Transform B 只平移 second body +30 mm。
 *
 * 期望：body A 质心 x=0、body B 质心 x=70，单体积 π·8²·6 = 1206.372；push+重开一致。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

function circleSketch(source: string, cx: number, r: number) {
  return {
    type: 'sketch' as const,
    name: `Sketch ${source}`,
    sourceFeatureId: source,
    params: {
      plane: XY_PLANE,
      entities: [
        { kind: 'point' as const, id: 1, x: cx, y: 0 },
        { kind: 'circle' as const, id: 2, center: 1, radius: r },
      ],
      constraints: [],
    },
  };
}

function syntheticTransformTargetScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-transform-target-multibody',
    name: 'transform target multi-body',
    units: 'mm',
    features: [
      circleSketch('sketch-a', 0, 8),
      {
        type: 'extrude',
        name: 'Extrude A',
        sourceFeatureId: 'extrude-a',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 6,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'sketch-a', regions: [0] },
        },
      },
      circleSketch('sketch-b', 40, 8),
      {
        type: 'extrude',
        name: 'Extrude B',
        sourceFeatureId: 'extrude-b',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 6,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'sketch-b', regions: [0] },
        },
      },
      {
        type: 'transform',
        name: 'Transform B',
        sourceFeatureId: 'transform-b',
        params: {
          transformType: 'TRANSLATION_DISTANCE',
          translation: { x: 30, y: 0, z: 0 },
          targetSourceFeatureIds: ['extrude-b'],
          copy: false,
          directionApprox: true,
        },
      },
    ],
  };
}

const EXPECTED_VOLUME_MM3 = Math.PI * 8 * 8 * 6;

test.describe('transform 多体目标回放真栈验收', () => {
  test('两个 body：transform 只平移目标 body，另一体不动', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Transform Target', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const built = await runScenario(ctx, syntheticTransformTargetScenario(), token);
    expect(built.steps.map((step) => step.type)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'transform',
    ]);
    const transformStep = built.steps.find((step) => step.type === 'transform');
    expect(transformStep?.notes.join(' ')).toContain('targetBody=');
    expect(transformStep?.approximate).toBe(true);

    const mass = async () => (await getMassPropertiesRpc(ctx, token))
      .slice().sort((a, b) => a.centroid.x - b.centroid.x);
    const items = await mass();
    expect(items.length).toBe(2);
    console.log(
      `[transform-target] volumes=${items.map((item) => item.volume.toFixed(3)).join(',')} ` +
      `centroids=${items.map((item) => item.centroid.x.toFixed(3)).join(',')}`,
    );
    expect(items[0]!.centroid.x).toBeCloseTo(0, 3);
    expect(items[1]!.centroid.x).toBeCloseTo(70, 3);
    for (const item of items)
      expect(Math.abs(item.volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.01);

    await pushExampleChanges(page, 'transform target multi-body');
    await page.reload();
    const reopened = await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'transform',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedItems = (await getMassPropertiesRpc(reopened, token))
      .slice().sort((a, b) => a.centroid.x - b.centroid.x);
    expect(reopenedItems.length).toBe(2);
    expect(reopenedItems[0]!.centroid.x).toBeCloseTo(0, 3);
    expect(reopenedItems[1]!.centroid.x).toBeCloseTo(70, 3);
    for (let i = 0; i < 2; i++)
      expect(Math.abs(reopenedItems[i]!.volume - items[i]!.volume) / items[i]!.volume).toBeLessThan(0.005);
  });
});
